/**
 * .jid — WhatsApp identifier resolver (owner only).
 *
 * Resolves to a normalized WhatsApp JID (with display name where the
 * platform exposes one):
 *   1. phone numbers        → sock.onWhatsApp(number) registration check
 *   2. existing JIDs        → @s.whatsapp.net / @g.us / @newsletter / @lid / @broadcast
 *   3. group invite links   → sock.groupGetInviteInfo(code)
 *   4. channel links        → sock.newsletterMetadata('invite', code)
 *   5. quoted messages      → quoted sender JID (+ identifiers inside the quoted text)
 *   6. mentioned users      → every @mention JID
 *
 * All network calls use the Baileys v7 RC APIs installed in this project
 * (verified against node_modules/@whiskeysockets/baileys): onWhatsApp,
 * groupGetInviteInfo, newsletterMetadata, groupMetadata, fetchStatus.
 * Channel JIDs are never guessed from URLs — the invite code is resolved
 * through the newsletter metadata API and the returned id is used.
 *
 * Run with no arguments in a group: shows the current group JID (the old
 * behavior of the former general .jid command, now owner-only).
 */

const { jidNormalizedUser, isJidGroup, isJidNewsletter } = require('@whiskeysockets/baileys');
const isOwnerOrSudo = require('../../lib/isOwner');
const style = require('../../lib/messageStyle');

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable without a socket)
// ---------------------------------------------------------------------------

/**
 * Classify a raw token.
 * @returns {{ type: 'number'|'jid'|'groupLink'|'channelLink'|'unknown'|'empty', value: string }}
 */
function classify(raw) {
    const input = String(raw == null ? '' : raw).trim();
    if (!input) return { type: 'empty', value: input };
    if (/chat\.whatsapp\.com/i.test(input)) return { type: 'groupLink', value: input };
    if (/whatsapp\.com\/channel/i.test(input)) return { type: 'channelLink', value: input };
    if (input.includes('@')) return { type: 'jid', value: input };
    const digits = input.replace(/\D+/g, '');
    if (digits.length >= 7 && digits.length <= 15) return { type: 'number', value: digits };
    return { type: 'unknown', value: input };
}

/** Extract the invite code from a chat.whatsapp.com / whatsapp.com/channel URL. */
function extractCodeFromUrl(url) {
    const cleaned = String(url || '').split(/[?#]/)[0].trim().replace(/\/+$/, '');
    const parts = cleaned.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
}

/**
 * Pull the quoted message's sender JID and its text content.
 * @returns {{ senderJid: string, text: string } | null}
 */
function extractQuoted(message) {
    const ctx = message?.message?.extendedTextMessage?.contextInfo;
    if (!ctx) return null;
    const senderJid = ctx.participant || ctx.remoteJid || '';
    const quoted = ctx.quotedMessage;
    const text = String(
        quoted?.conversation ||
        quoted?.extendedTextMessage?.text ||
        quoted?.imageMessage?.caption ||
        quoted?.videoMessage?.caption ||
        quoted?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
        ''
    );
    return { senderJid, text: text.trim() };
}

/** @returns {string[]} mentioned JIDs from the message. */
function extractMentions(message) {
    return message?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

/**
 * Collect every identifier to resolve from args, mentions and quoted content.
 * @returns {{ tokens: string[], quotedJid: string|null }}
 */
function collectIdentifiers(message, args) {
    const tokens = (args || []).filter(t => String(t).trim().length > 0);
    const mentions = extractMentions(message);
    const quoted = extractQuoted(message);

    const out = { tokens: [...tokens], quotedJid: quoted?.senderJid || null };

    // Identifiers embedded in the quoted text (links / numbers / JIDs)
    if (quoted && quoted.text) {
        const words = quoted.text.split(/\s+/);
        for (const w of words) {
            const c = classify(w);
            if (c.type === 'groupLink' || c.type === 'channelLink' || c.type === 'number' || c.type === 'jid') {
                out.tokens.push(w);
            }
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Resolution (uses the live socket)
// ---------------------------------------------------------------------------

/** Normalize a newsletter/group id returned by Baileys to a full JID. */
function ensureServer(jid, server) {
    const s = String(jid || '');
    if (!s) return '';
    return s.includes('@') ? s : `${s}@${server}`;
}

async function fetchAbout(sock, jid) {
    try {
        const st = await sock.fetchStatus(jid);
        return (st && st.status) ? String(st.status) : '';
    } catch {
        return '';
    }
}

/**
 * Resolve a single raw identifier.
 * @returns {Promise<Array<{kind: string, name: string|null, jid: string, note: string}>>}
 */
async function resolveOne(sock, raw) {
    const { type, value } = classify(raw);

    if (type === 'empty') return [];

    // --- Group invite link ---
    if (type === 'groupLink') {
        const code = extractCodeFromUrl(value);
        if (!code) return [{ kind: 'error', name: null, jid: '', note: 'Could not extract an invite code from that link.' }];
        try {
            const meta = await sock.groupGetInviteInfo(code);
            if (!meta || !meta.id) {
                return [{ kind: 'error', name: null, jid: '', note: 'Invalid or expired group invite code.' }];
            }
            return [{
                kind: 'group',
                name: meta.subject || null,
                jid: ensureServer(meta.id, 'g.us'),
                note: meta.desc || ''
            }];
        } catch (err) {
            return [{ kind: 'error', name: null, jid: '', note: `Group invite lookup failed: ${err.message || err}` }];
        }
    }

    // --- Channel (newsletter) link ---
    if (type === 'channelLink') {
        const code = extractCodeFromUrl(value);
        if (!code) return [{ kind: 'error', name: null, jid: '', note: 'Could not extract a channel code from that link.' }];
        try {
            const meta = await sock.newsletterMetadata('invite', code);
            if (!meta || !meta.id) {
                return [{ kind: 'error', name: null, jid: '', note: 'Invalid or unavailable channel invite code.' }];
            }
            return [{
                kind: 'channel',
                name: meta.name || null,
                jid: ensureServer(meta.id, 'newsletter'),
                note: [
                    meta.description || '',
                    typeof meta.subscribers === 'number' ? `Subscribers: ${meta.subscribers}` : ''
                ].filter(Boolean).join(' · ')
            }];
        } catch (err) {
            return [{ kind: 'error', name: null, jid: '', note: `Channel lookup failed: ${err.message || err}` }];
        }
    }

    // --- Existing JID ---
    if (type === 'jid') {
        const jid = jidNormalizedUser(value); // strips :device suffix, c.us → s.whatsapp.net
        const server = jid.split('@')[1] || '';

        if (isJidGroup(jid)) {
            try {
                const meta = await sock.groupMetadata(jid);
                if (!meta || !meta.id) {
                    return [{ kind: 'error', name: null, jid, note: 'Group not found (is the bot a member?).' }];
                }
                return [{
                    kind: 'group',
                    name: meta.subject || null,
                    jid: meta.id,
                    note: meta.desc || ''
                }];
            } catch (err) {
                return [{ kind: 'error', name: null, jid, note: `Group lookup failed: ${err.message || err}` }];
            }
        }

        if (isJidNewsletter(jid)) {
            try {
                const meta = await sock.newsletterMetadata('jid', jid);
                if (!meta || !meta.id) {
                    return [{ kind: 'error', name: null, jid, note: 'Channel not found or unavailable.' }];
                }
                return [{
                    kind: 'channel',
                    name: meta.name || null,
                    jid: ensureServer(meta.id, 'newsletter'),
                    note: typeof meta.subscribers === 'number' ? `Subscribers: ${meta.subscribers}` : ''
                }];
            } catch (err) {
                return [{ kind: 'error', name: null, jid, note: `Channel lookup failed: ${err.message || err}` }];
            }
        }

        if (server === 's.whatsapp.net') {
            const user = jid.split('@')[0];
            const results = await resolveNumber(sock, user, jid);
            return results;
        }

        if (server === 'lid') {
            return [{
                kind: 'user',
                name: null,
                jid,
                note: 'LID (Linked ID) — maps to this user\'s current phone-number JID.'
            }];
        }

        if (server === 'broadcast') {
            return [{ kind: 'broadcast', name: null, jid, note: 'Broadcast list.' }];
        }

        if (server === 'status') {
            return [{ kind: 'broadcast', name: null, jid, note: 'Status broadcast.' }];
        }

        return [{ kind: 'error', name: null, jid, note: `Unrecognized JID server "@${server}".` }];
    }

    // --- Phone number ---
    if (type === 'number') {
        return resolveNumber(sock, value);
    }

    return [{ kind: 'error', name: null, jid: '', note: `"${value}" is not a recognizable number, JID or WhatsApp link.` }];
}

/**
 * Verify a phone number (digits only) against WhatsApp.
 * @param {string} digits
 * @param {string} [knownJid] when the input was already a @s.whatsapp.net JID
 */
async function resolveNumber(sock, digits, knownJid) {
    try {
        const res = await sock.onWhatsApp(digits);
        const hit = Array.isArray(res) ? res.find(r => r && r.exists) : null;
        if (hit) {
            const contact = hit.exists || {};
            const jid = ensureServer(hit.jid || knownJid || `${digits}@s.whatsapp.net`, 's.whatsapp.net');
            const name = contact.notify || contact.name || contact.verifiedName || null;
            const about = await fetchAbout(sock, jid);
            return [{
                kind: 'user',
                name,
                jid,
                note: about ? `About: ${about}` : 'Registered on WhatsApp.'
            }];
        }
        return [{
            kind: 'user',
            name: null,
            jid: ensureServer(knownJid || `${digits}@s.whatsapp.net`, 's.whatsapp.net'),
            note: '⚠️ Not registered on WhatsApp (include the country code, e.g. 92XXXXXXXXXX).'
        }];
    } catch (err) {
        return [{ kind: 'error', name: null, jid: '', note: `Registration check failed: ${err.message || err}` }];
    }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const KIND_ICON = { user: '👤', group: '👥', channel: '📢', broadcast: '📡', error: '❌' };

function formatResult(r) {
    const icon = KIND_ICON[r.kind] || '🔎';
    const head = r.name ? `${icon} *${r.kind === 'user' ? 'User' : r.kind === 'group' ? 'Group' : r.kind === 'channel' ? 'Channel' : r.kind}* — ${r.name}` : `${icon} *${r.kind === 'user' ? 'User' : r.kind === 'group' ? 'Group' : r.kind === 'channel' ? 'Channel' : r.kind}*`;
    const lines = [head];
    if (r.jid) lines.push(`   JID: ${r.jid}`);
    if (r.note) lines.push(`   ${r.note}`);
    return lines.join('\n');
}

function buildResponse(results) {
    if (!results.length) return '';
    return ['🔎 *WhatsApp Identifier Lookup*', '', ...results.map(formatResult)].join('\n');
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

const USAGE = style.box('🔎 IDENTIFIER LOOKUP', [
    'Usage:',
    ' .jid <number>                  — verify & resolve a phone number',
    ' .jid <jid>                     — resolve a @s.whatsapp.net / @g.us / @newsletter JID',
    ' .jid <chat.whatsapp.com link>  — resolve a group invite link',
    ' .jid <whatsapp.com/channel>    — resolve a channel link',
    ' .jid                           — reply to a message or mention users',
    '',
    'You can combine several identifiers in one command.'
]);

async function jidCommand(sock, chatId, message, args) {
    const senderId = message.key.participant || message.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

    if (!message.key.fromMe && !isOwner) {
        await sock.sendMessage(chatId, { text: style.permissionDenied('owner', { box: false }) }, { quoted: message });
        return;
    }

    const { tokens, quotedJid } = collectIdentifiers(message, args);

    // No inputs: keep the old .jid behavior — show the current group JID.
    if (!tokens.length && !quotedJid) {
        if (chatId.endsWith('@g.us')) {
            let subject = '';
            try {
                const meta = await sock.groupMetadata(chatId);
                subject = meta?.subject ? `\n   Name: ${meta.subject}` : '';
            } catch { }
            await sock.sendMessage(chatId, {
                text: `👥 *Group JID*${subject}\n   JID: ${chatId}`
            }, { quoted: message });
            return;
        }
        await sock.sendMessage(chatId, { text: USAGE }, { quoted: message });
        return;
    }

    // Mentioned users are always resolved too.
    const mentions = extractMentions(message);

    const results = [];
    for (const raw of tokens) {
        try {
            results.push(...(await resolveOne(sock, raw)));
        } catch (err) {
            results.push({ kind: 'error', name: null, jid: '', note: `Lookup failed: ${err.message || err}` });
        }
    }
    if (quotedJid && !tokens.includes(quotedJid)) {
        results.push(...(await resolveOne(sock, quotedJid)));
    }
    for (const m of mentions) {
        if (!tokens.includes(m) && m !== quotedJid) {
            results.push(...(await resolveOne(sock, m)));
        }
    }

    if (!results.length) {
        await sock.sendMessage(chatId, { text: USAGE }, { quoted: message });
        return;
    }

    await sock.sendMessage(chatId, { text: buildResponse(results) }, { quoted: message });
}

module.exports = {
    name: 'jid',
    aliases: ['resolvejid', 'getjid'],
    category: 'owner',
    description: 'Resolve numbers, JIDs, group/channel links, quotes and mentions to WhatsApp JIDs',
    usage: '.jid <number|jid|link> (reply or mention supported)',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await jidCommand(sock, extra.chatId, message, args);
    },
    // Exported for the smoke test
    classify,
    extractCodeFromUrl,
    extractQuoted,
    extractMentions,
    collectIdentifiers,
    resolveOne,
    buildResponse,
};
