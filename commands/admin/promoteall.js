const style = require('../../lib/messageStyle');
const { getBotJids, isBotParticipant, sleep } = require('../../lib/groupBulk');

module.exports = {
    name: 'promoteall',
    aliases: [],
    category: 'admin',
    description: 'Promote every non-admin member to admin',
    usage: '.promoteall',
    ownerOnly: true,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        try {
            const metadata = await sock.groupMetadata(extra.chatId);
            const botJids = getBotJids(sock);
            const targets = (metadata.participants || [])
                .filter(p => !p.admin && !isBotParticipant(p, botJids))
                .map(p => p.id);

            if (targets.length === 0) {
                return await extra.reply(style.info('No non-admin members to promote.'));
            }

            await extra.reply(style.processing(`Promoting ${targets.length} members`));

            let ok = 0;
            for (const id of targets) {
                try {
                    await sock.groupParticipantsUpdate(extra.chatId, [id], 'promote');
                    ok++;
                } catch (e) {
                    console.error('[promoteall] promote failed:', e.message);
                }
                await sleep(1000);
            }

            await extra.reply(style.success(`Promoted ${ok}/${targets.length} members to admin.`));
        } catch (error) {
            console.error('[promoteall] error:', error.message);
            return await extra.reply(style.error('Failed to promote members. Make sure I am an admin.'));
        }
    },
};
