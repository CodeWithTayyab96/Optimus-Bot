const { translateText, DEFAULT_TO } = require('../../lib/translate');
const style = require('../../lib/messageStyle');

// Whitelist of common ISO 639-1/639-3 codes so ordinary words (e.g. "hello",
// "the") are never mistaken for a target language.
const KNOWN = new Set([
    'en', 'ur', 'ar', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'hi',
    'tr', 'nl', 'pl', 'id', 'vi', 'th', 'fa', 'he', 'el', 'sv', 'no', 'da', 'fi',
    'cs', 'ro', 'hu', 'uk', 'bn', 'ta', 'ml', 'pa', 'sk', 'bg', 'hr', 'sr', 'sl',
    'ms', 'tl', 'sw', 'ca', 'eu', 'gl',
]);

function isLang(t) {
    return /^[a-z]{2,3}$/i.test(t) && KNOWN.has(t.toLowerCase());
}

function getQuotedText(message) {
    const q = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    return q?.conversation
        || q?.extendedTextMessage?.text
        || q?.imageMessage?.caption
        || q?.videoMessage?.caption
        || '';
}

async function handleTranslateCommand(sock, chatId, message, match) {
    try {
        // Typing indicator (better UX)
        try {
            await sock.presenceSubscribe(chatId);
            await sock.sendPresenceUpdate('composing', chatId);
        } catch { /* presence is best-effort */ }

        const quotedText = getQuotedText(message);
        const tokens = (match || '').trim().split(/\s+/).filter(Boolean);

        let text;
        let to;

        if (quotedText) {
            // REPLY MODE: text comes from the message you replied to.
            // Any token you type after .translate is the target language
            // (defaults to Urdu if you type nothing).
            to = (tokens.length && isLang(tokens[0])) ? tokens[0].toLowerCase() : DEFAULT_TO;
            text = quotedText;
        } else {
            // DIRECT MODE: text you typed after the command.
            if (!tokens.length) {
                return sock.sendMessage(chatId, {
                    text: style.box('🌐 TRANSLATOR', [
                        'Translate text (or a replied message) — no API key needed.',
                        '',
                        'Usage:',
                        ' .translate <text>          → to Urdu (default)',
                        ' .translate <text> <lang>   → to <lang>',
                        ' reply + .translate [lang]  → translate the replied message',
                        '',
                        'Examples:',
                        ' .translate hello world',
                        ' .translate hello world fr',
                        ' reply to a msg, then .translate ur',
                        '',
                        'Codes: en ur ar es fr de it pt ru ja ko zh hi tr …',
                    ]),
                }, { quoted: message });
            }
            // Last token may be a target language; otherwise default to Urdu.
            if (tokens.length >= 2 && isLang(tokens[tokens.length - 1])) {
                to = tokens.pop().toLowerCase();
            } else {
                to = DEFAULT_TO;
            }
            text = tokens.join(' ');
        }

        if (!text) {
            return sock.sendMessage(chatId, {
                text: '❌ No text found to translate. Reply to a message or type text after .translate.',
                quoted: message,
            });
        }

        const result = await translateText(text, to);

        await sock.sendMessage(chatId, {
            text: style.box('🌐 TRANSLATION', [
                `(${result.from} → ${result.to})`,
                '',
                result.text,
            ]),
        }, { quoted: message });

    } catch (error) {
        console.error('❌ Error in translate command:', error?.message || error);
        await sock.sendMessage(chatId, {
            text: '❌ Translation failed. Please try again later.',
            quoted: message,
        });
    }
}

module.exports = {
    name: 'translate',
    aliases: ['trt'],
    category: 'general',
    description: 'Translate text or a replied message (default: Urdu)',
    usage: '.translate <text> [lang]  •  reply + .translate [lang]',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleTranslateCommand(sock, extra.chatId, message, extra.userMessage.split(/\s+/).slice(1).join(' '));
    },
    handleTranslateCommand,
};
