/**
 * .autoreply — let the AI answer every message in this chat, on its own.
 *
 *   .autoreply              → is it on here, and who is it answering?
 *   .autoreply on           → answer everyone in this chat
 *   .autoreply on 923…      → answer only that one person in this chat
 *   .autoreply off          → stop
 *
 * Owner-only: it speaks with the account's voice, so nobody else should be able
 * to switch it on. Works in DMs as well as groups — that is the point of it,
 * unlike `.chatbot` which is group-only and needs a mention.
 */
const style = require('../../lib/messageStyle');
const isOwnerOrSudo = require('../../lib/isOwner');
const { getAutoReply, setAutoReply, removeAutoReply } = require('../../lib/index');

/** Digits only, from any JID or phone format. */
function bareNumber(value) {
    return String(value || '').replace(/[^0-9]/g, '');
}

module.exports = {
    name: 'autoreply',
    aliases: ['autochat', 'aireply'],
    category: 'owner',
    description: 'Let the AI answer every message in this chat automatically',
    usage: '.autoreply on [number]  ·  .autoreply off  ·  .autoreply',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const reply = (content) => sock.sendMessage(
            extra.chatId,
            typeof content === 'string' ? { text: content } : content,
            { quoted: message }
        );

        const senderId = message.key.participant || message.key.remoteJid;
        if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, extra.chatId))) {
            return reply(style.permissionDenied('owner', { box: false }));
        }

        const sub = (args[0] || '').toLowerCase();
        const current = await getAutoReply(extra.chatId);
        const where = extra.isGroup ? 'this group' : 'this chat';

        // ── status ────────────────────────────────────────────────────────
        if (!sub) {
            if (!current) {
                return reply(style.box('🤖 AUTO-REPLY', [
                    `Off in ${where}.`,
                    '',
                    'Turn it on and the AI answers every message here on its own —',
                    'no mention needed. Works in DMs too.',
                    '',
                    `On for everyone:  ${extra.prefix}autoreply on`,
                    `On for one person: ${extra.prefix}autoreply on 923701609799`,
                ]));
            }

            return reply(style.box('🤖 AUTO-REPLY', [
                `On in ${where}.`,
                current.onlyJid
                    ? `Replying only to ${bareNumber(current.onlyJid)}.`
                    : 'Replying to everyone here.',
                '',
                `Turn it off with ${extra.prefix}autoreply off`,
            ]));
        }

        // ── off ───────────────────────────────────────────────────────────
        if (sub === 'off') {
            if (!current) {
                return reply(style.info(`Auto-reply is already off in ${where}.`));
            }
            await removeAutoReply(extra.chatId);
            return reply(style.success(`Auto-reply off. The bot will stay quiet in ${where}.`));
        }

        // ── on ────────────────────────────────────────────────────────────
        if (sub === 'on') {
            const raw = args[1];
            const target = bareNumber(raw);

            if (raw && (target.length < 6 || target.length > 19)) {
                return reply(style.invalidInput(
                    'That does not look like a phone number (country code first, digits only).',
                    `${extra.prefix}autoreply on 923701609799`,
                    { box: false }
                ));
            }

            const onlyJid = target ? `${target}@s.whatsapp.net` : null;
            await setAutoReply(extra.chatId, true, onlyJid);

            return reply(style.box('🤖 AUTO-REPLY ON', [
                onlyJid ? `Replying only to ${target}.` : 'Replying to everyone in this chat.',
                '',
                'The AI answers each message here by itself — no mention needed.',
                'Commands still work: anything starting with the prefix is left alone.',
                '',
                `Off:  ${extra.prefix}autoreply off`,
            ]));
        }

        return reply(style.invalidInput(
            'Unknown option.',
            `${extra.prefix}autoreply on [number] | off`,
            { box: false }
        ));
    },
    // exported for tests
    _test: { bareNumber },
};
