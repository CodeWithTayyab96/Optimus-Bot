const style = require('../../lib/messageStyle');

/**
 * .join — join a group via an invite link.
 *
 * OWNER-ONLY by default: this lets whoever issues it make the bot join an
 * arbitrary group (spam vector, and it pulls the bot into groups the owner may
 * not want it in). Restricted deliberately — see the note in the deployment
 * docs if you want to widen it.
 */
module.exports = {
    name: 'join',
    aliases: ['joingroup', 'acceptinvite'],
    category: 'admin',
    description: 'Join a group using an invite link (owner only)',
    usage: '.join https://chat.whatsapp.com/XXXXX',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const raw = args.join(' ').trim();
            if (!raw) {
                return await extra.reply(style.invalidInput('Provide an invite link.', `${extra.prefix}join https://chat.whatsapp.com/XXXXX`));
            }

            const m = raw.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
            const code = m ? m[1] : raw.replace(/[^A-Za-z0-9_-]/g, '');
            if (!code) {
                return await extra.reply(style.invalidInput('That does not look like a WhatsApp invite link.', `${extra.prefix}join https://chat.whatsapp.com/XXXXX`));
            }

            await extra.reply(style.processing('Joining group...'));
            const res = await sock.groupAcceptInvite(code);

            if (res) {
                return await extra.reply(style.success(`Joined group: ${res}`));
            }
            return await extra.reply(style.error('Could not join — the invite may be expired, revoked, or at its member limit.'));
        } catch (e) {
            console.error('[join] error:', e.message);
            return await extra.reply(style.error(`Failed to join the group. ${e.message.slice(0, 80)}`));
        }
    },
};
