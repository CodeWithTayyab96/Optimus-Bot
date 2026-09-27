const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');
const ytdlp = require('../../lib/ytdlp');

module.exports = {
    name: 'soundcloud',
    aliases: ['scsearch', 'soundcloudsearch'],
    category: 'media',
    description: 'Search SoundCloud for tracks',
    usage: '.soundcloud <query>',
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
                return await extra.reply(style.invalidInput('Please provide a search query.', `${extra.prefix}soundcloud <query>`));
            }

            // yt-dlp's SoundCloud extractor — no API key required.
            if (!(await ytdlp.isAvailable())) {
                return await extra.reply(style.error('SoundCloud search is unavailable: yt-dlp is not installed on this host.'));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '🎵', key: message.key } });

            const results = await ytdlp.searchSoundCloud(query, 10);

            if (!results.length) {
                return await extra.reply(style.error('No SoundCloud results found for that query.'));
            }

            const lines = results.map((t, i) =>
                `${i + 1}. ${t.title}\n    👤 ${t.uploader || 'Unknown'}\n    🔗 ${t.url}`
            );

            await sock.sendMessage(extra.chatId, {
                text: style.box('🎵 SOUNDCLOUD', [
                    `Results for: ${query}`,
                    '',
                    ...lines
                ]),
                ...channelInfo
            }, { quoted: message });
        } catch (error) {
            console.error('[soundcloud] error:', error.message);
            return await extra.reply(style.error('SoundCloud search failed. Please try again.'));
        }
    },
};
