const style = require('../../lib/messageStyle');

async function tagNotAdminCommand(sock, chatId, senderId, message) {
    try {
        const groupMetadata = await sock.groupMetadata(chatId);
        const participants = groupMetadata.participants || [];

        const nonAdmins = participants.filter(p => !p.admin).map(p => p.id);
        if (nonAdmins.length === 0) {
            await sock.sendMessage(chatId, { text: style.info('No non-admin members to tag.') }, { quoted: message });
            return;
        }

        let text = '🔊 *Hello Everyone:*\n\n';
        nonAdmins.forEach(jid => {
            text += `@${jid.split('@')[0]}\n`;
        });

        await sock.sendMessage(chatId, { text, mentions: nonAdmins }, { quoted: message });
    } catch (error) {
        console.error('Error in tagnotadmin command:', error);
        await sock.sendMessage(chatId, { text: style.error('Failed to tag non-admin members.') }, { quoted: message });
    }
}

module.exports = {
    name: 'tagnotadmin',
    aliases: [],
    category: 'admin',
    description: 'Mention all non-admin group members',
    usage: '.tagnotadmin',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        await tagNotAdminCommand(sock, extra.chatId, extra.senderId, message);
    },

};


