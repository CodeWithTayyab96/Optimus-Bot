const sharp = require('sharp');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { generateImageEdit } = require('../../lib/ai');
const { channelInfo } = require('../../lib/messageConfig');
const style = require('../../lib/messageStyle');
const { getPrompt } = require('../../lib/aiHelpers');

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

            const prompt = getPrompt(args, message, extra.prefix);
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

            // Centralized Gemini native image editing (Interactions API).
            // Never uploads the image to an arbitrary third-party endpoint.
            const resultImageBuffer = await generateImageEdit(finalImageBuffer, prompt, { mimeType: 'image/jpeg' });

            if (!resultImageBuffer || resultImageBuffer.length === 0) {
                return await extra.reply(style.error("I couldn't edit the image right now. The image editing service may be unavailable — please try again."));
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

            return await extra.reply(style.error("I couldn't edit the image right now. Please try again."));
        }
    },
};
