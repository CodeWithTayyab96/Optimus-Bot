/**
 * Optimus Bot — .antihijack
 * Defend the group against an admin demoting the other admins.
 *
 * Ported from Shadow MD (`drenox.js:6186`). When enabled, anyone who demotes
 * an admin is removed from the group and the victim is restored.
 * Enforcement lives in lib/antiHijack.js.
 */
const isAdmin = require('../../lib/isAdmin');
const style = require('../../lib/messageStyle');
const { setAntihijack, getAntihijack } = require('../../lib/index');

async function handleAntihijackCommand(sock, chatId, message, args, senderId) {
    try {
        const adminStatus = await isAdmin(sock, chatId, senderId);
        if (!adminStatus.isSenderAdmin) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('admin', { box: false }) }, { quoted: message });
            return;
        }

        const prefix = require('../../settings').prefix || '.';
        const sub = (args[0] || '').toLowerCase();

        const usage = () => style.box('🛡️ ANTI-HIJACK', [
            'Setup:',
            ` ${prefix}antihijack on`,
            ` ${prefix}antihijack off`,
            ``,
            'When on, anyone who demotes an admin is removed',
            'and the demoted admin is restored.',
            'Use .protect to protect specific admins without',
            'enabling removal.'
        ]);

        if (!sub) {
            const enabled = !!getAntihijack(chatId)?.enabled;
            await sock.sendMessage(chatId, {
                text: style.box('🛡️ ANTI-HIJACK', [`Status: ${enabled ? 'ON' : 'OFF'}`])
            }, { quoted: message });
            return;
        }

        if (sub === 'on') {
            if (getAntihijack(chatId)?.enabled) {
                await sock.sendMessage(chatId, { text: style.info('Anti-hijack is already on.') }, { quoted: message });
                return;
            }
            const ok = setAntihijack(chatId, true);
            await sock.sendMessage(chatId, {
                text: ok ? style.success('Anti-hijack has been turned ON.') : style.error('Failed to turn on Anti-hijack.')
            }, { quoted: message });
            return;
        }

        if (sub === 'off') {
            setAntihijack(chatId, false);
            await sock.sendMessage(chatId, { text: style.success('Anti-hijack has been turned OFF.') }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { text: usage() }, { quoted: message });
    } catch (error) {
        console.error('[antihijack] command error:', error.message);
        await sock.sendMessage(chatId, { text: style.error('Failed to process the antihijack command.') }, { quoted: message });
    }
}

module.exports = {
    name: 'antihijack',
    aliases: ['antihijackadmin'],
    category: 'admin',
    description: 'Remove anyone who demotes an admin and restore them',
    usage: '.antihijack on|off',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleAntihijackCommand(sock, extra.chatId, message, args, extra.senderId);
    },
    handleAntihijackCommand,
};
