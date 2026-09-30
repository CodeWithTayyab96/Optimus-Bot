/**
 * statusCache — keep a copy of every WhatsApp status the bot receives.
 *
 * WHY A CACHE IS THE ONLY WAY TO DO THIS
 *   WhatsApp PUSHES statuses to you; there is no "fetch contact X's status" call.
 *   `sock.fetchStatus(jid)` is a trap — it returns the profile *about* text, not
 *   the story. So the only way `.status <number>` can work on demand is to have
 *   recorded the status when it arrived. That is what this module is for.
 *
 * PRIVACY — THE POINT OF THE WHOLE THING
 *   Downloading a status does NOT mark it as viewed. `readMessages()` is what
 *   sends the "seen" receipt, and this module deliberately never calls it. So a
 *   status can be saved without the poster ever seeing that the bot looked.
 *   (`.autostatus on` does the opposite — it calls readMessages. The two are
 *   independent on purpose.)
 *
 * WHAT IT CANNOT DO
 *   A status only reaches this bot if the poster's privacy settings allow the
 *   bot's number to see it. If someone posts to "my contacts except …" and the
 *   bot is not in that list, the status never arrives and there is nothing to
 *   cache. No amount of code can work around that.
 *
 * BOUNDS
 *   Media is stored on disk, so it is capped: the newest few per contact and a
 *   total ceiling, oldest pruned first. Without this a busy status feed would
 *   quietly fill the panel's disk.
 */

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const CACHE_DIR = path.join(__dirname, '..', 'data', 'status-cache');
const INDEX_FILE = path.join(CACHE_DIR, 'index.json');

const MAX_PER_CONTACT = 5;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024; // 150 MB
const MAX_ENTRY_BYTES = 30 * 1024 * 1024;  // skip anything bigger than 30 MB

/** Message ids already handled, so a re-delivered upsert is not stored twice. */
const seenIds = new Set();

function ensureDir() {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function readIndex() {
    try {
        const raw = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function writeIndex(entries) {
    ensureDir();
    fs.writeFileSync(INDEX_FILE, JSON.stringify(entries, null, 2));
}

/** '923701609799:12@s.whatsapp.net' → '923701609799' */
function numberFromJid(jid) {
    return String(jid || '').split('@')[0].split(':')[0];
}

/** Recursively unwrap view-once / ephemeral envelopes to the raw media node. */
function unwrap(content, depth = 0) {
    if (!content || depth > 10) return null;
    if (content.imageMessage) return { type: 'image', node: content.imageMessage };
    if (content.videoMessage) return { type: 'video', node: content.videoMessage };
    if (content.audioMessage) return { type: 'audio', node: content.audioMessage };
    if (content.conversation) return { type: 'text', text: content.conversation };
    if (content.extendedTextMessage?.text) return { type: 'text', text: content.extendedTextMessage.text };

    for (const key of ['viewOnceMessageV2', 'viewOnceMessageV2Extension', 'viewOnceMessage', 'ephemeralMessage']) {
        if (content[key]?.message) {
            const r = unwrap(content[key].message, depth + 1);
            if (r) return r;
        }
    }
    if (content.message && typeof content.message === 'object') {
        return unwrap(content.message, depth + 1);
    }
    return null;
}

const EXT = { image: 'jpg', video: 'mp4', audio: 'ogg' };

/**
 * Record one status. Never throws — a status we fail to keep must not take the
 * message pipeline down with it.
 */
async function captureMessage(sock, msg) {
    const key = msg?.key;
    if (!key) return;

    // The poster is normally the `participant`. A status posted by THIS account
    // arrives with `fromMe: true` and no participant, which would leave only
    // status@broadcast — and skipping that would silently drop the owner's own
    // statuses, which is exactly what you want to test with.
    let posterJid = key.participant;
    if (!posterJid && key.fromMe) posterJid = sock?.user?.id || sock?.user?.jid;
    if (!posterJid || posterJid === 'status@broadcast') return;

    const id = key.id;
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    if (seenIds.size > 500) {
        // Keep the dedupe set from growing without bound.
        for (const old of [...seenIds].slice(0, 250)) seenIds.delete(old);
    }

    const found = unwrap(msg.message);
    if (!found) return;

    const number = numberFromJid(posterJid);
    const entry = {
        id,
        jid: posterJid,
        number,
        type: found.type,
        ts: (key.messageTimestamp ? Number(key.messageTimestamp) : Math.floor(Date.now() / 1000)),
        caption: found.node?.caption || found.text || '',
        mimetype: found.node?.mimetype || null,
        file: null,
        size: 0,
    };

    try {
        if (found.type !== 'text') {
            // NOTE: no readMessages() call here — that is what keeps this silent.
            const stream = await downloadContentFromMessage(found.node, found.type);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);

            if (!buffer.length) return;
            if (buffer.length > MAX_ENTRY_BYTES) {
                console.log(`[statusCache] skipping ${number} — ${(buffer.length / 1048576).toFixed(1)} MB is over the cap`);
                return;
            }

            ensureDir();
            const file = `${number}-${entry.ts}-${id.slice(0, 6)}.${EXT[found.type] || 'bin'}`;
            fs.writeFileSync(path.join(CACHE_DIR, file), buffer);
            entry.file = file;
            entry.size = buffer.length;
        }

        const entries = readIndex();
        entries.push(entry);
        writeIndex(prune(entries));

        // Say so out loud. Without this there is no way to tell "the bot is not
        // in anyone's status audience" from "the capture path is broken" — both
        // look like an empty cache from inside the chat.
        console.log(`[statusCache] saved ${entry.type} status from ${number} (${entry.size} bytes)`);
    } catch (e) {
        console.error('[statusCache] capture failed:', e.message);
    }
}

/** Enforce the per-contact and total caps, deleting files as entries are dropped. */
function prune(entries) {
    // Newest first for the cap checks.
    const byNewest = [...entries].sort((a, b) => b.ts - a.ts);
    const keep = new Set();

    const perContact = new Map();
    for (const e of byNewest) {
        const n = perContact.get(e.number) || 0;
        if (n >= MAX_PER_CONTACT) continue;
        perContact.set(e.number, n + 1);
        keep.add(e.id);
    }

    let total = 0;
    const kept = [];
    for (const e of byNewest) {
        if (!keep.has(e.id)) continue;
        total += e.size || 0;
        if (total > MAX_TOTAL_BYTES) continue;
        kept.push(e);
    }

    // Drop the files for anything that did not survive.
    const keptIds = new Set(kept.map((e) => e.id));
    for (const e of entries) {
        if (keptIds.has(e.id) || !e.file) continue;
        try {
            fs.unlinkSync(path.join(CACHE_DIR, e.file));
        } catch { /* already gone */ }
    }

    return kept;
}

/** Capture every status in a messages.upsert payload. */
async function capture(sock, upsert) {
    const messages = upsert?.messages || [];
    for (const msg of messages) {
        if (msg?.key?.remoteJid !== 'status@broadcast') continue;
        await captureMessage(sock, msg);
    }
}

/** Cached statuses for a number or JID, newest first. */
function listFor(numberOrJid) {
    const want = numberFromJid(numberOrJid);
    if (!want) return [];
    return readIndex()
        .filter((e) => e.number === want)
        .sort((a, b) => b.ts - a.ts);
}

/** One row per contact that has anything cached, newest first. */
function listContacts() {
    const byNumber = new Map();
    for (const e of readIndex()) {
        const cur = byNumber.get(e.number);
        if (!cur || e.ts > cur.ts) {
            byNumber.set(e.number, { number: e.number, jid: e.jid, ts: e.ts, count: (cur?.count || 0) + 1 });
        } else {
            cur.count += 1;
        }
    }
    return [...byNumber.values()].sort((a, b) => b.ts - a.ts);
}

function stats() {
    const entries = readIndex();
    return {
        entries: entries.length,
        contacts: new Set(entries.map((e) => e.number)).size,
        bytes: entries.reduce((s, e) => s + (e.size || 0), 0),
        dir: CACHE_DIR,
    };
}

/** Delete everything (or one contact's entries). Returns how many were removed. */
function clear(numberOrJid) {
    const entries = readIndex();
    const want = numberOrJid ? numberFromJid(numberOrJid) : null;
    const drop = want ? entries.filter((e) => e.number === want) : entries;
    const keep = want ? entries.filter((e) => e.number !== want) : [];

    for (const e of drop) {
        if (!e.file) continue;
        try {
            fs.unlinkSync(path.join(CACHE_DIR, e.file));
        } catch { /* already gone */ }
    }
    writeIndex(keep);
    return drop.length;
}

/** Absolute path of a cached entry's media, or null. */
function filePathFor(entry) {
    if (!entry?.file) return null;
    const p = path.join(CACHE_DIR, entry.file);
    return fs.existsSync(p) ? p : null;
}

module.exports = {
    capture,
    listFor,
    listContacts,
    stats,
    clear,
    filePathFor,
    numberFromJid,
    // exported for tests
    _test: { unwrap, prune, MAX_PER_CONTACT, MAX_TOTAL_BYTES, CACHE_DIR },
};
