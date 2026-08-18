const { generateImage } = require('../../lib/ai');
const { channelInfo } = require('../../lib/messageConfig');
const settings = require('../../settings');
const style = require('../../lib/messageStyle');

async function imagineCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation?.trim() ||
                     message.message?.extendedTextMessage?.text?.trim() || '';

        // Remove command prefix (.imagine)
        const prompt = text.replace(/^\.\w+\s*/, '').trim();

        if (!prompt) {
            return await sock.sendMessage(chatId, {
                text: style.invalidInput('Please provide a prompt for image generation.', '.imagine <prompt>'),
                ...channelInfo
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            react: { text: '🎨', key: message.key }
        });

        await sock.sendMessage(chatId, {
            text: style.processing('Creating your image...'),
            ...channelInfo
        }, { quoted: message });

        const imageBuffer = await generateImage(prompt);

        if (!imageBuffer) {
            return await sock.sendMessage(chatId, {
                text: style.error('The image service is temporarily unavailable. Please try again later.'),
                ...channelInfo
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            image: imageBuffer,
            caption: `🎨 ${prompt}\n⚡ ${settings.botName || 'Optimus Bot'}`,
            ...channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('Error in imagine command:', error.message);
        await sock.sendMessage(chatId, {
            text: style.error("I couldn't generate the image right now. Please try again."),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'imagine',
    aliases: [],
    category: 'ai',
    description: 'Generate an image from a text prompt',
    usage: '.imagine <prompt>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await imagineCommand(sock, extra.chatId, message);
    },

};
