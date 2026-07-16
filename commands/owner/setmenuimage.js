const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'setmenuimage',
    aliases: ['setmenuimg', 'changemenuimage'],
    category: 'owner',
    description: 'Set the menu/help image (assets/bot_image.jpg)',
    usage: '.setmenuimage (reply to image or sticker)',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const ctx = message.message?.extendedTextMessage?.contextInfo;
            if (!ctx?.quotedMessage) {
                return extra.reply('📷 Please reply to an *image* or *sticker* to set it as the menu image.');
            }

            const quotedMsg = ctx.quotedMessage;
            const imageMsg = quotedMsg.imageMessage || quotedMsg.stickerMessage;

            if (!imageMsg) {
                return extra.reply('❌ The replied message must be an *image* or *sticker*.');
            }

            const targetMessage = {
                key: {
                    remoteJid: extra.chatId,
                    id: ctx.stanzaId,
                    participant: ctx.participant,
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
                return extra.reply('❌ Failed to download the image. Please try again.');
            }

            // Convert stickers (webp) and non-JPEG formats to JPEG using jimp
            let finalBuffer = mediaBuffer;
            const isJpeg = imageMsg.mimetype?.includes('jpeg') || imageMsg.mimetype?.includes('jpg');
            if (quotedMsg.stickerMessage || !isJpeg) {
                const { Jimp } = require('jimp');
                const img = await Jimp.read(mediaBuffer);
                finalBuffer = await img.getBuffer('image/jpeg');
            }

            const imagePath = path.join(__dirname, '../../assets/bot_image.jpg');

            if (fs.existsSync(imagePath)) {
                try {
                    fs.unlinkSync(imagePath);
                } catch (e) {
                    console.warn('Could not delete old menu image:', e);
                }
            }

            fs.writeFileSync(imagePath, finalBuffer);

            await extra.reply('✅ Menu image has been updated successfully!');
        } catch (error) {
            console.error('SetMenuImage command error:', error);
            await extra.reply(`❌ Failed to set menu image: ${error.message}`);
        }
    }
};
