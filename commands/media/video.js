const axios = require('axios');
const path = require('path');
const yts = require('yt-search');
const settings = require('../../settings');
const style = require('../../lib/messageStyle');
const ytdlp = require('../../lib/ytdlp');

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

// NOTE: the former HTTP fallback APIs (EliteProTech, Yupra, Okatsu) were removed
// — all three are dead (verified 2026-09-27: 404, DNS no longer resolves, and
// 402 payment-required respectively). yt-dlp is now the only download source,
// and when it is unavailable the command says so instead of blaming the region.

async function videoCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        const searchQuery = text.split(' ').slice(1).join(' ').trim();
        
        
        if (!searchQuery) {
            await sock.sendMessage(chatId, { text: style.invalidInput('Please tell me what video to download.', '.video <name or url>') }, { quoted: message });
            return;
        }

        // Determine if input is a YouTube link
        let videoUrl = '';
        let videoTitle = '';
        let videoThumbnail = '';
        if (searchQuery.startsWith('http://') || searchQuery.startsWith('https://')) {
            videoUrl = searchQuery;
        } else {
            // Search YouTube for the video
            const { videos } = await yts(searchQuery);
            if (!videos || videos.length === 0) {
                await sock.sendMessage(chatId, { text: style.error('No videos found for your search.') }, { quoted: message });
                return;
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
            videoThumbnail = videos[0].thumbnail;
        }

        // Send thumbnail immediately
        try {
            const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
            const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : undefined);
            const captionTitle = videoTitle || searchQuery;
            if (thumb) {
                await sock.sendMessage(chatId, {
                    image: { url: thumb },
                    caption: `🎬 ${captionTitle}\n⏳ Downloading...`
                }, { quoted: message });
            }
        } catch (e) { console.error('[VIDEO] thumb error:', e?.message || e); }
        

        // Validate YouTube URL
        let urls = videoUrl.match(/(?:https?:\/\/)?(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/|playlist\?list=)?)([a-zA-Z0-9_-]{11})/gi);
        if (!urls) {
            await sock.sendMessage(chatId, { text: style.invalidInput('This is not a valid YouTube link.', '.video <name or url>', { box: false }) }, { quoted: message });
            return;
        }

        // Primary: let yt-dlp fetch the media itself. Session-bound GVS URLs 403
        // when fetched by a bare HTTP client, so yt-dlp does the transfer.
        if (await ytdlp.isAvailable()) {
            try {
                const tempDir = path.join(__dirname, '../../temp');
                const dl = await ytdlp.downloadVideo(videoUrl, tempDir);
                if (dl.buffer && dl.buffer.length) {
                    await sock.sendMessage(chatId, {
                        video: dl.buffer,
                        mimetype: 'video/mp4',
                        fileName: `${(videoTitle || 'video').replace(/[^\w\s-]/g, '')}.mp4`,
                        caption: `🎬 ${videoTitle || 'Video'}\n⚡ ${settings.botName || 'Optimus Bot'}`
                    }, { quoted: message });
                    return;
                }
            } catch (e) {
                console.error('[video] yt-dlp download failed:', e.message);
            }
        }

        // Fallback: the HTTP APIs (kept only for when yt-dlp is unavailable).
        let videoData;
        let downloadSuccess = false;

        const apiMethods = [];
        if (await ytdlp.isAvailable()) {
            apiMethods.push({
                name: 'yt-dlp (url)',
                method: async () => ({ download: await ytdlp.getVideoUrl(videoUrl), title: videoTitle })
            });
        }
        // (removed: EliteProTech / Yupra / Okatsu — all three are dead)
        
        // Try each API until we successfully get video data
        for (const apiMethod of apiMethods) {
            if (downloadSuccess) break;
            try {
                videoData = await apiMethod.method();
                const videoUrl_check = videoData.download || videoData.dl || videoData.url;
                
                if (!videoUrl_check) {
                    console.log(`${apiMethod.name} returned no download URL, trying next API...`);
                    continue; // Try next API
                }
                
                downloadSuccess = true;
                break; // Success! Exit the loop
            } catch (apiErr) {
                // API call failed, try next API
                console.log(`${apiMethod.name} API failed:`, apiErr.message);
                continue;
            }
        }
        
        // Nothing left to try.
        if (!downloadSuccess || !videoData) {
            if (apiMethods.length === 0) {
                throw new Error(
                    'yt-dlp is not installed on this host, and it is now the only download source. ' +
                        'Install it with: pip install -U yt-dlp bgutil-ytdlp-pot-provider'
                );
            }
            throw new Error(
                'yt-dlp could not fetch this video — it may be private, age-restricted, or region-locked.'
            );
        }

        const srcUrl = videoData.download || videoData.dl || videoData.url;
        const vCaption = `🎬 ${videoData.title || videoTitle || 'Video'}\n⚡ ${settings.botName || 'Optimus Bot'}`;
        const vFileName = `${(videoData.title || videoTitle || 'video').replace(/[^\w\s-]/g, '')}.mp4`;

        // Download the buffer ourselves first — googlevideo URLs from yt-dlp are
        // IP-locked to this host, so WhatsApp's servers can't fetch them directly.
        let sent = false;
        try {
            const vres = await axios.get(srcUrl, {
                responseType: 'arraybuffer',
                timeout: 120000,
                maxContentLength: 200 * 1024 * 1024,
                headers: {
                    'User-Agent': AXIOS_DEFAULTS.headers['User-Agent'],
                    'Accept': '*/*',
                    'Accept-Encoding': 'identity'
                }
            });
            const buffer = Buffer.from(vres.data);
            if (buffer && buffer.length > 0) {
                await sock.sendMessage(chatId, {
                    video: buffer,
                    mimetype: 'video/mp4',
                    fileName: vFileName,
                    caption: vCaption
                }, { quoted: message });
                sent = true;
            }
        } catch (bufErr) {
            console.error('[VIDEO] buffer download failed, trying URL method:', bufErr.message);
        }

        // Fallback: hand the URL to WhatsApp directly.
        if (!sent) {
            await sock.sendMessage(chatId, {
                video: { url: srcUrl },
                mimetype: 'video/mp4',
                fileName: vFileName,
                caption: vCaption
            }, { quoted: message });
        }


    } catch (error) {
        console.error('[VIDEO] Command Error:', error?.message || error);
        
        // Provide more specific error messages
        let errorMessage = 'Failed to download the video. Please try again later.';
        const msg = String(error?.message || '');
        if (msg.startsWith('yt-dlp')) {
            // Surface actionable causes ("yt-dlp is not installed…") verbatim.
            errorMessage = msg;
        } else if (msg.includes('blocked')) {
            errorMessage = 'Download blocked. The content may be unavailable in your region or due to legal restrictions.';
        } else if (error.response?.status === 451 || error.status === 451) {
            errorMessage = 'Content unavailable. This may be due to legal restrictions or regional blocking.';
        }
        
        await sock.sendMessage(chatId, { 
            text: style.error(errorMessage)
        }, { quoted: message });
    }
}

module.exports = {
    name: 'video',
    aliases: ['ytmp4'],
    category: 'media',
    description: 'Download a video from YouTube',
    usage: '.video <name or url>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await videoCommand(sock, extra.chatId, message);
    },

};