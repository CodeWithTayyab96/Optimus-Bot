/**
 * groupBulk — shared helpers for bulk group-participant operations
 * (promoteall / demoteall / kickall).
 *
 * The single most important guarantee here: a bulk operation must NEVER
 * target the bot itself. This mirrors the bot-self detection used by
 * commands/admin/kick.js, factored out so all three bulk commands share it.
 */

/** Candidate JIDs / numbers that identify the bot account. */
function getBotJids(sock) {
    const raw = [sock?.user?.id, sock?.user?.lid].filter(Boolean);
    const nums = raw.map(s => (s.includes(':') ? s.split(':')[0] : s.split('@')[0]));
    const jids = new Set(raw);
    for (const n of nums) {
        jids.add(n);
        jids.add(`${n}@s.whatsapp.net`);
        jids.add(`${n}@lid`);
    }
    return jids;
}

/** True when a group participant entry refers to the bot itself. */
function isBotParticipant(p, botJids) {
    const ids = [p?.id, p?.lid, p?.phoneNumber].filter(Boolean);
    for (const id of ids) {
        if (botJids.has(id)) return true;
        const n = id.includes(':') ? id.split(':')[0] : id.split('@')[0];
        if (botJids.has(n) || botJids.has(`${n}@s.whatsapp.net`) || botJids.has(`${n}@lid`)) return true;
    }
    return false;
}

/** Split an array into chunks of `size`. */
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { getBotJids, isBotParticipant, chunk, sleep };
