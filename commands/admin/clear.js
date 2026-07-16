async function clearCommand(sock, chatId) {
    try {
        const message = await sock.sendMessage(chatId, { text: 'Clearing bot messages...' });
        const messageKey = message.key; // Get the key of the message the bot just sent
        
        // Now delete the bot's message
        await sock.sendMessage(chatId, { delete: messageKey });
        
    } catch (error) {
        console.error('Error clearing messages:', error);
        await sock.sendMessage(chatId, { text: 'An error occurred while clearing messages.' });
    }
}

module.exports = {
    name: 'clear',
    aliases: [],
    category: 'admin',
    description: 'Clear bot messages in the group',
    usage: '.clear',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        if (extra.isGroup) await clearCommand(sock, extra.chatId);
    },
    clearCommand,
};
