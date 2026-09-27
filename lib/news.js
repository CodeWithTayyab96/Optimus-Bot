/**
 * news — free news via Google News RSS (NO API key, no rate limit).
 *
 * Replaces the old hardcoded NewsAPI key. Google News RSS supports:
 *   • top headlines for a locale (en-PK here)
 *   • topic sections (WORLD / BUSINESS / TECHNOLOGY / SPORTS / …)
 *   • free-text search (…/rss/search?q=)
 * Parsed with cheerio (already a dependency) in xmlMode.
 */
const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; OptimusBot/1.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
};
const LOCALE = 'hl=en-PK&gl=PK&ceid=PK:en';

// friendly keyword → Google News topic section
const TOPICS = {
    world: 'WORLD',
    nation: 'NATION', pakistan: 'NATION', local: 'NATION',
    business: 'BUSINESS', finance: 'BUSINESS',
    tech: 'TECHNOLOGY', technology: 'TECHNOLOGY',
    entertainment: 'ENTERTAINMENT',
    sports: 'SPORTS', sport: 'SPORTS',
    science: 'SCIENCE',
    health: 'HEALTH',
};

/** Strip the trailing " - Source" Google appends to titles. */
function cleanTitle(title, source) {
    let t = String(title || '').trim();
    if (source && t.endsWith(` - ${source}`)) t = t.slice(0, -(source.length + 3)).trim();
    return t;
}

async function fetchFeed(url, limit) {
    const r = await axios.get(url, { headers: HEADERS, timeout: 12000 });
    const $ = cheerio.load(r.data, { xmlMode: true });
    const items = [];
    $('item').each((i, el) => {
        if (items.length >= limit) return false;
        const source = $(el).find('source').first().text().trim();
        const link = $(el).find('link').first().text().trim();
        const title = cleanTitle($(el).find('title').first().text(), source);
        if (title && link) items.push({ title, link, source });
    });
    return items;
}

/**
 * @param {string} query  empty = top headlines; a known topic word = that
 *                        section; anything else = a search query.
 * @param {number} limit
 * @returns {{ label: string, items: {title,link,source}[] }}
 */
async function getNews(query, limit = 6) {
    const q = String(query || '').trim();
    if (!q) {
        return { label: '📰 TOP NEWS', items: await fetchFeed(`https://news.google.com/rss?${LOCALE}`, limit) };
    }
    const topic = TOPICS[q.toLowerCase()];
    if (topic) {
        return { label: `📰 ${topic}`, items: await fetchFeed(`https://news.google.com/rss/headlines/section/topic/${topic}?${LOCALE}`, limit) };
    }
    return { label: `📰 "${q}"`, items: await fetchFeed(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${LOCALE}`, limit) };
}

module.exports = { getNews, fetchFeed, TOPICS };
