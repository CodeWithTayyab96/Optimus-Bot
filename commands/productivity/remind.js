/**
 * .remind — create a timed reminder.
 *
 * Usage:
 *   .remind <time> <message>
 *
 * Time can be:
 *   30s 10m 2h 1d            → relative
 *   5pm  17:30  5:30pm       → absolute (next occurrence)
 *   tomorrow 9am             → absolute, next day
 *   daily 9am                → repeats every day
 *   weekly mon 9am           → repeats every Monday
 *
 * Examples:
 *   .remind 10m Submit assignment
 *   .remind 5pm Call mom
 *   .remind tomorrow 9am Office meeting
 *   .remind daily 9am Standup
 */

const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');
const reminderStore = require('../../lib/productivity/reminderStore');
const scheduler = require('../../lib/productivity/scheduler');
const { parseLeadingTime } = require('../../lib/productivity/timeParse');

const HELP =
    '.remind <time> <message>\n' +
    'Examples:\n' +
    ' .remind 10m Submit assignment\n' +
    ' .remind 5pm Call mom\n' +
    ' .remind tomorrow 9am Office meeting\n' +
    ' .remind daily 9am Standup';

async function remindCommand(sock, chatId, message, args, extra) {
    try {
        if (args.length < 2) {
            return sock.sendMessage(chatId, { text: style.invalidInput('Please provide a time and a message.', HELP), ...channelInfo }, { quoted: message });
        }

        const lead = parseLeadingTime(args);
        if (!lead) {
            const bad = args.slice(0, 3).join(' ');
            return sock.sendMessage(chatId, {
                text: style.invalidInput(`Couldn't understand the time "${bad}".`, 'Use: 30s · 10m · 2h · 1d · 5pm · 17:30 · tomorrow 9am · daily 9am · weekly mon 9am'),
                ...channelInfo,
            }, { quoted: message });
        }

        const msgText = args.slice(lead.consumed).join(' ').trim();
        if (!msgText) {
            return sock.sendMessage(chatId, { text: style.invalidInput('Please provide a reminder message.', HELP), ...channelInfo }, { quoted: message });
        }

        const { spec } = lead;
        const reminder = reminderStore.createReminder({
            userJid: extra.senderId,
            chatJid: chatId,
            text: msgText,
            dueAt: spec.dueAt,
            groupContext: extra.isGroup,
            recurring: spec.recurring,
            weeklyDay: spec.weeklyDay,
            kind: 'reminder',
        });
        scheduler.scheduleNew(reminder);

        const lines = [`🆔 ID: ${reminder.id}`];
        lines.push(spec.isRelative ? `⏰ In: ${spec.display}` : `📅 At: ${spec.display}`);
        if (spec.recurring) lines.push(`🔁 Repeats: ${spec.recurring}${spec.weeklyDay ? ' on ' + spec.weeklyDay : ''}`);
        lines.push(`📝 ${msgText}`);

        await sock.sendMessage(chatId, { text: style.box('⏰ REMINDER CREATED', lines), ...channelInfo }, { quoted: message });
    } catch (e) {
        console.error('[Remind] Error:', e.message);
        await sock.sendMessage(chatId, { text: style.error('Failed to create reminder.'), ...channelInfo }, { quoted: message });
    }
}

module.exports = {
    name: 'remind',
    aliases: [],
    category: 'general',
    description: 'Create a timed reminder (relative, absolute or recurring)',
    usage: '.remind <time> <message>  (e.g. .remind 10m Submit assignment)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await remindCommand(sock, extra.chatId, message, args, extra);
    },
    remindCommand,
};
