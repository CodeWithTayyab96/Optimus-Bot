const { getGroupSettings, updateGroupSettings } = require('../../lib/groupSettings');

module.exports = {
    name: 'autosticker',
    aliases: ['autos', 'asticker'],
    category: 'admin',
    description: 'Automatically convert images/videos in the group to stickers',
    usage: '.autosticker on/off',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            if (!args[0]) {
                const settings = getGroupSettings(extra.chatId);
                const status = settings.autosticker ? 'ON' : 'OFF';
                return extra.reply(
                    `📌 *AutoSticker Status*\n\n` +
                    `Status: *${status}*\n\n` +
                    `When enabled, all images and videos sent in this group will automatically be converted to stickers.\n\n` +
                    `Usage:\n` +
                    `  ${extra.prefix}autosticker on\n` +
                    `  ${extra.prefix}autosticker off`
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                if (getGroupSettings(extra.chatId).autosticker) {
                    return extra.reply('*AutoSticker is already ON*');
                }
                updateGroupSettings(extra.chatId, { autosticker: true });
                return extra.reply('✅ *AutoSticker has been turned ON*\n\nAll images and videos will now automatically be converted to stickers!');
            }

            if (opt === 'off') {
                if (!getGroupSettings(extra.chatId).autosticker) {
                    return extra.reply('*AutoSticker is already OFF*');
                }
                updateGroupSettings(extra.chatId, { autosticker: false });
                return extra.reply('❌ *AutoSticker has been turned OFF*');
            }

            return extra.reply(`❌ Invalid option!\nUsage: ${extra.prefix}autosticker <on/off>`);
        } catch (error) {
            console.error('[AutoSticker Command Error]:', error);
            return extra.reply('❌ Error updating autosticker setting.');
        }
    }
};
