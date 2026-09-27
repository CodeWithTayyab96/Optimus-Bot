const { shayari, pick } = require('../../lib/funData');
const { channelInfo } = require('../../lib/messageConfig');

async function shayariCommand(sock, chatId, message) {
    try {
        const line = pick(shayari);
        await sock.sendMessage(chatId, {
            text: `📜 SHAYARI\n\n${line}`,
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Failed to fetch shayari. Please try again later.', ...channelInfo }, { quoted: message });
    }
}

module.exports = {
    name: 'shayari',
    aliases: ['shayri'],
    category: 'fun',
    description: 'Get a random shayari',
    usage: '.shayari',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await shayariCommand(sock, extra.chatId, message);
    },
    shayariCommand,
};
