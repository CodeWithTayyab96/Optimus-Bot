const fs = require('fs');
const path = require('path');
const style = require('../../lib/messageStyle');

const warningsPath = path.join(process.cwd(), 'data', 'warnings.json');

module.exports = {
    name: 'resetwarn',
    aliases: ['resetwarning', 'clearwarn', 'unwarn', 'delwarn'],
    category: 'admin',
    description: 'Reset all warnings for a user',
    usage: '.resetwarn @user (or reply)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: true,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        try {
            let target;
            const ctx = message.message?.extendedTextMessage?.contextInfo;
            const mentioned = ctx?.mentionedJid || [];

            if (mentioned.length > 0) {
                target = mentioned[0];
            } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
                target = ctx.participant;
            } else {
                return extra.reply(style.invalidInput('Please mention or reply to the user to reset warnings.', `${extra.prefix}resetwarn @user`, { box: false }));
            }

            // Warnings live in data/warnings.json as { [chatId]: { [userId]: count } }
            let warnings = {};
            try {
                warnings = JSON.parse(fs.readFileSync(warningsPath, 'utf8'));
            } catch (e) {
                warnings = {};
            }

            const currentCount = warnings[extra.chatId]?.[target] || 0;

            if (currentCount === 0) {
                return sock.sendMessage(extra.chatId, {
                    text: style.info(`@${target.split('@')[0]} has no warnings to reset.`),
                    mentions: [target]
                }, { quoted: message });
            }

            delete warnings[extra.chatId][target];
            fs.writeFileSync(warningsPath, JSON.stringify(warnings, null, 2));

            await sock.sendMessage(extra.chatId, {
                text: style.box('🛡️ MODERATION', [
                    '✅ Warnings Reset',
                    '',
                    `👤 User: @${target.split('@')[0]}`,
                    `⚠️ Previous warnings: ${currentCount}`,
                    '',
                    'All warnings have been cleared.'
                ]),
                mentions: [target]
            }, { quoted: message });
        } catch (error) {
            console.error('ResetWarn command error:', error);
            await extra.reply(style.error('Failed to reset warnings.'));
        }
    }
};
