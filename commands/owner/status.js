/**
 * .status — pull a contact's WhatsApp status out of the cache and send it to
 * your DM, privately.
 *
 *   .status 923701609799   → send that contact's cached statuses to your DM
 *   .status                → what is cached, and for whom
 *   .status clear [number] → wipe the cache (all, or one contact)
 *
 * WHY IT READS FROM A CACHE
 *   WhatsApp PUSHES statuses; there is no "fetch this contact's status" call.
 *   (`sock.fetchStatus(jid)` is a trap — it returns the profile *about* text, not
 *   the story.) So lib/statusCache records every status as it arrives, and this
 *   command serves from that. If a status was never received, it cannot be
 *   served — see the note in the reply for what has to be true.
 *
 * PRIVACY
 *   Nothing here calls readMessages(), so saving a status does NOT mark it as
 *   viewed. The poster never sees that the bot looked. And every message this
 *   command produces — the media AND the confirmation — goes to the DM, never
 *   back into the chat it was typed in.
 *
 * Owner-only: it can expose media posted by other people.
 */
const fs = require('fs');
const style = require('../../lib/messageStyle');
const isOwnerOrSudo = require('../../lib/isOwner');
const statusCache = require('../../lib/statusCache');
const { resolveDmJid } = require('../../lib/dmTarget');

function fmtWhen(ts) {
    try {
        return new Date(ts * 1000).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return 'unknown';
    }
}

function fmtBytes(n) {
    if (!n) return '0 B';
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
}

module.exports = {
    name: 'status',
    aliases: ['statusdl', 'getstatus'],
    category: 'owner',
    description: "Save a contact's WhatsApp status to your DM, privately (never marks it viewed)",
    usage: '.status <number>  ·  .status  ·  .status clear [number]',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const senderId = message.key.participant || message.key.remoteJid;

        if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, extra.chatId))) {
            return sock.sendMessage(
                extra.chatId,
                { text: style.permissionDenied('owner', { box: false }) },
                { quoted: message }
            );
        }

        // Everything this command produces goes to the DM — that is the whole
        // point. resolveDmJid never returns a group, so a trigger typed in a
        // group cannot leak the result back into it.
        const dmJid = resolveDmJid(sock, message, extra.chatId, senderId) || extra.chatId;
        const say = (content) => sock.sendMessage(
            dmJid,
            typeof content === 'string' ? { text: content } : content,
            dmJid === extra.chatId ? { quoted: message } : {}
        );

        const sub = (args[0] || '').trim().toLowerCase();

        // ── .status clear [number] ──────────────────────────────────────
        if (sub === 'clear') {
            const target = (args[1] || '').replace(/[^0-9]/g, '');
            const removed = statusCache.clear(target || null);
            return say(style.success(
                `Cleared ${removed} cached status${removed === 1 ? '' : 'es'}${target ? ` for ${target}` : ''}.`
            ));
        }

        // ── .status  (what is cached) ───────────────────────────────────
        if (!sub) {
            const contacts = statusCache.listContacts();
            const st = statusCache.stats();

            if (!contacts.length) {
                return say(style.box('📸 STATUS CACHE', [
                    'Nothing cached yet — no status has arrived since the bot started.',
                    '',
                    'Statuses are recorded LIVE, as they arrive. The bot cannot go back',
                    'and fetch one that was already posted, and they expire after 24h.',
                    '',
                    'Ask someone to post a new status, then check again.',
                ]));
            }

            const lines = contacts.slice(0, 15).map((c) =>
                ` ${c.number} — ${c.count} item${c.count > 1 ? 's' : ''}, last ${fmtWhen(c.ts)}`);

            return say(style.box('📸 STATUS CACHE', [
                ...lines,
                contacts.length > 15 ? ` …and ${contacts.length - 15} more` : '',
                '',
                `${st.contacts} contact(s) · ${st.entries} item(s) · ${fmtBytes(st.bytes)}`,
                '',
                `Get one: ${extra.prefix}status <number>`,
                `Wipe:    ${extra.prefix}status clear`,
            ].filter((l) => l !== '')));
        }

        // ── .status <number> ────────────────────────────────────────────
        const number = sub.replace(/[^0-9]/g, '');
        if (number.length < 6 || number.length > 19) {
            return say(style.invalidInput(
                'Give me a phone number (country code first, digits only).',
                `${extra.prefix}status 923701609799`,
                { box: false }
            ));
        }

        const entries = statusCache.listFor(number);
        if (!entries.length) {
            return say(style.box('📸 STATUS', [
                `Nothing cached for ${number}.`,
                '',
                'Statuses are recorded LIVE, as they arrive. The bot cannot go back',
                'and fetch one that was already posted — so a status from before the',
                'bot last started, or older than 24h, will never appear here.',
                '',
                'Ask them to post a new status, then run this again.',
                '',
                `See who IS cached: ${extra.prefix}status`,
            ]));
        }

        let sent = 0;
        for (const e of entries) {
            try {
                if (e.type === 'text') {
                    await sock.sendMessage(dmJid, {
                        text: `📝 Status from ${number}:\n${e.caption || ''}`,
                    });
                    sent++;
                    continue;
                }

                const file = statusCache.filePathFor(e);
                if (!file) continue;

                const buffer = fs.readFileSync(file);
                const payload = { caption: e.caption || `📸 Status from ${number}` };
                if (e.type === 'image') payload.image = buffer;
                else if (e.type === 'video') payload.video = buffer;
                else payload.audio = buffer;

                await sock.sendMessage(dmJid, payload);
                sent++;
            } catch (err) {
                console.error('[status] send failed:', err.message);
            }
        }

        return say(style.success(
            `Sent ${sent}/${entries.length} status${entries.length === 1 ? '' : 'es'} to your DM.`
        ));
    },
};
