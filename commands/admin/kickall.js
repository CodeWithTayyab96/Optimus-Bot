const style = require('../../lib/messageStyle');
const { getBotJids, isBotParticipant, chunk, sleep } = require('../../lib/groupBulk');

module.exports = {
    name: 'kickall',
    aliases: [],
    category: 'admin',
    description: 'Remove every non-admin member from the group',
    usage: '.kickall',
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
                return await extra.reply(style.info('No non-admin members to kick. Only admins remain.'));
            }

            await extra.reply(style.warning(`Kicking ${targets.length} members... please wait.`));

            let ok = 0;
            for (const batch of chunk(targets, 20)) {
                try {
                    await sock.groupParticipantsUpdate(extra.chatId, batch, 'remove');
                    ok += batch.length;
                } catch (e) {
                    console.error('[kickall] batch failed:', e.message);
                }
                await sleep(2000);
            }

            await extra.reply(style.success(`Kicked ${ok}/${targets.length} members.`));
        } catch (error) {
            console.error('[kickall] error:', error.message);
            return await extra.reply(style.error('Failed to kick members. Make sure I am an admin.'));
        }
    },
};
