const { getGroupSettings, updateGroupSettings } = require('../../lib/groupSettings');

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
                    `📌 *Antigroupmention Status*\n\n` +
                    `Status: *${status}*\n` +
                    `Action: *${action}*\n\n` +
                    `Usage:\n` +
                    `  ${p}antigroupmention on\n` +
                    `  ${p}antigroupmention off\n` +
                    `  ${p}antigroupmention set delete | kick\n` +
                    `  ${p}antigroupmention get`
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                if (getGroupSettings(extra.chatId).antigroupmention) {
                    return extra.reply('*Antigroupmention is already on*');
                }
                updateGroupSettings(extra.chatId, { antigroupmention: true });
                return extra.reply('*Antigroupmention has been turned ON*');
            }

            if (opt === 'off') {
                updateGroupSettings(extra.chatId, { antigroupmention: false });
                return extra.reply('*Antigroupmention has been turned OFF*');
            }

            if (opt === 'set') {
                if (args.length < 2) {
                    return extra.reply(`*Please specify an action: ${p}antigroupmention set delete | kick*`);
                }
                const setAction = args[1].toLowerCase();
                if (!['delete', 'kick'].includes(setAction)) {
                    return extra.reply('*Invalid action. Choose delete or kick.*');
                }
                updateGroupSettings(extra.chatId, { antigroupmentionAction: setAction, antigroupmention: true });
                return extra.reply(`*Antigroupmention action set to ${setAction}*`);
            }

            if (opt === 'get') {
                const settings = getGroupSettings(extra.chatId);
                return extra.reply(`*Antigroupmention Configuration:*\nStatus: ${settings.antigroupmention ? 'ON' : 'OFF'}\nAction: ${settings.antigroupmentionAction || 'delete'}`);
            }

            return extra.reply(`*Use ${p}antigroupmention for usage.*`);
        } catch (error) {
            await extra.reply(`❌ Error: ${error.message}`);
        }
    }
};
