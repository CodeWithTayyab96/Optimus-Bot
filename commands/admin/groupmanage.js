const fs = require('fs');
const path = require('path');
const style = require('../../lib/messageStyle');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function ensureGroupAndAdmin(sock, chatId, senderId) {
    const isGroup = chatId.endsWith('@g.us');
    if (!isGroup) {
        await sock.sendMessage(chatId, { text: style.permissionDenied('group', { box: false }) });
        return { ok: false };
    }
    // Check admin status of sender and bot
    const isAdmin = require('../../lib/isAdmin');
    const adminStatus = await isAdmin(sock, chatId, senderId);
    if (!adminStatus.isBotAdmin) {
        await sock.sendMessage(chatId, { text: style.permissionDenied('botAdmin', { box: false }) });
        return { ok: false };
    }
    if (!adminStatus.isSenderAdmin) {
        await sock.sendMessage(chatId, { text: style.permissionDenied('admin', { box: false }) });
        return { ok: false };
    }
    return { ok: true };
}

async function setGroupDescription(sock, chatId, senderId, text, message) {
    const check = await ensureGroupAndAdmin(sock, chatId, senderId);
    if (!check.ok) return;
    const desc = (text || '').trim();
    if (!desc) {
        await sock.sendMessage(chatId, { text: style.invalidInput('Provide a description.', '.setgdesc <description>', { box: false }) }, { quoted: message });
        return;
    }
    try {
        await sock.groupUpdateDescription(chatId, desc);
        await sock.sendMessage(chatId, { text: style.success('Group description updated.') }, { quoted: message });
    } catch (e) {
        console.error('setgdesc error:', e);
        await sock.sendMessage(chatId, { text: style.error('Failed to update the group description.') }, { quoted: message });
    }
}

async function setGroupName(sock, chatId, senderId, text, message) {
    const check = await ensureGroupAndAdmin(sock, chatId, senderId);
    if (!check.ok) return;
    const name = (text || '').trim();
    if (!name) {
        await sock.sendMessage(chatId, { text: style.invalidInput('Provide a new name.', '.setgname <new name>', { box: false }) }, { quoted: message });
        return;
    }
    try {
        await sock.groupUpdateSubject(chatId, name);
        await sock.sendMessage(chatId, { text: style.success('Group name updated.') }, { quoted: message });
    } catch (e) {
        console.error('setgname error:', e);
        await sock.sendMessage(chatId, { text: style.error('Failed to update the group name.') }, { quoted: message });
    }
}

async function setGroupPhoto(sock, chatId, senderId, message) {
    const check = await ensureGroupAndAdmin(sock, chatId, senderId);
    if (!check.ok) return;

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMessage = quoted?.imageMessage || quoted?.stickerMessage;
    if (!imageMessage) {
        await sock.sendMessage(chatId, { text: style.invalidInput('Reply to an image or sticker.', '.setgpp (reply to image)', { box: false }) }, { quoted: message });
        return;
    }
    try {
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        const stream = await downloadContentFromMessage(imageMessage, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        const imgPath = path.join(tmpDir, `gpp_${Date.now()}.jpg`);
        fs.writeFileSync(imgPath, buffer);

        await sock.updateProfilePicture(chatId, { url: imgPath });
        try { fs.unlinkSync(imgPath); } catch (_) {}
        await sock.sendMessage(chatId, { text: style.success('Group profile photo updated.') }, { quoted: message });
    } catch (e) {
        console.error('setgpp error:', e);
        await sock.sendMessage(chatId, { text: style.error('Failed to update the group profile photo.') }, { quoted: message });
    }
}

module.exports = {
    name: 'setgdesc',
    aliases: ['setgname', 'setgpp'],
    category: 'admin',
    description: 'Set group description, name or photo',
    usage: '.setgdesc <text> | .setgname <text> | .setgpp (reply to image)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: true,
    async execute(sock, message, args, extra) {
        const text = args.join(' ');
        if (extra.commandName === 'setgname') {
            await setGroupName(sock, extra.chatId, extra.senderId, text, message);
        } else if (extra.commandName === 'setgpp') {
            await setGroupPhoto(sock, extra.chatId, extra.senderId, message);
        } else {
            await setGroupDescription(sock, extra.chatId, extra.senderId, text, message);
        }
    },
    setGroupDescription,
    setGroupName,
    setGroupPhoto,
};


