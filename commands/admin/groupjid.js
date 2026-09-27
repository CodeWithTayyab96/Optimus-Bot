const style = require('../../lib/messageStyle');

module.exports = {
    name: 'groupjid',
    aliases: ['gid', 'chatjid'],
    category: 'admin',
    description: 'Show the current group’s JID',
    usage: '.groupjid',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const jid = extra.chatId;
            if (!jid.endsWith('@g.us')) {
                return await extra.reply(style.error('This command only works in groups.'));
            }
            return await extra.reply(style.box('🆔 GROUP JID', [
                `\`${jid}\``,
                '',
                'Useful for config, whitelists and debugging.'
            ]));
        } catch (e) {
            console.error('[groupjid] error:', e.message);
            return await extra.reply(style.error('Failed to read the group JID.'));
        }
    },
};
