const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

async function flirtCommand(sock, chatId, message) {
    try {
        const flirt = await chat(
            'You are a charming person. Generate ONE creative, flirty pickup line or sweet message. It should be cute and romantic, not creepy. Just output the line, nothing else. Vary between cheesy, sweet, clever, and funny styles.',
            'Give me a flirty pickup line'
        );

        await sock.sendMessage(chatId, {
            text: flirt || '❌ Could not generate a flirt message.',
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        console.error('Error in flirt command:', error.message);
        await sock.sendMessage(chatId, { text: '❌ Failed to get flirt message. Please try again later!', ...channelInfo }, { quoted: message });
    }
}

module.exports = { flirtCommand };
