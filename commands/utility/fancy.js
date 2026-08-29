/**
 * Optimus Bot — .fancy
 * Convert text into multiple Unicode fancy-text styles.
 * Fully local — no API, no network, no dependency.
 */

const style = require('../../lib/messageStyle');

/** Map of lowercase ASCII letters → Unicode style characters. */
const STYLES = {
    '𝐁𝐨𝐥𝐝': {
        a: '𝐚', b: '𝐛', c: '𝐜', d: '𝐝', e: '𝐞', f: '𝐟', g: '𝐠', h: '𝐡',
        i: '𝐢', j: '𝐣', k: '𝐤', l: '𝐥', m: '𝐦', n: '𝐧', o: '𝐨', p: '𝐩',
        q: '𝐪', r: '𝐫', s: '𝐬', t: '𝐭', u: '𝐮', v: '𝐯', w: '𝐰', x: '𝐱',
        y: '𝐲', z: '𝐳',
        A: '𝐀', B: '𝐁', C: '𝐂', D: '𝐃', E: '𝐄', F: '𝐅', G: '𝐆', H: '𝐇',
        I: '𝐈', J: '𝐉', K: '𝐊', L: '𝐋', M: '𝐌', N: '𝐍', O: '𝐎', P: '𝐏',
        Q: '𝐐', R: '𝐑', S: '𝐒', T: '𝐓', U: '𝐔', V: '𝐕', W: '𝐖', X: '𝐗',
        Y: '𝐘', Z: '𝐙'
    },
    '𝘐𝘵𝘢𝘭𝘪𝘤': {
        a: '𝘢', b: '𝘣', c: '𝘤', d: '𝘥', e: '𝘦', f: '𝘧', g: '𝘨', h: '𝘩',
        i: '𝘪', j: '𝘫', k: '𝘬', l: '𝘭', m: '𝘮', n: '𝘯', o: '𝘰', p: '𝘱',
        q: '𝘲', r: '𝘳', s: '𝘴', t: '𝘵', u: '𝘶', v: '𝘷', w: '𝘸', x: '𝘹',
        y: '𝘺', z: '𝘻',
        A: '𝘈', B: '𝘉', C: '𝘊', D: '𝘋', E: '𝘌', F: '𝘍', G: '𝘎', H: '𝘏',
        I: '𝘐', J: '𝘑', K: '𝘒', L: '𝘓', M: '𝘔', N: '𝘕', O: '𝘖', P: '𝘗',
        Q: '𝘘', R: '𝘙', S: '𝘚', T: '𝘛', U: '𝘜', V: '𝘝', W: '𝘞', X: '𝘟',
        Y: '𝘠', Z: '𝘡'
    },
    '𝔉𝔯𝔞𝔨𝔱𝔲𝔯': {
        a: '𝔞', b: '𝔟', c: '𝔠', d: '𝔡', e: '𝔢', f: '𝔣', g: '𝔤', h: '𝔥',
        i: '𝔦', j: '𝔧', k: '𝔨', l: '𝔩', m: '𝔪', n: '𝔫', o: '𝔬', p: '𝔭',
        q: '𝔮', r: '𝔯', s: '𝔰', t: '𝔱', u: '𝔲', v: '𝔳', w: '𝔴', x: '𝔵',
        y: '𝔶', z: '𝔷',
        A: '𝔄', B: '𝔅', C: 'ℭ', D: '𝔇', E: '𝔈', F: '𝔉', G: '𝔊', H: 'ℌ',
        I: 'ℑ', J: '𝔍', K: '𝔎', L: '𝔏', M: '𝔐', N: '𝔑', O: '𝔒', P: '𝔓',
        Q: '𝔔', R: 'ℜ', S: '𝔖', T: '𝔗', U: '𝔘', V: '𝔙', W: '𝔚', X: '𝔛',
        Y: '𝔜', Z: 'ℨ'
    },
    '𝐒𝐞𝐫𝐢𝐟': {
        a: '𝐚', b: '𝐛', c: '𝐜', d: '𝐝', e: '𝐞', f: '𝐟', g: '𝐠', h: '𝐡',
        i: '𝐢', j: '𝐣', k: '𝐤', l: '𝐥', m: '𝐦', n: '𝐧', o: '𝐨', p: '𝐩',
        q: '𝐪', r: '𝐫', s: '𝐬', t: '𝐭', u: '𝐮', v: '𝐯', w: '𝐰', x: '𝐱',
        y: '𝐲', z: '𝐳',
        A: '𝐀', B: '𝐁', C: '𝐂', D: '𝐃', E: '𝐄', F: '𝐅', G: '𝐆', H: '𝐇',
        I: '𝐈', J: '𝐉', K: '𝐊', L: '𝐋', M: '𝐌', N: '𝐍', O: '𝐎', P: '𝐏',
        Q: '𝐐', R: '𝐑', S: '𝐒', T: '𝐓', U: '𝐔', V: '𝐕', W: '𝐖', X: '𝐗',
        Y: '𝐘', Z: '𝐙'
    },
    'Ⓒⓘⓡⓒⓛⓔⓓ': {
        a: 'ⓐ', b: 'ⓑ', c: 'ⓒ', d: 'ⓓ', e: 'ⓔ', f: 'ⓕ', g: 'ⓖ', h: 'ⓗ',
        i: 'ⓘ', j: 'ⓙ', k: 'ⓚ', l: 'ⓛ', m: 'ⓜ', n: 'ⓝ', o: 'ⓞ', p: 'ⓟ',
        q: 'ⓠ', r: 'ⓡ', s: 'ⓢ', t: 'ⓣ', u: 'ⓤ', v: 'ⓥ', w: 'ⓦ', x: 'ⓧ',
        y: 'ⓨ', z: 'ⓩ',
        A: 'Ⓐ', B: 'Ⓑ', C: 'Ⓒ', D: 'Ⓓ', E: 'Ⓔ', F: 'Ⓕ', G: 'Ⓖ', H: 'Ⓗ',
        I: 'Ⓘ', J: 'Ⓙ', K: 'Ⓚ', L: 'Ⓛ', M: 'Ⓜ', N: 'Ⓝ', O: 'Ⓞ', P: 'Ⓟ',
        Q: 'Ⓠ', R: 'Ⓡ', S: 'Ⓢ', T: 'Ⓣ', U: 'Ⓤ', V: 'Ⓥ', W: 'Ⓦ', X: 'Ⓧ',
        Y: 'Ⓨ', Z: 'Ⓩ'
    },
    ' المقدس': {
        // Pseudo-Cyrillic style using Unicode Cyrillic lookalikes
        a: 'а', b: 'ь', c: 'с', d: 'd', e: 'е', f: 'f', g: 'g', h: 'н',
        i: 'і', j: 'ј', k: 'k', l: 'ӏ', m: 'м', n: 'и', o: 'о', p: 'р',
        q: 'q', r: 'г', s: 'ѕ', t: 'т', u: 'u', v: 'ѵ', w: 'w', x: 'х',
        y: 'у', z: 'z',
        A: 'А', B: 'Ь', C: 'С', D: 'D', E: 'Е', F: 'F', G: 'G', H: 'Н',
        I: 'І', J: 'Ј', K: 'K', L: 'ӏ', M: 'М', N: 'И', O: 'О', P: 'Р',
        Q: 'Q', R: 'Г', S: 'Ѕ', T: 'Т', U: 'U', V: 'Ѵ', W: 'W', X: 'Х',
        Y: 'У', Z: 'Z'
    },
    'Ｓｑｕａｒｅ': {
        a: 'ａ', b: 'ｂ', c: 'ｃ', d: 'ｄ', e: 'ｅ', f: 'ｆ', g: 'ｇ', h: 'ｈ',
        i: 'ｉ', j: 'ｊ', k: 'ｋ', l: 'ｌ', m: 'ｍ', n: 'ｎ', o: 'ｏ', p: 'ｐ',
        q: 'ｑ', r: 'ｒ', s: 'ｓ', t: 'ｔ', u: 'ｕ', v: 'ｖ', w: 'ｗ', x: 'ｘ',
        y: 'ｙ', z: 'ｚ',
        A: 'Ａ', B: 'Ｂ', C: 'Ｃ', D: 'Ｄ', E: 'Ｅ', F: 'Ｆ', G: 'Ｇ', H: 'Ｈ',
        I: 'Ｉ', J: 'Ｊ', K: 'Ｋ', L: 'Ｌ', M: 'Ｍ', N: 'Ｎ', O: 'Ｏ', P: 'Ｐ',
        Q: 'Ｑ', R: 'Ｒ', S: 'Ｓ', T: 'Ｔ', U: 'Ｕ', V: 'Ｖ', W: 'Ｗ', X: 'Ｘ',
        Y: 'Ｙ', Z: 'Ｚ'
    },
    '$L33T$': {
        a: '4', b: '8', c: 'c', d: 'd', e: '3', f: 'f', g: '9', h: 'h',
        i: '1', j: 'j', k: 'k', l: 'l', m: 'm', n: 'n', o: '0', p: 'p',
        q: 'q', r: 'r', s: '5', t: '7', u: 'u', v: 'v', w: 'w', x: 'x',
        y: 'y', z: '2',
        A: '4', B: '8', C: 'c', D: 'd', E: '3', F: 'f', G: '9', H: 'h',
        I: '1', J: 'j', K: 'k', L: 'l', M: 'm', N: 'n', O: '0', P: 'p',
        Q: 'q', R: 'r', S: '5', T: '7', U: 'u', V: 'v', W: 'w', X: 'x',
        Y: 'y', Z: '2'
    }
};

function applyStyle(text, map) {
    return text.split('').map(ch => map[ch] || ch).join('');
}

async function handleFancyCommand(sock, chatId, message, userMessage) {
    try {
        const text = userMessage.trim().split(/\s+/).slice(1).join(' ').trim();
        if (!text) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput(
                    'Please provide text to convert.',
                    '.fancy <text>\n\nExample: .fancy Hello World'
                )
            }, { quoted: message });
        }

        const lines = [`✨ *Fancy Text Styles*\n`];
        for (const [name, map] of Object.entries(STYLES)) {
            const converted = applyStyle(text, map);
            lines.push(`${name}: ${converted}`);
        }

        // Split if too long for WhatsApp (4096 char limit per message)
        const fullText = lines.join('\n');
        if (fullText.length > 4000) {
            // Send in chunks
            const half = Math.ceil(lines.length / 2);
            await sock.sendMessage(chatId, {
                text: lines.slice(0, half).join('\n')
            }, { quoted: message });
            await sock.sendMessage(chatId, {
                text: lines.slice(half).join('\n')
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, {
                text: fullText
            }, { quoted: message });
        }

    } catch (error) {
        console.error('[fancy] Error:', error);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to generate fancy text.')
        }, { quoted: message });
    }
}

module.exports = {
    name: 'fancy',
    aliases: ['fancytext', 'textstyle', 'styletext'],
    category: 'utility',
    description: 'Convert text into fancy Unicode styles',
    usage: '.fancy <text>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleFancyCommand(sock, extra.chatId, message, extra.userMessage);
    },
};
