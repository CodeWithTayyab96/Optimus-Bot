const { getGroupSettings, updateGroupSettings } = require('../../lib/groupSettings');
const style = require('../../lib/messageStyle');

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
                    style.box('🛡️ AUTOSTICKER', [
                        `Status: *${status}*`,
                        '',
                        'When enabled, all images and videos sent in this group will automatically be converted to stickers.',
                        '',
                        'Usage:',
                        ` ${extra.prefix}autosticker on`,
                        ` ${extra.prefix}autosticker off`
                    ])
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                if (getGroupSettings(extra.chatId).autosticker) {
                    return extra.reply(style.info('AutoSticker is already ON.'));
                }
                updateGroupSettings(extra.chatId, { autosticker: true });
                return extra.reply(style.success('AutoSticker has been turned ON. All images and videos will now automatically be converted to stickers.'));
            }

            if (opt === 'off') {
                if (!getGroupSettings(extra.chatId).autosticker) {
                    return extra.reply(style.info('AutoSticker is already OFF.'));
                }
                updateGroupSettings(extra.chatId, { autosticker: false });
                return extra.reply(style.success('AutoSticker has been turned OFF.'));
            }

            return extra.reply(style.invalidInput('Invalid option. Choose on or off.', `${extra.prefix}autosticker <on/off>`, { box: false }));
        } catch (error) {
            console.error('[AutoSticker Command Error]:', error);
            return extra.reply(style.error('Failed to update autosticker setting.'));
        }
    }
};
