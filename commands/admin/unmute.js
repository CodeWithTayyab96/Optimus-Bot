async function unmuteCommand(sock, chatId) {
    await sock.groupSettingUpdate(chatId, 'not_announcement'); // Unmute the group
    await sock.sendMessage(chatId, { text: 'The group has been unmuted.' });
}

module.exports = {
    name: 'unmute',
    aliases: [],
    category: 'admin',
    description: 'Unmute the group',
    usage: '.unmute',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        await unmuteCommand(sock, extra.chatId);
    },

};
