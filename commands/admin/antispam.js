/**
 * Optimus Bot — .antispam
 * Group flood protection.
 *
 * Ported from Shadow MD (`drenox.js:5962`), re-implemented with persisted
 * settings and the shared sanction helper. Detection lives in lib/antispam.js.
 */
const { setAntispam, getAntispam, removeAntispam } = require('../../lib/index');
const isAdmin = require('../../lib/isAdmin');
const style = require('../../lib/messageStyle');
const antispam = require('../../lib/antispam');

async function handleAntispamCommand(sock, chatId, message, args, senderId) {
    try {
        // Checked directly so the command still works when the bot is not admin.
        const adminStatus = await isAdmin(sock, chatId, senderId);
        if (!adminStatus.isSenderAdmin) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('admin', { box: false }) }, { quoted: message });
            return;
        }

        const prefix = require('../../settings').prefix || '.';
        const action = (args[0] || '').toLowerCase();

        const usage = () => style.box('🛡️ ANTISPAM', [
            'Setup:',
            ` ${prefix}antispam on`,
            ` ${prefix}antispam set warn | kick | delete`,
            ` ${prefix}antispam limit <2-20>`,
            ` ${prefix}antispam off`,
            ``,
            `Warns a member who sends more than N messages in 5 seconds.`
        ]);

        if (!action) {
            await sock.sendMessage(chatId, { text: usage() }, { quoted: message });
            return;
        }

        if (action === 'on') {
            const existing = getAntispam(chatId);
            if (existing?.enabled) {
                await sock.sendMessage(chatId, { text: style.info('Antispam is already on.') }, { quoted: message });
                return;
            }
            const ok = setAntispam(chatId, { enabled: true });
            await sock.sendMessage(chatId, {
                text: ok ? style.success('Antispam has been turned ON.') : style.error('Failed to turn on Antispam.')
            }, { quoted: message });
            return;
        }

        if (action === 'off') {
            removeAntispam(chatId);
            antispam.clearAll();
            await sock.sendMessage(chatId, { text: style.success('Antispam has been turned OFF.') }, { quoted: message });
            return;
        }

        if (action === 'set') {
            const value = (args[1] || '').toLowerCase();
            if (!antispam.VALID_ACTIONS.includes(value)) {
                await sock.sendMessage(chatId, {
                    text: style.invalidInput('Invalid action. Choose warn, kick, or delete.', `${prefix}antispam set <action>`, { box: false })
                }, { quoted: message });
                return;
            }
            const ok = setAntispam(chatId, { enabled: true, action: value });
            await sock.sendMessage(chatId, {
                text: ok ? style.success(`Antispam action set to ${value}.`) : style.error('Failed to set Antispam action.')
            }, { quoted: message });
            return;
        }

        if (action === 'limit') {
            const n = parseInt(args[1], 10);
            if (!Number.isFinite(n) || n < 2 || n > 20) {
                await sock.sendMessage(chatId, {
                    text: style.invalidInput('Limit must be a number between 2 and 20.', `${prefix}antispam limit <n>`, { box: false })
                }, { quoted: message });
                return;
            }
            const ok = setAntispam(chatId, { enabled: true, threshold: n });
            await sock.sendMessage(chatId, {
                text: ok ? style.success(`Antispam will trigger after ${n} messages in 5 seconds.`) : style.error('Failed to set Antispam limit.')
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { text: usage() }, { quoted: message });
    } catch (error) {
        console.error('[antispam] command error:', error.message);
        await sock.sendMessage(chatId, { text: style.error('Failed to process the antispam command.') }, { quoted: message });
    }
}

module.exports = {
    name: 'antispam',
    aliases: ['antiflood', 'flood'],
    category: 'admin',
    description: 'Configure flood (anti-spam) protection for the group',
    usage: '.antispam on/off/set warn|kick|delete/limit <n>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleAntispamCommand(sock, extra.chatId, message, args, extra.senderId);
    },
    handleAntispamCommand,
};
