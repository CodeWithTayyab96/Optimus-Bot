const style = require('../../lib/messageStyle');
const { getBotJids, isBotParticipant, sleep } = require('../../lib/groupBulk');

module.exports = {
    name: 'demoteall',
    aliases: [],
    category: 'admin',
    description: 'Demote every admin (except the bot)',
    usage: '.demoteall',
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
                .filter(p => p.admin && !isBotParticipant(p, botJids))
                .map(p => p.id);

            if (targets.length === 0) {
                return await extra.reply(style.info('No admins to demote.'));
            }

            await extra.reply(style.processing(`Demoting ${targets.length} admins`));

            let ok = 0;
            for (const id of targets) {
                try {
                    await sock.groupParticipantsUpdate(extra.chatId, [id], 'demote');
                    ok++;
                } catch (e) {
                    console.error('[demoteall] demote failed:', e.message);
                }
                await sleep(1000);
            }

            await extra.reply(style.success(`Demoted ${ok}/${targets.length} admins.`));
        } catch (error) {
            console.error('[demoteall] error:', error.message);
            return await extra.reply(style.error('Failed to demote admins. Make sure I am an admin.'));
        }
    },
};
