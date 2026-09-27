const { truths, pick } = require('../../lib/funData');
const { channelInfo } = require('../../lib/messageConfig');

async function truthCommand(sock, chatId, message) {
    try {
        const truth = pick(truths);
        await sock.sendMessage(chatId, {
            text: `🤔 TRUTH\n\n${truth}`,
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Failed to get truth. Please try again later!', ...channelInfo }, { quoted: message });
    }
}

module.exports = {
    name: 'truth',
    aliases: [],
    category: 'fun',
    description: 'Get a random truth question',
    usage: '.truth',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await truthCommand(sock, extra.chatId, message);
    },
    truthCommand,
};
