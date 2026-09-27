const { flirts, pick } = require('../../lib/funData');
const { channelInfo } = require('../../lib/messageConfig');

async function flirtCommand(sock, chatId, message) {
    try {
        const flirt = pick(flirts);
        await sock.sendMessage(chatId, {
            text: `💘 FLIRT\n\n${flirt}`,
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
