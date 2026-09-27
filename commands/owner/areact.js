const { handleAreactCommand } = require('../../lib/reactions');

module.exports = {
    name: 'areact',
    aliases: ['autoreact', 'autoreaction'],
    category: 'owner',
    description: 'Toggle automatic reactions to messages',
    usage: '.areact on/off',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleAreactCommand(sock, extra.chatId, message, extra.isOwnerOrSudoCheck);
    }
};
