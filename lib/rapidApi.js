/**
 * rapidApi — YouTube metadata + media URLs via RapidAPI's "YouTube Media
 * Downloader". Used ONLY as a fallback when yt-dlp cannot fetch.
 *
 * WHY THIS EXISTS
 *   yt-dlp fetches from THIS host's IP. On a flagged datacenter IP every player
 *   client is refused with "Sign in to confirm you're not a bot", and no client,
 *   cookie or plugin choice fixes that — `.ytdiag` proves it in one command. This
 *   service fetches from ITS OWN IPs, so it works where yt-dlp cannot. It also
 *   reaches videos yt-dlp reports as region-restricted.
 *
 * ⚠️  IT IS A THIRD-PARTY DEPENDENCY AND WILL EVENTUALLY ROT.
 *     Three earlier ones (EliteProTech, Yupra, Okatsu) all died. So yt-dlp stays
 *     primary and this is only reached after yt-dlp has failed.
 *
 * ⚠️  THE FREE TIER IS 100 REQUESTS/MONTH. That is roughly three a day — treat
 *     it as a safety net, not a primary source, and check `.dlstatus`.
 *
 * Configure in .env:
 *   RAPIDAPI_KEY=...                                        (required)
 *   RAPIDAPI_HOST=youtube-media-downloader.p.rapidapi.com   (optional)
 */
const axios = require('axios');

const DEFAULT_HOST = 'youtube-media-downloader.p.rapidapi.com';

function apiKey() {
    return String(process.env.RAPIDAPI_KEY || '').trim();
}

function apiHost() {
    return String(process.env.RAPIDAPI_HOST || DEFAULT_HOST).trim();
}

/** True when a key is configured — callers use this to skip the fallback cheaply. */
function isConfigured() {
    return Boolean(apiKey());
}

/** Pull the 11-character video id out of any common YouTube URL form. */
function videoIdFrom(url) {
    const s = String(url || '');
    const patterns = [
        /[?&]v=([A-Za-z0-9_-]{11})/,
        /youtu\.be\/([A-Za-z0-9_-]{11})/,
        /\/shorts\/([A-Za-z0-9_-]{11})/,
        /\/embed\/([A-Za-z0-9_-]{11})/,
        /\/live\/([A-Za-z0-9_-]{11})/,
    ];
    for (const re of patterns) {
        const m = s.match(re);
        if (m) return m[1];
    }
    // Already a bare id?
    return /^[A-Za-z0-9_-]{11}$/.test(s.trim()) ? s.trim() : null;
}

/**
 * Fetch full details for a video. Returns the API's object, or throws with a
 * message that says what actually went wrong (bad key, quota, region, …).
 */
async function getDetails(videoId) {
    if (!isConfigured()) throw new Error('RAPIDAPI_KEY is not set');

    const res = await axios.get(`https://${apiHost()}/v2/video/details`, {
        params: { videoId },
        headers: {
            'x-rapidapi-key': apiKey(),
            'x-rapidapi-host': apiHost(),
        },
        timeout: 45000,
    });

    const data = res.data;
    if (!data || data.errorId) {
        throw new Error(`API error ${data?.errorId || 'unknown'}: ${data?.message || 'no message'}`);
    }
    return data;
}

/** Highest-quality MP4 that already contains audio (WhatsApp cannot mux). */
function pickMuxedVideo(details) {
    const items = details?.videos?.items || [];
    const muxed = items.filter((v) => v.hasAudio && /mp4/i.test(v.mimeType || '') && v.url);
    if (!muxed.length) return null;
    const height = (v) => parseInt(String(v.quality || '0').replace(/\D/g, ''), 10) || 0;
    return muxed.sort((a, b) => height(b) - height(a))[0];
}

/** Best audio-only track: prefer m4a, then the largest, for a clean mp3 transcode. */
function pickAudio(details) {
    const items = details?.audios?.items || [];
    const usable = items.filter((a) => a.url);
    if (!usable.length) return null;
    const isM4a = (a) => /audio\/mp4|m4a/i.test(a.mimeType || '') || a.extension === 'm4a';
    const m4a = usable.filter(isM4a);
    const pool = m4a.length ? m4a : usable;
    return pool.sort((a, b) => (b.size || 0) - (a.size || 0))[0];
}

module.exports = {
    isConfigured,
    videoIdFrom,
    getDetails,
    pickMuxedVideo,
    pickAudio,
    DEFAULT_HOST,
};
