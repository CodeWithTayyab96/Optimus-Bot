const fs = require('fs');
const path = require('path');
const style = require('../../lib/messageStyle');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');

const messageStore = new Map();
const CONFIG_PATH = path.join(__dirname, '../../data/antidelete.json');
const STORE_PATH = path.join(__dirname, '../../data/antidelete-store.json');
const DATA_DIR = path.join(__dirname, '../../data');
const TEMP_MEDIA_DIR = path.join(__dirname, '../../tmp');

// Retention / bounds. The old version kept EVERY message in memory forever and
// wiped the whole temp folder once it hit 200MB — which could delete media still
// needed to recover a not-yet-deleted message. We now bound both by age + size.
const STORE_TTL_MS = 24 * 60 * 60 * 1000; // recoverable window (24h)
const MAX_STORE_ENTRIES = 1000;           // hard cap on stored messages
const TEMP_MAX_MB = 200;                  // temp folder soft cap

// Ensure dirs exist
try {
    if (!fs.existsSync(TEMP_MEDIA_DIR)) fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
    console.error('Antidelete dir init error:', e.message);
}

// Folder size in MB
const getFolderSizeInMB = (folderPath) => {
    try {
        let totalSize = 0;
        for (const file of fs.readdirSync(folderPath)) {
            const filePath = path.join(folderPath, file);
            if (fs.statSync(filePath).isFile()) totalSize += fs.statSync(filePath).size;
        }
        return totalSize / (1024 * 1024);
    } catch (err) {
        console.error('Error getting folder size:', err);
        return 0;
    }
};

// --- Persistence: survive a bot restart ----------------------------------
// Metadata is persisted (debounced); media files already live in tmp/, so a
// message deleted after a restart can still be recovered while its file remains.
let saveTimer = null;
function saveStoreToDisk() {
    try {
        const obj = {};
        for (const [id, entry] of messageStore) obj[id] = entry;
        fs.writeFileSync(STORE_PATH, JSON.stringify(obj));
    } catch (err) {
        console.error('Antidelete store save error:', err.message);
    }
}
function scheduleStoreSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; saveStoreToDisk(); }, 2000);
}
function loadStoreFromDisk() {
    try {
        if (!fs.existsSync(STORE_PATH)) return;
        const obj = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
        for (const [id, entry] of Object.entries(obj || {})) messageStore.set(id, entry);
        sweepStore();
        if (messageStore.size) console.log(`🛡️ Antidelete: restored ${messageStore.size} stored message(s)`);
    } catch (err) {
        console.error('Antidelete store load error:', err.message);
    }
}

// --- Eviction (bounds memory + disk) -------------------------------------
function evictEntry(id) {
    const entry = messageStore.get(id);
    if (!entry) return;
    if (entry.mediaPath) { try { fs.unlinkSync(entry.mediaPath); } catch { /* already gone */ } }
    messageStore.delete(id);
}
function enforceCap() {
    while (messageStore.size > MAX_STORE_ENTRIES) {
        const oldest = messageStore.keys().next().value;
        if (oldest === undefined) break;
        evictEntry(oldest);
    }
}
function sweepStore() {
    const now = Date.now();
    let removed = 0;
    for (const [id, entry] of messageStore) {
        const ts = Date.parse(entry.timestamp || '') || 0;
        if (ts && now - ts > STORE_TTL_MS) { evictEntry(id); removed++; }
    }
    if (removed) scheduleStoreSave();
}

// --- Temp media cleanup --------------------------------------------------
// Delete temp files older than the retention window that are NOT referenced by a
// live store entry; then, if still over the cap, drop the oldest unreferenced files.
function sweepTempDir() {
    try {
        const referenced = new Set();
        for (const entry of messageStore.values()) if (entry.mediaPath) referenced.add(entry.mediaPath);

        const now = Date.now();
        let files = fs.readdirSync(TEMP_MEDIA_DIR)
            .map((f) => {
                const fp = path.join(TEMP_MEDIA_DIR, f);
                try {
                    const st = fs.statSync(fp);
                    return st.isFile() ? { fp, mtime: st.mtimeMs, size: st.size } : null;
                } catch { return null; }
            })
            .filter(Boolean);

        // 1) age-based: remove expired, unreferenced files
        for (const f of files) {
            if (!referenced.has(f.fp) && now - f.mtime > STORE_TTL_MS) {
                try { fs.unlinkSync(f.fp); } catch { }
            }
        }

        // 2) cap-based: if still too big, drop the oldest unreferenced files
        files = files.filter((f) => fs.existsSync(f.fp));
        let totalMB = files.reduce((s, f) => s + f.size, 0) / (1024 * 1024);
        if (totalMB > TEMP_MAX_MB) {
            const oldestFirst = files
                .filter((f) => !referenced.has(f.fp))
                .sort((a, b) => a.mtime - b.mtime);
            for (const f of oldestFirst) {
                if (totalMB <= TEMP_MAX_MB) break;
                try { fs.unlinkSync(f.fp); totalMB -= f.size / (1024 * 1024); } catch { }
            }
        }
    } catch (err) {
        console.error('Temp cleanup error:', err);
    }
}

// Periodic maintenance (store TTL + temp cleanup) every 5 minutes.
//
// unref() so merely importing this module never holds a process open. Without
// it any process that requires it — tests, CLI helpers, one-off scripts — hangs
// on exit waiting for a 5-minute timer it has no interest in.
const sweepTimer = setInterval(() => { sweepStore(); sweepTempDir(); }, 5 * 60 * 1000);
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

// Restore persisted entries on startup.
loadStoreFromDisk();

// Load config
function loadAntideleteConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false };
        return JSON.parse(fs.readFileSync(CONFIG_PATH));
    } catch {
        return { enabled: false };
    }
}

// Save config
function saveAntideleteConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('Config save error:', err);
    }
}

const isOwnerOrSudo = require('../../lib/isOwner');

function getOwnerJid(sock) {
    return sock.user.id.split(':')[0] + '@s.whatsapp.net';
}

function sanitizeFileName(name, fallback = 'file') {
    return String(name || fallback).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 120);
}

function getExtensionFromMime(mimetype = '', fallback = 'bin') {
    const mime = String(mimetype).toLowerCase();
    if (mime.includes('jpeg')) return 'jpg';
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('webm')) return 'webm';
    if (mime.includes('mpeg')) return 'mp3';
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('wav')) return 'wav';
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('zip')) return 'zip';
    if (mime.includes('json')) return 'json';
    if (mime.includes('plain')) return 'txt';
    return fallback;
}

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function downloadMessageToFile(messageContent, streamType, filePath) {
    const stream = await downloadContentFromMessage(messageContent, streamType);
    const buffer = await streamToBuffer(stream);
    await writeFile(filePath, buffer);
    return filePath;
}

function getMessageContent(message) {
    let content = message?.message || {};
    // Unwrap common envelopes so the real payload is captured.
    if (content.ephemeralMessage?.message) content = content.ephemeralMessage.message;
    if (content.groupStatusMessage?.message) content = content.groupStatusMessage.message;
    if (content.groupStatusMessageV2?.message) content = content.groupStatusMessageV2.message;
    return content;
}

function unwrapViewOnceMessage(content) {
    return content?.viewOnceMessageV2?.message
        || content?.viewOnceMessageV2Extension?.message
        || content?.viewOnceMessage?.message
        || null;
}

function extractDocumentWithCaption(content) {
    return content?.documentWithCaptionMessage?.message?.documentMessage || null;
}

/** Best-effort text extraction from interactive / template / list / button nodes. */
function extractUiText(node) {
    if (!node) return '';
    const candidates = [
        node.contentText, node.text, node.headerText,
        node.body?.text, node.header?.title, node.footerText,
        node.description, node.title,
        node.hydratedTemplate?.hydratedContentText,
        node.hydratedTemplate?.hydratedTitleText,
    ];
    const found = candidates.find((v) => typeof v === 'string' && v.trim());
    return found ? found.trim() : '';
}

/** Text from a calendar event message. */
function extractEventText(ev) {
    if (!ev) return '';
    const parts = [];
    if (ev.name) parts.push(`Event: ${ev.name}`);
    if (ev.description) parts.push(ev.description);
    if (ev.startTime) {
        try { parts.push(`Starts: ${new Date(Number(ev.startTime) * 1000).toISOString()}`); } catch { /* ignore */ }
    }
    return parts.join('\n');
}

/** Text from a catalog product message. */
function extractProductText(pm) {
    const p = pm?.product;
    if (!p) return '';
    const parts = [];
    if (p.title) parts.push(`Product: ${p.title}`);
    if (p.description) parts.push(p.description);
    if (p.priceAmount1000) parts.push(`Price: ${Number(p.priceAmount1000) / 1000}`);
    return parts.join('\n');
}

/** Download helper that never throws — a failed media fetch still stores the
 *  rest of the message (caption/text), it just won't have the file. */
async function safeDownload(node, type, filePath) {
    // downloadContentFromMessage() destructures `mediaKey` from the TOP LEVEL of
    // whatever it is handed. A node without one cannot be decrypted — that is a
    // property of the message WhatsApp delivered (some arrive as stubs), not
    // something to retry. Report it once, concisely, instead of throwing an
    // error that reads like a crash.
    if (!node?.mediaKey) {
        logMediaFailureOnce(`no media key for ${type}`, describeMediaNode(node));
        return '';
    }
    try {
        await downloadMessageToFile(node, type, filePath);
        return filePath;
    } catch (e) {
        logMediaFailureOnce(`${type} download failed: ${e.message}`, describeMediaNode(node));
        return '';
    }
}

/** What a media node actually carries — enough to tell a wrong node from a
 *  genuinely keyless message, without dumping the payload. */
function describeMediaNode(node) {
    if (!node || typeof node !== 'object') return `node is ${node === null ? 'null' : typeof node}`;
    const fields = Object.keys(node)
        .filter((k) => !k.startsWith('_') && node[k] !== null && node[k] !== undefined)
        .slice(0, 8);
    return [
        `mediaKey=${node.mediaKey ? 'present' : 'MISSING'}`,
        `url=${node.url || node.directPath ? 'present' : 'MISSING'}`,
        `fields=[${fields.join(', ')}]`,
    ].join(' ');
}

// Bursts are common (one keyless message per media type), so log each distinct
// reason at most once a minute rather than flooding the console.
const recentMediaFailures = new Map();
const MEDIA_FAILURE_LOG_INTERVAL_MS = 60000;

function logMediaFailureOnce(reason, detail) {
    const key = `${reason}|${detail}`;
    const now = Date.now();
    if (now - (recentMediaFailures.get(key) || 0) < MEDIA_FAILURE_LOG_INTERVAL_MS) return;
    recentMediaFailures.set(key, now);
    if (recentMediaFailures.size > 50) recentMediaFailures.clear();
    console.warn(`[antidelete] ${reason} — ${detail}`);
}

/** True if the captured entry holds anything worth storing. */
function hasContent(entry) {
    return Boolean(entry && (
        entry.content || entry.mediaType || entry.contacts ||
        entry.location || entry.poll || entry.reaction || entry.contactName
    ));
}

function buildTextPreview(entry) {
    const parts = [];
    if (entry.content) parts.push(entry.content);
    if (entry.mediaType === 'contact' && entry.contactName) {
        parts.push(`Contact: ${entry.contactName}`);
    }
    if (entry.mediaType === 'contacts' && entry.contacts?.length) {
        parts.push(`Contacts: ${entry.contacts.map(c => c.displayName).join(', ')}`);
    }
    if ((entry.mediaType === 'location' || entry.mediaType === 'liveLocation') && entry.location) {
        const { degreesLatitude, degreesLongitude, name, address } = entry.location;
        if (name) parts.push(`Location: ${name}`);
        if (address) parts.push(`Address: ${address}`);
        if (typeof degreesLatitude === 'number' && typeof degreesLongitude === 'number') {
            parts.push(`Coordinates: ${degreesLatitude}, ${degreesLongitude}`);
        }
    }
    if (entry.mediaType === 'poll' && entry.poll) {
        parts.push(`Poll: ${entry.poll.name || 'Untitled poll'}`);
        if (entry.poll.options?.length) {
            parts.push(`Options: ${entry.poll.options.join(', ')}`);
        }
    }
    if (entry.mediaType === 'reaction' && entry.reaction) {
        parts.push(`Reaction: ${entry.reaction.text || 'unknown'}`);
    }
    return parts.join('\n');
}

function buildForwardDetails({ original, sender, senderName, deletedBy, groupName, time }) {
    const lines = [
        `*Deleted ${original.mediaType || 'message'}*`,
        `*Sender:* @${senderName}`,
        `*Sender JID:* ${sender}`,
        `*Deleted By:* @${deletedBy.split('@')[0]}`,
        `*Time:* ${time}`
    ];

    if (groupName) {
        lines.push(`*Group:* ${groupName}`);
    }

    if ((original.mediaType === 'location' || original.mediaType === 'liveLocation') && original.location) {
        const { name, address, degreesLatitude, degreesLongitude } = original.location;
        if (name) lines.push(`*Location:* ${name}`);
        if (address) lines.push(`*Address:* ${address}`);
        if (typeof degreesLatitude === 'number' && typeof degreesLongitude === 'number') {
            lines.push(`*Coordinates:* ${degreesLatitude}, ${degreesLongitude}`);
        }
    }

    if (original.fileName) {
        lines.push(`*File:* ${original.fileName}`);
    }

    if (original.content) {
        lines.push('', `*Caption/Text:* ${original.content}`);
    }

    return lines.join('\n');
}

async function captureMessageData(messageId, content) {
    const entry = {
        content: '',
        mediaType: '',
        mediaPath: '',
        mimetype: '',
        fileName: '',
        ptt: false,
        isViewOnce: false,
        contactName: '',
        contacts: null,
        location: null,
        poll: null,
        reaction: null
    };

    const viewOnceContent = unwrapViewOnceMessage(content);
    const activeContent = viewOnceContent || content;
    entry.isViewOnce = Boolean(viewOnceContent);

    const documentMessage = extractDocumentWithCaption(activeContent) || activeContent.documentMessage;

    if (activeContent.conversation) {
        entry.content = activeContent.conversation;
    } else if (activeContent.extendedTextMessage?.text) {
        entry.content = activeContent.extendedTextMessage.text;
    } else if (activeContent.imageMessage) {
        entry.mediaType = 'image';
        entry.content = activeContent.imageMessage.caption || '';
        entry.mimetype = activeContent.imageMessage.mimetype || 'image/jpeg';
        const ext = getExtensionFromMime(entry.mimetype, 'jpg');
        entry.mediaPath = await safeDownload(activeContent.imageMessage, 'image', path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`));
    } else if (activeContent.stickerMessage) {
        entry.mediaType = 'sticker';
        entry.mimetype = activeContent.stickerMessage.mimetype || 'image/webp';
        entry.mediaPath = await safeDownload(activeContent.stickerMessage, 'sticker', path.join(TEMP_MEDIA_DIR, `${messageId}.webp`));
    } else if (activeContent.lottieStickerMessage) {
        // Animated (lottie) sticker — store the raw file as a document.
        //
        // lottieStickerMessage is a FutureProofMessage: { message: { stickerMessage } }.
        // The mediaKey lives on the INNER stickerMessage, so unwrapping only one
        // level hands downloadContentFromMessage a wrapper with no key — which is
        // exactly what produced "Cannot derive from empty media key" for stickers.
        const lottieNode = activeContent.lottieStickerMessage.message?.stickerMessage
            || activeContent.lottieStickerMessage.message
            || activeContent.lottieStickerMessage;
        entry.mediaType = 'document';
        entry.mimetype = 'application/json';
        entry.fileName = `${messageId}.json`;
        entry.mediaPath = await safeDownload(lottieNode, 'sticker', path.join(TEMP_MEDIA_DIR, `${messageId}.json`));
    } else if (activeContent.videoMessage) {
        entry.mediaType = 'video';
        entry.content = activeContent.videoMessage.caption || '';
        entry.mimetype = activeContent.videoMessage.mimetype || 'video/mp4';
        const ext = getExtensionFromMime(entry.mimetype, 'mp4');
        entry.mediaPath = await safeDownload(activeContent.videoMessage, 'video', path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`));
    } else if (activeContent.ptvMessage) {
        // Video note (round "video message").
        entry.mediaType = 'video';
        entry.mimetype = activeContent.ptvMessage.mimetype || 'video/mp4';
        entry.mediaPath = await safeDownload(activeContent.ptvMessage, 'video', path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`));
    } else if (activeContent.audioMessage) {
        entry.mediaType = 'audio';
        entry.mimetype = activeContent.audioMessage.mimetype || 'audio/mpeg';
        entry.ptt = Boolean(activeContent.audioMessage.ptt);
        const ext = getExtensionFromMime(entry.mimetype, entry.ptt ? 'ogg' : 'mp3');
        entry.mediaPath = await safeDownload(activeContent.audioMessage, 'audio', path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`));
    } else if (documentMessage) {
        entry.mediaType = 'document';
        entry.content = activeContent.documentWithCaptionMessage?.message?.documentMessage?.caption || documentMessage.caption || '';
        entry.mimetype = documentMessage.mimetype || 'application/octet-stream';
        entry.fileName = sanitizeFileName(documentMessage.fileName, `${messageId}.${getExtensionFromMime(entry.mimetype, 'bin')}`);
        const extFromName = path.extname(entry.fileName).replace('.', '');
        const ext = extFromName || getExtensionFromMime(entry.mimetype, 'bin');
        entry.mediaPath = await safeDownload(documentMessage, 'document', path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`));
    } else if (activeContent.contactMessage) {
        entry.mediaType = 'contact';
        entry.contactName = activeContent.contactMessage.displayName || 'Unknown contact';
        entry.content = activeContent.contactMessage.vcard || '';
    } else if (activeContent.contactsArrayMessage?.contacts?.length) {
        entry.mediaType = 'contacts';
        entry.contacts = activeContent.contactsArrayMessage.contacts.map(contact => ({
            displayName: contact.displayName || 'Unknown contact',
            vcard: contact.vcard || ''
        }));
    } else if (activeContent.locationMessage) {
        entry.mediaType = 'location';
        entry.location = {
            degreesLatitude: activeContent.locationMessage.degreesLatitude,
            degreesLongitude: activeContent.locationMessage.degreesLongitude,
            name: activeContent.locationMessage.name || '',
            address: activeContent.locationMessage.address || ''
        };
    } else if (activeContent.liveLocationMessage) {
        entry.mediaType = 'liveLocation';
        entry.location = {
            degreesLatitude: activeContent.liveLocationMessage.degreesLatitude,
            degreesLongitude: activeContent.liveLocationMessage.degreesLongitude,
            name: activeContent.liveLocationMessage.name || '',
            address: activeContent.liveLocationMessage.caption || ''
        };
    } else if (activeContent.pollCreationMessage || activeContent.pollCreationMessageV2 || activeContent.pollCreationMessageV3) {
        const pollMessage = activeContent.pollCreationMessage || activeContent.pollCreationMessageV2 || activeContent.pollCreationMessageV3;
        entry.mediaType = 'poll';
        entry.poll = {
            name: pollMessage.name || '',
            options: (pollMessage.options || []).map(option => option.optionName).filter(Boolean)
        };
    } else if (activeContent.reactionMessage) {
        entry.mediaType = 'reaction';
        entry.reaction = {
            text: activeContent.reactionMessage.text || '',
            key: activeContent.reactionMessage.key || null
        };
    } else if (activeContent.buttonsMessage) {
        entry.content = extractUiText(activeContent.buttonsMessage);
    } else if (activeContent.templateMessage) {
        entry.content = extractUiText(activeContent.templateMessage);
    } else if (activeContent.interactiveMessage) {
        entry.content = extractUiText(activeContent.interactiveMessage);
    } else if (activeContent.listMessage) {
        entry.content = extractUiText(activeContent.listMessage);
    } else if (activeContent.buttonsResponseMessage) {
        entry.content = activeContent.buttonsResponseMessage.selectedDisplayText
            || activeContent.buttonsResponseMessage.selectedButtonId || '';
    } else if (activeContent.listResponseMessage) {
        entry.content = activeContent.listResponseMessage.title
            || activeContent.listResponseMessage.singleSelectReply?.selectedRowId || '';
    } else if (activeContent.templateButtonReplyMessage) {
        entry.content = activeContent.templateButtonReplyMessage.selectedDisplayText
            || activeContent.templateButtonReplyMessage.selectedId || '';
    } else if (activeContent.eventMessage) {
        entry.content = extractEventText(activeContent.eventMessage);
    } else if (activeContent.productMessage) {
        entry.content = extractProductText(activeContent.productMessage);
    } else if (activeContent.requestPhoneNumberMessage) {
        entry.content = activeContent.requestPhoneNumberMessage.text || '';
    }

    return entry;
}

async function sendStoredMedia(sock, ownerNumber, sender, senderName, deletedBy, groupName, time, original) {
    const detailsText = buildForwardDetails({ original, sender, senderName, deletedBy, groupName, time });
    const mediaOptions = {
        caption: detailsText,
        mentions: [sender, deletedBy]
    };

    switch (original.mediaType) {
        case 'image':
            await sock.sendMessage(ownerNumber, {
                image: { url: original.mediaPath },
                ...mediaOptions
            });
            return;
        case 'sticker':
            await sock.sendMessage(ownerNumber, {
                text: detailsText,
                mentions: [sender, deletedBy]
            });
            await sock.sendMessage(ownerNumber, {
                sticker: { url: original.mediaPath }
            });
            return;
        case 'video':
            await sock.sendMessage(ownerNumber, {
                video: { url: original.mediaPath },
                ...mediaOptions
            });
            return;
        case 'audio':
            await sock.sendMessage(ownerNumber, {
                audio: { url: original.mediaPath },
                mimetype: original.mimetype || 'audio/mpeg',
                ptt: Boolean(original.ptt),
                ...mediaOptions
            });
            return;
        case 'document':
            await sock.sendMessage(ownerNumber, {
                document: { url: original.mediaPath },
                fileName: original.fileName || path.basename(original.mediaPath),
                mimetype: original.mimetype || 'application/octet-stream',
                ...mediaOptions
            });
            return;
        case 'contact':
            await sock.sendMessage(ownerNumber, {
                text: detailsText,
                mentions: [sender, deletedBy]
            });
            await sock.sendMessage(ownerNumber, {
                contacts: {
                    displayName: original.contactName || 'Deleted contact',
                    contacts: [{
                        displayName: original.contactName || 'Deleted contact',
                        vcard: original.content || ''
                    }]
                }
            });
            return;
        case 'contacts':
            await sock.sendMessage(ownerNumber, {
                text: detailsText,
                mentions: [sender, deletedBy]
            });
            await sock.sendMessage(ownerNumber, {
                contacts: {
                    displayName: `${(original.contacts || []).length} deleted contacts`,
                    contacts: (original.contacts || []).map(contact => ({
                        displayName: contact.displayName,
                        vcard: contact.vcard
                    }))
                }
            });
            return;
        case 'location':
        case 'liveLocation':
            await sock.sendMessage(ownerNumber, {
                text: detailsText,
                mentions: [sender, deletedBy]
            });
            if (original.location) {
                await sock.sendMessage(ownerNumber, {
                    location: {
                        degreesLatitude: original.location.degreesLatitude,
                        degreesLongitude: original.location.degreesLongitude,
                        name: original.location.name || undefined,
                        address: original.location.address || undefined
                    }
                });
            }
            return;
        default:
            // Any other media type (e.g. lottie sticker, or a future type) — send
            // the stored file as a document so it is still recoverable.
            if (original.mediaPath) {
                await sock.sendMessage(ownerNumber, {
                    document: { url: original.mediaPath },
                    fileName: original.fileName || path.basename(original.mediaPath),
                    mimetype: original.mimetype || 'application/octet-stream',
                    ...mediaOptions
                });
            }
            return;
    }
}

// Command Handler
async function handleAntideleteCommand(sock, chatId, message, match) {
    const senderId = message.key.participant || message.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
    
    if (!message.key.fromMe && !isOwner) {
        return sock.sendMessage(chatId, { text: style.permissionDenied('owner', { box: false }) }, { quoted: message });
    }

    const config = loadAntideleteConfig();

    const showStatus = () => sock.sendMessage(chatId, {
        text: style.box('🛡️ ANTIDELETE', [
            `Status: ${config.enabled ? '✅ Enabled' : '❌ Disabled'}`,
            `Stored: ${messageStore.size} message(s) · retention ${STORE_TTL_MS / 3600000}h`,
            '',
            'Usage:',
            ' .antidelete on — enable',
            ' .antidelete off — disable',
            ' .antidelete status — show status',
            ' .antidelete clear — wipe stored messages'
        ])
    }, { quoted: message });

    if (!match || match === 'status') {
        return showStatus();
    }

    if (match === 'clear') {
        for (const id of [...messageStore.keys()]) evictEntry(id);
        scheduleStoreSave();
        return sock.sendMessage(chatId, { text: style.success('Cleared all stored antidelete messages.') }, { quoted: message });
    }

    if (match === 'on') {
        config.enabled = true;
    } else if (match === 'off') {
        config.enabled = false;
    } else {
        return sock.sendMessage(chatId, { text: style.invalidInput('Invalid command. Use .antidelete to see usage.', '.antidelete on/off/status/clear', { box: false }) }, {quoted:message});
    }

    saveAntideleteConfig(config);
    return sock.sendMessage(chatId, { text: style.success(`Antidelete ${match === 'on' ? 'enabled' : 'disabled'}.`) }, {quoted:message});
}

// Store incoming messages (also handles anti-view-once by forwarding immediately)
async function storeMessage(sock, message) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return; // Don't store if antidelete is disabled

        if (!message.key?.id) return;
        if (message.key.fromMe) return; // our own messages can't be deleted by others

        const messageId = message.key.id;
        const sender = message.key.participant || message.key.remoteJid;
        const captured = await captureMessageData(messageId, getMessageContent(message));

        if (!hasContent(captured)) return; // nothing worth storing (protocol/system message)

        messageStore.set(messageId, {
            ...captured,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString()
        });

        enforceCap();
        scheduleStoreSave();

        // Anti-ViewOnce: forward immediately to owner if captured
        if (captured.isViewOnce && captured.mediaType && captured.mediaPath && fs.existsSync(captured.mediaPath)) {
            try {
                const ownerNumber = getOwnerJid(sock);
                const senderName = sender.split('@')[0];
                const mediaOptions = {
                    caption: `*Anti-ViewOnce ${captured.mediaType}*
From: @${senderName}`,
                    mentions: [sender]
                };
                if (captured.mediaType === 'image') {
                    await sock.sendMessage(ownerNumber, { image: { url: captured.mediaPath }, ...mediaOptions });
                } else if (captured.mediaType === 'video') {
                    await sock.sendMessage(ownerNumber, { video: { url: captured.mediaPath }, ...mediaOptions });
                } else if (captured.mediaType === 'audio') {
                    await sock.sendMessage(ownerNumber, {
                        audio: { url: captured.mediaPath },
                        mimetype: captured.mimetype || 'audio/mpeg',
                        ptt: Boolean(captured.ptt)
                    });
                } else if (captured.mediaType === 'document') {
                    await sock.sendMessage(ownerNumber, {
                        document: { url: captured.mediaPath },
                        fileName: captured.fileName || path.basename(captured.mediaPath),
                        mimetype: captured.mimetype || 'application/octet-stream',
                        ...mediaOptions
                    });
                }
                // Cleanup immediately for view-once forward
                try { fs.unlinkSync(captured.mediaPath); } catch {}
            } catch (e) {
                // ignore
            }
        }

    } catch (err) {
        console.error('storeMessage error:', err);
    }
}

// Handle message deletion
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return;

        const messageId = revocationMessage.message.protocolMessage.key.id;
        const deletedBy = revocationMessage.participant || revocationMessage.key.participant || revocationMessage.key.remoteJid;
        const ownerNumber = getOwnerJid(sock);

        if (deletedBy.includes(sock.user.id) || deletedBy === ownerNumber) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        const sender = original.sender;
        const senderName = sender.split('@')[0];
        const groupName = original.group ? (await sock.groupMetadata(original.group)).subject : '';

        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Kolkata',
            hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        let text = `*🔰 ANTIDELETE REPORT 🔰*\n\n` +
            `*🗑️ Deleted By:* @${deletedBy.split('@')[0]}\n` +
            `*👤 Sender:* @${senderName}\n` +
            `*📱 Number:* ${sender}\n` +
            `*🕒 Time:* ${time}\n`;

        if (groupName) text += `*👥 Group:* ${groupName}\n`;

        const previewText = buildTextPreview(original);
        if (previewText) {
            text += `\n*💬 Deleted Message:*\n${previewText}`;
        }

        await sock.sendMessage(ownerNumber, {
            text,
            mentions: [deletedBy, sender]
        });

        // Media sending
        if (original.mediaType) {
            const hasFile = original.mediaPath && fs.existsSync(original.mediaPath);
            if (hasFile) {
                try {
                    await sendStoredMedia(sock, ownerNumber, sender, senderName, deletedBy, groupName, time, original);
                } catch (err) {
                    console.error('Error sending deleted media:', err);
                    await sock.sendMessage(ownerNumber, {
                        text: '⚠️ Failed to send the deleted media. The file may no longer be available.'
                    });
                }
            } else {
                await sock.sendMessage(ownerNumber, {
                    text: `⚠️ Media (${original.mediaType}) could not be recovered — the file is no longer available.`
                });
            }

            // Cleanup
            if (original.mediaPath) {
                try {
                    fs.unlinkSync(original.mediaPath);
                } catch (err) {
                    console.error('Media cleanup error:', err);
                }
            }
        }

        messageStore.delete(messageId);
        scheduleStoreSave();

    } catch (err) {
        console.error('handleMessageRevocation error:', err);
    }
}

module.exports = {
    name: 'antidelete',
    aliases: [],
    category: 'owner',
    description: 'Recover deleted messages',
    usage: '.antidelete on/off/status/clear',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleAntideleteCommand(sock, extra.chatId, message, extra.userMessage.split(/\s+/).slice(1).join(' ').trim());
    },
    handleAntideleteCommand,
    handleMessageRevocation,
    storeMessage,
    // Internals exposed for tests only.
    _test: {
        messageStore, sweepStore, sweepTempDir, evictEntry, enforceCap,
        captureMessageData, hasContent, getMessageContent,
        describeMediaNode, safeDownload,
        STORE_TTL_MS, MAX_STORE_ENTRIES,
    },
};
