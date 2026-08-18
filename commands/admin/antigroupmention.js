const { getGroupSettings, updateGroupSettings } = require('../../lib/groupSettings');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'antigroupmention',
    aliases: ['agm'],
    category: 'admin',
    description: 'Block forwarded status/channel mentions of the group (delete/kick)',
    usage: '.antigroupmention on/off/set delete|kick/get',
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
                const status = settings.antigroupmention ? 'ON' : 'OFF';
                const action = settings.antigroupmentionAction || 'delete';
                return extra.reply(
                    style.box('🛡️ ANTIGROUPMENTION', [
                        `Status: *${status}*`,
                        `Action: *${action}*`,
                        '',
                        'Usage:',
                        ` ${p}antigroupmention on`,
                        ` ${p}antigroupmention off`,
                        ` ${p}antigroupmention set delete | kick`,
                        ` ${p}antigroupmention get`
                    ])
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                if (getGroupSettings(extra.chatId).antigroupmention) {
                    return extra.reply(style.info('Antigroupmention is already on.'));
                }
                updateGroupSettings(extra.chatId, { antigroupmention: true });
                return extra.reply(style.success('Antigroupmention has been turned ON.'));
            }

            if (opt === 'off') {
                updateGroupSettings(extra.chatId, { antigroupmention: false });
                return extra.reply(style.success('Antigroupmention has been turned OFF.'));
            }

            if (opt === 'set') {
                if (args.length < 2) {
                    return extra.reply(style.invalidInput('Please specify an action.', `${p}antigroupmention set delete | kick`, { box: false }));
                }
                const setAction = args[1].toLowerCase();
                if (!['delete', 'kick'].includes(setAction)) {
                    return extra.reply(style.invalidInput('Invalid action. Choose delete or kick.', `${p}antigroupmention set <action>`, { box: false }));
                }
                updateGroupSettings(extra.chatId, { antigroupmentionAction: setAction, antigroupmention: true });
                return extra.reply(style.success(`Antigroupmention action set to ${setAction}.`));
            }

            if (opt === 'get') {
                const settings = getGroupSettings(extra.chatId);
                return extra.reply(style.box('🛡️ ANTIGROUPMENTION', [
                    `Status: ${settings.antigroupmention ? 'ON' : 'OFF'}`,
                    `Action: ${settings.antigroupmentionAction || 'delete'}`
                ]));
            }

            return extra.reply(style.info(`Use ${p}antigroupmention for usage.`));
        } catch (error) {
            console.error('Antigroupmention command error:', error);
            await extra.reply(style.error('Failed to update antigroupmention settings.'));
        }
    }
};
