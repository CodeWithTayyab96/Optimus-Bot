/**
 * .snooze — push a reminder back to a later time.
 *
 * Usage:
 *   .snooze <id> <time>
 *
 * Works on a pending reminder, or one that just fired (reminders stay snoozeable
 * for a while after delivery). Time accepts relative (10m, 1h) or absolute
 * (5pm, tomorrow 9am) formats.
 *
 * Examples:
 *   .snooze R001 10m
 *   .snooze R003 1h
 */

const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');
const reminderStore = require('../../lib/productivity/reminderStore');
const scheduler = require('../../lib/productivity/scheduler');
const { parseTimeSpec } = require('../../lib/productivity/timeParse');

async function snoozeCommand(sock, chatId, message, args, extra) {
    try {
        if (args.length < 2) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput('Provide a reminder ID and a new time.', '.snooze <id> <time>\nExample: .snooze R001 10m'),
                ...channelInfo,
            }, { quoted: message });
        }

        const id = args[0].toUpperCase();
        const spec = parseTimeSpec(args.slice(1).join(' '));
        if (!spec || spec.recurring) {
            return sock.sendMessage(chatId, {
                text: style.invalidInput('Invalid snooze time.', 'Use: 10m · 1h · 5pm · tomorrow 9am'),
                ...channelInfo,
            }, { quoted: message });
        }

        const reminder = reminderStore.getReminder(id);
        if (!reminder) {
            return sock.sendMessage(chatId, { text: style.notFound(`Reminder "${id}"`), ...channelInfo }, { quoted: message });
        }
        if (reminder.userJid !== extra.senderId) {
            return sock.sendMessage(chatId, { text: style.error('You can only snooze your own reminders.'), ...channelInfo }, { quoted: message });
        }
        if (!['pending', 'delivered'].includes(reminder.status)) {
            return sock.sendMessage(chatId, { text: style.warning(`Reminder ${id} is already ${reminder.status}.`), ...channelInfo }, { quoted: message });
        }

        scheduler.cancelTimer(id);
        reminderStore.rescheduleReminder(id, spec.dueAt);
        const updated = reminderStore.getReminder(id);
        scheduler.scheduleNew(updated);

        const lines = [
            `🆔 ID: ${id}`,
            spec.isRelative ? `⏰ In: ${spec.display}` : `📅 At: ${spec.display}`,
            `📝 ${reminder.text}`,
        ];
        await sock.sendMessage(chatId, { text: style.box('😴 REMINDER SNOOZED', lines), ...channelInfo }, { quoted: message });
    } catch (e) {
        console.error('[Snooze] Error:', e.message);
        await sock.sendMessage(chatId, { text: style.error('Failed to snooze the reminder.'), ...channelInfo }, { quoted: message });
    }
}

module.exports = {
    name: 'snooze',
    aliases: ['snoozeremind'],
    category: 'general',
    description: 'Snooze a reminder to a later time',
    usage: '.snooze <id> <time>  (e.g. .snooze R001 10m)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await snoozeCommand(sock, extra.chatId, message, args, extra);
    },
    snoozeCommand,
};
