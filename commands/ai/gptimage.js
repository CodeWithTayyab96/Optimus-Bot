const axios = require('axios');
const sharp = require('sharp');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { uploadImage } = require('../../lib/uploadImage');
const style = require('../../lib/messageStyle');

const EDITIMG_API = 'https://restapis.xrizaldev.my.id/api/ai2/editimg';

module.exports = {
    name: 'gptimage',
    aliases: ['gptimg', 'editimage', 'aiimage', 'gi'],
    category: 'ai',
    description: 'Edit an image with AI using a prompt (reply to image/sticker)',
    usage: '.gptimage <prompt> (reply to image/sticker)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const ctxInfo = message.message?.extendedTextMessage?.contextInfo;
            if (!ctxInfo?.quotedMessage) {
                return await extra.reply(
                    style.box('🎨 AI IMAGE', [
                        'Reply to an image or sticker with a prompt to edit it.',
                        '',
                        'Usage:',
                        ` ${extra.prefix}gptimage <your prompt>`,
                        '',
                        'Example: Reply to an image with:',
                        ` ${extra.prefix}gptimage change the background to a beach`
                    ])
                );
            }

            const prompt = args.join(' ').trim();
            if (!prompt) {
                return await extra.reply(
                    style.invalidInput('Please provide a prompt for editing the image.', `${extra.prefix}gptimage <your prompt> (reply to image/sticker)`)
                );
            }

            const quotedMsg = ctxInfo.quotedMessage;
            const isImage = !!quotedMsg.imageMessage;
            const isSticker = !!quotedMsg.stickerMessage;

            if (!isImage && !isSticker) {
                return await extra.reply(style.error('Please reply to an image or sticker.'));
            }

            if (isSticker) {
                const stickerMessage = quotedMsg.stickerMessage;
                const isAnimated = stickerMessage.isAnimated || stickerMessage.mimetype?.includes('animated');
                if (isAnimated) {
                    return await extra.reply(style.error('Animated stickers are not supported. Please use a static image or sticker.'));
                }
            }

            const targetMessage = {
                key: {
                    remoteJid: extra.chatId,
                    id: ctxInfo.stanzaId,
                    participant: ctxInfo.participant,
                },
                message: quotedMsg,
            };

            const mediaBuffer = await downloadMediaMessage(
                targetMessage,
                'buffer',
                {},
                { logger: undefined, reuploadRequest: sock.updateMediaMessage },
            );

            if (!mediaBuffer) {
                return await extra.reply(style.error('Failed to download the image. Please try again.'));
            }

            // Normalize to JPEG (also converts webp stickers — sharp reads webp natively)
            let finalImageBuffer = mediaBuffer;
            try {
                const metadata = await sharp(mediaBuffer).metadata();
                if (metadata.format !== 'jpeg' && metadata.format !== 'jpg') {
                    finalImageBuffer = await sharp(mediaBuffer)
                        .jpeg({ quality: 90 })
                        .toBuffer();
                }
            } catch (error) {
                console.error('[gptimage] sharp processing error:', error.message);
                if (isSticker) {
                    return await extra.reply(style.error('Failed to convert the sticker to an image. Please try with a regular image.'));
                }
            }

            // The edit API requires a public image_url
            let imageUrl;
            try {
                imageUrl = await uploadImage(finalImageBuffer);
            } catch (uploadErr) {
                console.error('[gptimage] upload error:', uploadErr.message);
                return await extra.reply(style.error('Failed to upload the image. Please try again.'));
            }

            const apiUrl = `${EDITIMG_API}?image_url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`;

            const response = await axios.get(apiUrl, {
                timeout: 120000,
                maxContentLength: 10 * 1024 * 1024,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            });

            if (response.data?.status === false) {
                return await extra.reply(style.error('The image service returned an error. Please try another image or prompt.'));
            }
            const result = response.data?.result || response.data;
            const outputImageUrl = result?.output_image;

            if (!outputImageUrl) {
                return await extra.reply(style.error('No image was returned. Please try again.'));
            }

            const imageResponse = await axios.get(outputImageUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
            });

            const resultImageBuffer = Buffer.from(imageResponse.data);

            if (!resultImageBuffer || resultImageBuffer.length === 0) {
                return await extra.reply(style.error('The image service returned an empty result. Please try again.'));
            }

            const maxImageSize = 5 * 1024 * 1024;
            if (resultImageBuffer.length > maxImageSize) {
                return await extra.reply(
                    style.error(`Image too large: ${(resultImageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 5MB)`)
                );
            }

            await sock.sendMessage(extra.chatId, {
                image: resultImageBuffer,
                caption: `🎨 AI Image Editor\n📝 ${prompt}`,
            }, { quoted: message });
        } catch (error) {
            console.error('Error in gptimage command:', error);

            if (error.response) {
                const status = error.response.status;
                if (status === 400) {
                    return await extra.reply(style.error('Bad request: invalid parameters. Please check your prompt and image.'));
                } else if (status === 429) {
                    return await extra.reply(style.error('Rate limit exceeded. Please try again later.'));
                } else if (status === 500) {
                    return await extra.reply(style.error('Server error. Please try again later.'));
                }
            }

            if (error.code === 'ECONNABORTED') {
                return await extra.reply(style.error('Request timed out. The image processing took too long. Please try again.'));
            }

            return await extra.reply(style.error("I couldn't edit the image right now. Please try again."));
        }
    },
};
