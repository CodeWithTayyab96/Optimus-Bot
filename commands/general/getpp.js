const axios = require('axios');
const { jidNormalizedUser, jidDecode } = require('@whiskeysockets/baileys');

/** Turn a phone number / JID into a WhatsApp JID. Returns null if it looks invalid. */
function toJid(input) {
    const digits = String(input || '').replace(/\D/g, '');
    if (digits.length < 7) return null;
    return `${digits}@s.whatsapp.net`;
}

/** The user part of a JID, for display only. Never compare JIDs this way. */
function displayNumber(jid) {
    try {
        const decoded = jidDecode(jid);
        if (decoded?.user) return decoded.user.split(':')[0];
    } catch { /* fall through */ }
    return String(jid || '').split('@')[0];
}

/**
 * Ask WhatsApp for a profile picture, trying every form it accepts.
 *
 * WHY MORE THAN ONE ATTEMPT
 *   Baileys 7 moved to LIDs: "PNs are less reliable going forward", and the docs
 *   explicitly say to migrate logic to LIDs. A bare `@s.whatsapp.net` lookup can
 *   simply come back empty even when the picture is visible in the chat list.
 *
 *   The picture TYPE matters too. WA Web asks for `preview` (the thumbnail), and
 *   `image` is frequently refused — a privacy-gated picture often answers for
 *   `preview` but not for `image`. The old code only ever asked for `image`.
 *
 * So: resolve PN → LID first, then try `image` before `preview` on each form,
 * and return the first URL that lands. Every failure is swallowed on purpose —
 * one combination failing says nothing about the next.
 *
 * @returns {Promise<{url: string, jid: string, type: string}|null>}
 */
async function fetchProfilePicture(sock, targetUser) {
    const pn = jidNormalizedUser(targetUser);

    // PN → LID is the direction WhatsApp exposes. The reverse is not supported,
    // and the mapping only exists once Baileys has seen the pair, so a miss here
    // is normal rather than an error.
    let lid = null;
    try {
        lid = await sock.signalRepository?.lidMapping?.getLIDForPN?.(pn);
    } catch { /* no mapping yet — carry on with the PN */ }

    const forms = lid && lid !== pn ? [lid, pn] : [pn];

    for (const jid of forms) {
        for (const type of ['image', 'preview']) {
            try {
                const url = await sock.profilePictureUrl(jid, type);
                if (url) return { url, jid, type };
            } catch { /* try the next combination */ }
        }
    }
    return null;
}

module.exports = {
    name: 'getpp',
    aliases: ['gp', 'getpic', 'getdp', 'dp'],
    category: 'general',
    description: 'Get a user profile picture — by phone number, mention, reply, or your own',
    usage: '.getdp <number>  ·  .getpp @user (or reply)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            let targetUser = null;

            // 1) Explicit phone number / JID argument, e.g. .getdp 923701609799
            if (args && args[0]) {
                const jid = toJid(args[0]);
                if (!jid) {
                    return extra.reply('❌ Please provide a valid phone number (with country code).');
                }
                targetUser = jid;
            }

            // 2) Otherwise: the message you replied to, then a mention, then yourself.
            const ctx = message.message?.extendedTextMessage?.contextInfo;
            if (!targetUser && ctx?.quotedMessage) {
                targetUser = ctx.participant;
            }
            if (!targetUser && ctx?.mentionedJid?.length > 0) {
                targetUser = ctx.mentionedJid[0];
            }
            if (!targetUser) {
                targetUser = extra.senderId;
            }

            if (!targetUser) {
                return extra.reply('❌ Could not identify target user. Provide a number, or reply to / tag a user.');
            }

            const found = await fetchProfilePicture(sock, targetUser);
            if (!found) {
                // Be accurate about WHY. "Not found" alone is misleading — the
                // picture usually exists, it is just not shared with this account.
                return extra.reply(
                    '❌ No profile picture available for this user.\n\n' +
                    'Either they have none set, or their privacy is set to ' +
                    '*My contacts* / *Nobody* and this account is not on their list. ' +
                    'A picture you can see in your own chat list is not necessarily ' +
                    'one WhatsApp will hand to the bot.'
                );
            }

            const response = await axios.get(found.url, { responseType: 'arraybuffer', timeout: 30000 });
            const buffer = Buffer.from(response.data);

            if (!buffer.length) {
                return extra.reply('❌ Got an empty profile picture. Try again.');
            }

            await sock.sendMessage(extra.chatId, {
                image: buffer,
                // Label with the identifier the caller actually used — the LID we
                // resolved internally means nothing to a human reading the chat.
                caption: `👤 Profile picture of @${displayNumber(targetUser)}`,
                mentions: [targetUser],
            }, { quoted: message });
        } catch (error) {
            console.error('[getpp] error:', error.message);
            extra.reply('❌ Could not fetch that profile picture.');
        }
    },
    // Exported for tests
    toJid,
    fetchProfilePicture,
    displayNumber,
};
