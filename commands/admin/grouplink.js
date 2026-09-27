const style = require('../../lib/messageStyle');

module.exports = {
    name: 'grouplink',
    aliases: ['link', 'invite'],
    category: 'admin',
    description: 'Get the group invite link',
    usage: '.grouplink',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        try {
            const code = await sock.groupInviteCode(extra.chatId);
            const link = `https://chat.whatsapp.com/${code}`;
            const metadata = await sock.groupMetadata(extra.chatId);

            const text = style.box('🔗 GROUP LINK', [
                `Group: ${metadata.subject}`,
                '',
                `Link: ${link}`,
                '',
                '⚠️ Don\'t share this link publicly!'
            ]);

            await extra.reply(text);
        } catch (error) {
            console.error('Error in grouplink command:', error);
            await extra.reply(style.error('Failed to fetch the group invite link.'));
        }
    }
};
