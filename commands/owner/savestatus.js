/**
 * .savestatus — save the media you REPLIED TO (or forwarded) into this chat.
 *
 * ⚠️ NAME WARNING — read this before changing the description again.
 *   This command does NOT fetch anybody's WhatsApp status, and never could:
 *   statuses cannot be quoted from a normal chat, and there is no fetch-on-demand
 *   API for them. It saves the media attached to the message you replied to.
 *   The real status saver is `.status <number>` (commands/owner/status.js), which
 *   serves from lib/statusCache. The description below is deliberately honest
 *   about that, because the old wording ("Save media from a status") sent people
 *   here expecting something this command cannot do.
 *
 * ⚠️ PRIVACY: this can capture media posted by other people. It is owner-only and
 * the reply carries a reminder. If you consider that unacceptable, delete this
 * file — see the deployment docs.
 */
const style = require('../../lib/messageStyle');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

// A quoted message may be wrapped — a view-once reply arrives as
// { viewOnceMessageV2: { message: { imageMessage } } }, so looking for
// `imageMessage` on the wrapper finds nothing. Unwrap first.
const ENVELOPE_KEYS = [
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'viewOnceMessage',
    'ephemeralMessage',
];

function unwrap(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 10) return node;
    for (const key of ENVELOPE_KEYS) {
        if (node[key]?.message) return unwrap(node[key].message, depth + 1);
    }
    return node;
}

module.exports = {
    name: 'savestatus',
    aliases: ['dlstatus2', 'savestory'],
    category: 'owner',
    description: 'Save the media you replied to (or forwarded) into this chat — for a real status, use .status <number>',
    usage: '.savestatus (reply to / forward the media)  ·  .status <number> for a contact’s status',
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

            // Unwrap view-once / ephemeral envelopes on both paths.
            const src = unwrap(quoted) || unwrap(own) || {};

            const kind = src.imageMessage ? 'image'
                : src.videoMessage ? 'video'
                    : src.audioMessage ? 'audio'
                        : null;

            if (!kind) {
                return await extra.reply(style.invalidInput(
                    'Reply to (or forward) an image, video or audio to save it. ' +
                    'To fetch someone’s status, use .status <number>.',
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
    // Exported for tests.
    _test: { unwrap },
};
