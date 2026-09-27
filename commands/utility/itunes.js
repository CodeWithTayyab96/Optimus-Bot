const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'itunes',
    aliases: ['applesearch'],
    category: 'utility',
    description: 'Search songs on iTunes / Apple Music',
    usage: '.itunes <song or artist>',
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
                return await extra.reply(style.invalidInput('Please provide a song or artist.', `${extra.prefix}itunes <song or artist>`));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '🎵', key: message.key } });

            // iTunes Search API — free, no key.
            const data = await getJson('https://itunes.apple.com/search', {
                params: { term: query, entity: 'song', limit: 5 },
            });
            const results = (data && data.results) || [];

            if (results.length === 0) {
                return await extra.reply(style.error('No results found on iTunes for that query.'));
            }

            const rows = results.map((r, i) =>
                `${i + 1}. ${r.trackName} — ${r.artistName}\n    💿 ${r.collectionName || '—'}`
            );

            const caption = style.box('🎵 ITUNES SEARCH', [
                `Results for: ${query}`,
                '',
                ...rows
            ]);

            // Artwork of the first result (upscaled), if present.
            const art = results[0].artworkUrl100
                ? results[0].artworkUrl100.replace('100x100', '600x600')
                : null;

            if (art) {
                await sock.sendMessage(extra.chatId, { image: { url: art }, caption }, { quoted: message });
            } else {
                await sock.sendMessage(extra.chatId, { text: caption }, { quoted: message });
            }
        } catch (error) {
            console.error('[itunes] error:', error.message);
            return await extra.reply(style.error('iTunes search failed. Please try again.'));
        }
    },
};
