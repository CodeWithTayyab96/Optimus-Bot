const yts = require('yt-search');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'ytsearch',
    aliases: ['yts'],
    category: 'media',
    description: 'Search YouTube and show the top results',
    usage: '.ytsearch <query>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const query = args.join(' ').trim();

            if (!query) {
                return await extra.reply(style.invalidInput('Please provide a search query.', `${extra.prefix}ytsearch <query>`));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '🔍', key: message.key } });

            // Keyless — uses yt-search (already a project dependency).
            const { videos } = await yts(query);

            if (!videos || videos.length === 0) {
                return await extra.reply(style.error('No YouTube results found for that query.'));
            }

            const top = videos.slice(0, 5);
            const first = top[0];

            const lines = top.map((v, i) =>
                `${i + 1}. ${v.title}\n    ⏱ ${v.timestamp || '—'} · ${v.author?.name || 'Unknown'}\n    🔗 ${v.url}`
            );

            await sock.sendMessage(extra.chatId, {
                image: { url: first.thumbnail },
                caption: `🎥 *YOUTUBE SEARCH*\n\n${lines.join('\n\n')}`
            }, { quoted: message });
        } catch (error) {
            console.error('[ytsearch] error:', error.message);
            return await extra.reply(style.error('YouTube search failed. Please try again.'));
        }
    },
};
