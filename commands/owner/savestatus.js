const style = require('../../lib/messageStyle');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

/**
 * .savestatus — save media from a status (or any quoted media) into this chat.
 *
 * ⚠️ PRIVACY: this can capture media posted by other people. It is owner-only
 * and the reply carries a reminder. If the owner considers that unacceptable,
 * delete this file — see the deployment docs.
 *
 * Practical note: WhatsApp statuses cannot be quoted directly in a normal chat,
 * so this works on media that was forwarded into the chat (or a quoted media
 * message). It downloads the attached media and re-sends it here.
 */
module.exports = {
    name: 'savestatus',
    aliases: ['dlstatus2', 'savestory'],
    category: 'owner',
    description: 'Save media from a status / quoted message into this chat (owner only)',
    usage: '.savestatus (reply to/forward the media)',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const own = message.message || {};
            const src = quoted || own;

            const kind = src.imageMessage ? 'image'
                : src.videoMessage ? 'video'
                    : src.audioMessage ? 'audio'
                        : null;

            if (!kind) {
                return await extra.reply(style.invalidInput(
                    'Reply to (or forward) an image, video or audio to save it.',
                    `${extra.prefix}savestatus`
                ));
            }

            await extra.reply(style.processing('Saving media...'));

            const stream = await downloadContentFromMessage(src[`${kind}Message`], kind);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);

            if (!buffer.length) {
                return await extra.reply(style.error('Downloaded media was empty.'));
            }

            const payload = {};
            if (kind === 'image') payload.image = buffer;
            else if (kind === 'video') payload.video = buffer;
            else payload.audio = buffer;

            payload.caption = '💾 Saved media';
            await sock.sendMessage(extra.chatId, payload, { quoted: message });

            return await extra.reply(style.info('Saved. ⚠️ Respect the poster’s privacy — only save media you’re entitled to keep.'));
        } catch (e) {
            console.error('[savestatus] error:', e.message);
            return await extra.reply(style.error('Failed to save that media.'));
        }
    },
};
