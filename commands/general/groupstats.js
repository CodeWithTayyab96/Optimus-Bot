const { getStats } = require('../../lib/groupstats');

module.exports = {
    name: 'groupstats',
    aliases: ['stats', 'leaderboard', 'gstats', 'msgs', 'messagestats'],
    category: 'general',
    description: "Show today's group chat statistics",
    usage: '.groupstats',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const stats = getStats(extra.chatId);

            if (!stats) {
                return extra.reply('📊 No activity recorded today.');
            }

            const { total, users } = stats;

            const sortedUsers = Object.entries(users)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            const topText = sortedUsers.length
                ? sortedUsers.map(([id, count], i) => `${i + 1}) @${id.split('@')[0]} — ${count} msgs`).join('\n')
                : 'No active users yet.';

            const text = `
📊 *Group Stats — Today*

📌 *Total Messages:* ${total}

👥 *Top Active Members:*
${topText}

Type ${extra.prefix}myactivity to see your stats.
`.trim();

            await sock.sendMessage(extra.chatId, {
                text,
                mentions: sortedUsers.map(u => u[0])
            }, { quoted: message });
        } catch (err) {
            console.error('[groupstats cmd] error:', err);
            extra.reply('❌ Error loading stats.');
        }
    }
};
