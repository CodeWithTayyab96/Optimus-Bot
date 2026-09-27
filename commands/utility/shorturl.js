/**
 * Optimus Bot — .shorturl
 * Shorten a URL with TinyURL.
 *
 * Provider: tinyurl.com/api-create.php. No API key required.
 * Behaviour ported from Shadow MD (`drenox.js:9711`).
 */
const axios = require('axios');
const style = require('../../lib/messageStyle');

const TIMEOUT = 10000;
const API = 'https://tinyurl.com/api-create.php';

/** Exported for unit testing without network access. */
function isValidHttpUrl(value) {
    try {
        const u = new URL(value);
        return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
    } catch (_) {
        return false;
    }
}

async function shorturlCommand(sock, chatId, message, target) {
    try {
        const url = String(target || '').trim();

        if (!url) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput('Please provide a URL to shorten.', '.shorturl <url>\n\nExample: .shorturl https://example.com/a/very/long/path')
            }, { quoted: message });
        }

        if (!isValidHttpUrl(url)) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput('That is not a valid http(s) URL.', '.shorturl <url>', { box: false })
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, { text: style.processing('Shortening URL') }, { quoted: message });

        const res = await axios.get(API, {
            params: { url },
            timeout: TIMEOUT,
            // TinyURL replies with plain text, which axios would try to parse.
            transformResponse: [(d) => d]
        });

        const short = String(res.data || '').trim();
        if (!/^https?:\/\//i.test(short)) {
            return sock.sendMessage(chatId, {
                text: style.error('The shortening service returned an unexpected response. Please try again.')
            }, { quoted: message });
        }

        return sock.sendMessage(chatId, {
            text: style.box('🔗 SHORT URL', [
                `Original: ${url}`,
                `Short: ${short}`
            ])
        }, { quoted: message });
    } catch (error) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            return sock.sendMessage(chatId, {
                text: style.error('The shortening service timed out. Please try again.')
            }, { quoted: message });
        }
        console.error('[shorturl] Error:', error.message);
        return sock.sendMessage(chatId, {
            text: style.error('Could not shorten that URL. Please try again.')
        }, { quoted: message });
    }
}

module.exports = {
    name: 'shorturl',
    aliases: ['tinyurl', 'shorten'],
    category: 'utility',
    description: 'Shorten a URL using TinyURL',
    usage: '.shorturl <url>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await shorturlCommand(sock, extra.chatId, message, args.join(' '));
    },
    shorturlCommand,
    isValidHttpUrl,
};
