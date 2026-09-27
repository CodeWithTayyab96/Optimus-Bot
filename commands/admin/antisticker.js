const { getGroupSettings, updateGroupSettings } = require('../../lib/groupSettings');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'antisticker',
    aliases: ['nosticker'],
    category: 'admin',
    description: 'Delete (or kick for) stickers sent by non-admins',
    usage: '.antisticker on/off/set delete|kick/get',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        try {
            const p = extra.prefix;
            if (!args[0]) {
                const settings = getGroupSettings(extra.chatId);
                const status = settings.antisticker ? 'ON' : 'OFF';
                const action = settings.antistickerAction || 'delete';
                return extra.reply(
                    style.box('🛡️ ANTISTICKER', [
                        `Status: *${status}*`,
                        `Action: *${action}*`,
                        '',
                        'Stickers from non-admins will be deleted when enabled.',
                        '',
                        'Usage:',
                        ` ${p}antisticker on`,
                        ` ${p}antisticker off`,
                        ` ${p}antisticker set delete | kick`,
                        ` ${p}antisticker get`
                    ])
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                if (getGroupSettings(extra.chatId).antisticker) {
                    return extra.reply(style.info('Antisticker is already on.'));
                }
                updateGroupSettings(extra.chatId, { antisticker: true });
                return extra.reply(style.success('Antisticker has been turned ON. Stickers from non-admins will be deleted.'));
            }

            if (opt === 'off') {
                updateGroupSettings(extra.chatId, { antisticker: false });
                return extra.reply(style.success('Antisticker has been turned OFF.'));
            }

            if (opt === 'set') {
                if (args.length < 2) {
                    return extra.reply(style.invalidInput('Please specify an action.', `${p}antisticker set delete | kick`, { box: false }));
                }
                const setAction = args[1].toLowerCase();
                if (!['delete', 'kick'].includes(setAction)) {
                    return extra.reply(style.invalidInput('Invalid action. Choose delete or kick.', `${p}antisticker set <action>`, { box: false }));
                }
                updateGroupSettings(extra.chatId, { antistickerAction: setAction, antisticker: true });
                return extra.reply(style.success(`Antisticker action set to ${setAction}.`));
            }

            if (opt === 'get') {
                const settings = getGroupSettings(extra.chatId);
                return extra.reply(style.box('🛡️ ANTISTICKER', [
                    `Status: ${settings.antisticker ? 'ON' : 'OFF'}`,
                    `Action: ${settings.antistickerAction || 'delete'}`
                ]));
            }

            return extra.reply(style.info(`Use ${p}antisticker for usage.`));
        } catch (error) {
            console.error('Antisticker command error:', error);
            await extra.reply(style.error('Failed to update antisticker settings.'));
        }
    }
};
