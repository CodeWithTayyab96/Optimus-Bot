const { postJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

// AniList GraphQL — free, no key, reliable.
const QUERY = `query ($q: String) {
  Page(perPage: 5) {
    media(search: $q, type: ANIME) {
      title { romaji english }
      averageScore
      episodes
      status
      startDate { year }
      genres
      coverImage { large }
      siteUrl
    }
  }
}`;

module.exports = {
    name: 'mal',
    aliases: ['animesearch', 'anilist', 'anisearch'],
    category: 'anime',
    description: 'Search anime',
    usage: '.mal <title>',
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
                return await extra.reply(style.invalidInput('Please provide an anime title.', `${extra.prefix}mal <title>`));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '🔍', key: message.key } });

            const data = await postJson('https://graphql.anilist.co', { query: QUERY, variables: { q: query } });
            const list = data && data.data && data.data.Page && data.data.Page.media;

            if (!Array.isArray(list) || list.length === 0) {
                return await extra.reply(style.error('No anime found for that title.'));
            }

            const first = list[0];
            const title = first.title?.english || first.title?.romaji || query;
            const poster = first.coverImage?.large;
            const genres = (first.genres || []).join(', ') || '—';
            const rows = list.map((a, i) =>
                `${i + 1}. ${a.title?.english || a.title?.romaji || '?'} (${a.startDate?.year || '—'}) ⭐ ${a.averageScore ?? '—'}`
            );

            const caption = style.box('🎌 ANIME SEARCH', [
                `📌 ${title}`,
                `⭐ ${first.averageScore ?? '—'} · 📺 ${first.episodes ?? '?'} eps · ${first.status || '—'}`,
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
            console.error('[mal] error:', error.message);
            return await extra.reply(style.error('Anime search failed. Please try again.'));
        }
    },
};
