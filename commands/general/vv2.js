const style = require('../../lib/messageStyle');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { channelInfo } = require('../../lib/messageConfig');
const { resolveDmJid } = require('../../lib/dmTarget');
const store = require('../../lib/lightweight_store');

/**
 * .vv2 — View-Once media to your DM (image / video / audio)
 *
 * Follows the reference bot's vv2 command: reply to a view-once message
 * and the recovered media is sent to your DM instead of back into the
 * chat, so it stays private. The download is attempted first and only
 * explained afterwards, matching the .vv fix: a missing mediaKey is
 * only reported after the download is tried and fails, because that is
 * when it is known the media cannot be decrypted.
 *
 * Reference approach:
 *   - extract the quoted message from contextInfo on several message
 *     types, not only extendedTextMessage
 *   - check the view-once flag across V2, V2Extension, V1 and direct
 *     image/video/audio nodes
 *   - unwrap viewOnceMessageV2Extension first, then viewOnceMessageV2,
 *     then viewOnceMessage, then direct media
 *   - download with downloadContentFromMessage and send to the
 *     sender's DM; confirm in the chat only when the DM differs
 */

const ENVELOPE_KEYS = [
    'viewOnceMessageV2Extension',
    'viewOnceMessageV2',
    'viewOnceMessage',
    'ephemeralMessage',
];

/**
 * Recursively unwrap view-once / ephemeral envelopes to find the raw media node.
 */
function findMedia(content, depth = 0) {
    if (!content || depth > 10) return null;

    // Check for media at this level
    if (content.imageMessage) return { type: 'image', media: content.imageMessage };
    if (content.videoMessage) return { type: 'video', media: content.videoMessage };
    if (content.audioMessage) return { type: 'audio', media: content.audioMessage };

    // Try envelope wrappers
    for (const key of ENVELOPE_KEYS) {
        if (content[key]?.message) {
            const result = findMedia(content[key].message, depth + 1);
            if (result) return result;
        }
    }

    // Generic .message unwrapping
    if (content.message && typeof content.message === 'object') {
        const result = findMedia(content.message, depth + 1);
        if (result) return result;
    }

    return null;
}

/**
 * Download media using downloadContentFromMessage (the known-working method).
 * Collects stream chunks into a single Buffer.
 */
async function downloadMedia(mediaNode, type) {
    const stream = await downloadContentFromMessage(mediaNode, type);
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function vv2Command(sock, chatId, message, senderId) {
    const fail = (text) => sock.sendMessage(chatId, {
        text: style.error(text),
        ...channelInfo,
    }, { quoted: message });

    try {
        // 1. Extract quoted message from contextInfo on several message
        // types, not only extendedTextMessage.
        const ctx =
            message.message?.extendedTextMessage?.contextInfo ||
            message.message?.imageMessage?.contextInfo ||
            message.message?.videoMessage?.contextInfo ||
            message.message?.buttonsResponseMessage?.contextInfo ||
            message.message?.listResponseMessage?.contextInfo;

        if (!ctx?.quotedMessage) {
            return fail('Reply to a view-once message.\nIt will be sent to your DM.');
        }

        const quotedMsg = ctx.quotedMessage;

        // 2. Confirm the quoted message is a view-once message.
        const hasViewOnce =
            !!quotedMsg.viewOnceMessageV2 ||
            !!quotedMsg.viewOnceMessageV2Extension ||
            !!quotedMsg.viewOnceMessage ||
            !!quotedMsg.viewOnce ||
            !!quotedMsg?.imageMessage?.viewOnce ||
            !!quotedMsg?.videoMessage?.viewOnce ||
            !!quotedMsg?.audioMessage?.viewOnce;

        if (!hasViewOnce) {
            return fail('This is not a view-once message!');
        }

        // 3. Unwrap the envelope (V2Extension first, then V2, then V1,
        // then direct media) to find the raw media node.
        let actualMsg = null;
        let mtype = null;

        if (quotedMsg.viewOnceMessageV2Extension?.message) {
            actualMsg = quotedMsg.viewOnceMessageV2Extension.message;
            mtype = Object.keys(actualMsg)[0];
        } else if (quotedMsg.viewOnceMessageV2?.message) {
            actualMsg = quotedMsg.viewOnceMessageV2.message;
            mtype = Object.keys(actualMsg)[0];
        } else if (quotedMsg.viewOnceMessage?.message) {
            actualMsg = quotedMsg.viewOnceMessage.message;
            mtype = Object.keys(actualMsg)[0];
        } else if (quotedMsg.imageMessage?.viewOnce) {
            actualMsg = { imageMessage: quotedMsg.imageMessage };
            mtype = 'imageMessage';
        } else if (quotedMsg.videoMessage?.viewOnce) {
            actualMsg = { videoMessage: quotedMsg.videoMessage };
            mtype = 'videoMessage';
        } else if (quotedMsg.audioMessage?.viewOnce) {
            actualMsg = { audioMessage: quotedMsg.audioMessage };
            mtype = 'audioMessage';
        }

        if (!actualMsg || !mtype) {
            return fail('Unsupported view-once message type.');
        }

        let mediaNode = actualMsg[mtype];
        let mediaType = mtype === 'imageMessage' ? 'image' : mtype === 'videoMessage' ? 'video' : 'audio';

        // 3b. WhatsApp strips download credentials from view-once
        // quotedMessages. Look up the original from the store.
        if (mediaNode && !mediaNode.url && !mediaNode.directPath && ctx?.stanzaId) {
            const original = await store.loadMessage(chatId, ctx.stanzaId);
            if (original?.message) {
                const stored = findMedia(original.message);
                if (stored && (stored.media.url || stored.media.directPath)) {
                    mediaNode = stored.media;
                    mediaType = stored.type;
                }
            }
        }

        // 4. Resolve a genuinely private target. Never trust senderId
        // alone; see lib/dmTarget for why.
        const dest = resolveDmJid(sock, message, chatId, senderId);
        if (!dest) {
            return fail('Could not find your DM.');
        }

        // 5. Download the media. Attempt first, explain afterwards.
        let buffer;
        try {
            buffer = await downloadMedia(mediaNode, mediaType);
        } catch (dlErr) {
            console.error(`[.vv2] Download failed for ${mediaType}:`, dlErr.message);
            // A media node without a mediaKey cannot be decrypted. WhatsApp
            // delivers the sender's own copy of a view-once message (and one
            // already opened) as a stub with no key and no download path, so
            // say so plainly instead of blaming expiry.
            if (!mediaNode.mediaKey) {
                return fail('Sorry, I cannot recover this one. WhatsApp did not include the download key in this view-once message, so there is nothing for me to download. This happens with view-once messages you sent yourself, and with ones already opened. Reply .vv2 to a view-once message someone else sent you and it works.');
            }
            return fail('Failed to download media. The view-once media may have expired or the download URL is no longer valid.');
        }

        if (!buffer || buffer.length === 0) {
            return fail('Downloaded media is empty. Please try again.');
        }

        // 6. Send the recovered media to the DM.
        const caption = mediaNode.caption || '';
        if (mediaType === 'video') {
            await sock.sendMessage(dest, {
                video: buffer,
                caption,
                mimetype: 'video/mp4',
                ...channelInfo,
            });
        } else if (mediaType === 'image') {
            await sock.sendMessage(dest, {
                image: buffer,
                caption,
                mimetype: 'image/jpeg',
                ...channelInfo,
            });
        } else if (mediaType === 'audio') {
            await sock.sendMessage(dest, {
                audio: buffer,
                ptt: true,
                mimetype: mediaNode.mimetype || 'audio/ogg; codecs=opus',
                ...channelInfo,
            });
        }

        // 7. Confirm in the chat only when the DM is a different chat.
        if (dest !== chatId) {
            await sock.sendMessage(chatId, {
                text: style.success('Sent to your DM.'),
                ...channelInfo,
            }, { quoted: message });
        }
    } catch (error) {
        console.error('[.vv2]', error?.message || error);
        await fail('Error processing view-once message: ' + (error.message || 'Unknown error'));
    }
}

module.exports = {
    name: 'vv2',
    aliases: [],
    category: 'general',
    description: 'Recover a view-once message and send it to your DM so it stays private. Use .vv to re-send it in the same chat instead.',
    usage: '.vv2 (reply to a view-once image/video/audio)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await vv2Command(sock, extra.chatId, message, extra.senderId);
    },
};
