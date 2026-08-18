const style = require('../../lib/messageStyle');

async function tagAllCommand(sock, chatId, senderId, message) {
    try {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(chatId);
        const participants = groupMetadata.participants;

        if (!participants || participants.length === 0) {
            await sock.sendMessage(chatId, { text: style.info('No participants found in the group.') });
            return;
        }

        // Create message with each member on a new line
        let messageText = '🔊 *Hello Everyone:*\n\n';
        participants.forEach(participant => {
            messageText += `@${participant.id.split('@')[0]}\n`; // Add \n for new line
        });

        // Send message with mentions
        await sock.sendMessage(chatId, {
            text: messageText,
            mentions: participants.map(p => p.id)
        });

    } catch (error) {
        console.error('Error in tagall command:', error);
        await sock.sendMessage(chatId, { text: style.error('Failed to tag all members.') });
    }
}

module.exports = {
    name: 'tagall',
    aliases: [],
    category: 'admin',
    description: 'Mention every group member',
    usage: '.tagall',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        await tagAllCommand(sock, extra.chatId, extra.senderId, message);
    },

};
