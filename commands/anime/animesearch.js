const { getJson } = require('../../lib/http');
const style = require('../../lib/messageStyle');

// Kitsu — free anime/manga database (public reads, no key). JSON:API; needs the
// `application/vnd.api+json` Accept header or it answers 406.
// Docs: https://freeapihub.com/apis/kitsu
const ANIME_URL = 'https://kitsu.io/api/edge/anime';

async function animeCommand(sock, chatId, message, query) {
    if (!query) {
        await sock.sendMessage(chatId, { text: style.invalidInput('Provide an anime title to search.', '.anime <title>') }, { quoted: message });
        return;
    }

    await sock.sendMessage(chatId, { react: { text: '🔍', key: message.key } });

    try {
        const data = await getJson(ANIME_URL, {
            timeout: 20000,
            // lowercase `accept` overrides getJson's default (same object key) so Kitsu
            // does not reject with 406.
            headers: { accept: 'application/vnd.api+json' },
            params: { 'filter[text]': query, 'page[limit]': 5 },
        });

        const items = (data && data.data) || [];
        if (!items.length) {
            await sock.sendMessage(chatId, { text: style.notFound(`"${query}"`) }, { quoted: message });
            return;
        }

        const lines = [];
        for (const it of items.slice(0, 3)) {
            const a = it.attributes || {};
            const title = a.canonicalTitle || (a.titles && a.titles.en) || '(untitled)';
            lines.push(`*${title}*`);
            const meta = [];
            if (a.showType) meta.push(a.showType);
            if (a.status) meta.push(a.status);
            if (a.episodeCount) meta.push(`${a.episodeCount} ep`);
            if (a.averageRating) meta.push(`★ ${a.averageRating}`);
            if (meta.length) lines.push(`  _${meta.join(' · ')}_`);
            if (a.synopsis) lines.push(`  ${a.synopsis.slice(0, 260)}${a.synopsis.length > 260 ? '…' : ''}`);
            lines.push('');
        }
        if (items.length > 3) lines.push(`… and ${items.length - 3} more.`);

        const text = style.box('🔎 ANIME', lines);

        // Show the top result's poster, then the card.
        const top = items[0].attributes || {};
        const poster = top.posterImage && (top.posterImage.large || top.posterImage.original);
        if (poster) {
            try {
                await sock.sendMessage(chatId, { image: { url: poster }, caption: top.canonicalTitle || query }, { quoted: message });
            } catch (err) {
                console.error('[anime] poster send failed:', err.message);
            }
        }
        await sock.sendMessage(chatId, { text }, { quoted: message });
    } catch (err) {
        console.error('[anime] error:', err.message);
        await sock.sendMessage(chatId, { text: style.error('Anime search failed. Please try again.') }, { quoted: message });
    }
}

module.exports = {
    name: 'anime',
    aliases: ['kitsu', 'animelook'],
    category: 'anime',
    description: 'Search anime by title (Kitsu) — poster, type, status, rating, synopsis',
    usage: '.anime <title>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await animeCommand(sock, extra.chatId, message, args.join(' ').trim());
    },
};
