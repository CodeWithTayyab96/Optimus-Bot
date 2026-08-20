const axios = require('axios');
const settings = require('../../settings');
const style = require('../../lib/messageStyle');

const processedMessages = new Set();

module.exports = {
    name: 'pinterest',
    aliases: ['pin', 'pindl', 'pinterestdl'],
    category: 'media',
    description: 'Download images/videos from Pinterest',
    usage: '.pinterest <Pinterest URL>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            if (processedMessages.has(message.key.id)) return;
            processedMessages.add(message.key.id);
            setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);

            const text = args.join(' ').trim();

            if (!text) {
                return await extra.reply(
                    style.box('📌 PINTEREST', [
                        'Download images or videos from Pinterest.',
                        '',
                        'Usage:',
                        ` ${extra.prefix}pinterest <Pinterest URL>`,
                        '',
                        'Example:',
                        ` ${extra.prefix}pinterest https://in.pinterest.com/pin/1109363320773690068/`
                    ])
                );
            }

            // Match Pinterest pin URLs, including pin.it shortened links (with or without https)
            let urlMatch = text.match(/https?:\/\/[^\s]*pinterest[^\s]*\/pin\/[^\s]+/i);
            if (!urlMatch) urlMatch = text.match(/https?:\/\/pin\.it\/[^\s]+/i);
            if (!urlMatch) urlMatch = text.match(/pin\.it\/[^\s]+/i);

            if (!urlMatch) {
                return await extra.reply(style.invalidInput('Please provide a valid Pinterest pin URL.', `${extra.prefix}pinterest <Pinterest URL>`));
            }

            const pinterestUrl = urlMatch[0];

            await sock.sendMessage(extra.chatId, {
                react: { text: '📥', key: message.key }
            });

            const apiUrl = `https://api.nexray.web.id/downloader/pinterest?url=${encodeURIComponent(pinterestUrl)}`;

            let response;
            try {
                response = await axios.get(apiUrl, {
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
            } catch (error) {
                console.error('[pinterest] API error:', error.message);
                if (error.response) {
                    const status = error.response.status;
                    if (status === 400) {
                        return await extra.reply(style.error('Bad request: invalid Pinterest URL. Please check the link.'));
                    } else if (status === 429) {
                        return await extra.reply(style.error('Rate limit exceeded. Please try again later.'));
                    } else if (status === 500) {
                        return await extra.reply(style.error('Server error. Please try again later.'));
                    }
                }
                return await extra.reply(style.error('Failed to fetch Pinterest content. Please try again.'));
            }

            if (!response.data || !response.data.status || !response.data.result) {
                return await extra.reply(style.error('Invalid response from the API. The pin might not exist or be private.'));
            }

            const pinData = response.data.result;

            // A video field means it's a video pin; otherwise fall back to image URL
            const isVideo = !!pinData.video;
            const mediaUrl = pinData.video || pinData.image || pinData.url;
            const title = pinData.title || 'Pinterest Pin';
            const author = pinData.author || 'Unknown';

            if (!mediaUrl) {
                return await extra.reply(style.error('No media URL found in the API response. The pin might have an unsupported format.'));
            }

            let caption = `📌 *${title}*\n\n`;
            if (author && author !== 'Unknown') {
                caption += `👤 Author: ${author}\n`;
            }
            caption += `\n*Downloaded by ${settings.botName || 'Optimus Bot'}*`;

            if (isVideo) {
                // Pinterest tokenized video URLs need to be downloaded as a buffer
                try {
                    const videoResponse = await axios.get(mediaUrl, {
                        responseType: 'arraybuffer',
                        timeout: 120000,
                        maxContentLength: 100 * 1024 * 1024,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'video/mp4,video/*,*/*',
                            'Referer': 'https://www.pinterest.com/'
                        }
                    });

                    const videoBuffer = Buffer.from(videoResponse.data);

                    if (!videoBuffer || videoBuffer.length < 100) {
                        throw new Error('Video buffer empty or corrupted');
                    }

                    await sock.sendMessage(extra.chatId, {
                        video: videoBuffer,
                        caption: caption
                    }, { quoted: message });
                } catch (videoError) {
                    console.error('[pinterest] video download/send error:', videoError.message);
                    return await extra.reply(style.error('Failed to download or send the video. It might be expired or require authentication.'));
                }
            } else {
                await sock.sendMessage(extra.chatId, {
                    image: { url: mediaUrl },
                    caption: caption
                }, { quoted: message });
            }
        } catch (error) {
            console.error('Error in pinterest command:', error);
            return await extra.reply(style.error('Failed to download the Pinterest content. Please try again.'));
        }
    },
};
