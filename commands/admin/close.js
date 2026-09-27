const style = require('../../lib/messageStyle');
const groupTimers = require('../../lib/groupTimers');

/** Parse "30s" / "30m" / "2h" / "1d" (bare number = minutes). Returns NaN if bad. */
function parseDuration(raw) {
    if (!raw) return 0;
    const m = String(raw).trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d)?$/);
    if (!m) return NaN;
    const n = parseInt(m[1], 10);
    const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2] || 'm'];
    return n * mult;
}

module.exports = {
    name: 'close',
    aliases: ['lock', 'closetime'],
    category: 'admin',
    description: 'Close the group so only admins can send messages (optionally auto-open after a duration)',
    usage: '.close [30m]',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        try {
            const jid = extra.chatId;
            if (!jid.endsWith('@g.us')) {
                return await extra.reply(style.error('This command only works in groups.'));
            }

            const dur = parseDuration(args[0] || '');
            if (args[0] && Number.isNaN(dur)) {
                return await extra.reply(style.invalidInput('Use a duration like 30s, 30m, 2h or 1d.', `${extra.prefix}close 30m`));
            }

            await sock.groupSettingUpdate(jid, 'announcement');
            groupTimers.cancel(jid); // any pending revert is superseded

            if (dur > 0) {
                const due = groupTimers.schedule(jid, 'not_announcement', dur);
                return await extra.reply(style.success(
                    `Group closed — only admins can send messages.\n⏰ It will auto-open at ${new Date(due).toLocaleTimeString()}.`
                ));
            }
            return await extra.reply(style.success('Group closed — only admins can send messages.'));
        } catch (e) {
            console.error('[close] error:', e.message);
            return await extra.reply(style.error('Failed to close the group. Make sure I am an admin.'));
        }
    },
};
