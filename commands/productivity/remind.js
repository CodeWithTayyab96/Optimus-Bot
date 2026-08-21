/**
 * .remind — Create a timed reminder.
 *
 * Usage:
 *   .remind <duration> <message>
 *
 * Duration formats:
 *   30s  → 30 seconds
 *   10m  → 10 minutes
 *   2h   → 2 hours
 *   1d   → 1 day
 *
 * Examples:
 *   .remind 10m Submit assignment
 *   .remind 2h Check the server
 *   .remind 30s Test reminder
 */

const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');
const reminderStore = require('../../lib/productivity/reminderStore');
const scheduler = require('../../lib/productivity/scheduler');

const MAX_DURATION_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
const UNITS = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
};

function parseDuration(input) {
    if (!input) return null;
    const match = input.match(/^(\d+)\s*(s|m|h|d)$/i);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (value <= 0) return null;
    const ms = value * UNITS[unit];
    if (ms > MAX_DURATION_MS) return null;
    return { ms, display: formatDuration(value, unit) };
}

function formatDuration(value, unit) {
    const labels = { s: 'second', m: 'minute', h: 'hour', d: 'day' };
    const label = labels[unit] || 'unit';
    return `${value} ${label}${value !== 1 ? 's' : ''}`;
}

function formatDueTime(dueAt) {
    const d = new Date(dueAt);
    return d.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        month: 'short',
        day: 'numeric'
    });
}

async function remindCommand(sock, chatId, message, args, extra) {
    try {
        if (args.length < 2) {
            const text = style.invalidInput(
                'Please provide a duration and message.',
                '.remind <duration> <message>\nExample: .remind 10m Submit assignment'
            );
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        const durationInput = args[0];
        const text = args.slice(1).join(' ');
        const duration = parseDuration(durationInput);

        if (!duration) {
            const text = style.invalidInput(
                `Invalid duration: "${durationInput}"`,
                'Use: 30s, 10m, 2h, or 1d'
            );
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        if (!text.trim()) {
            const text = style.invalidInput(
                'Please provide a reminder message.',
                '.remind 10m Submit assignment'
            );
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        const userJid = extra.senderId;
        const dueAt = Date.now() + duration.ms;
        const isGroup = extra.isGroup;

        const reminder = reminderStore.createReminder({
            userJid,
            chatJid: chatId,
            text: text.trim(),
            dueAt,
            groupContext: isGroup
        });

        scheduler.scheduleNew(reminder);

        const response = style.box('⏰ REMINDER CREATED', [
            `🆔 ID: ${reminder.id}`,
            `⏰ In: ${duration.display}`,
            `📅 At: ${formatDueTime(reminder.dueAt)}`,
            `📝 ${text.trim()}`
        ]);

        await sock.sendMessage(chatId, { text: response, ...channelInfo }, { quoted: message });
    } catch (e) {
        console.error('[Remind] Error:', e.message);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to create reminder.'),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'remind',
    aliases: [],
    category: 'general',
    description: 'Create a timed reminder',
    usage: '.remind <duration> <message>  (e.g., .remind 10m Submit assignment)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await remindCommand(sock, extra.chatId, message, args, extra);
    }
};
