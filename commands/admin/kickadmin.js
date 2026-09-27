const style = require('../../lib/messageStyle');
const { getBotJids, isBotParticipant, sleep } = require('../../lib/groupBulk');

/**
 * .kickadmin — demote every current admin.
 *
 * DESTRUCTIVE and slow to undo (someone has to re-promote everyone by hand), so
 * it is gated: the first run only previews who would be demoted and asks for a
 * re-run with `confirm`. A re-run (rather than "reply yes within N seconds") is
 * used because command modules here get a single (sock, message, args, extra)
 * call with no hook to await a follow-up message from the user — a re-run is
 * deterministic and survives restarts.
 *
 * The group creator/superadmin cannot be demoted; WhatsApp rejects it, so each
 * participant is demoted individually and per-person failures are reported
 * instead of aborting the batch.
 */
module.exports = {
    name: 'kickadmin',
    aliases: ['demoteadmins', 'demoteadmin'],
    category: 'admin',
    description: 'Demote all group admins (requires confirmation)',
    usage: '.kickadmin confirm',
    ownerOnly: true,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        try {
            const jid = extra.chatId;
            if (!jid.endsWith('@g.us')) {
                return await extra.reply(style.error('This command only works in groups.'));
            }

            const metadata = await sock.groupMetadata(jid);
            const botJids = getBotJids(sock);
            const targets = (metadata.participants || [])
                .filter(p => p.admin && !isBotParticipant(p, botJids))
                .map(p => p.id);

            if (!targets.length) {
                return await extra.reply(style.info('There are no admins to demote (other than bots).'));
            }

            const wantsConfirm = String(args[0] || '').toLowerCase();
            if (wantsConfirm !== 'confirm' && wantsConfirm !== 'yes') {
                const list = targets.map((id) => `• @${id.split('@')[0]}`).join('\n');
                return await extra.reply(style.warning(
                    `⚠️ This will demote ${targets.length} admin(s).\n\n${list}\n\n` +
                    `It cannot be undone automatically — someone must re-promote them.\n` +
                    `To proceed, run:\n\`${extra.prefix}kickadmin confirm\``
                ));
            }

            await extra.reply(style.processing(`Demoting ${targets.length} admin(s)...`));

            const done = [];
            const failed = [];
            for (const id of targets) {
                try {
                    await sock.groupParticipantsUpdate(jid, [id], 'demote');
                    done.push(id);
                } catch (e) {
                    // creator / superadmin cannot be demoted — expected
                    failed.push(`${id.split('@')[0]} (${e.message.slice(0, 40)})`);
                }
                await sleep(1200);
            }

            const lines = [`Demoted ${done.length}/${targets.length} admin(s).`];
            if (failed.length) {
                lines.push('', 'Could not demote (likely the group creator or a superadmin):');
                for (const f of failed.slice(0, 10)) lines.push(`• ${f}`);
            }
            return await extra.reply(style.success(lines.join('\n')));
        } catch (e) {
            console.error('[kickadmin] error:', e.message);
            return await extra.reply(style.error('Failed to demote admins. Make sure I am an admin.'));
        }
    },
};
