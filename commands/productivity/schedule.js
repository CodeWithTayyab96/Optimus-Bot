/**
 * .schedule — schedule a message the bot will post later.
 *
 * Usage:
 *   .schedule <time> <message>
 *
 * Time accepts the same formats as .remind (10m, 5pm, tomorrow 9am, daily 9am,
 * weekly mon 9am). The message is sent to the CURRENT chat as-is (no "Reminder"
 * prefix). List with .reminders, cancel with .cancelreminder <id>.
 *
 * Examples:
 *   .schedule 30m Standup in 5 minutes
 *   .schedule 8am Good morning everyone!
 *   .schedule daily 7am Have a great day ☀️
 */

const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');
const reminderStore = require('../../lib/productivity/reminderStore');
const scheduler = require('../../lib/productivity/scheduler');
const { parseLeadingTime } = require('../../lib/productivity/timeParse');

const HELP =
    '.schedule <time> <message>\n' +
    'Examples:\n' +
    ' .schedule 30m Standup in 5 minutes\n' +
    ' .schedule 8am Good morning everyone!\n' +
    ' .schedule daily 7am Have a great day ☀️';

async function scheduleCommand(sock, chatId, message, args, extra) {
    try {
        if (args.length < 2) {
            return sock.sendMessage(chatId, { text: style.invalidInput('Please provide a time and the message to send.', HELP), ...channelInfo }, { quoted: message });
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
            return sock.sendMessage(chatId, { text: style.invalidInput('Please provide the message to send.', HELP), ...channelInfo }, { quoted: message });
        }

        const { spec } = lead;
        const item = reminderStore.createReminder({
            userJid: extra.senderId,
            chatJid: chatId,
            text: msgText,
            dueAt: spec.dueAt,
            groupContext: extra.isGroup,
            recurring: spec.recurring,
            weeklyDay: spec.weeklyDay,
            kind: 'message',
        });
        scheduler.scheduleNew(item);

        const lines = [`🆔 ID: ${item.id}`];
        lines.push(spec.isRelative ? `⏰ In: ${spec.display}` : `📅 At: ${spec.display}`);
        if (spec.recurring) lines.push(`🔁 Repeats: ${spec.recurring}${spec.weeklyDay ? ' on ' + spec.weeklyDay : ''}`);
        lines.push(`💬 ${msgText}`);

        await sock.sendMessage(chatId, { text: style.box('📨 MESSAGE SCHEDULED', lines), ...channelInfo }, { quoted: message });
    } catch (e) {
        console.error('[Schedule] Error:', e.message);
        await sock.sendMessage(chatId, { text: style.error('Failed to schedule the message.'), ...channelInfo }, { quoted: message });
    }
}

module.exports = {
    name: 'schedule',
    aliases: ['sched', 'schedulemsg'],
    category: 'general',
    description: 'Schedule a message the bot will send later (optionally recurring)',
    usage: '.schedule <time> <message>  (e.g. .schedule 30m Standup in 5)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await scheduleCommand(sock, extra.chatId, message, args, extra);
    },
    scheduleCommand,
};
