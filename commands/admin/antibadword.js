const { handleAntiBadwordCommand } = require('../../lib/antibadword');
const isAdminHelper = require('../../lib/isAdmin');
const style = require('../../lib/messageStyle');

async function antibadwordCommand(sock, chatId, message, senderId, isSenderAdmin) {
    try {
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('admin', { box: false }) }, { quoted: message });
            return;
        }

        // Extract match from message
        const text = message.message?.conversation || 
                    message.message?.extendedTextMessage?.text || '';
        const match = text.split(' ').slice(1).join(' ');

        await handleAntiBadwordCommand(sock, chatId, message, match);
    } catch (error) {
        console.error('Error in antibadword command:', error);
        await sock.sendMessage(chatId, { text: style.error('Failed to process the antibadword command.') }, { quoted: message });
    }
}

module.exports = {
    name: 'antibadword',
    aliases: [],
    category: 'admin',
    description: 'Configure bad word filtering for the group',
    usage: '.antibadword on/off/set',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        await antibadwordCommand(sock, extra.chatId, message, extra.senderId, extra.isSenderAdmin);
    },

};