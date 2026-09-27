const { readMode, setMode } = require('../../lib/mode');
const style = require('../../lib/messageStyle');

async function modeCommand(sock, chatId, message, args, channelInfo) {
    const action = args[0]?.toLowerCase();

    // If no argument provided, show current status
    if (!action) {
        const currentMode = readMode() ? 'public' : 'private';
        await sock.sendMessage(chatId, {
            text: style.box('⚙️ MODE', [
                `Current mode: *${currentMode}*`,
                '',
                'Usage:',
                ' .mode public - Allow everyone to use the bot',
                ' .mode private - Restrict to the owner only'
            ]),
            ...channelInfo
        }, { quoted: message });
        return;
    }

    if (action !== 'public' && action !== 'private') {
        await sock.sendMessage(chatId, {
            text: style.invalidInput('Invalid mode. Use public or private.', '.mode public/private'),
            ...channelInfo
        }, { quoted: message });
        return;
    }

    try {
        // Update access mode
        setMode(action === 'public');

        await sock.sendMessage(chatId, { text: style.success(`Bot is now in *${action}* mode`), ...channelInfo });
    } catch (error) {
        console.error('Error updating access mode:', error);
        await sock.sendMessage(chatId, { text: style.error('Failed to update bot access mode.'), ...channelInfo });
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
