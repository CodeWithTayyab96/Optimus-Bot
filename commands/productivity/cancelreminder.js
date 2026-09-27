/**
 * .cancelreminder — Cancel a pending reminder by ID.
 *
 * Usage:
 *   .cancelreminder R001
 *
 * Verifies ownership before cancelling.
 */

const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');
const reminderStore = require('../../lib/productivity/reminderStore');
const scheduler = require('../../lib/productivity/scheduler');

async function cancelReminderCommand(sock, chatId, message, args, extra) {
    try {
        if (!args[0]) {
            const text = style.invalidInput(
                'Please provide a reminder ID.',
                '.cancelreminder R001'
            );
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        const reminderId = args[0].toUpperCase();
        const userJid = extra.senderId;

        const reminder = reminderStore.getReminder(reminderId);

        if (!reminder) {
            const text = style.notFound(`Reminder "${reminderId}"`);
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        if (reminder.userJid !== userJid) {
            const text = style.error('You can only cancel your own reminders.');
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        if (reminder.status !== 'pending') {
            const text = style.warning(`Reminder ${reminderId} is already ${reminder.status}.`);
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        scheduler.cancelTimer(reminderId);
        reminderStore.cancelReminder(reminderId, userJid);

        const response = style.box('🗑️ REMINDER CANCELLED', [
            `🆔 ID: ${reminderId}`,
            `🗑️ Reminder cancelled.`
        ]);

        await sock.sendMessage(chatId, { text: response, ...channelInfo }, { quoted: message });
    } catch (e) {
        console.error('[CancelReminder] Error:', e.message);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to cancel reminder.'),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'cancelreminder',
    aliases: ['cancelremind'],
    category: 'general',
    description: 'Cancel a pending reminder by ID',
    usage: '.cancelreminder R001',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await cancelReminderCommand(sock, extra.chatId, message, args, extra);
    }
};
