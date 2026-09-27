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

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    throw lastError;
}

// EliteProTech API - Primary
async function getEliteProTechVideoByUrl(youtubeUrl) {
    const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp4`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.downloadURL) {
        return {
            download: res.data.downloadURL,
            title: res.data.title
        };
    }
    throw new Error('EliteProTech ytdown returned no download');
}

async function getYupraVideoByUrl(youtubeUrl) {
    const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.data?.download_url) {
        return {
            download: res.data.data.download_url,
            title: res.data.data.title,
            thumbnail: res.data.data.thumbnail
        };
    }
    throw new Error('Yupra returned no download');
}

async function getOkatsuVideoByUrl(youtubeUrl) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    // shape: { status, creator, url, result: { status, title, mp4 } }
    if (res?.data?.result?.mp4) {
        return { download: res.data.result.mp4, title: res.data.result.title };
    }
    throw new Error('Okatsu ytmp4 returned no mp4');
}

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
        apiMethods.push(
            { name: 'EliteProTech', method: () => getEliteProTechVideoByUrl(videoUrl) },
            { name: 'Yupra', method: () => getYupraVideoByUrl(videoUrl) },
            { name: 'Okatsu', method: () => getOkatsuVideoByUrl(videoUrl) }
        );
        
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
        
        // If all APIs failed, throw error
        if (!downloadSuccess || !videoData) {
            throw new Error('All download sources failed. The content may be unavailable or blocked in your region.');
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
        if (error.message && error.message.includes('blocked')) {
            errorMessage = 'Download blocked. The content may be unavailable in your region or due to legal restrictions.';
        } else if (error.response?.status === 451 || error.status === 451) {
            errorMessage = 'Content unavailable. This may be due to legal restrictions or regional blocking.';
        } else if (error.message && error.message.includes('All download sources failed')) {
            errorMessage = 'All download sources failed. The content may be unavailable or blocked.';
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