const style = require('../../lib/messageStyle');

async function groupInfoCommand(sock, chatId, msg) {
    try {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(chatId);
        
        // Get group profile picture
        let pp;
        try {
            pp = await sock.profilePictureUrl(chatId, 'image');
        } catch {
            pp = 'https://i.imgur.com/2wzGhpF.jpeg'; // Default image
        }

        // Get admins from participants
        const participants = groupMetadata.participants;
        const groupAdmins = participants.filter(p => p.admin);
        
        // Get group owner
        const owner = groupMetadata.owner || groupAdmins.find(p => p.admin === 'superadmin')?.id || chatId.split('-')[0] + '@s.whatsapp.net';

        // Create info text
        const text = style.box('📊 GROUP INFO', [
            `👑 Owner: @${owner.split('@')[0]}`,
            `👥 Members: ${participants.length}`,
            `🛡️ Admins: ${groupAdmins.length}`,
            '',
            `📌 Name: ${groupMetadata.subject}`,
            `🆔 ID: ${groupMetadata.id}`,
            '',
            '👥 Admin List:',
            ...groupAdmins.map((v, i) => `${i + 1}. @${v.id.split('@')[0]}`),
            '',
            '📝 Description:',
            groupMetadata.desc?.toString() || 'No description'
        ]);

        // Send the message with image and mentions
        await sock.sendMessage(chatId, {
            image: { url: pp },
            caption: text,
            mentions: [...groupAdmins.map(v => v.id), owner]
        });

    } catch (error) {
        console.error('Error in groupinfo command:', error);
        await sock.sendMessage(chatId, { text: 'Failed to get group info!' });
    }
}

module.exports = {
    name: 'groupinfo',
    aliases: ['infogp', 'infogrupo'],
    category: 'general',
    description: 'Show group information',
    usage: '.groupinfo',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await groupInfoCommand(sock, extra.chatId, message);
    },

};