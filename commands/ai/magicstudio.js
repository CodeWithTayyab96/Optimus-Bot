const { generateImage } = require('../../lib/ai');
const { channelInfo } = require('../../lib/messageConfig');
const style = require('../../lib/messageStyle');
const { getPrompt } = require('../../lib/aiHelpers');

// Magic Studio generates AI art from a text prompt using the centralized
// image generation service (Gemini -> Cloudflare -> Pollinations).
// No third-party API key or external endpoint is hard-coded here.
module.exports = {
    name: 'magicstudio',
    aliases: ['magic', 'magicai', 'generate'],
    category: 'ai',
    description: 'Generate AI art from a text prompt (Flux)',
    usage: '.magicstudio <prompt>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const prompt = getPrompt(args, message, extra.prefix);

            if (!prompt) {
                return await extra.reply(
                    style.invalidInput(`Please provide a prompt for image generation.\n\nExample:\n${extra.prefix}magicstudio a handsome gentle man`, `${extra.prefix}magicstudio <prompt>`)
                );
            }

            await sock.sendMessage(extra.chatId, {
                react: { text: '🎨', key: message.key }
            });

            await sock.sendMessage(extra.chatId, {
                text: style.processing('Creating your image...'),
                ...channelInfo
            }, { quoted: message });

            const imageBuffer = await generateImage(prompt);

            if (!imageBuffer) {
                return await extra.reply(style.error('The image service is temporarily unavailable. Please try again later.'));
            }

            const maxImageSize = 5 * 1024 * 1024;
            if (imageBuffer.length > maxImageSize) {
                return await extra.reply(style.error(`Image too large: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 5MB)`));
            }

            await sock.sendMessage(extra.chatId, {
                image: imageBuffer,
                caption: `🎨 *Magic Studio*\n\n📝 ${prompt}`,
                ...channelInfo
            }, { quoted: message });
        } catch (error) {
            console.error('Error in magicstudio command:', error);

            return await extra.reply(style.error("I couldn't generate the image right now. Please try again."));
        }
    },
};
