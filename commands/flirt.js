const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

const styles = ['cheesy', 'clever', 'sweet', 'funny', 'nerdy', 'romantic', 'smooth', 'bold', 'poetic', 'corny'];

async function flirtCommand(sock, chatId, message) {
    try {
        const style = styles[Math.floor(Math.random() * styles.length)];
        const flirt = await chat(
            'You are a charming person. Generate ONE creative, flirty pickup line or sweet message. It should be cute and romantic, not creepy. Just output the line, nothing else.',
            `Give me a ${style} pickup line. (#${Date.now()})`
        );
        await sock.sendMessage(chatId, {
            text: flirt || '❌ Could not generate a flirt message.',
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Failed to get flirt message. Please try again later!', ...channelInfo }, { quoted: message });
    }
}

module.exports = { flirtCommand };
