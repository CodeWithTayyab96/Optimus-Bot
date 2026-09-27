const { getGroupSettings, updateGroupSettings } = require('../../lib/groupSettings');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'antigroupstatus',
    aliases: ['antigstatus', 'ags'],
    category: 'admin',
    description: 'Block group status posts from non-admins (delete/kick)',
    usage: '.antigroupstatus on/off/set delete|kick/get',
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
                const status = settings.antigroupstatus ? 'ON' : 'OFF';
                const action = settings.antigroupstatusAction || 'delete';
                return extra.reply(
                    style.box('🛡️ ANTIGROUPSTATUS', [
                        `Status: *${status}*`,
                        `Action: *${action}*`,
                        '',
                        'Blocks members from posting WhatsApp group statuses.',
                        '',
                        'Usage:',
                        ` ${p}antigroupstatus on`,
                        ` ${p}antigroupstatus off`,
                        ` ${p}antigroupstatus set delete | kick`,
                        ` ${p}antigroupstatus get`
                    ])
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                if (getGroupSettings(extra.chatId).antigroupstatus) {
                    return extra.reply(style.info('Anti group status is already on.'));
                }
                updateGroupSettings(extra.chatId, { antigroupstatus: true });
                return extra.reply(style.success('Anti group status has been turned ON.'));
            }

            if (opt === 'off') {
                updateGroupSettings(extra.chatId, { antigroupstatus: false });
                return extra.reply(style.success('Anti group status has been turned OFF.'));
            }

            if (opt === 'set') {
                if (args.length < 2) {
                    return extra.reply(style.invalidInput('Please specify an action.', `${p}antigroupstatus set delete | kick`, { box: false }));
                }
                const setAction = args[1].toLowerCase();
                if (!['delete', 'kick'].includes(setAction)) {
                    return extra.reply(style.invalidInput('Invalid action. Choose delete or kick.', `${p}antigroupstatus set <action>`, { box: false }));
                }
                updateGroupSettings(extra.chatId, { antigroupstatusAction: setAction, antigroupstatus: true });
                return extra.reply(style.success(`Anti group status action set to ${setAction}.`));
            }

            if (opt === 'get') {
                const settings = getGroupSettings(extra.chatId);
                return extra.reply(style.box('🛡️ ANTIGROUPSTATUS', [
                    `Status: ${settings.antigroupstatus ? 'ON' : 'OFF'}`,
                    `Action: ${settings.antigroupstatusAction || 'delete'}`
                ]));
            }

            return extra.reply(style.info(`Use ${p}antigroupstatus for usage.`));
        } catch (error) {
            console.error('Antigroupstatus command error:', error);
            await extra.reply(style.error('Failed to update antigroupstatus settings.'));
        }
    }
};
