const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');

const messageStore = new Map();
const CONFIG_PATH = path.join(__dirname, '../../data/antidelete.json');
const TEMP_MEDIA_DIR = path.join(__dirname, '../../tmp');

// Ensure tmp dir exists
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// Function to get folder size in MB
const getFolderSizeInMB = (folderPath) => {
    try {
        const files = fs.readdirSync(folderPath);
        let totalSize = 0;

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            if (fs.statSync(filePath).isFile()) {
                totalSize += fs.statSync(filePath).size;
            }
        }

        return totalSize / (1024 * 1024); // Convert bytes to MB
    } catch (err) {
        console.error('Error getting folder size:', err);
        return 0;
    }
};

// Function to clean temp folder if size exceeds 10MB
const cleanTempFolderIfLarge = () => {
    try {
        const sizeMB = getFolderSizeInMB(TEMP_MEDIA_DIR);
        
        if (sizeMB > 200) {
            const files = fs.readdirSync(TEMP_MEDIA_DIR);
            for (const file of files) {
                const filePath = path.join(TEMP_MEDIA_DIR, file);
                fs.unlinkSync(filePath);
            }
        }
    } catch (err) {
        console.error('Temp cleanup error:', err);
    }
};

// Start periodic cleanup check every 1 minute
setInterval(cleanTempFolderIfLarge, 60 * 1000);

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
    return message?.message?.ephemeralMessage?.message || message?.message || {};
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
        entry.mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
        await downloadMessageToFile(activeContent.imageMessage, 'image', entry.mediaPath);
    } else if (activeContent.stickerMessage) {
        entry.mediaType = 'sticker';
        entry.mimetype = activeContent.stickerMessage.mimetype || 'image/webp';
        entry.mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
        await downloadMessageToFile(activeContent.stickerMessage, 'sticker', entry.mediaPath);
    } else if (activeContent.videoMessage) {
        entry.mediaType = 'video';
        entry.content = activeContent.videoMessage.caption || '';
        entry.mimetype = activeContent.videoMessage.mimetype || 'video/mp4';
        const ext = getExtensionFromMime(entry.mimetype, 'mp4');
        entry.mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
        await downloadMessageToFile(activeContent.videoMessage, 'video', entry.mediaPath);
    } else if (activeContent.audioMessage) {
        entry.mediaType = 'audio';
        entry.mimetype = activeContent.audioMessage.mimetype || 'audio/mpeg';
        entry.ptt = Boolean(activeContent.audioMessage.ptt);
        const ext = getExtensionFromMime(entry.mimetype, entry.ptt ? 'ogg' : 'mp3');
        entry.mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
        await downloadMessageToFile(activeContent.audioMessage, 'audio', entry.mediaPath);
    } else if (documentMessage) {
        entry.mediaType = 'document';
        entry.content = activeContent.documentWithCaptionMessage?.message?.documentMessage?.caption || '';
        entry.mimetype = documentMessage.mimetype || 'application/octet-stream';
        entry.fileName = sanitizeFileName(documentMessage.fileName, `${messageId}.${getExtensionFromMime(entry.mimetype, 'bin')}`);
        const extFromName = path.extname(entry.fileName).replace('.', '');
        const ext = extFromName || getExtensionFromMime(entry.mimetype, 'bin');
        entry.mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
        await downloadMessageToFile(documentMessage, 'document', entry.mediaPath);
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
    }
}

// Command Handler
async function handleAntideleteCommand(sock, chatId, message, match) {
    const senderId = message.key.participant || message.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
    
    if (!message.key.fromMe && !isOwner) {
        return sock.sendMessage(chatId, { text: '*Only the bot owner can use this command.*' }, { quoted: message });
    }

    const config = loadAntideleteConfig();

    if (!match) {
        return sock.sendMessage(chatId, {
            text: `*ANTIDELETE SETUP*\n\nCurrent Status: ${config.enabled ? '✅ Enabled' : '❌ Disabled'}\n\n*.antidelete on* - Enable\n*.antidelete off* - Disable`
        }, {quoted: message});
    }

    if (match === 'on') {
        config.enabled = true;
    } else if (match === 'off') {
        config.enabled = false;
    } else {
        return sock.sendMessage(chatId, { text: '*Invalid command. Use .antidelete to see usage.*' }, {quoted:message});
    }

    saveAntideleteConfig(config);
    return sock.sendMessage(chatId, { text: `*Antidelete ${match === 'on' ? 'enabled' : 'disabled'}*` }, {quoted:message});
}

// Store incoming messages (also handles anti-view-once by forwarding immediately)
async function storeMessage(sock, message) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return; // Don't store if antidelete is disabled

        if (!message.key?.id) return;

        const messageId = message.key.id;
        const sender = message.key.participant || message.key.remoteJid;
        const captured = await captureMessageData(messageId, getMessageContent(message));

        messageStore.set(messageId, {
            ...captured,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString()
        });

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
        if (original.mediaType && (!original.mediaPath || fs.existsSync(original.mediaPath))) {
            try {
                await sendStoredMedia(sock, ownerNumber, sender, senderName, deletedBy, groupName, time, original);
            } catch (err) {
                await sock.sendMessage(ownerNumber, {
                    text: `⚠️ Error sending media: ${err.message}`
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

    } catch (err) {
        console.error('handleMessageRevocation error:', err);
    }
}

module.exports = {
    name: 'antidelete',
    aliases: [],
    category: 'owner',
    description: 'Recover deleted messages',
    usage: '.antidelete on/off',
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
};
