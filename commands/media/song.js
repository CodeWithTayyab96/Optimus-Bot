const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const style = require('../../lib/messageStyle');
const { downloadYouTubeAudio, toMp3Buffer } = require('../../lib/ytAudio');

async function songCommand(sock, chatId, message, query) {
    try {
        const text = (query || '').trim();
        if (!text) {
            await sock.sendMessage(chatId, { text: style.invalidInput('Please provide a song name or YouTube link.', '.song <song name or YouTube link>') }, { quoted: message });
            return;
        }

        let video;
        if (text.includes('youtube.com') || text.includes('youtu.be')) {
            const m = text.match(/https?:\/\/\S+/);
            video = { url: m ? m[0] : text };
        } else {
            const search = await yts(text);
            if (!search || !search.videos.length) {
                await sock.sendMessage(chatId, { text: style.error('No results found for your search.') }, { quoted: message });
                return;
            }
            video = search.videos[0];
        }

        // Inform user
        await sock.sendMessage(chatId, {
            image: { url: video.thumbnail },
            caption: `🎵 Downloading: *${video.title || 'Your song'}*\n⏱️ Duration: ${video.timestamp || 'Unknown'}`
        }, { quoted: message });

        // Download audio via the shared robust chain (yt-dlp primary + API
        // fallbacks). Trying each source until one yields a valid buffer.
        const tempDir = path.join(__dirname, '../../temp');
        let audioData;
        try {
            audioData = await downloadYouTubeAudio(video.url, { tempDir, title: video.title });
        } catch (e) {
            console.error('[song] download failed:', e.message);
            throw new Error('All download sources failed. The content may be unavailable or blocked in your region.');
        }

        const audioBuffer = audioData.buffer;
        if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('Downloaded audio buffer is empty');
        }

        // Detect actual format and normalize to a WhatsApp-friendly MP3.
        const normalized = await toMp3Buffer(audioBuffer);

        // Send buffer as MP3
        await sock.sendMessage(chatId, {
            audio: normalized.buffer,
            mimetype: normalized.mimetype,
            fileName: `${(audioData.title || video.title || 'song').replace(/[^\w\s-]/g, '')}.${normalized.extension}`,
            ptt: false
        }, { quoted: message });

        // Cleanup: Delete stray temp files older than 10 seconds.
        try {
            if (fs.existsSync(tempDir)) {
                const now = Date.now();
                for (const file of fs.readdirSync(tempDir)) {
                    const filePath = path.join(tempDir, file);
                    try {
                        const stats = fs.statSync(filePath);
                        if (now - stats.mtimeMs > 10000) {
                            if (file.endsWith('.mp3') || file.endsWith('.m4a') || /^\d+\.(mp3|m4a)$/.test(file)) {
                                fs.unlinkSync(filePath);
                            }
                        }
                    } catch (e) {
                        // Ignore individual file errors
                    }
                }
            }
        } catch (cleanupErr) {
            // Ignore cleanup errors
        }

    } catch (err) {
        console.error('Song command error:', err);

        let errorMessage = 'Failed to download the song. Please try again later.';
        if (err.message && err.message.includes('blocked')) {
            errorMessage = 'Download blocked. The content may be unavailable in your region or due to legal restrictions.';
        } else if (err.response?.status === 451 || err.status === 451) {
            errorMessage = 'Content unavailable. This may be due to legal restrictions or regional blocking.';
        } else if (err.message && err.message.includes('All download sources failed')) {
            errorMessage = 'All download sources failed. The content may be unavailable or blocked.';
        }

        await sock.sendMessage(chatId, {
            text: style.error(errorMessage)
        }, { quoted: message });
    }
}

module.exports = {
    name: 'song',
    aliases: ['play', 'mp3', 'ytmp3'],
    category: 'media',
    description: 'Download a song from YouTube',
    usage: '.song <name or url>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await songCommand(sock, extra.chatId, message, args.join(' '));
    },

};
