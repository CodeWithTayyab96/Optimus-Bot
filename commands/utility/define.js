/**
 * Optimus Bot — .define
 * Look up a word in the dictionary.
 *
 * Provider: dictionaryapi.dev (Wiktionary-backed). No API key required.
 * Behaviour ported from Shadow MD (`drenox.js:10214`), re-implemented with
 * Optimus message styling and a hard request timeout.
 */
const axios = require('axios');
const style = require('../../lib/messageStyle');

const TIMEOUT = 10000;
const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

/**
 * Flattens the dictionaryapi.dev payload into display lines.
 * Exported so it can be unit-tested without hitting the network.
 */
function formatEntries(word, data, maxMeanings = 3) {
    if (!Array.isArray(data) || data.length === 0) return null;

    const entry = data[0];
    const lines = [];

    const phonetic = entry.phonetic || (entry.phonetics || []).find(p => p.text)?.text;
    lines.push(`📖 *${entry.word || word}*${phonetic ? `  _${phonetic}_` : ''}`);
    lines.push('');

    const meanings = (entry.meanings || []).slice(0, maxMeanings);
    for (const meaning of meanings) {
        lines.push(`*${meaning.partOfSpeech}*`);
        const defs = (meaning.definitions || []).slice(0, 2);
        defs.forEach((d, i) => {
            lines.push(` ${i + 1}. ${d.definition}`);
            if (d.example) lines.push(`    _"${d.example}"_`);
        });
        const syn = (meaning.synonyms || []).slice(0, 6);
        if (syn.length) lines.push(` 🔗 ${syn.join(', ')}`);
        lines.push('');
    }

    return lines;
}

async function defineCommand(sock, chatId, message, query) {
    try {
        const word = String(query || '').trim();

        if (!word) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput('Please provide a word to define.', '.define <word>\n\nExample: .define serendipity')
            }, { quoted: message });
        }

        if (!/^[\p{L}\p{M}\-'. ]+$/u.test(word)) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput('That does not look like a single word.', '.define <word>', { box: false })
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: style.processing(`Looking up "${word}"`)
        }, { quoted: message });

        let res;
        try {
            res = await axios.get(API + encodeURIComponent(word), { timeout: TIMEOUT });
        } catch (err) {
            // The API answers 404 for unknown words — that is a normal miss.
            if (err.response && err.response.status === 404) {
                return sock.sendMessage(chatId, {
                    text: style.notFound(`No dictionary entry for "${word}"`)
                }, { quoted: message });
            }
            throw err;
        }

        const lines = formatEntries(word, res.data);
        if (!lines) {
            return sock.sendMessage(chatId, {
                text: style.notFound(`No dictionary entry for "${word}"`)
            }, { quoted: message });
        }

        return sock.sendMessage(chatId, {
            text: style.box('📚 DICTIONARY', lines)
        }, { quoted: message });
    } catch (error) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            return sock.sendMessage(chatId, {
                text: style.error('The dictionary service timed out. Please try again.')
            }, { quoted: message });
        }
        console.error('[define] Error:', error.message);
        return sock.sendMessage(chatId, {
            text: style.error('Could not reach the dictionary service. Please try again.')
        }, { quoted: message });
    }
}

module.exports = {
    name: 'define',
    aliases: ['dictionary', 'meaning'],
    category: 'utility',
    description: 'Look up a word in the dictionary',
    usage: '.define <word>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await defineCommand(sock, extra.chatId, message, args.join(' '));
    },
    defineCommand,
    formatEntries,
};
