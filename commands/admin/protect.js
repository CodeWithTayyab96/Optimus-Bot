/**
 * Optimus Bot — .protect
 * Protected-admin list for the anti-hijack feature.
 *
 * Ported from Shadow MD (`drenox.js:6100` add, `:6130` remove, `:6166` list).
 * A protected admin is automatically restored if someone demotes them.
 * Enforcement lives in lib/antiHijack.js.
 */
const isAdmin = require('../../lib/isAdmin');
const style = require('../../lib/messageStyle');
const {
    getProtectedAdmins,
    addProtectedAdmin,
    removeProtectedAdmin,
    isProtectedAdmin
} = require('../../lib/index');

function resolveTarget(message) {
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned.length > 0) return mentioned[0];
    return message.message?.extendedTextMessage?.contextInfo?.participant || null;
}

function shortJid(jid) {
    return String(jid || '').split('@')[0];
}

async function handleProtectCommand(sock, chatId, message, args, senderId) {
    try {
        const adminStatus = await isAdmin(sock, chatId, senderId);
        if (!adminStatus.isSenderAdmin) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('admin', { box: false }) }, { quoted: message });
            return;
        }

        const prefix = require('../../settings').prefix || '.';
        const sub = (args[0] || '').toLowerCase();

        const usage = () => style.box('🛡️ PROTECTED ADMINS', [
            'Setup:',
            ` ${prefix}protect add @user`,
            ` ${prefix}protect remove @user`,
            ` ${prefix}protect list`,
            ``,
            'A protected admin is restored automatically if',
            'someone demotes them. Pair with .antihijack on to',
            'also remove whoever performed the demotion.'
        ]);

        if (!sub) {
            await sock.sendMessage(chatId, { text: usage() }, { quoted: message });
            return;
        }

        if (sub === 'list') {
            const list = getProtectedAdmins(chatId);
            if (list.length === 0) {
                await sock.sendMessage(chatId, { text: style.info('No protected admins in this group.') }, { quoted: message });
                return;
            }
            const lines = list.map((jid, i) => ` ${i + 1}. @${shortJid(jid)}`);
            await sock.sendMessage(chatId, {
                text: style.box('🛡️ PROTECTED ADMINS', lines),
                mentions: list
            }, { quoted: message });
            return;
        }

        if (sub !== 'add' && sub !== 'remove') {
            await sock.sendMessage(chatId, { text: usage() }, { quoted: message });
            return;
        }

        const target = resolveTarget(message);
        if (!target) {
            await sock.sendMessage(chatId, {
                text: style.invalidInput('Mention a user or reply to their message.', `${prefix}protect ${sub} @user`, { box: false })
            }, { quoted: message });
            return;
        }

        if (sub === 'add') {
            if (isProtectedAdmin(chatId, target)) {
                await sock.sendMessage(chatId, {
                    text: style.info(`@${shortJid(target)} is already a protected admin.`),
                    mentions: [target]
                }, { quoted: message });
                return;
            }
            addProtectedAdmin(chatId, target);
            await sock.sendMessage(chatId, {
                text: style.success(`@${shortJid(target)} is now a protected admin.`),
                mentions: [target]
            }, { quoted: message });
            return;
        }

        removeProtectedAdmin(chatId, target);
        await sock.sendMessage(chatId, {
            text: style.success(`@${shortJid(target)} is no longer a protected admin.`),
            mentions: [target]
        }, { quoted: message });
    } catch (error) {
        console.error('[protect] command error:', error.message);
        await sock.sendMessage(chatId, { text: style.error('Failed to process the protect command.') }, { quoted: message });
    }
}

module.exports = {
    name: 'protect',
    aliases: ['protectadmin', 'addprotect', 'removeprotect', 'listprotect'],
    category: 'admin',
    description: 'Manage protected admins (auto-restore if demoted)',
    usage: '.protect add|remove @user  |  .protect list',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleProtectCommand(sock, extra.chatId, message, args, extra.senderId);
    },
    handleProtectCommand,
};
