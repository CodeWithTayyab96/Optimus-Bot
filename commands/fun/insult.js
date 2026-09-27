const { insults, pick } = require('../../lib/funData');
const { channelInfo } = require('../../lib/messageConfig');

async function insultCommand(sock, chatId, message) {
    try {
        if (!message || !chatId) return;

        let userToInsult;
        if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            userToInsult = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            userToInsult = message.message.extendedTextMessage.contextInfo.participant;
        }

        if (!userToInsult) {
            return await sock.sendMessage(chatId, {
                text: '⚠️ Please mention someone or reply to their message to roast them.',
                ...channelInfo
            });
        }

        const insult = pick(insults);

        await sock.sendMessage(chatId, {
            text: `😈 INSULT\n\nHey @${userToInsult.split('@')[0]}, ${insult}`,
            mentions: [userToInsult],
            ...channelInfo
        });
    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ An error occurred while sending the insult.', ...channelInfo });
    }
}

module.exports = {
    name: 'insult',
    aliases: [],
    category: 'fun',
    description: 'Send a playful insult',
    usage: '.insult @user',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await insultCommand(sock, extra.chatId, message);
    },
    insultCommand,
};
