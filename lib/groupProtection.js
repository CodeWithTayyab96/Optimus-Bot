/**
 * Group protection enforcement — antisticker, antigroupstatus,
 * antigroupmention, autosticker. Ported from KnightBot-Mini handler.js,
 * adapted to Optimus's lib/isAdmin and lib/groupSettings.
 *
 * Detection notes vs KnightBot:
 * - antigroupmention only matches real status-mention indicators
 *   (groupStatusMentionMessage, protocol type 25, forwarded newsletter
 *   info). KnightBot also treated ANY forwarded message as a violation
 *   (ctx.isForwarded / forwardingScore) which deletes ordinary forwards —
 *   that overreach is intentionally not replicated.
 * - antigroupstatus exempts admins/owner. KnightBot shipped with that
 *   exemption commented out ("TESTING") — restored here.
 */

const { getGroupSettings } = require('./groupSettings');
const isAdmin = require('./isAdmin');

// Unwrap common WhatsApp message containers (ephemeral, view once, etc.)
function getMessageContent(msg) {
    if (!msg || !msg.message) return null;
    let m = msg.message;
    if (m.ephemeralMessage) m = m.ephemeralMessage.message;
    if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
    if (m.viewOnceMessage) m = m.viewOnceMessage.message;
    if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
    return m;
}

function isGroupStatusPost(msg, content) {
    const unwrapped = content || getMessageContent(msg);
    return !!(
        unwrapped?.groupStatusMessage ||
        unwrapped?.groupStatusMessageV2 ||
        msg.message?.groupStatusMessage ||
        msg.message?.groupStatusMessageV2
    );
}

function isStatusMention(msg) {
    if (!msg.message) return false;
    if (msg.message.groupStatusMentionMessage) return true;
    if (msg.message.protocolMessage && msg.message.protocolMessage.type === 25) return true; // STATUS_MENTION_MESSAGE

    const contexts = [
        msg.message.contextInfo,
        msg.message.extendedTextMessage?.contextInfo,
        msg.message.imageMessage?.contextInfo,
        msg.message.videoMessage?.contextInfo,
    ];
    return contexts.some(ctx => ctx && ctx.forwardedNewsletterMessageInfo);
}

async function enforce(sock, chatId, message, senderId, action) {
    try {
        await sock.sendMessage(chatId, { delete: message.key });
    } catch (e) {
        console.error('[groupProtection] failed to delete message:', e.message);
        return false;
    }

    if (action === 'kick') {
        try {
            await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
        } catch (e) {
            console.error('[groupProtection] failed to kick:', e.message);
        }
    }
    return true;
}

/**
 * Runs all enabled group protections for a message.
 * Returns true when the message was consumed (deleted or auto-converted)
 * and normal processing should stop.
 */
async function runGroupProtections(sock, chatId, message, senderId, userMessage, prefix) {
    try {
        const settings = getGroupSettings(chatId);
        if (!settings || Object.keys(settings).length === 0) return false;

        const content = getMessageContent(message);
        const fromMe = message.key.fromMe;

        const isSticker = !!(content?.stickerMessage || message.message?.stickerMessage);
        const isStatusPost = isGroupStatusPost(message, content);
        const isMentionPost = isStatusMention(message);
        const mediaMessage = content?.imageMessage || content?.videoMessage;

        const needsModeration = !fromMe && (
            (settings.antisticker && isSticker) ||
            (settings.antigroupstatus && isStatusPost) ||
            (settings.antigroupmention && isMentionPost)
        );

        if (needsModeration) {
            // Admins and the bot itself are exempt
            const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
            if (!isSenderAdmin) {
                if (settings.antigroupstatus && isStatusPost) {
                    const done = await enforce(sock, chatId, message, senderId, (settings.antigroupstatusAction || 'delete').toLowerCase());
                    if (done) {
                        await sock.sendMessage(chatId, {
                            text: '📵 *Anti Group Status!* Group status removed.',
                            mentions: [senderId]
                        }, { quoted: message }).catch(() => { });
                        return true;
                    }
                }

                if (settings.antisticker && isSticker) {
                    const done = await enforce(sock, chatId, message, senderId, (settings.antistickerAction || 'delete').toLowerCase());
                    if (done) return true;
                }

                if (settings.antigroupmention && isMentionPost) {
                    const done = await enforce(sock, chatId, message, senderId, (settings.antigroupmentionAction || 'delete').toLowerCase());
                    if (done) return true;
                }
            }
        }

        // AutoSticker — convert plain image/video messages to stickers
        if (settings.autosticker && mediaMessage && !userMessage.startsWith(prefix)) {
            try {
                const stickerCmd = require('../commands/general/sticker');
                await stickerCmd.execute(sock, message, [], { chatId, senderId });
                return true;
            } catch (error) {
                console.error('[AutoSticker Error]:', error.message);
            }
        }

        return false;
    } catch (error) {
        console.error('[groupProtection] error:', error.message);
        return false;
    }
}

module.exports = { runGroupProtections, isGroupStatusPost, isStatusMention };
