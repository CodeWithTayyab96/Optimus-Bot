const axios = require('axios');
const settings = require('../../settings');
const style = require('../../lib/messageStyle');
const ytdlp = require('../../lib/ytdlp');
const proxyPool = require('../../lib/proxyPool');
const ffmpeg = require('../../lib/ffmpeg');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function downloadBuffer(url) {
    const res = await proxyPool.get(url, {
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: 200 * 1024 * 1024,
        headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Encoding': 'identity' }
    });
    return Buffer.from(res.data);
}

/** Primary: yt-dlp (local binary). */
async function viaYtdlp(url) {
    const direct = await ytdlp.getBestUrl(url);
    return downloadBuffer(direct);
}

const SHORT_LINK_RE = /^https?:\/\/(?:vt|vm)\.tiktok\.com\//i;
const VIDEO_PATH_RE = /\/video\/\d+/;

/**
 * Resolve a TikTok short link, and detect one that has expired.
 *
 * Short links expire, and an expired one 302s to the homepage. yt-dlp then fails
 * with "Unexpected response from webpage request", which tells the user nothing
 * useful. Resolving it here means we can say what actually happened — and yt-dlp
 * gets the canonical URL instead of having to follow a redirect itself.
 *
 * @returns {Promise<{url: string, expired: boolean}>} `url` is the best URL to use.
 */
async function resolveShortLink(url) {
    if (!SHORT_LINK_RE.test(url)) return { url, expired: false };

    let current = url;
    for (let hop = 0; hop < 3; hop++) {
        let res;
        try {
            res = await proxyPool.get(current, {
                maxRedirects: 0,
                validateStatus: () => true, // we want the 302 itself, not an exception
                timeout: 20000,
                headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
            });
        } catch {
            return { url, expired: false }; // can't tell — let yt-dlp try
        }

        const next = res.headers?.location;
        if (!next) break;
        try {
            current = new URL(next, current).toString();
        } catch {
            break;
        }
        if (VIDEO_PATH_RE.test(current)) return { url: current, expired: false };
    }

    // Ended up somewhere that is not a video page → the short link is dead.
    return { url, expired: !VIDEO_PATH_RE.test(current) };
}

/** Fallback: ruhend-scraper ttdl (no key). */
async function viaTtdl(url) {
    const { ttdl } = require('ruhend-scraper');
    const r = await ttdl(url);
    // ttdl returns a flat object: { title, author, video, video_hd, video_wm, ... }
    // A photo-mode slideshow post has no video URL but an `images` array.
    const mediaUrl = r && (r.video_hd || r.video || r.video_wm);
    if (!mediaUrl) {
        const err = new Error('ttdl returned no video url');
        if (r && Array.isArray(r.images) && r.images.length) err.images = r.images;
        throw err;
    }
    return downloadBuffer(mediaUrl);
}

module.exports = {
    name: 'tiktok',
    aliases: ['tt'],
    category: 'media',
    description: 'Download a TikTok video',
    usage: '.tiktok <url>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const url = args.join(' ').trim();

            if (!url) {
                return await extra.reply(style.invalidInput('Please provide a TikTok link for the video.', `${extra.prefix}tiktok <url>`));
            }
            if (!/tiktok\.com/i.test(url)) {
                return await extra.reply(style.invalidInput('That is not a valid TikTok link. Please provide a valid TikTok video link.', `${extra.prefix}tiktok <url>`));
            }

            await sock.sendMessage(extra.chatId, { react: { text: '🔄', key: message.key } });

            // Short links expire and then 302 to the homepage. Check first, so the
            // user gets "this link is dead" rather than yt-dlp's opaque
            // "Unexpected response from webpage request".
            const resolved = await resolveShortLink(url);
            if (resolved.expired) {
                return await extra.reply(style.error(
                    "That TikTok link is invalid or has expired — it redirects to TikTok's homepage instead of a video. Please send a fresh link."
                ));
            }
            const target = resolved.url;

            let videoBuffer = null;
            let slideshowImages = null;

            // 1) yt-dlp (verified working)
            if (await ytdlp.isAvailable()) {
                try { videoBuffer = await viaYtdlp(target); } catch (e) { console.error('[tiktok] yt-dlp:', e.message); }
            }
            // 2) ruhend-scraper ttdl (verified working)
            if (!videoBuffer || !videoBuffer.length) {
                try { videoBuffer = await viaTtdl(target); } catch (e) {
                    console.error('[tiktok] ttdl:', e.message);
                    if (e.images && e.images.length) slideshowImages = e.images;
                }
            }

            if (!videoBuffer || !videoBuffer.length) {
                if (slideshowImages && slideshowImages.length) {
                    return await extra.reply(style.info(
                        'This TikTok post is a photo slideshow, not a video — I can only download videos, not photo posts yet.'
                    ));
                }
                throw new Error('All download methods failed');
            }

            // TikTok mirrors (ttdl/tikwm) often serve HEVC/H.265, which WhatsApp
            // can't decode — the result is a black video with working audio.
            // Normalise to H.264 (audio untouched) so it actually plays.
            try { videoBuffer = ffmpeg.ensureH264(videoBuffer); } catch (e) { console.error('[tiktok] ensureH264:', e.message); }

            await sock.sendMessage(extra.chatId, {
                video: videoBuffer,
                mimetype: 'video/mp4',
                caption: `𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗗 𝗕𝗬 ${(settings.botName || 'OPTIMUS BOT').toUpperCase()}`
            }, { quoted: message });
        } catch (error) {
            console.error('[tiktok] error:', error.message);
            return await extra.reply(style.error('Failed to download the TikTok video. Please try another link.'));
        }
    },
    // Exported for tests.
    _test: { resolveShortLink, SHORT_LINK_RE, VIDEO_PATH_RE },
};
