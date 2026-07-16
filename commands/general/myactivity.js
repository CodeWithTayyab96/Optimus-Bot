const { getStats } = require('../../lib/groupstats');

module.exports = {
    name: 'myactivity',
    aliases: ['mystats', 'mymsgs', 'rank'],
    category: 'general',
    description: 'Check your activity stats for today',
    usage: '.myactivity',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const sender = extra.senderId;
            const stats = getStats(extra.chatId);

            if (!stats || !stats.users || !stats.users[sender]) {
                return extra.reply("📊 You haven't sent any messages today yet!");
            }

            const userCount = stats.users[sender];
            const totalMessages = stats.total;
            const percentage = ((userCount / totalMessages) * 100).toFixed(1);

            const sortedUsers = Object.entries(stats.users)
                .sort((a, b) => b[1] - a[1]);

            const rank = sortedUsers.findIndex(([id]) => id === sender) + 1;

            const text = `
📊 *Your Activity Today*

👤 *User:* @${sender.split('@')[0]}
📝 *Messages Sent:* ${userCount}
📈 *Your Share:* ${percentage}%
🏆 *Rank:* #${rank} of ${sortedUsers.length}

Keep chatting! 💬
`.trim();

            await sock.sendMessage(extra.chatId, {
                text,
                mentions: [sender]
            }, { quoted: message });
        } catch (err) {
            console.error('[myactivity cmd] error:', err);
            extra.reply('❌ Error loading your activity stats.');
        }
    }
};
