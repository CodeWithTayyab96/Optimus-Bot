async function groupJidCommand(sock, chatId, message) {
    const groupJid = message.key.remoteJid;

    if (!groupJid.endsWith('@g.us')) {
        return await sock.sendMessage(chatId, {
            text: "❌ This command can only be used in a group."
        });
    }

    await sock.sendMessage(chatId, {
        text: `✅ Group JID: ${groupJid}`
    }, {
        quoted: message
    });
}

module.exports = {
    name: 'jid',
    aliases: [],
    category: 'general',
    description: 'Show the current group JID',
    usage: '.jid',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await groupJidCommand(sock, extra.chatId, message);
    }
};
