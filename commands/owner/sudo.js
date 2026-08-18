const settings = require('../../settings');
const { addSudo, removeSudo, getSudoList } = require('../../lib/index');
const isOwnerOrSudo = require('../../lib/isOwner');
const style = require('../../lib/messageStyle');

function extractMentionedJid(message) {
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned.length > 0) return mentioned[0];
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const match = text.match(/\b(\d{7,15})\b/);
    if (match) return match[1] + '@s.whatsapp.net';
    return null;
}

async function sudoCommand(sock, chatId, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const isOwner = message.key.fromMe || await isOwnerOrSudo(senderJid, sock, chatId);

    const rawText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const args = rawText.trim().split(' ').slice(1);
    const sub = (args[0] || '').toLowerCase();

    if (!sub || !['add', 'del', 'remove', 'list'].includes(sub)) {
        await sock.sendMessage(chatId, { text: style.box('👑 SUDO', [
            'Usage:',
            ' .sudo add <@user|number>',
            ' .sudo del <@user|number>',
            ' .sudo list'
        ]) },{quoted :message});
        return;
    }

    if (sub === 'list') {
        const list = await getSudoList();
        if (list.length === 0) {
            await sock.sendMessage(chatId, { text: style.info('No sudo users set.') },{quoted :message});
            return;
        }
        const text = list.map((j, i) => `${i + 1}. ${j}`).join('\n');
        await sock.sendMessage(chatId, { text: style.box('👑 SUDO', ['Sudo users:', '', ...list.map((j, i) => `${i + 1}. ${j}`)]) },{quoted :message});
        return;
    }

    if (!isOwner) {
        await sock.sendMessage(chatId, { text: style.permissionDenied('owner', { box: false }) + ' Use .sudo list to view.' },{quoted :message});
        return;
    }

    const targetJid = extractMentionedJid(message);
    if (!targetJid) {
        await sock.sendMessage(chatId, { text: style.invalidInput('Mention a user or provide a number.', '.sudo add <@user|number>', { box: false }) },{quoted :message});
        return;
    }

    if (sub === 'add') {
        const ok = await addSudo(targetJid);
        await sock.sendMessage(chatId, { text: ok ? style.success(`Added sudo: ${targetJid}`) : style.error('Failed to add sudo user.') },{quoted :message});
        return;
    }

    if (sub === 'del' || sub === 'remove') {
        const ownerJid = settings.ownerNumber + '@s.whatsapp.net';
        if (targetJid === ownerJid) {
            await sock.sendMessage(chatId, { text: style.warning('The owner cannot be removed.') },{quoted :message});
            return;
        }
        const ok = await removeSudo(targetJid);
        await sock.sendMessage(chatId, { text: ok ? style.success(`Removed sudo: ${targetJid}`) : style.error('Failed to remove sudo user.') },{quoted :message});
        return;
    }
}

module.exports = {
    name: 'sudo',
    aliases: [],
    category: 'owner',
    description: 'Manage sudo users',
    usage: '.sudo add/del/list @user',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await sudoCommand(sock, extra.chatId, message);
    },

};


