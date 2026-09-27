const style = require('../../lib/messageStyle');

/**
 * .listonline — members reported online in the last few seconds.
 *
 * IMPORTANT limitation: WhatsApp only exposes presence for members who allow
 * it. Plenty of people hide it (and the bot must explicitly subscribe to the
 * group's presence before anything arrives), so this is a partial view — the
 * reply says so rather than implying an empty list means nobody is online.
 */
module.exports = {
    name: 'listonline',
    aliases: ['online', 'onlinemembers'],
    category: 'admin',
    description: 'List members currently reported online (presence permitting)',
    usage: '.listonline',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const jid = extra.chatId;
            if (!jid.endsWith('@g.us')) {
                return await extra.reply(style.error('This command only works in groups.'));
            }

            const online = new Set();
            const handler = (update) => {
                try {
                    const presences = update?.presences || {};
                    for (const [who, p] of Object.entries(presences)) {
                        if (p && p.lastKnownPresence === 'available') online.add(who);
                        else online.delete(who);
                    }
                } catch { /* ignore malformed update */ }
            };

            const ev = sock.ev;
            if (ev && typeof ev.on === 'function') ev.on('presence.update', handler);

            try {
                await sock.presenceSubscribe(jid);
            } catch (e) {
                console.error('[listonline] presenceSubscribe failed:', e.message);
            }

            // give WhatsApp a few seconds to deliver presence updates
            await new Promise((r) => setTimeout(r, 8000));

            if (ev && typeof ev.off === 'function') ev.off('presence.update', handler);
            else if (ev && typeof ev.removeListener === 'function') ev.removeListener('presence.update', handler);

            if (!online.size) {
                return await extra.reply(style.info(
                    'No online members were reported in the last few seconds.\n\n' +
                    'WhatsApp only shares presence for people who allow it — many hide it, ' +
                    'so an empty result does NOT mean nobody is online.'
                ));
            }

            const lines = [...online].map((id) => `• @${String(id).split('@')[0]}`);
            lines.push('', '⚠️ Only members who share their presence can appear here.');
            return await extra.reply(style.box(`🟢 ONLINE (${online.size})`, lines));
        } catch (e) {
            console.error('[listonline] error:', e.message);
            return await extra.reply(style.error('Failed to check presence.'));
        }
    },
};
