const { chat } = require('../../lib/ai');
const { channelInfo } = require('../../lib/messageConfig');

const styles = ['cheesy', 'clever', 'sweet', 'funny', 'nerdy', 'romantic', 'smooth', 'bold', 'poetic', 'corny'];

async function flirtCommand(sock, chatId, message) {
    try {
        const style = styles[Math.floor(Math.random() * styles.length)];
        const flirt = await chat(
            'You are a charming person. Generate ONE creative, flirty pickup line or sweet message. It should be cute and romantic, not creepy. Respond in Roman Urdu or English — you can mix both naturally. Just output the line, nothing else.',
            `Give me a ${style} pickup line. (#${Date.now()})`
        );
        await sock.sendMessage(chatId, {
            text: `💘 FLIRT\n\n${flirt || 'Sorry, I could not come up with a flirt line right now.'}`,
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Failed to get flirt message. Please try again later!', ...channelInfo }, { quoted: message });
    }
}

module.exports = {
    name: 'flirt',
    aliases: [],
    category: 'fun',
    description: 'Send a random flirty line',
    usage: '.flirt',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await flirtCommand(sock, extra.chatId, message);
    },
    flirtCommand,
};
