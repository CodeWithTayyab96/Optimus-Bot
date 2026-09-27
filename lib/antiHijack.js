/**
 * Anti-hijack + protected admins.
 *
 * Ported from Shadow MD (`drenox.js:6186` toggle, `drenox.js:6100-6184`
 * protected-admin management, `drenox.js:13048-13108` enforcement) and
 * re-implemented against Optimus infrastructure.
 *
 * The threat this defends against: a rogue group admin demotes the other
 * admins (often including the group owner) to take the group over. Shadow's
 * answer is to re-promote the victim immediately and then remove whoever did
 * the demoting.
 *
 * Optimus splits that into two independent pieces, which is safer:
 *
 *   .protect add @user      the user can never stay demoted — the bot
 *                           re-promotes them. No one is removed.
 *   .antihijack on          additionally, whoever demotes an admin is removed
 *                           (unless they are themselves protected, or the bot).
 *
 * Deliberate differences from Shadow:
 *   - Shadow kicks the demoter even when antihijack is off, as long as the
 *     victim is protected. Optimus only removes the demoter when antihijack is
 *     explicitly enabled — otherwise `.protect` silently becomes a weapon.
 *   - Every step is wrapped so a missing permission degrades to a notice
 *     instead of throwing inside the participant-update handler.
 */

const isAdmin = require('./isAdmin');
const style = require('./messageStyle');
const {
    getAntihijack,
    isProtectedAdmin,
    getProtectedAdmins
} = require('./index');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const REPROMOTE_DELAY_MS = 1000;

function shortJid(jid) {
    return String(jid || '').split('@')[0];
}

function isEnabled(groupId) {
    const stored = getAntihijack(groupId);
    return !!(stored && stored.enabled === true);
}

/**
 * Called from the `demote` branch of handleGroupParticipantUpdate.
 *
 * @param {object} sock         Baileys socket
 * @param {string} groupId      group JID
 * @param {string[]} participants JIDs that were just demoted
 * @param {string} author       JID of whoever performed the demotion
 * @returns {Promise<boolean>}  true when the bot intervened
 */
async function handleAntiHijack(sock, groupId, participants, author) {
    try {
        if (!groupId || !String(groupId).endsWith('@g.us')) return false;
        if (!Array.isArray(participants) || participants.length === 0) return false;

        const antihijack = isEnabled(groupId);
        const protectedList = getProtectedAdmins(groupId);

        // Nothing configured for this group — leave the normal flow alone.
        if (!antihijack && protectedList.length === 0) return false;

        const botJid = sock?.user?.id;
        let acted = false;

        // Only re-promote if the bot is an admin; otherwise it physically can't.
        let botIsAdmin = false;
        try {
            const status = await isAdmin(sock, groupId, botJid);
            botIsAdmin = !!status.isBotAdmin;
        } catch (_) { /* fall through */ }

        if (!botIsAdmin) {
            await sock.sendMessage(groupId, {
                text: style.warning('Anti-hijack is configured here, but I need to be an admin to restore demoted admins.')
            }).catch(() => { });
            return false;
        }

        for (const victim of participants) {
            const victimProtected = isProtectedAdmin(groupId, victim);
            if (!antihijack && !victimProtected) continue;

            try {
                await delay(REPROMOTE_DELAY_MS);
                await sock.groupParticipantsUpdate(groupId, [victim], 'promote');
                acted = true;
                await sock.sendMessage(groupId, {
                    text: style.warning(`🛡️ @${shortJid(victim)} was demoted and has been restored to admin.`),
                    mentions: [victim]
                }).catch(() => { });
            } catch (e) {
                console.error('[antiHijack] failed to restore admin:', e.message);
                await sock.sendMessage(groupId, {
                    text: style.error(`Could not restore @${shortJid(victim)} to admin.`),
                    mentions: [victim]
                }).catch(() => { });
                continue;
            }

            // Removing the demoter requires antihijack to be on explicitly.
            if (!antihijack) continue;
            if (!author || author === botJid) continue;
            if (isProtectedAdmin(groupId, author)) continue;

            try {
                await delay(REPROMOTE_DELAY_MS);
                await sock.groupParticipantsUpdate(groupId, [author], 'remove');
                await sock.sendMessage(groupId, {
                    text: style.warning(`🛡️ @${shortJid(author)} was removed for demoting an admin.`),
                    mentions: [author]
                }).catch(() => { });
            } catch (e) {
                console.error('[antiHijack] failed to remove demoter:', e.message);
            }
        }

        return acted;
    } catch (error) {
        console.error('[antiHijack] error:', error.message);
        return false;
    }
}

module.exports = {
    handleAntiHijack,
    isEnabled,
    REPROMOTE_DELAY_MS
};
