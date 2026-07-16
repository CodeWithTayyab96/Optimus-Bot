const fs = require('fs');
const path = require('path');

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
                return extra.reply(`❌ Please mention or reply to the user to reset warnings!\n\nExample: ${extra.prefix}resetwarn @user`);
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
                    text: `✅ @${target.split('@')[0]} has no warnings to reset.`,
                    mentions: [target]
                }, { quoted: message });
            }

            delete warnings[extra.chatId][target];
            fs.writeFileSync(warningsPath, JSON.stringify(warnings, null, 2));

            await sock.sendMessage(extra.chatId, {
                text: `✅ *Warnings Reset*\n\n👤 User: @${target.split('@')[0]}\n⚠️ Previous warnings: ${currentCount}\n\nAll warnings have been cleared.`,
                mentions: [target]
            }, { quoted: message });
        } catch (error) {
            console.error('ResetWarn command error:', error);
            await extra.reply(`❌ Error: ${error.message}`);
        }
    }
};
