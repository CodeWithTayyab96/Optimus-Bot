const style = require('../../lib/messageStyle');
const { getNews } = require('../../lib/news');

/**
 * .news [topic|keyword]
 *   .news            → top headlines (Pakistan edition)
 *   .news world      → a topic section (world/business/tech/sports/…)
 *   .news <keyword>  → search the news
 * Free via Google News RSS — no API key (replaces the old hardcoded NewsAPI key).
 */
async function newsCommand(sock, chatId, message, query) {
    try {
        const { label, items } = await getNews(query, 6);
        if (!items || !items.length) {
            return sock.sendMessage(chatId, {
                text: style.error('No news found right now. Try a different keyword.')
            }, { quoted: message });
        }

        const lines = [];
        items.forEach((it, i) => {
            lines.push(`*${i + 1}.* ${it.title}`);
            if (it.source) lines.push(`    📰 ${it.source}`);
            lines.push(`    🔗 ${it.link}`);
            if (i < items.length - 1) lines.push('');
        });
        lines.push('', '_via Google News_');

        await sock.sendMessage(chatId, { text: style.box(label, lines) }, { quoted: message });
    } catch (error) {
        console.error('[news] error:', error?.message || error);
        await sock.sendMessage(chatId, { text: style.error('Could not fetch news right now.') }, { quoted: message });
    }
}

module.exports = {
    name: 'news',
    aliases: ['headlines'],
    category: 'general',
    description: 'Latest news headlines — by topic or keyword (free, no API key)',
    usage: '.news [topic|keyword]  ·  e.g. .news  ·  .news world  ·  .news cricket',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await newsCommand(sock, extra.chatId, message, args.join(' ').trim());
    },
    newsCommand,
};
