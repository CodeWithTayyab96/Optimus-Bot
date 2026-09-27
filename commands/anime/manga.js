const { postJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

const QUERY = `query ($q: String) {
  Page(perPage: 5) {
    media(search: $q, type: MANGA) {
      title { romaji english }
      averageScore
      chapters
      volumes
      status
      startDate { year }
      genres
      coverImage { large }
      siteUrl
    }
  }
}`;

module.exports = {
    name: 'manga',
    aliases: ['mangasearch'],
    category: 'anime',
    description: 'Search manga',
    usage: '.manga <title>',
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
                return await extra.reply(style.invalidInput('Please provide a manga title.', `${extra.prefix}manga <title>`));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '🔍', key: message.key } });

            const data = await postJson('https://graphql.anilist.co', { query: QUERY, variables: { q: query } });
            const list = data && data.data && data.data.Page && data.data.Page.media;

            if (!Array.isArray(list) || list.length === 0) {
                return await extra.reply(style.error('No manga found for that title.'));
            }

            const first = list[0];
            const title = first.title?.english || first.title?.romaji || query;
            const poster = first.coverImage?.large;
            const genres = (first.genres || []).join(', ') || '—';
            const rows = list.map((m, i) =>
                `${i + 1}. ${m.title?.english || m.title?.romaji || '?'} ⭐ ${m.averageScore ?? '—'}`
            );

            const caption = style.box('📖 MANGA SEARCH', [
                `📌 ${title}`,
                `⭐ ${first.averageScore ?? '—'} · 📚 ${first.chapters ?? '?'} ch · ${first.volumes ?? '?'} vol`,
                `🏷 ${genres}`,
                '',
                'Top results:',
                ...rows,
                '',
                `🔗 ${first.siteUrl || ''}`
            ]);

            if (poster) {
                await sock.sendMessage(extra.chatId, { image: { url: poster }, caption }, { quoted: message });
            } else {
                await sock.sendMessage(extra.chatId, { text: caption }, { quoted: message });
            }
        } catch (error) {
            console.error('[manga] error:', error.message);
            return await extra.reply(style.error('Manga search failed. Please try again.'));
        }
    },
};
