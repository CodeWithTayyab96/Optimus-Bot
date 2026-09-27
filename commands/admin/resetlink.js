const style = require('../../lib/messageStyle');

async function resetlinkCommand(sock, chatId, senderId) {
    try {
        // Check if sender is admin
        const groupMetadata = await sock.groupMetadata(chatId);
        const isAdmin = groupMetadata.participants
            .filter(p => p.admin)
            .map(p => p.id)
            .includes(senderId);

        // Check if bot is admin
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const isBotAdmin = groupMetadata.participants
            .filter(p => p.admin)
            .map(p => p.id)
            .includes(botId);

        if (!isAdmin) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('admin', { box: false }) });
            return;
        }

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('botAdmin', { box: false }) });
            return;
        }

        // Reset the group link
        const newCode = await sock.groupRevokeInvite(chatId);
        
        // Send the new link
        await sock.sendMessage(chatId, { 
            text: style.box('🔗 GROUP LINK', [
                '✅ Group link reset',
                '',
                `New link: https://chat.whatsapp.com/${newCode}`
            ])
        });

    } catch (error) {
        console.error('Error in resetlink command:', error);
        await sock.sendMessage(chatId, { text: style.error('Failed to reset the group link.') });
    }
}

module.exports = {
    name: 'resetlink',
    aliases: ['revoke', 'anularlink', 'resetlinkgc'],
    category: 'admin',
    description: 'Revoke and regenerate the group invite link',
    usage: '.resetlink',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await resetlinkCommand(sock, extra.chatId, extra.senderId);
    },

};