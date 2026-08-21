/**
 * .reminders — List your pending reminders.
 *
 * Usage:
 *   .reminders
 *
 * Shows all pending reminders for the requesting user.
 */

const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');
const reminderStore = require('../../lib/productivity/reminderStore');

function formatDueTime(dueAt) {
    const now = Date.now();
    const diff = dueAt - now;

    if (diff <= 0) return 'Now';

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `In ${days}d ${hours % 24}h`;
    if (hours > 0) return `In ${hours}h ${minutes % 60}m`;
    return `In ${minutes}m`;
}

function formatAbsolute(dueAt) {
    const d = new Date(dueAt);
    return d.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        month: 'short',
        day: 'numeric'
    });
}

async function remindersCommand(sock, chatId, message, args, extra) {
    try {
        const userJid = extra.senderId;
        const reminders = reminderStore.getUserReminders(userJid);

        if (reminders.length === 0) {
            const text = '📋 You have no pending reminders.';
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        const lines = reminders.map(r =>
            `🆔 ${r.id}\n⏰ ${formatDueTime(r.dueAt)} (${formatAbsolute(r.dueAt)})\n📝 ${r.text}`
        );

        const response = style.box('📋 YOUR REMINDERS', [
            ...lines.map((line, i) => {
                const sep = i < lines.length - 1 ? '\n' : '';
                return line + sep;
            })
        ]);

        await sock.sendMessage(chatId, { text: response, ...channelInfo }, { quoted: message });
    } catch (e) {
        console.error('[Reminders] Error:', e.message);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to list reminders.'),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'reminders',
    aliases: ['myreminders', 'myremind'],
    category: 'general',
    description: 'List your pending reminders',
    usage: '.reminders',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await remindersCommand(sock, extra.chatId, message, args, extra);
    }
};
