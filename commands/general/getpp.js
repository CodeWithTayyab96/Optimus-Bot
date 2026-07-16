const axios = require('axios');

module.exports = {
    name: 'getpp',
    aliases: ['gp', 'getpic'],
    category: 'general',
    description: 'Get the profile picture of a user',
    usage: '.getpp @user (or reply, or your own)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            let targetUser = null;

            const ctx = message.message?.extendedTextMessage?.contextInfo;
            if (ctx?.quotedMessage) {
                targetUser = ctx.participant;
            } else if (ctx?.mentionedJid?.length > 0) {
                targetUser = ctx.mentionedJid[0];
            } else {
                targetUser = extra.senderId;
            }

            if (!targetUser) {
                return extra.reply('❌ Could not identify target user. Please reply to a message or tag a user.');
            }

            try {
                const ppUrl = await sock.profilePictureUrl(targetUser, 'image');

                if (!ppUrl) {
                    return extra.reply('❌ Profile picture not found for this user.');
                }

                const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data);

                await sock.sendMessage(extra.chatId, {
                    image: buffer,
                    caption: `👤 Profile picture of @${targetUser.split('@')[0]}`,
                    mentions: [targetUser]
                }, { quoted: message });
            } catch (profileError) {
                if (profileError.output?.statusCode === 401 ||
                    profileError.message?.includes('forbidden') ||
                    profileError.message?.includes('unauthorized')) {
                    return extra.reply("❌ Profile picture not found. The user's profile picture is private or not available.");
                }
                return extra.reply('❌ Profile picture not found for this user.');
            }
        } catch (error) {
            extra.reply('❌ Profile picture not found for this user.');
        }
    }
};
