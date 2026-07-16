const fs = require('fs');

async function modeCommand(sock, chatId, message, args, channelInfo) {
    // Read current data first
    let data;
    try {
        data = JSON.parse(fs.readFileSync('./data/messageCount.json'));
    } catch (error) {
        console.error('Error reading access mode:', error);
        await sock.sendMessage(chatId, { text: 'Failed to read bot mode status', ...channelInfo });
        return;
    }

    const action = args[0]?.toLowerCase();
    // If no argument provided, show current status
    if (!action) {
        const currentMode = data.isPublic ? 'public' : 'private';
        await sock.sendMessage(chatId, {
            text: `Current bot mode: *${currentMode}*\n\nUsage: .mode public/private\n\nExample:\n.mode public - Allow everyone to use bot\n.mode private - Restrict to owner only`,
            ...channelInfo
        }, { quoted: message });
        return;
    }

    if (action !== 'public' && action !== 'private') {
        await sock.sendMessage(chatId, {
            text: 'Usage: .mode public/private\n\nExample:\n.mode public - Allow everyone to use bot\n.mode private - Restrict to owner only',
            ...channelInfo
        }, { quoted: message });
        return;
    }

    try {
        // Update access mode
        data.isPublic = action === 'public';

        // Save updated data
        fs.writeFileSync('./data/messageCount.json', JSON.stringify(data, null, 2));

        await sock.sendMessage(chatId, { text: `Bot is now in *${action}* mode`, ...channelInfo });
    } catch (error) {
        console.error('Error updating access mode:', error);
        await sock.sendMessage(chatId, { text: 'Failed to update bot access mode', ...channelInfo });
    }
}

module.exports = {
    name: 'mode',
    aliases: [],
    category: 'owner',
    description: 'Switch the bot between public and private mode',
    usage: '.mode public/private',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await modeCommand(sock, extra.chatId, message, args, extra.channelInfo);
    }
};
