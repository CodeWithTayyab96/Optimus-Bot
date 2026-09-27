/**
 * Optimus Bot — .antibot
 * Block commands belonging to other WhatsApp bots.
 *
 * Ported from Shadow MD (`drenox.js:5994`) with the self-defeating part fixed:
 * detection runs on the *unknown command* branch (see lib/antibot.js), so
 * Optimus's own commands are never flagged.
 */
const { setAntibot, getAntibot, removeAntibot } = require('../../lib/index');
const isAdmin = require('../../lib/isAdmin');
const style = require('../../lib/messageStyle');
const antibot = require('../../lib/antibot');

async function handleAntibotCommand(sock, chatId, message, args, senderId) {
    try {
        const adminStatus = await isAdmin(sock, chatId, senderId);
        if (!adminStatus.isSenderAdmin) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('admin', { box: false }) }, { quoted: message });
            return;
        }

        const prefix = require('../../settings').prefix || '.';
        const action = (args[0] || '').toLowerCase();

        const usage = () => style.box('🤖 ANTIBOT', [
            'Setup:',
            ` ${prefix}antibot on`,
            ` ${prefix}antibot set warn | kick | delete`,
            ` ${prefix}antibot off`,
            ``,
            `Flags messages that look like a bot command (!play, /start,`,
            `#cmd) but match no Optimus command.`
        ]);

        if (!action) {
            await sock.sendMessage(chatId, { text: usage() }, { quoted: message });
            return;
        }

        if (action === 'on') {
            const existing = getAntibot(chatId);
            if (existing?.enabled) {
                await sock.sendMessage(chatId, { text: style.info('Antibot is already on.') }, { quoted: message });
                return;
            }
            const ok = setAntibot(chatId, { enabled: true });
            await sock.sendMessage(chatId, {
                text: ok ? style.success('Antibot has been turned ON.') : style.error('Failed to turn on Antibot.')
            }, { quoted: message });
            return;
        }

        if (action === 'off') {
            removeAntibot(chatId);
            await sock.sendMessage(chatId, { text: style.success('Antibot has been turned OFF.') }, { quoted: message });
            return;
        }

        if (action === 'set') {
            const value = (args[1] || '').toLowerCase();
            if (!antibot.VALID_ACTIONS.includes(value)) {
                await sock.sendMessage(chatId, {
                    text: style.invalidInput('Invalid action. Choose warn, kick, or delete.', `${prefix}antibot set <action>`, { box: false })
                }, { quoted: message });
                return;
            }
            const ok = setAntibot(chatId, { enabled: true, action: value });
            await sock.sendMessage(chatId, {
                text: ok ? style.success(`Antibot action set to ${value}.`) : style.error('Failed to set Antibot action.')
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { text: usage() }, { quoted: message });
    } catch (error) {
        console.error('[antibot] command error:', error.message);
        await sock.sendMessage(chatId, { text: style.error('Failed to process the antibot command.') }, { quoted: message });
    }
}

module.exports = {
    name: 'antibot',
    aliases: ['nobot', 'antibots'],
    category: 'admin',
    description: 'Block other bots’ commands in the group',
    usage: '.antibot on/off/set warn|kick|delete',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleAntibotCommand(sock, extra.chatId, message, args, extra.senderId);
    },
    handleAntibotCommand,
};
