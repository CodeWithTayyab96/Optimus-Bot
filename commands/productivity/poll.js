/**
 * .poll — Create a native WhatsApp poll.
 *
 * Usage:
 *   .poll Question | Option 1 | Option 2 | Option 3
 *   .poll multi Question | Option 1 | Option 2 | Option 3
 *
 * Creates a real WhatsApp poll using Baileys native poll support.
 * The "multi" prefix enables multi-select (selectableCount = option count).
 * Default is single-select (selectableCount = 1).
 */

const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');

const MAX_OPTIONS = 12;
const MAX_OPTION_LENGTH = 100;
const MAX_QUESTION_LENGTH = 200;

async function pollCommand(sock, chatId, message, args, extra) {
    try {
        const rawText = args.join(' ');
        if (!rawText) {
            const text = style.invalidInput(
                'Please provide a question and options.',
                '.poll Question | Option 1 | Option 2 | Option 3'
            );
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        // Check for "multi" prefix
        let isMulti = false;
        let pollText = rawText;
        if (args[0] && args[0].toLowerCase() === 'multi') {
            isMulti = true;
            pollText = args.slice(1).join(' ');
        }

        const parts = pollText.split('|').map(p => p.trim()).filter(p => p.length > 0);

        if (parts.length < 3) {
            const text = style.invalidInput(
                'Need a question and at least 2 options.',
                '.poll Question | Option 1 | Option 2 | Option 3'
            );
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        const question = parts[0];
        const options = [...new Set(parts.slice(1))]; // deduplicate

        if (question.length > MAX_QUESTION_LENGTH) {
            const text = style.error(`Question too long (max ${MAX_QUESTION_LENGTH} characters).`);
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        if (options.length < 2) {
            const text = style.error('Need at least 2 unique options.');
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        if (options.length > MAX_OPTIONS) {
            const text = style.error(`Too many options (max ${MAX_OPTIONS}).`);
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        for (const opt of options) {
            if (opt.length > MAX_OPTION_LENGTH) {
                const text = style.error(`Option too long (max ${MAX_OPTION_LENGTH} chars): "${opt.substring(0, 30)}..."`);
                return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
            }
        }

        const selectableCount = isMulti ? options.length : 1;

        await sock.sendMessage(chatId, {
            poll: {
                name: question,
                values: options,
                selectableCount,
                messageSecret: require('crypto').randomBytes(32)
            },
            ...channelInfo
        }, { quoted: message });

    } catch (e) {
        console.error('[Poll] Error:', e.message);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to create poll.'),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'poll',
    aliases: [],
    category: 'general',
    description: 'Create a native WhatsApp poll',
    usage: '.poll Question | Option 1 | Option 2 | Option 3',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await pollCommand(sock, extra.chatId, message, args, extra);
    }
};
