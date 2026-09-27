const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const style = require('../../lib/messageStyle');
const { ffmpegBin } = require('../../lib/ffmpegPath');

const BASE = 'https://api.shizo.top/tools/meme-search';

module.exports = {
    name: 'memesearch',
    aliases: ['memes', 'sm', 'smeme', 'gifsearch'],
    category: 'fun',
    description: 'Search and send a meme (image or GIF)',
    usage: '.memesearch <query>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const query = args.join(' ').trim();

            if (!query) {
                return await extra.reply(style.invalidInput('Please provide a search query.', `${extra.prefix}memesearch <query>`));
            }

            const url = `${BASE}?apikey=shizo&query=${encodeURIComponent(query)}`;
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const mediaBuffer = Buffer.from(response.data);

            if (!mediaBuffer || mediaBuffer.length === 0) {
                throw new Error('Empty response from API');
            }

            // WhatsApp limits: 16MB for videos, 5MB for images
            const maxVideoSize = 16 * 1024 * 1024;
            const maxImageSize = 5 * 1024 * 1024;

            const contentType = response.headers['content-type'] || '';
            const fileHeader = mediaBuffer.slice(0, 6).toString('ascii');
            const isGIF = fileHeader === 'GIF89a' || fileHeader === 'GIF87a' || contentType.includes('gif');

            if (isGIF) {
                if (mediaBuffer.length > maxVideoSize) {
                    throw new Error(`GIF file too large: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB (max 16MB)`);
                }

                // Convert GIF to MP4 for WhatsApp playback (system ffmpeg, same as stickercrop)
                const tempDir = path.join(process.cwd(), 'tmp');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                const timestamp = Date.now();
                const gifPath = path.join(tempDir, `meme_gif_${timestamp}.gif`);
                const mp4Path = path.join(tempDir, `meme_mp4_${timestamp}.mp4`);

                try {
                    fs.writeFileSync(gifPath, mediaBuffer);

                    const ffmpegCmd = `${ffmpegBin()} -i "${gifPath}" -vf "fps=15,scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -fps_mode vfr -y "${mp4Path}"`;

                    await new Promise((resolve, reject) => {
                        exec(ffmpegCmd, { maxBuffer: 10 * 1024 * 1024 }, (error) => {
                            if (error) reject(error);
                            else resolve();
                        });
                    });

                    if (!fs.existsSync(mp4Path)) {
                        throw new Error('MP4 output file not found');
                    }

                    const mp4Buffer = fs.readFileSync(mp4Path);

                    if (mp4Buffer.length > maxVideoSize) {
                        throw new Error(`MP4 file too large: ${(mp4Buffer.length / 1024 / 1024).toFixed(2)}MB`);
                    }

                    await sock.sendMessage(extra.chatId, {
                        video: mp4Buffer,
                        mimetype: 'video/mp4',
                        gifPlayback: true
                    }, { quoted: message });
                } catch (convertError) {
                    // Fallback: send the original GIF as a document
                    await sock.sendMessage(extra.chatId, {
                        document: mediaBuffer,
                        mimetype: 'image/gif',
                        fileName: `meme_${query.replace(/\s+/g, '_')}.gif`
                    }, { quoted: message });
                } finally {
                    try {
                        if (fs.existsSync(gifPath)) fs.unlinkSync(gifPath);
                        if (fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path);
                    } catch (cleanupError) {
                        // Ignore cleanup errors
                    }
                }
            } else if (contentType.includes('video') || contentType.includes('mp4')) {
                if (mediaBuffer.length > maxVideoSize) {
                    throw new Error(`Video file too large: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB (max 16MB)`);
                }

                await sock.sendMessage(extra.chatId, {
                    video: mediaBuffer,
                    mimetype: 'video/mp4'
                }, { quoted: message });
            } else {
                if (mediaBuffer.length > maxImageSize) {
                    throw new Error(`Image file too large: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB (max 5MB)`);
                }

                await sock.sendMessage(extra.chatId, {
                    image: mediaBuffer
                }, { quoted: message });
            }
        } catch (error) {
            console.error('Error in memesearch command:', error);
            await extra.reply('❌ Failed to fetch the meme. Please try again later.');
        }
    }
};
