const { getGroupSettings, updateGroupSettings } = require('../../lib/groupSettings');

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
                    `📵 *Anti Group Status*\n\n` +
                    `Status: *${status}*\n` +
                    `Action: *${action}*\n\n` +
                    `Blocks members from posting WhatsApp group statuses.\n\n` +
                    `Usage:\n` +
                    `  ${p}antigroupstatus on\n` +
                    `  ${p}antigroupstatus off\n` +
                    `  ${p}antigroupstatus set delete | kick\n` +
                    `  ${p}antigroupstatus get`
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                if (getGroupSettings(extra.chatId).antigroupstatus) {
                    return extra.reply('*Anti group status is already on*');
                }
                updateGroupSettings(extra.chatId, { antigroupstatus: true });
                return extra.reply('*Anti group status has been turned ON*');
            }

            if (opt === 'off') {
                updateGroupSettings(extra.chatId, { antigroupstatus: false });
                return extra.reply('*Anti group status has been turned OFF*');
            }

            if (opt === 'set') {
                if (args.length < 2) {
                    return extra.reply(`*Usage: ${p}antigroupstatus set delete | kick*`);
                }
                const setAction = args[1].toLowerCase();
                if (!['delete', 'kick'].includes(setAction)) {
                    return extra.reply('*Invalid action. Choose delete or kick.*');
                }
                updateGroupSettings(extra.chatId, { antigroupstatusAction: setAction, antigroupstatus: true });
                return extra.reply(`*Anti group status action set to ${setAction}*`);
            }

            if (opt === 'get') {
                const settings = getGroupSettings(extra.chatId);
                return extra.reply(`*Anti Group Status Config:*\nStatus: ${settings.antigroupstatus ? 'ON' : 'OFF'}\nAction: ${settings.antigroupstatusAction || 'delete'}`);
            }

            return extra.reply(`*Use ${p}antigroupstatus for usage.*`);
        } catch (error) {
            await extra.reply(`❌ Error: ${error.message}`);
        }
    }
};
