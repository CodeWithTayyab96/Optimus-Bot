const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

// Free Dictionary API (dictionaryapi.dev) — definitions, phonetics, audio,
// examples, synonyms/antonyms. Free, no API key, community-run (best-effort).
// Docs: https://freeapihub.com/apis/free-dictionary-api
const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries';

/**
 * Pick a usable pronunciation audio URL from an entry's phonetics array.
 * Not every word has audio, so callers must guard on null.
 */
function firstAudio(entry) {
    const ph = entry && entry.phonetics;
    if (!Array.isArray(ph)) return null;
    for (const p of ph) {
        if (p && typeof p.audio === 'string' && p.audio.startsWith('http')) return p.audio;
    }
    return null;
}

async function dictionaryCommand(sock, chatId, message, word) {
    if (!word) {
        await extra_reply(sock, chatId, message, style.invalidInput('Please provide a word to look up.', '.dictionary <word>'));
        return;
    }

    await sock.sendMessage(chatId, { react: { text: '📖', key: message.key } });

    let data;
    try {
        data = await getJson(`${API_BASE}/en/${encodeURIComponent(word.toLowerCase())}`, { timeout: 20000 });
    } catch (err) {
        const status = err.response && err.response.status;
        if (status === 404) {
            await extra_reply(sock, chatId, message, style.notFound(`"${word}"`));
            return;
        }
        console.error('[dictionary] lookup failed:', err.message);
        await extra_reply(sock, chatId, message, style.error('Dictionary lookup failed. Please try again later.'));
        return;
    }

    const entries = Array.isArray(data) ? data : [];
    if (!entries.length) {
        await extra_reply(sock, chatId, message, style.notFound(`"${word}"`));
        return;
    }

    const lines = [];
    let audioUrl = null;

    for (const entry of entries.slice(0, 2)) {
        const w = entry.word || word;
        const phon = entry.phonetic || (entry.phonetics && entry.phonetics[0] && entry.phonetics[0].text) || '';
        lines.push(`*${w}*${phon ? `   ${phon}` : ''}`);

        if (!audioUrl) audioUrl = firstAudio(entry);

        for (const m of entry.meanings || []) {
            const pos = m.partOfSpeech || '?';
            lines.push('', `▸ *${pos}*`);
            for (const d of (m.definitions || []).slice(0, 3)) {
                lines.push(`• ${d.definition}`);
                if (d.example) lines.push(`  ↳ _"${d.example}"_`);
                const syn = (d.synonyms || []).slice(0, 5);
                if (syn.length) lines.push(`  synonyms: ${syn.join(', ')}`);
                const ant = (d.antonyms || []).slice(0, 5);
                if (ant.length) lines.push(`  antonyms: ${ant.join(', ')}`);
            }
        }
        lines.push('');
    }

    const text = style.box('📖 DICTIONARY', lines);
    for (const chunk of style.splitLong(text, 3500)) {
        await sock.sendMessage(chatId, { text: chunk }, { quoted: message });
    }

    // Pronunciation audio — a headline feature of the API. Sent separately so a
    // failed/odd-format audio never loses the definitions we already sent.
    if (audioUrl) {
        const mimetype = /\.ogg($|\?)/i.test(audioUrl) ? 'audio/ogg' : 'audio/mpeg';
        try {
            await sock.sendMessage(chatId, {
                audio: { url: audioUrl },
                mimetype,
                ptt: false,
                caption: `🔊 Pronunciation — ${word}`,
            });
        } catch (err) {
            console.error('[dictionary] audio send failed:', err.message);
        }
    }
}

/** Thin wrapper so the text branches above read cleanly; quotes the source message. */
function extra_reply(sock, chatId, message, text) {
    return sock.sendMessage(chatId, { text }, { quoted: message });
}

module.exports = {
    name: 'dictionary',
    aliases: ['dict', 'define', 'meaning'],
    category: 'utility',
    description: 'Look up an English word: definition, phonetic, examples, synonyms',
    usage: '.dictionary <word>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await dictionaryCommand(sock, extra.chatId, message, args.join(' ').trim());
    },
};
