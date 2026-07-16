const { getGroupSettings, updateGroupSettings } = require('../../lib/groupSettings');

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
                    `🖼️ *Antisticker Status*\n\n` +
                    `Status: *${status}*\n` +
                    `Action: *${action}*\n\n` +
                    `Stickers from non-admins will be deleted when enabled.\n\n` +
                    `Usage:\n` +
                    `  ${p}antisticker on\n` +
                    `  ${p}antisticker off\n` +
                    `  ${p}antisticker set delete | kick\n` +
                    `  ${p}antisticker get`
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                if (getGroupSettings(extra.chatId).antisticker) {
                    return extra.reply('*Antisticker is already on*');
                }
                updateGroupSettings(extra.chatId, { antisticker: true });
                return extra.reply('*Antisticker has been turned ON* - Stickers will be deleted.');
            }

            if (opt === 'off') {
                updateGroupSettings(extra.chatId, { antisticker: false });
                return extra.reply('*Antisticker has been turned OFF*');
            }

            if (opt === 'set') {
                if (args.length < 2) {
                    return extra.reply(`*Please specify an action: ${p}antisticker set delete | kick*`);
                }
                const setAction = args[1].toLowerCase();
                if (!['delete', 'kick'].includes(setAction)) {
                    return extra.reply('*Invalid action. Choose delete or kick.*');
                }
                updateGroupSettings(extra.chatId, { antistickerAction: setAction, antisticker: true });
                return extra.reply(`*Antisticker action set to ${setAction}*`);
            }

            if (opt === 'get') {
                const settings = getGroupSettings(extra.chatId);
                return extra.reply(`*Antisticker Configuration:*\nStatus: ${settings.antisticker ? 'ON' : 'OFF'}\nAction: ${settings.antistickerAction || 'delete'}`);
            }

            return extra.reply(`*Use ${p}antisticker for usage.*`);
        } catch (error) {
            await extra.reply(`❌ Error: ${error.message}`);
        }
    }
};
