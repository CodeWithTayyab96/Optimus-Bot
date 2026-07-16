module.exports = {
    name: 'unblock',
    aliases: [],
    category: 'owner',
    description: 'Unblock a previously blocked user',
    usage: '.unblock @user (or reply)',
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
            } else if (args[0] && /^\d{6,}$/.test(args[0].replace(/[^0-9]/g, ''))) {
                target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            } else {
                return extra.reply('❌ Please mention, reply to, or give the number of a user to unblock!');
            }

            await sock.updateBlockStatus(target, 'unblock');

            await sock.sendMessage(extra.chatId, {
                text: `✅ @${target.split('@')[0]} has been unblocked!`,
                mentions: [target]
            }, { quoted: message });
        } catch (error) {
            await extra.reply(`❌ Error: ${error.message}`);
        }
    }
};
