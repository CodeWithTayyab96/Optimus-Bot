const style = require('../../lib/messageStyle');

module.exports = {
    name: 'block',
    aliases: [],
    category: 'owner',
    description: 'Block a user from contacting the bot',
    usage: '.block @user (or reply)',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            let target;

            const ctx = message.message?.extendedTextMessage?.contextInfo;
            const mentioned = ctx?.mentionedJid || [];

            if (mentioned.length > 0) {
                target = mentioned[0];
            } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
                target = ctx.participant;
            } else if (!extra.isGroup && !message.key.fromMe) {
                target = extra.chatId;
            } else {
                return extra.reply(style.invalidInput('Mention or reply to a user to block.', '.block @user (or reply)', { box: false }));
            }

            await sock.updateBlockStatus(target, 'block');

            await sock.sendMessage(extra.chatId, {
                text: style.success(`@${target.split('@')[0]} has been blocked!`),
                mentions: [target]
            }, { quoted: message });
        } catch (error) {
            console.error('Block command error:', error);
            await extra.reply(style.error('Failed to block the user.'));
        }
    }
};
