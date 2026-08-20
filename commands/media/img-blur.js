const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const sharp = require('sharp');
const settings = require('../../settings');
const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');

async function blurCommand(sock, chatId, message, quotedMessage) {
    try {
        // Get the image to blur
        let imageBuffer;
        
        if (quotedMessage) {
            // If replying to a message
            if (!quotedMessage.imageMessage) {
                await sock.sendMessage(chatId, { 
                    text: style.invalidInput('Please reply to an image message.', '.blur (reply to image)', { box: false }) 
                }, { quoted: message });
                return;
            }
            
            const quoted = {
                message: {
                    imageMessage: quotedMessage.imageMessage
                }
            };
            
            imageBuffer = await downloadMediaMessage(
                quoted,
                'buffer',
                { },
                { }
            );
        } else if (message.message?.imageMessage) {
            // If image is in current message
            imageBuffer = await downloadMediaMessage(
                message,
                'buffer',
                { },
                { }
            );
        } else {
            await sock.sendMessage(chatId, { 
                text: style.invalidInput('Please reply to an image or send an image with caption .blur', '.blur (reply to image)', { box: false }) 
            }, { quoted: message });
            return;
        }

        // Resize and optimize image
        const resizedImage = await sharp(imageBuffer)
            .resize(800, 800, { // Resize to max 800x800
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 80 }) // Convert to JPEG with 80% quality
            .toBuffer();

        // Apply blur effect directly using sharp
        const blurredImage = await sharp(resizedImage)
            .blur(10) // Blur radius of 10
            .toBuffer();

        // Send the blurred image
        await sock.sendMessage(chatId, {
            image: blurredImage,
            caption: `🖼️ Image blurred successfully!\n⚡ ${settings.botName || 'Optimus Bot'}`,
            ...channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('Error in blur command:', error);
        await sock.sendMessage(chatId, { 
            text: style.error('Failed to blur the image. Please try again later.') 
        }, { quoted: message });
    }
}

module.exports = {
    name: 'blur',
    aliases: [],
    category: 'media',
    description: 'Blur an image',
    usage: '.blur (reply to image)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        await blurCommand(sock, extra.chatId, message, quotedMessage);
    },

};