const { compliments, pick } = require('../../lib/funData');
const { channelInfo } = require('../../lib/messageConfig');

async function complimentCommand(sock, chatId, message) {
    try {
        if (!message || !chatId) return;

        let userToCompliment;
        if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            userToCompliment = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            userToCompliment = message.message.extendedTextMessage.contextInfo.participant;
        }

        if (!userToCompliment) {
            return await sock.sendMessage(chatId, {
                text: '⚠️ Please mention someone or reply to their message to compliment them.',
                ...channelInfo
            });
        }

        const compliment = pick(compliments);

        await sock.sendMessage(chatId, {
            text: `💖 COMPLIMENT\n\nHey @${userToCompliment.split('@')[0]}, ${compliment}`,
            mentions: [userToCompliment],
            ...channelInfo
        });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ An error occurred while sending the compliment.', ...channelInfo });
    }
}

module.exports = {
    name: 'compliment',
    aliases: [],
    category: 'fun',
    description: 'Send a random compliment',
    usage: '.compliment @user',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await complimentCommand(sock, extra.chatId, message);
    },
    complimentCommand,
};
