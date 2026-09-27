const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const style = require('../../lib/messageStyle');
const { downloadYouTubeAudio, toMp3Buffer } = require('../../lib/ytAudio');

async function playCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        const searchQuery = text.split(' ').slice(1).join(' ').trim();

        if (!searchQuery) {
            return await sock.sendMessage(chatId, {
                text: style.invalidInput('Please tell me what song to download.', '.music <song name>')
            });
        }

        // Search for the song
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            return await sock.sendMessage(chatId, {
                text: style.error('No songs found for your search.')
            });
        }

        const video = videos[0];
        const urlYt = video.url;

        await sock.sendMessage(chatId, {
            text: style.processing(`🎵 Fetching audio for: *${video.title || searchQuery}*`)
        });

        // Download audio via the shared robust chain (yt-dlp primary + API
        // fallbacks). This no longer depends on a single brittle host.
        const tempDir = path.join(__dirname, '../../temp');
        let audioData;
        try {
            audioData = await downloadYouTubeAudio(urlYt, { tempDir, title: video.title });
        } catch (e) {
            console.error('[music] download failed:', e.message);
            // Show the real cause (e.g. "yt-dlp is not installed…") so the
            // failure is diagnosable instead of a vague "source unavailable".
            const msg = String(e?.message || '');
            return await sock.sendMessage(chatId, {
                text: style.error(
                    msg.startsWith('yt-dlp')
                        ? msg
                        : 'Failed to fetch the audio. The source may be unavailable or blocked. Please try again later.'
                )
            });
        }

        const normalized = await toMp3Buffer(audioData.buffer);
        const safeTitle = (audioData.title || video.title || 'song').replace(/[^\w\s-]/g, '').trim() || 'song';

        await sock.sendMessage(chatId, {
            audio: normalized.buffer,
            mimetype: normalized.mimetype,
            fileName: `${safeTitle}.${normalized.extension}`,
            ptt: false
        }, { quoted: message });

        // Best-effort cleanup of any stray temp files older than 10s.
        try {
            if (fs.existsSync(tempDir)) {
                const now = Date.now();
                for (const file of fs.readdirSync(tempDir)) {
                    const fp = path.join(tempDir, file);
                    try {
                        const st = fs.statSync(fp);
                        if (now - st.mtimeMs > 10000 && /^\d+\.(mp3|m4a|webm|ogg|wav|opus)$/.test(file)) {
                            fs.unlinkSync(fp);
                        }
                    } catch { /* ignore */ }
                }
            }
        } catch { /* ignore */ }

    } catch (error) {
        console.error('Error in song2 command:', error);
        await sock.sendMessage(chatId, {
            text: style.error('Download failed. Please try again later.')
        });
    }
}

module.exports = {
    name: 'music',
    aliases: [],
    category: 'media',
    description: 'Search and play music',
    usage: '.music <song name>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await playCommand(sock, extra.chatId, message);
    },
};

/*Powered by OPTIMUS-BOT*
*Credits to Keith MD*`*/
