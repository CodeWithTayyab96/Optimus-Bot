const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

function parseRef(args) {
    // Accept ".gita 2:47" or ".gita 2 47"; default to 2:47.
    if (args.length >= 2 && /^\d+$/.test(args[0]) && /^\d+$/.test(args[1])) {
        return [parseInt(args[0], 10), parseInt(args[1], 10)];
    }
    const m = /^(\d+):(\d+)$/.exec((args[0] || '').trim());
    if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
    return [2, 47];
}

module.exports = {
    name: 'gita',
    aliases: ['bhagavadgita', 'geeta'],
    category: 'utility',
    description: 'Read a Bhagavad Gita verse',
    usage: '.gita <chapter:verse>  (default 2:47)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const [chapter, verse] = parseRef(args);

            await sock.sendMessage(extra.chatId, { react: { text: '🕉️', key: message.key } });

            // Vedic Scriptures — free, no key.
            const data = await getJson(`https://vedicscriptures.github.io/slok/${chapter}/${verse}`);

            if (!data || !data.slok) {
                return await extra.reply(style.error('Could not find that verse. Use the form chapter:verse, e.g. 2:47.'));
            }

            // Prefer the Tejomayananda English translation; fall back to others.
            const english = data.tej?.et || data.siva?.et || data.purohit?.et || data.raman?.et || '';

            await extra.reply(style.box('🕉️ BHAGAVAD GITA', [
                `Chapter ${data.chapter}, Verse ${data.verse}`,
                '',
                data.slok,
                '',
                data.transliteration || '',
                '',
                english
            ].filter(l => l !== undefined)));
        } catch (error) {
            console.error('[gita] error:', error.message);
            return await extra.reply(style.error('Could not fetch the verse. Please try again.'));
        }
    },
};
