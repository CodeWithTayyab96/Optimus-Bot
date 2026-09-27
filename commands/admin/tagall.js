const style = require('../../lib/messageStyle');

async function tagAllCommand(sock, chatId, senderId, message, args) {
    try {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(chatId);
        const participants = groupMetadata.participants;

        if (!participants || participants.length === 0) {
            await sock.sendMessage(chatId, { text: style.info('No participants found in the group.') });
            return;
        }

        // Custom message text after .tagall
        const customText = args && args.length > 0 ? args.join(' ') : '';
        const header = customText ? `🔊 *${customText}*\n\n` : '🔊 *Hello Everyone:*\n\n';

        // Create message with each member on a new line, deduplicate participant IDs
        const seen = new Set();
        const uniqueParticipants = [];
        for (const participant of participants) {
            if (!seen.has(participant.id)) {
                seen.add(participant.id);
                uniqueParticipants.push(participant);
            }
        }

        let messageText = header;
        uniqueParticipants.forEach(participant => {
            messageText += `@${participant.id.split('@')[0]}\n`;
        });

        // Send message with mentions
        await sock.sendMessage(chatId, {
            text: messageText,
            mentions: uniqueParticipants.map(p => p.id)
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
    usage: '.tagall <optional message>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await tagAllCommand(sock, extra.chatId, extra.senderId, message, args);
    },

};
