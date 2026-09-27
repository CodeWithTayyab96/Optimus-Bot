const fetch = require('node-fetch');
const style = require('../../lib/messageStyle');

const REQ_TIMEOUT = 10000;
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
};

/** Strip LRC timestamps ([mm:ss.xx]) from synced lyrics. */
function cleanSynced(synced) {
    if (!synced) return '';
    return synced
        .replace(/\[\d{1,2}:\d{2}(?:\.\d{1,2})?\]/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

/** Primary source: lrclib free-text search (accepts a whole phrase). */
async function fetchLyricsLrclib(query) {
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { timeout: REQ_TIMEOUT, headers: HEADERS });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) return null;
    const plain = arr.find(t => t && t.plainLyrics && t.plainLyrics.trim());
    if (plain) return plain.plainLyrics.trim();
    const synced = arr.find(t => t && t.syncedLyrics && t.syncedLyrics.trim());
    if (synced) return cleanSynced(synced.syncedLyrics);
    return null;
}

/** Fallback source: lyrics.ovh (needs artist/title, so best-effort split). */
async function fetchLyricsOvh(query) {
    let artist = '';
    let title = query;
    const m = query.match(/(.+?)\s+(?:-|–|by)\s+(.+)/i);
    if (m) { artist = m[1].trim(); title = m[2].trim(); }
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await fetch(url, { timeout: REQ_TIMEOUT, headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const lyrics = data && data.lyrics ? data.lyrics.trim() : null;
    if (!lyrics || /no lyrics found/i.test(lyrics)) return null;
    return lyrics;
}

/**
 * Try each lyrics source in turn. Returns the first lyrics text found, or null.
 * A failing/dead source is skipped — we never throw from here.
 */
async function fetchLyrics(query) {
    const sources = [fetchLyricsLrclib, fetchLyricsOvh];
    let lastErr = null;
    for (const fn of sources) {
        try {
            const l = await fn(query);
            if (l) return l;
        } catch (e) {
            lastErr = e;
            // try next source
        }
    }
    if (lastErr) console.error('[lyrics] all sources failed:', lastErr.message);
    return null;
}

async function lyricsCommand(sock, chatId, songTitle, message) {
    if (!songTitle) {
        await sock.sendMessage(chatId, {
            text: style.invalidInput('Please enter the song name to get the lyrics.', '.lyrics <song title>')
        }, { quoted: message });
        return;
    }

    try {
        const lyrics = await fetchLyrics(songTitle);

        if (!lyrics) {
            await sock.sendMessage(chatId, {
                text: style.error(`Sorry, I couldn't find any lyrics for "${songTitle}".`)
            }, { quoted: message });
            return;
        }

        const maxChars = 4096;
        const output = lyrics.length > maxChars ? lyrics.slice(0, maxChars - 3) + '...' : lyrics;

        await sock.sendMessage(chatId, { text: output }, { quoted: message });
    } catch (error) {
        console.error('Error in lyrics command:', error && error.message ? error.message : error);
        await sock.sendMessage(chatId, {
            text: style.error(`An error occurred while fetching the lyrics for "${songTitle}".`)
        }, { quoted: message });
    }
}

module.exports = {
    name: 'lyrics',
    aliases: [],
    category: 'media',
    description: 'Find song lyrics',
    usage: '.lyrics <song title>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await lyricsCommand(sock, extra.chatId, extra.userMessage.split(/\s+/).slice(1).join(' '), message);
    },
    lyricsCommand,
};
