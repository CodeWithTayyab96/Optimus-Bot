const { getGroupStats, increment } = require('../../lib/messageStats');

// Compatibility wrapper kept so main.js can keep calling incrementMessageCount.
// The heavy lifting lives in lib/messageStats (in-memory + periodic flush).
function incrementMessageCount(groupId, userId) {
    increment(groupId, userId);
}

function topMembers(sock, chatId, isGroup) {
    if (!isGroup) {
        sock.sendMessage(chatId, { text: 'This command is only available in group chats.' });
        return;
    }

    const groupCounts = getGroupStats(chatId);

    const sortedMembers = Object.entries(groupCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5); // Get top 5 members

    if (sortedMembers.length === 0) {
        sock.sendMessage(chatId, { text: 'No message activity recorded yet.' });
        return;
    }

    let message = '🏆 Top Members Based on Message Count:\n\n';
    sortedMembers.forEach(([userId, count], index) => {
        message += `${index + 1}. @${userId.split('@')[0]} - ${count} messages\n`;
    });

    sock.sendMessage(chatId, { text: message, mentions: sortedMembers.map(([userId]) => userId) });
}

module.exports = {
    name: 'topmembers',
    aliases: [],
    category: 'fun',
    description: 'Show the most active group members',
    usage: '.topmembers',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await topMembers(sock, extra.chatId, extra.isGroup);
    },
    incrementMessageCount,
    topMembers,
};
