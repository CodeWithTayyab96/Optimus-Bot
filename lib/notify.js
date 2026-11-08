/**
 * notify — the outbound notification governor.
 *
 * THE PROBLEM
 *   WhatsApp does not judge a bot by what it *intends*, it judges it by how many
 *   messages it pushes. A single `.video` used to produce three separate sends
 *   ("⏳ Downloading…" thumbnail, the video, a "✅ done" line) and `.savestatus`
 *   three more. None of those extra messages carry anything the user did not
 *   already get from the deliverable itself, but every one of them counts toward
 *   the same anti-spam heuristics that get a linked number banned. The noise is
 *   not spread evenly either: it is concentrated in exactly the commands people
 *   run repeatedly, which is the pattern that looks automated.
 *
 * WHAT THIS DOES
 *   Every outbound payload is classified before it leaves the process:
 *
 *     essential  — the deliverable itself (media, documents, menus, errors,
 *                  usage hints, answers). Never dropped, never delayed.
 *     progress   — "⏳ Downloading…", "🔍 Searching…". At most one per
 *                  `progressCoalesceMs` per chat; the rest are dropped because a
 *                  newer progress line supersedes the older one anyway.
 *     completion — "✅ Saved.", "Download completed successfully." Suppressed
 *                  when a deliverable already landed in that chat within
 *                  `completionGraceMs`: the media IS the confirmation.
 *
 *   A notice that is suppressed by the per-chat budget is not thrown away — it
 *   is queued and flushed later as ONE merged digest, so the user still learns
 *   what happened, in one message instead of five.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   - It never drops media, errors, permission denials, usage hints or menus.
 *   - It never drops a completion notice that carries counts ("Sent 3/4"), a
 *     failure, or anything the user needs to act on.
 *   - It never touches reactions, edits, deletes, status posts (`@broadcast`) or
 *     newsletter posts: those are not chat messages and cannot be batched.
 *   - It never lets a governor bug break a send. Every failure path falls back
 *     to the original `sendMessage`.
 *
 * CONFIG
 *   data/notify.json (created on first write), overridable per-process with
 *   NOTIFY_ENABLED=0, NOTIFY_MAX_PER_CHAT, NOTIFY_WINDOW_MS,
 *   NOTIFY_PROGRESS_COALESCE_MS, NOTIFY_COMPLETION_GRACE_MS.
 */

const fs = require('fs');
const path = require('path');
const style = require('./messageStyle');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'notify.json');

/** Symbol used to mark a socket that is already wrapped (wrapping twice = 2x guard). */
const WRAPPED = Symbol.for('optimus.notify.wrapped');
/** The untouched method, kept so unwrap() restores the exact same function. */
const RAW = Symbol.for('optimus.notify.raw');

const DEFAULTS = Object.freeze({
    enabled: true,
    // Per-chat budget for ROUTINE messages (progress + completion).
    windowMs: 60 * 1000,
    maxPerChat: 6,
    // A second progress line this soon after the first is noise.
    progressCoalesceMs: 20 * 1000,
    // A completion line this soon after a deliverable is redundant.
    completionGraceMs: 60 * 1000,
    // The same routine text again within this window is a duplicate.
    dedupeMs: 5 * 60 * 1000,
    // Queued notices are merged and flushed after this much quiet...
    batchWaitMs: 3000,
    // ...or immediately once this many are waiting.
    maxBatch: 3,
});

// ------------------------------------------------------------- classification

// The design vocabulary lives in messageStyle: every message is either a
// `[TAG] body` line or an `OPTIMUS · MODULE.SYS` card. Tags are the contract —
// a `[PROCESS]` line is by definition a status update, not an answer — so the
// classifier reads the tag first and only falls back to wording when there is
// no tag to read.
const TAG_RE = /^\[(SYSTEM|INFO|SUCCESS|WARNING|ERROR|PROCESS|PROMPT)\]/;

const PROGRESS_VERBS = [
    'download', 'fetch', 'search', 'process', 'sav', 'upload', 'load',
    'convert', 'render', 'creat', 'generat', 'check', 'look', 'scan',
    'post', 'join', 'demot', 'promot', 'restart', 'updat', 'optimis',
    'optimiz', 'request', 'prepar', 'probe', 'analys', 'analyz', 'sync',
    'shorten', 'translat', 'extract', 'compress', 'sending', 'reading',
    'work', 'wait', 'trying', 'attempt', 'hold', 'starting', 'connect',
];

const COMPLETION_VERBS = [
    'done', 'complete', 'finish', 'success', 'sent', 'saved', 'ready',
    'uploaded', 'delivered', 'posted', 'joined', 'updated', 'restarted',
];

// Never suppressable, whatever else the text looks like.
const PROTECTED = [
    /usage:/i,
    /access denied/i,
    /invalid input/i,
    /\bnot found\b/i,
    /permission/i,
    /\bowner\b.*\bonly\b/i,
    /reply to/i,
];

const FAILURE_WORDS = /\b(fail(?:ed|ure)?|error|could not|couldn't|unable|denied|blocked)\b/i;

// "Sent 3/4", "2/3 items" — a notice that carries a count is reporting an
// outcome the user cannot infer from the media alone. Keep it.
const COUNTS = /\b\d+\s*\/\s*\d+\b/;

// "Download completed successfully." does not START with a completion verb, so
// the head check misses it. An ellipsis means the line is still in progress.
const COMPLETION_ANY = /\b(done|completed?|finished|successfully|saved|ready)\b/i;
const IN_PROGRESS = /\.{2,}|…/;

const MAX_ROUTINE_LEN = 200;

/** Text of a payload, or null when it is not a text-only message. */
function textOf(content) {
    if (typeof content === 'string') return content;
    if (!content || typeof content !== 'object') return null;
    if (typeof content.text !== 'string') return null;
    // Anything else on the payload makes it a rich message, not a text notice.
    for (const key of ['image', 'video', 'audio', 'document', 'sticker', 'poll', 'contacts',
        'location', 'react', 'delete', 'edit', 'forward', 'pin', 'event', 'album']) {
        if (key in content) return null;
    }
    return content.text;
}

/** True when the payload carries something the user asked for. */
function isDeliverable(content) {
    if (!content || typeof content !== 'object') return false;
    return ['image', 'video', 'audio', 'document', 'sticker'].some((k) => k in content);
}

/** Non-chat targets: status broadcasts and newsletter posts are never batched. */
function isBroadcast(jid) {
    const s = String(jid || '');
    return s.endsWith('@broadcast') || s.endsWith('@newsletter');
}

function core(text) {
    return String(text).replace(TAG_RE, '').replace(/^[\s!·•\-–—]+/, '').toLowerCase();
}

/**
 * Classify one outbound payload.
 *
 * The tag decides almost everything: `[PROCESS]` is progress, `[SUCCESS]` is
 * completion, `[ERROR]`/`[WARNING]` and anything unknown is essential. Only
 * untagged text falls through to the wording heuristics below.
 *
 * @returns {'essential'|'progress'|'completion'}
 */
function classify(content) {
    if (isDeliverable(content)) return 'essential';

    const text = textOf(content);
    if (text == null) return 'essential'; // reaction, edit, delete, poll, …

    const trimmed = text.trim();
    if (!trimmed) return 'essential';

    // ── 1. The tag, when there is one ────────────────────────────────────────
    const tag = trimmed.match(TAG_RE);
    if (tag) {
        const kind = tag[1];
        const body = trimmed.slice(tag[0].length).trim();
        // A tag on the first line of a CARD is a heading, not a status line —
        // the body has more than a sentence in it.
        if (trimmed.split('\n').filter((l) => l.trim()).length > 3) return 'essential';

        if (kind === 'PROCESS') return 'progress';
        if (kind === 'SUCCESS') {
            // A completion notice is a SHORT, digit-free, single-line report.
            // The digit test is what keeps "Cleared 3 cached statuses" and
            // "Kicked 1 member" — results the user asked for — out of the
            // suppressible bucket, and it is why a tagged guard needs the same
            // rule as the untagged one.
            const bare = !/\d/.test(body) && body.length <= 60 && !body.includes('\n') && !/\.\s+\S/.test(body);
            if (bare && !FAILURE_WORDS.test(body)) return 'completion';
            return 'essential';
        }
        // SYSTEM / INFO / WARNING / ERROR / PROMPT are never disposable.
        return 'essential';
    }

    // ── 2. Untagged text: wording heuristics ─────────────────────────────────
    if (trimmed.length > MAX_ROUTINE_LEN) return 'essential'; // menus, help, reports
    if (PROTECTED.some((re) => re.test(trimmed))) return 'essential';
    if (FAILURE_WORDS.test(trimmed)) return 'essential'; // errors must always land
    if (COUNTS.test(trimmed)) return 'essential'; // "Sent 3/4" — an outcome
    if (trimmed.endsWith(':')) return 'essential'; // a header for what follows

    // A multi-line body is content, not a status line.
    if (trimmed.split('\n').filter((l) => l.trim()).length > 2) return 'essential';

    const head = core(trimmed);
    const word = (head.match(/^[a-z']+/) || [''])[0];

    // A completion notice is a SHORT, digit-free, single-clause status line.
    // The digit test is what keeps "Kicked 1 member." and "Promoted 3 members."
    // — results an admin asked for — out of the suppressible bucket.
    const plainStatus = !IN_PROGRESS.test(trimmed)
        && !/\.\s+\S/.test(trimmed)
        && !/\d/.test(trimmed)
        && trimmed.length <= 60;

    if (plainStatus && (COMPLETION_VERBS.some((v) => head.startsWith(v)) || COMPLETION_ANY.test(trimmed))) {
        return 'completion';
    }

    // Progress verbs only in their ongoing form. "Promoting 3 members" is
    // progress; "Promoted 3 members" is a result.
    if (PROGRESS_VERBS.some((v) => head.startsWith(v)) && !/ed$/.test(word)) return 'progress';

    // Anything else is a result the user asked for.
    return 'essential';
}

// -------------------------------------------------------------------- config

let cached = null;

function envOverride(name, parse) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return null;
    const v = parse(raw);
    return Number.isFinite(v) || typeof v === 'boolean' ? v : null;
}

function loadConfig() {
    if (cached) return cached;
    let stored = {};
    try {
        stored = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || {};
    } catch { /* no file yet — defaults apply */ }

    const cfg = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
        if (typeof stored[key] === typeof DEFAULTS[key]) cfg[key] = stored[key];
    }

    const overrides = [
        ['NOTIFY_ENABLED', 'enabled', (v) => !/^(0|false|off|no)$/i.test(v)],
        ['NOTIFY_MAX_PER_CHAT', 'maxPerChat', (v) => Number(v)],
        ['NOTIFY_WINDOW_MS', 'windowMs', (v) => Number(v)],
        ['NOTIFY_PROGRESS_COALESCE_MS', 'progressCoalesceMs', (v) => Number(v)],
        ['NOTIFY_COMPLETION_GRACE_MS', 'completionGraceMs', (v) => Number(v)],
    ];
    for (const [name, key, parse] of overrides) {
        const v = envOverride(name, parse);
        if (v !== null) cfg[key] = v;
    }

    cached = cfg;
    return cfg;
}

/**
 * Merge `partial` into the stored config and persist it.
 *
 * Pass `{ persist: false }` to apply a policy for this process only (tests, or
 * a temporary override that must not survive a restart).
 */
function configure(partial = {}, opts = {}) {
    const next = { ...loadConfig(), ...partial };
    for (const key of Object.keys(DEFAULTS)) {
        if (typeof next[key] !== typeof DEFAULTS[key]) next[key] = DEFAULTS[key];
    }
    cached = next;
    if (opts.persist === false) return next;
    try {
        fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(
            Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, next[k]])), null, 2
        ));
    } catch (e) {
        console.error('[notify] could not persist config:', e.message);
    }
    return next;
}

/** Drop the memoised config (tests, and after an external edit of the file). */
function reload() {
    cached = null;
    return loadConfig();
}

// --------------------------------------------------------------------- state

/** chatId -> per-chat window state. Bounded so a long uptime cannot leak. */
const chats = new Map();
const MAX_TRACKED_CHATS = 500;

const counters = { sent: 0, suppressed: 0, queued: 0, batched: 0, batchedMessages: 0 };

function stateFor(jid, now) {
    let s = chats.get(jid);
    if (!s) {
        if (chats.size >= MAX_TRACKED_CHATS) {
            // Evict the least recently used chat.
            let oldestKey = null;
            let oldest = Infinity;
            for (const [k, v] of chats) {
                if (v.lastAt < oldest) { oldest = v.lastAt; oldestKey = k; }
            }
            if (oldestKey !== null) chats.delete(oldestKey);
        }
        s = {
            windowStart: now,
            routine: 0,
            lastAt: now,
            lastProgressAt: 0,
            lastDeliverableAt: 0,
            recent: new Map(),
            queue: [],
            timer: null,
        };
        chats.set(jid, s);
    }
    if (now - s.windowStart >= loadConfig().windowMs) {
        s.windowStart = now;
        s.routine = 0;
    }
    s.lastAt = now;
    return s;
}

function fingerprint(text) {
    return String(text).trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Decide what to do with one payload. Pure with respect to the outside world
 * except for the per-chat window bookkeeping, and never throws.
 *
 * @returns {{action: 'send'|'suppress'|'queue', kind: string, reason?: string}}
 */
function decide(jid, content, now = Date.now()) {
    const cfg = loadConfig();
    let kind;
    try {
        kind = classify(content);
    } catch {
        return { action: 'send', kind: 'essential' };
    }

    if (!cfg.enabled || kind === 'essential' || isBroadcast(jid)) {
        return { action: 'send', kind };
    }

    const s = stateFor(jid, now);
    const text = textOf(content) || '';
    const fp = fingerprint(text);

    // Duplicate routine text is noise however recently it was sent.
    const seen = s.recent.get(fp);
    if (seen && now - seen < cfg.dedupeMs) {
        return { action: 'suppress', kind, reason: 'duplicate' };
    }

    if (kind === 'progress' && s.lastProgressAt && now - s.lastProgressAt < cfg.progressCoalesceMs) {
        return { action: 'suppress', kind, reason: 'progress-coalesced' };
    }

    if (kind === 'completion' && s.lastDeliverableAt && now - s.lastDeliverableAt < cfg.completionGraceMs) {
        return { action: 'suppress', kind, reason: 'redundant-after-deliverable' };
    }

    if (s.routine >= cfg.maxPerChat) {
        return { action: 'queue', kind, reason: 'budget' };
    }

    return { action: 'send', kind };
}

/** Update the window after a payload was actually sent. */
function recordSent(jid, content, kind, now = Date.now()) {
    const s = stateFor(jid, now);
    if (kind === 'progress') s.lastProgressAt = now;
    if (isDeliverable(content)) s.lastDeliverableAt = now;
    if (kind === 'progress' || kind === 'completion') {
        s.routine += 1;
        s.recent.set(fingerprint(textOf(content) || ''), now);
        if (s.recent.size > 50) {
            const cutoff = now - loadConfig().dedupeMs;
            for (const [k, ts] of s.recent) if (ts < cutoff) s.recent.delete(k);
        }
    }
}

// ------------------------------------------------------------------ batching

/**
 * Merge queued notices for one chat into a single message.
 * One line each, so nothing the user was going to learn is lost.
 */
function buildDigest(items) {
    if (items.length === 1) return items[0].text.trim();

    return style.card('NOTICE.SYS', [
        ...style.fields([['Notices', `${items.length} combined to keep this chat quiet`]]),
        '',
        ...items.map((i) => style.quote(i.text.trim())),
    ]);
}

function flush(jid, send) {
    const s = chats.get(jid);
    if (!s || !s.queue.length) return 0;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }

    const items = s.queue.splice(0, s.queue.length);
    const text = buildDigest(items);

    counters.batched += 1;
    counters.batchedMessages += items.length;
    counters.sent += 1;

    try {
        const p = send(jid, { text }, {});
        if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {
        console.error('[notify] digest flush failed:', e.message);
    }
    return items.length;
}

function enqueue(jid, text, send, now = Date.now()) {
    const cfg = loadConfig();
    const s = stateFor(jid, now);
    s.queue.push({ text, at: now });
    counters.queued += 1;

    if (s.queue.length >= cfg.maxBatch) {
        flush(jid, send);
        return;
    }
    if (s.timer) return;
    s.timer = setTimeout(() => {
        s.timer = null;
        flush(jid, send);
    }, Math.max(0, cfg.batchWaitMs));
    // Never hold the process open for a digest.
    if (s.timer && typeof s.timer.unref === 'function') s.timer.unref();
}

/** Flush every chat's queue now (shutdown, tests, or before a long idle). */
function flushAll(send) {
    if (typeof send !== 'function') return 0;
    let n = 0;
    for (const jid of [...chats.keys()]) n += flush(jid, send);
    return n;
}

/** The un-governed send, so internal helpers cannot re-enter the classifier. */
function rawSend(sock, jid, content, opts) {
    const original = sock?.[WRAPPED];
    if (typeof original === 'function') return original(jid, content, opts);
    return sock.sendMessage(jid, content, opts);
}

// ------------------------------------------------------------------- wrapper

/** A stand-in for a suppressed send, so callers that use the return value do not crash. */
function syntheticResult(jid, content) {
    return {
        key: { remoteJid: jid, id: `NOTIFY-SUPPRESSED-${Date.now()}`, fromMe: true },
        message: typeof content === 'object' ? content : { conversation: String(content) },
        suppressed: true,
    };
}

/**
 * Install the governor on a live socket.
 *
 * Idempotent: a socket that is already wrapped is returned untouched, so
 * calling this from more than one entry point cannot double-count.
 *
 * @param {object} sock a Baileys socket
 * @returns {object} the same socket
 */
function wrap(sock) {
    if (!sock || typeof sock.sendMessage !== 'function') return sock;
    if (sock[WRAPPED]) return sock;

    const raw = sock.sendMessage;
    const original = raw.bind(sock);

    sock.sendMessage = async function governedSend(jid, content, opts) {
        let decision;
        try {
            decision = decide(jid, content);
        } catch (e) {
            console.error('[notify] classifier error:', e.message);
            return original(jid, content, opts);
        }

        if (decision.action === 'send') {
            const result = await original(jid, content, opts);
            try { recordSent(jid, content, decision.kind); } catch { /* bookkeeping only */ }
            counters.sent += 1;
            return result;
        }

        if (decision.action === 'queue') {
            try {
                enqueue(jid, textOf(content) || '', (j, c, o) => original(j, c, o));
                console.log(`[notify] deferred ${decision.kind} notice to ${jid} (${decision.reason})`);
            } catch (e) {
                console.error('[notify] enqueue failed:', e.message);
                return original(jid, content, opts);
            }
            return syntheticResult(jid, content);
        }

        counters.suppressed += 1;
        console.log(`[notify] suppressed ${decision.kind} notice to ${jid} (${decision.reason}): ${JSON.stringify(String(textOf(content) || '').slice(0, 60))}`);
        return syntheticResult(jid, content);
    };

    sock[WRAPPED] = original;
    sock[RAW] = raw;
    return sock;
}

/** Remove the governor from a socket (tests, or a hot-swap of policy). */
function unwrap(sock) {
    if (!sock || !sock[WRAPPED]) return sock;
    sock.sendMessage = sock[RAW] || sock[WRAPPED];
    delete sock[WRAPPED];
    delete sock[RAW];
    return sock;
}

// ------------------------------------------------------------------ progress

/**
 * Announce that work has started, in at most ONE message.
 *
 * Returns a handle whose `update()`/`done()` EDIT that same message instead of
 * sending new ones. Edits do not notify the recipient and do not add to the
 * message count, so a long download can report five states for the price of one
 * message — or zero, if a deliverable is sent first.
 *
 * The handle is safe to call after the message was suppressed: every method is
 * a no-op then, so callers do not need to branch.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} text  initial line, e.g. "⏳ Downloading…"
 * @param {{quoted?: object, minEditMs?: number}} [opts]
 */
async function progress(sock, jid, text, opts = {}) {
    const cfg = loadConfig();
    const now = Date.now();
    const s = stateFor(jid, now);
    const kind = 'progress';
    let key = null;
    let lastEdit = 0;
    const minEditMs = Number.isFinite(opts.minEditMs) ? opts.minEditMs : 2500;

    // Presence is free: it tells the user the bot is working without adding a
    // message. Used as the sole "I heard you" signal when a notice would be
    // suppressed.
    try { await sock.sendPresenceUpdate?.('composing', jid); } catch { /* optional */ }

    let action = 'send';
    try { action = decide(jid, { text }, now).action; } catch { action = 'send'; }

    if (action === 'send') {
        try {
            const sent = await rawSend(sock, jid, { text }, opts.quoted ? { quoted: opts.quoted } : {});
            key = sent?.key || null;
            if (key) {
                s.lastProgressAt = now;
                s.routine += 1;
                s.recent.set(fingerprint(text), now);
                counters.sent += 1;
            }
        } catch (e) {
            console.error('[notify] progress send failed:', e.message);
        }
    } else {
        counters.suppressed += 1;
    }

    /** Replace the progress line in place (never a new message). */
    async function update(next) {
        if (!key) return false;
        const t = Date.now();
        if (t - lastEdit < minEditMs) return false;
        lastEdit = t;
        try {
            await rawSend(sock, jid, { text: next, edit: key });
            return true;
        } catch (e) {
            console.error('[notify] progress edit failed:', e.message);
            return false;
        }
    }

    return {
        key,
        suppressed: !key,
        update,
        /** Final line in the same bubble; the deliverable itself is what matters. */
        done: (next) => update(next || '✅ Done.'),
    };
}

/**
 * Mark a chat "typing" until the returned function is called.
 *
 * This is the zero-message way to say "I heard you, I'm working": WhatsApp
 * shows the typing bubble to the recipient and nothing is added to the message
 * count, so a 40-second download no longer costs a "⏳ Downloading…" message.
 *
 * Never throws — presence is best-effort and must not break a command.
 *
 * @returns {() => void} stop
 */
function startTyping(sock, jid) {
    let timer = null;
    let stopped = false;

    const ping = () => {
        try {
            const p = sock?.sendPresenceUpdate?.('composing', jid);
            if (p && typeof p.catch === 'function') p.catch(() => { });
        } catch { /* optional */ }
    };

    ping();
    try {
        timer = setInterval(ping, 8000);
        if (timer && typeof timer.unref === 'function') timer.unref();
    } catch { /* timers unavailable — one ping is still better than none */ }

    return function stop() {
        if (stopped) return;
        stopped = true;
        if (timer) clearInterval(timer);
        try {
            const p = sock?.sendPresenceUpdate?.('paused', jid);
            if (p && typeof p.catch === 'function') p.catch(() => { });
        } catch { /* optional */ }
    };
}

/**
 * Keep a chat marked "typing" while `fn` runs. No message is sent, so this is
 * the correct replacement for a "⏳ working on it…" text message.
 */
async function withTyping(sock, jid, fn) {
    const stop = startTyping(sock, jid);
    try {
        return await fn();
    } finally {
        stop();
    }
}

// ---------------------------------------------------------------------- misc

function stats() {
    return {
        ...counters,
        trackedChats: chats.size,
        queued: counters.queued,
        config: loadConfig(),
    };
}

/** Forget all per-chat state and counters (tests, or after a reconnect). */
function reset() {
    for (const s of chats.values()) if (s.timer) clearTimeout(s.timer);
    chats.clear();
    for (const k of Object.keys(counters)) counters[k] = 0;
}

module.exports = {
    classify,
    decide,
    wrap,
    unwrap,
    progress,
    startTyping,
    withTyping,
    configure,
    reload,
    stats,
    reset,
    flushAll,
    // exported for tests
    _test: {
        textOf, isDeliverable, isBroadcast, fingerprint, buildDigest, stateFor,
        chats, counters, DEFAULTS, CONFIG_FILE, WRAPPED,
    },
};
