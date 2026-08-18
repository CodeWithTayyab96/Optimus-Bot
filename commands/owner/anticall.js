const fs = require('fs');
const style = require('../../lib/messageStyle');

const ANTICALL_PATH = './data/anticall.json';

function readState() {
    try {
        if (!fs.existsSync(ANTICALL_PATH)) return { enabled: false };
        const raw = fs.readFileSync(ANTICALL_PATH, 'utf8');
        const data = JSON.parse(raw || '{}');
        return { enabled: !!data.enabled };
    } catch {
        return { enabled: false };
    }
}

function writeState(enabled) {
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        fs.writeFileSync(ANTICALL_PATH, JSON.stringify({ enabled: !!enabled }, null, 2));
    } catch {}
}

async function anticallCommand(sock, chatId, message, args) {
    const state = readState();
    const sub = (args || '').trim().toLowerCase();

    if (!sub || (sub !== 'on' && sub !== 'off' && sub !== 'status')) {
        await sock.sendMessage(chatId, { text: style.box('👑 ANTICALL', [
            'Usage:',
            ' .anticall on — enable auto-block on incoming calls',
            ' .anticall off — disable anticall',
            ' .anticall status — show current status'
        ]) }, { quoted: message });
        return;
    }

    if (sub === 'status') {
        await sock.sendMessage(chatId, { text: style.info(`Anticall is currently *${state.enabled ? 'ON' : 'OFF'}*.`) }, { quoted: message });
        return;
    }

    const enable = sub === 'on';
    writeState(enable);
    await sock.sendMessage(chatId, { text: style.success(`Anticall is now *${enable ? 'ENABLED' : 'DISABLED'}*.`) }, { quoted: message });
}

module.exports = {
    name: 'anticall',
    aliases: [],
    category: 'owner',
    description: 'Reject and block incoming calls',
    usage: '.anticall on/off',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await anticallCommand(sock, extra.chatId, message, extra.userMessage.split(/\s+/).slice(1).join(' '));
    },
    anticallCommand,
    readState,
};


