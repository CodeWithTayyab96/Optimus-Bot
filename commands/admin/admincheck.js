const style = require('../../lib/messageStyle');
const { getBotJids, isBotParticipant } = require('../../lib/groupBulk');

module.exports = {
    name: 'admincheck',
    aliases: ['checkadmin', 'amiadmin'],
    category: 'admin',
    description: 'Show bot / your admin status and group stats',
    usage: '.admincheck',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const metadata = await sock.groupMetadata(extra.chatId);
            const parts = metadata.participants || [];
            const botJids = getBotJids(sock);
            const admins = parts.filter(p => p.admin);

            const botPresent = parts.some(p => isBotParticipant(p, botJids));
            const senderPresent = parts.some(p => {
                if (!p.id || !extra.senderId) return false;
                return p.id === extra.senderId || p.id.split('@')[0] === String(extra.senderId).split('@')[0];
            });

            const adminList = admins.length
                ? admins.map((a, i) => ` ${i + 1}. @${String(a.id).split('@')[0]}`)
                : [' —'];

            await extra.reply(style.box('🔍 ADMIN CHECK', [
                `📱 Group: ${metadata.subject || 'this group'}`,
                '',
                `🤖 Bot   — in group: ${botPresent ? '✅' : '❌'} · admin: ${extra.isBotAdmin ? '✅' : '❌'}`,
                `👤 You   — in group: ${senderPresent ? '✅' : '❌'} · admin: ${extra.isSenderAdmin ? '✅' : '❌'}`,
                '',
                `📊 Members: ${parts.length} · Admins: ${admins.length}`,
                '',
                '👮 Admin list:',
                ...adminList
            ]));
        } catch (error) {
            console.error('[admincheck] error:', error.message);
            return await extra.reply(style.error('Failed to read group info. Please try again.'));
        }
    },
};
