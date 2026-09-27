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
    name: 'open',
    aliases: ['unlock', 'opentime'],
    category: 'admin',
    description: 'Open the group so everyone can send messages (optionally auto-close after a duration)',
    usage: '.open [30m]',
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
                return await extra.reply(style.invalidInput('Use a duration like 30s, 30m, 2h or 1d.', `${extra.prefix}open 30m`));
            }

            await sock.groupSettingUpdate(jid, 'not_announcement');
            groupTimers.cancel(jid); // any pending revert is superseded

            if (dur > 0) {
                const due = groupTimers.schedule(jid, 'announcement', dur);
                return await extra.reply(style.success(
                    `Group opened — everyone can send messages.\n⏰ It will auto-close at ${new Date(due).toLocaleTimeString()}.`
                ));
            }
            return await extra.reply(style.success('Group opened — everyone can send messages.'));
        } catch (e) {
            console.error('[open] error:', e.message);
            return await extra.reply(style.error('Failed to open the group. Make sure I am an admin.'));
        }
    },
};
