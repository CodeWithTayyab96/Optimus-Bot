const { getJson } = require('../../lib/http');
const settings = require('../../settings');
const style = require('../../lib/messageStyle');

function isConfigured() {
    const key = settings.tmdbApiKey;
    return !!key && key !== 'YOUR_TMDB_API_KEY';
}

module.exports = {
    name: 'tmdb',
    aliases: ['moviedb', 'tvshow'],
    category: 'utility',
    description: 'Search movies and TV shows (The Movie Database)',
    usage: '.tmdb <title>',
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
                return await extra.reply(style.invalidInput('Please provide a movie or TV title.', `${extra.prefix}tmdb <title>`));
            }

            if (!isConfigured()) {
                return await extra.reply(style.error(
                    'TMDB is not configured. Get a free key at themoviedb.org and set tmdbApiKey in settings.'
                ));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '🎬', key: message.key } });

            const data = await getJson('https://api.themoviedb.org/3/search/multi', {
                params: { api_key: settings.tmdbApiKey, query, include_adult: 'false' },
            });

            const results = (data && data.results ? data.results : []).filter(r => r.media_type !== 'person');
            if (results.length === 0) {
                return await extra.reply(style.error('No movie or TV results found for that title.'));
            }

            const first = results[0];
            const title = first.title || first.name || 'Untitled';
            const year = (first.release_date || first.first_air_date || '').slice(0, 4) || '—';
            const kind = first.media_type === 'tv' ? 'TV Show' : 'Movie';
            const poster = first.poster_path ? `https://image.tmdb.org/t/p/w500${first.poster_path}` : null;

            const caption = style.box('🎬 TMDB', [
                `📌 ${title} (${year})`,
                `🎞 ${kind} · ⭐ ${first.vote_average ?? '—'}`,
                '',
                String(first.overview || 'No description available.').slice(0, 600)
            ]);

            if (poster) {
                await sock.sendMessage(extra.chatId, { image: { url: poster }, caption }, { quoted: message });
            } else {
                await sock.sendMessage(extra.chatId, { text: caption }, { quoted: message });
            }
        } catch (error) {
            console.error('[tmdb] error:', error.message);
            return await extra.reply(style.error('Movie search failed. Please try again.'));
        }
    },
};
