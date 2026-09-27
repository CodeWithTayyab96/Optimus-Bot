module.exports = {
    name: 'gayrate',
    aliases: [],
    category: 'fun',
    description: 'Playful gay percentage for a user',
    usage: '.gayrate (reply or @user)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const ctx = message.message?.extendedTextMessage?.contextInfo || {};
            const mentioned = ctx.mentionedJid || [];
            let targetId = null;
            if (mentioned.length) targetId = mentioned[0];
            else if (ctx.participant) targetId = ctx.participant;
            else targetId = extra.senderId;

            const targetTag = `@${(targetId || extra.senderId).split('@')[0]}`;

            // deterministic-ish but random: base on id so results are repeatable-ish
            const base = (targetId || extra.senderId).toString().split('').reduce((s, c) => s + c.charCodeAt(0), 0);
            const percent = ((base % 101) + Math.floor(Math.random() * 7)) % 101; // 0-100

            const messages = [
                `${targetTag} is ${percent}% fabulous 🌈`,
                `💖 Compatibility with rainbows: ${percent}% for ${targetTag}`,
                `${targetTag} score: ${percent}% pure glitter ✨`
            ];

            const out = messages[Math.floor(Math.random() * messages.length)];
            await sock.sendMessage(extra.chatId, { text: out, mentions: [targetId] }, { quoted: message });
        } catch (error) {
            console.error('[gayrate] ERROR:', error);
            await extra.reply('❌ Something went wrong.');
        }
    }
};
