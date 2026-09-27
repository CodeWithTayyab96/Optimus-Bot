const axios = require('axios');

/** Turn a phone number / JID into a WhatsApp JID. Returns null if it looks invalid. */
function toJid(input) {
    const digits = String(input || '').replace(/\D/g, '');
    if (digits.length < 7) return null;
    return `${digits}@s.whatsapp.net`;
}

module.exports = {
    name: 'getpp',
    aliases: ['gp', 'getpic', 'getdp', 'dp'],
    category: 'general',
    description: 'Get a user profile picture — by phone number, mention, reply, or your own',
    usage: '.getdp <number>  ·  .getpp @user (or reply)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            let targetUser = null;

            // 1) Explicit phone number / JID argument, e.g. .getdp 923701609799
            if (args && args[0]) {
                const jid = toJid(args[0]);
                if (!jid) {
                    return extra.reply('❌ Please provide a valid phone number (with country code).');
                }
                targetUser = jid;
            }

            // 2) Otherwise: the message you replied to, then a mention, then yourself.
            const ctx = message.message?.extendedTextMessage?.contextInfo;
            if (!targetUser && ctx?.quotedMessage) {
                targetUser = ctx.participant;
            }
            if (!targetUser && ctx?.mentionedJid?.length > 0) {
                targetUser = ctx.mentionedJid[0];
            }
            if (!targetUser) {
                targetUser = extra.senderId;
            }

            if (!targetUser) {
                return extra.reply('❌ Could not identify target user. Provide a number, or reply to / tag a user.');
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
    },
    // Exported for tests
    toJid,
};
