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

            let videoBuffer = null;
            let slideshowImages = null;

            // 1) yt-dlp (verified working)
            if (await ytdlp.isAvailable()) {
                try { videoBuffer = await viaYtdlp(url); } catch (e) { console.error('[tiktok] yt-dlp:', e.message); }
            }
            // 2) ruhend-scraper ttdl (verified working)
            if (!videoBuffer || !videoBuffer.length) {
                try { videoBuffer = await viaTtdl(url); } catch (e) {
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
};
