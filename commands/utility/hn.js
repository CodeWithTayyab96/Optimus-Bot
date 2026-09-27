const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'hn',
    aliases: ['hackernews', 'ycombinator'],
    category: 'utility',
    description: 'Top Hacker News stories',
    usage: '.hn [count]',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const n = Math.min(Math.max(parseInt(args[0], 10) || 5, 1), 10);

            await sock.sendMessage(extra.chatId, { react: { text: '📰', key: message.key } });

            // Hacker News (Firebase) — free, no key.
            const ids = await getJson('https://hacker-news.firebaseio.com/v0/topstories.json');
            if (!Array.isArray(ids) || ids.length === 0) {
                return await extra.reply(style.error('Could not fetch Hacker News right now. Please try again.'));
            }

            const items = await Promise.all(
                ids.slice(0, n).map(id => getJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`))
            );

            const lines = items.filter(Boolean).map((it, i) =>
                `${i + 1}. ${it.title}\n    🔗 ${it.url || `https://news.ycombinator.com/item?id=${it.id}`}\n    ⬆ ${it.score ?? 0} · 💬 ${it.descendants ?? 0}`
            );

            await extra.reply(style.box('📰 HACKER NEWS — TOP', lines));
        } catch (error) {
            console.error('[hn] error:', error.message);
            return await extra.reply(style.error('Could not fetch Hacker News right now. Please try again.'));
        }
    },
};
