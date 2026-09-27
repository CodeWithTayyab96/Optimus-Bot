const style = require('../../lib/messageStyle');

/**
 * .leave — make the bot leave the current group.
 *
 * OWNER-ONLY: leaving is not easily reversible (someone has to re-invite the
 * bot), so it is not exposed to ordinary admins.
 */
module.exports = {
    name: 'leave',
    aliases: ['leavegroup', 'exitgc'],
    category: 'admin',
    description: 'Make the bot leave this group (owner only)',
    usage: '.leave',
    ownerOnly: true,
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
            await extra.reply(style.info('Leaving the group. Re-invite me if you need me back.'));
            await sock.groupLeave(jid);
        } catch (e) {
            console.error('[leave] error:', e.message);
            return await extra.reply(style.error('Failed to leave the group.'));
        }
    },
};
