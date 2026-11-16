const style = require('../../lib/messageStyle');
const { downloadContentFromMessage, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { channelInfo } = require('../../lib/messageConfig');
const { resolveDmJid } = require('../../lib/dmTarget');
const store = require('../../lib/lightweight_store');

const ENVELOPE_KEYS = [
    'viewOnceMessageV2Extension',
    'viewOnceMessageV2',
    'viewOnceMessage',
    'ephemeralMessage',
];

function findMedia(content, depth = 0) {
    if (!content || depth > 10) return null;

    if (content.imageMessage) return { type: 'image', media: content.imageMessage };
    if (content.videoMessage) return { type: 'video', media: content.videoMessage };
    if (content.audioMessage) return { type: 'audio', media: content.audioMessage };

    for (const key of ENVELOPE_KEYS) {
        if (content[key]?.message) {
            const result = findMedia(content[key].message, depth + 1);
            if (result) return result;
        }
    }

    if (content.message && typeof content.message === 'object') {
        const result = findMedia(content.message, depth + 1);
        if (result) return result;
    }

    return null;
}

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

        const needsRecovery = !mediaNode.url && !mediaNode.directPath;
        let buffer;
        let caption = mediaNode.caption || '';

        // --- DEBUG (temporary) — log exactly what the store lookup sees ---
        if (needsRecovery && ctx?.stanzaId) {
            console.log(`[.vv2] DEBUG: quoted node stripped (url=${mediaNode.url}, directPath=${mediaNode.directPath}, mediaKey=${mediaNode.mediaKey ? 'present' : 'MISSING'}), stanzaId=${ctx.stanzaId}`);
            const storedMsg = await store.loadMessage(chatId, ctx.stanzaId);
            if (storedMsg?.message) {
                const storedMedia = findMedia(storedMsg.message);
                console.log(`[.vv2] DEBUG: store hit — storedMedia=${storedMedia ? storedMedia.type : 'null'}, url=${storedMedia?.media?.url ? 'present' : 'MISSING'}, mediaKey=${storedMedia?.media?.mediaKey ? 'present' : 'MISSING'}, directPath=${storedMedia?.media?.directPath ? 'present' : 'MISSING'}`);
                if (storedMedia) {
                    mediaNode = storedMedia.media;
                    mediaType = storedMedia.type;
                    caption = storedMedia.media.caption || caption;
                }
            } else {
                console.log(`[.vv2] DEBUG: store miss — loadMessage(${chatId}, ${ctx.stanzaId}) returned ${storedMsg === null ? 'null' : typeof storedMsg}`);
            }
        }

        // 3c. Check proactive media cache first.
        if (needsRecovery && ctx?.stanzaId) {
            const cached = store.loadCachedMedia(ctx.stanzaId);
            if (cached) {
                console.log(`[.vv2] DEBUG: media cache hit for ${ctx.stanzaId}, type=${cached.type}, bytes=${cached.buffer.length}`);
                buffer = cached.buffer;
                mediaType = cached.type;
                caption = cached.caption || caption;
            }
        }

        // 3d. Try downloadMediaMessage with reuploadRequest (same pattern
        // as sticker.js / trace.js — lets Baileys re-request credentials).
        if (!buffer && needsRecovery && ctx?.stanzaId) {
            try {
                const syntheticMsg = {
                    key: {
                        remoteJid: chatId,
                        id: ctx.stanzaId,
                        participant: ctx.participant,
                    },
                    message: quotedMsg,
                };
                console.log(`[.vv2] DEBUG: trying downloadMediaMessage with reuploadRequest`);
                buffer = await downloadMediaMessage(syntheticMsg, 'buffer', {}, {
                    reuploadRequest: sock.updateMediaMessage,
                });
                console.log(`[.vv2] DEBUG: downloadMediaMessage succeeded, bytes=${buffer?.length}`);
            } catch (reupErr) {
                console.log(`[.vv2] DEBUG: downloadMediaMessage+reupload failed: ${reupErr.message}`);
            }
        }

        // 4. Resolve DM target.
        const dest = resolveDmJid(sock, message, chatId, senderId);
        if (!dest) {
            return fail('Could not find your DM.');
        }

        // 5. Download with downloadContentFromMessage as fallback.
        if (!buffer) {
            try {
                buffer = await downloadMedia(mediaNode, mediaType);
            } catch (dlErr) {
                console.error(`[.vv2] Download failed for ${mediaType}:`, dlErr.message);
                return fail('Failed to download media. The view-once media may have expired or the download URL is no longer valid.');
            }
        }

        if (!buffer || buffer.length === 0) {
            return fail('Downloaded media is empty. Please try again.');
        }

        // 6. Send the recovered media to the DM.
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
