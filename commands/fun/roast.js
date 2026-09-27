const { roasts, pick } = require('../../lib/funData');
const { channelInfo } = require('../../lib/messageConfig');

async function roastCommand(sock, chatId, message) {
    try {
        const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        const participant = message.message?.extendedTextMessage?.contextInfo?.participant;
        const sender = message.key?.participant || message.key?.remoteJid;

        const target = (mentioned && mentioned[0]) || participant || sender;
        const name = target?.split('@')[0] || 'you';

        const roast = pick(roasts);

        await sock.sendMessage(chatId, {
            text: `🔥 ROAST\n\n@${name}\n\n${roast}`,
            mentions: [target],
            ...channelInfo
        }, { quoted: message });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '❌ Failed to roast. Try again!', ...channelInfo }, { quoted: message });
    }
}

module.exports = {
    name: 'roast',
    aliases: [],
    category: 'fun',
    description: 'Roast a mentioned user',
    usage: '.roast @user',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await roastCommand(sock, extra.chatId, message);
    },
    roastCommand,
};
