const fs = require('fs');
const isOwnerOrSudo = require('../../lib/isOwner');
const style = require('../../lib/messageStyle');

const PMBLOCKER_PATH = './data/pmblocker.json';

function readState() {
    try {
        if (!fs.existsSync(PMBLOCKER_PATH)) return { enabled: false, message: '⚠️ Direct messages are blocked!\nYou cannot DM this bot. Please contact the owner in group chats only.' };
        const raw = fs.readFileSync(PMBLOCKER_PATH, 'utf8');
        const data = JSON.parse(raw || '{}');
        return {
            enabled: !!data.enabled,
            message: typeof data.message === 'string' && data.message.trim() ? data.message : '⚠️ Direct messages are blocked!\nYou cannot DM this bot. Please contact the owner in group chats only.'
        };
    } catch {
        return { enabled: false, message: '⚠️ Direct messages are blocked!\nYou cannot DM this bot. Please contact the owner in group chats only.' };
    }
}

function writeState(enabled, message) {
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        const current = readState();
        const payload = {
            enabled: !!enabled,
            message: typeof message === 'string' && message.trim() ? message : current.message
        };
        fs.writeFileSync(PMBLOCKER_PATH, JSON.stringify(payload, null, 2));
    } catch {}
}

async function pmblockerCommand(sock, chatId, message, args) {
    const senderId = message.key.participant || message.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
    
    if (!message.key.fromMe && !isOwner) {
        await sock.sendMessage(chatId, { text: style.permissionDenied('owner', { box: false }) }, { quoted: message });
        return;
    }
    
    const argStr = (args || '').trim();
    const [sub, ...rest] = argStr.split(' ');
    const state = readState();

    if (!sub || !['on', 'off', 'status', 'setmsg'].includes(sub.toLowerCase())) {
        await sock.sendMessage(chatId, { text: style.box('👑 PM BLOCKER', [
            'Usage:',
            ' .pmblocker on — enable PM auto-block',
            ' .pmblocker off — disable PM blocker',
            ' .pmblocker status — show current status',
            ' .pmblocker setmsg <text> — set the warning message'
        ]) }, { quoted: message });
        return;
    }

    if (sub.toLowerCase() === 'status') {
        await sock.sendMessage(chatId, { text: style.box('👑 PM BLOCKER', [
            `Status: *${state.enabled ? 'ON' : 'OFF'}*`,
            `Message: ${state.message}`
        ]) }, { quoted: message });
        return;
    }

    if (sub.toLowerCase() === 'setmsg') {
        const newMsg = rest.join(' ').trim();
        if (!newMsg) {
            await sock.sendMessage(chatId, { text: style.invalidInput('Provide a warning message.', '.pmblocker setmsg <message>', { box: false }) }, { quoted: message });
            return;
        }
        writeState(state.enabled, newMsg);
        await sock.sendMessage(chatId, { text: style.success('PM Blocker message updated.') }, { quoted: message });
        return;
    }

    const enable = sub.toLowerCase() === 'on';
    writeState(enable);
    await sock.sendMessage(chatId, { text: style.success(`PM Blocker is now *${enable ? 'ENABLED' : 'DISABLED'}*.`) }, { quoted: message });
}

module.exports = {
    name: 'pmblocker',
    aliases: [],
    category: 'owner',
    description: 'Block private messages from non-owners',
    usage: '.pmblocker on/off',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await pmblockerCommand(sock, extra.chatId, message, extra.userMessage.split(/\s+/).slice(1).join(' '));
    },
    pmblockerCommand,
    readState,
};


