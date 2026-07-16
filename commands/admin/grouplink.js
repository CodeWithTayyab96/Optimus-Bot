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

            let text = `🔗 *GROUP INVITE LINK*\n\n`;
            text += `📱 Group: ${metadata.subject}\n`;
            text += `🔗 Link: ${link}\n\n`;
            text += `⚠️ Don't share this link publicly!`;

            await extra.reply(text);
        } catch (error) {
            await extra.reply(`❌ Error: ${error.message}`);
        }
    }
};
