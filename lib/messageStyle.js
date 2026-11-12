/**
 * messageStyle — the outgoing-message design system for Optimus Bot.
 *
 * IDENTITY: a futuristic terminal / robotic system interface. Optimus answers
 * like a diagnostic console, not a chatbot:
 *
 *     ╔═ OPTIMUS · CACHE.SYS ═════════════╗
 *     ║ [SYSTEM] OPERATIONAL               ║
 *     ║                                    ║
 *     ║ > CONTACT_ENTRY_01                 ║
 *     ║   NAME       = Bilal Ahmed         ║
 *     ║   NUMBER     = +923007777777       ║
 *     ╚════════════════════════════════════╝
 *
 * Every card is an "icon rail": a framed box whose top rail carries the module
 * name (`OPTIMUS · <MODULE>.SYS`), optionally preceded by a section emoji.
 * Inside the rail the vocabulary stays deliberately small and is reused
 * everywhere: `[TAG]` status lines, quoted `>` detail lines, `KEY = VALUE`
 * fields and numbered `[NN] LABEL :: VALUE` settings. Every command that goes
 * through this module therefore looks like the same machine writing it.
 *
 * WHY IT LIVES HERE AND NOT PER COMMAND
 *   ~240 commands used to hand-roll their own wording and spacing. One shared
 *   formatter is what makes a visual identity hold together: changing this file
 *   restyles every reply, and no command can drift back to prose.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   - No ANSI escapes, no HTML/CSS, no generated images. WhatsApp renders plain
 *     text; that is the whole surface.
 *   - No third-party dependencies, no template engine, no class hierarchy — the
 *     entire module is string joins.
 *   - No emoji colour bands. Box-drawing characters and tags carry the
 *     structure instead, which is also what survives WhatsApp's proportional
 *     font. (Field gutters are aligned with spaces, so on a proportional font
 *     they read as columns without being pixel-exact — labels are kept short
 *     and uniform per block for that reason.)
 *
 * WIDTH
 *   The rail's inner content area is capped (BOX_INNER_MAX); the frame adds 4
 *   columns on top. `splitLong`/`splitBlocks` still chunk anything that
 *   overflows, and long body sentences are left to WhatsApp's own wrapping.
 */

const settings = require('../settings');

const BOT = 'OPTIMUS';

const TAGS = Object.freeze({
    system: 'SYSTEM',
    info: 'INFO',
    success: 'SUCCESS',
    warning: 'WARNING',
    error: 'ERROR',
    process: 'PROCESS',
    prompt: 'PROMPT',
});

/** Widest structural line, in columns. Nothing may exceed this. */
const MAX_WIDTH = 24;

// Light box-drawing glyphs used by the "icon rail" card frame. They render as a
// single monospace cell each on WhatsApp, so padding by `.length` still lines up.
const BOX = { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' };

/**
 * Width budget for the card's inner content area (between the two rails). The
 * box adds 4 columns of framing, so the outer line stays inside the phone
 * budget while the body still has room for `[01] LABEL :: VALUE` rows.
 */
const BOX_INNER_MAX = 40;

// ── primitives ──────────────────────────────────────────────────────────────

/**
 * A heavy rule, used to separate a card's heading from its body.
 *
 * Length is clamped so a long label cannot produce a rule wider than a phone
 * screen, and so a one-character request still gives a visible break.
 */
function rule(len = 15) {
    const n = Math.max(8, Math.min(MAX_WIDTH, Math.round(len)));
    return '━'.repeat(n);
}

/**
 * Module heading: `OPTIMUS / <name>`.
 *
 * A legacy flat heading, kept because `header()` and `rule()` are exported
 * primitives. Cards no longer use it — they use the boxed rail in `card()`.
 *
 * A caller-supplied label is normalised into a module name — emoji and
 * punctuation stripped, upper-cased, underscored, `.SYS` appended — so
 * `box('📸 STATUS CACHE', …)` and `box('STATUS CACHE', …)` produce the same
 * heading and no command has to know about the naming scheme.
 */
function moduleName(label) {
    // A label that already spells its own module ("CACHE.SYS", "STATUS.SYS")
    // must come back exactly as written — otherwise every caller that passes an
    // explicit module name gets "CACHE.SYS.SYS".
    const direct = String(label == null ? '' : label).trim();
    if (/^[\p{L}\p{N}]+(?:[ \t]+[\p{L}\p{N}]+)*\.SYS$/iu.test(direct)) {
        return direct.replace(/\s+/g, '_').toUpperCase();
    }

    const cleaned = direct
        // ...and a trailing ".sys" on a multi-word label means the same thing.
        .replace(/\.\s*sys\s*$/i, ' ')
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();

    const words = cleaned.split(/\s+/).filter(Boolean);
    if (!words.length) return 'SYSTEM.SYS';

    const bare = words.join('_').toUpperCase().replace(/_+/g, '_').slice(0, MAX_WIDTH - 4);
    return `${bare}.SYS`;
}

/** `OPTIMUS / <MODULE>` + rule — the legacy flat heading pair. */
function header(label) {
    const name = moduleName(label);
    return [`${BOT} / ${name}`, rule(Math.max(name.length, 12))];
}

/** `[TAG] content` — the status line used everywhere. */
function tag(kind, content) {
    const k = TAGS[String(kind).toLowerCase()] || TAGS.system;
    return content == null || content === '' ? `[${k}]` : `[${k}] ${content}`;
}

/** A quoted detail line: `> content`. */
function quote(content) {
    return `> ${String(content == null ? '' : content)}`;
}

/**
 * `KEY = VALUE` field, indented under a record.
 * Labels are padded to the widest value passed in, so a block of fields lines
 * up; short, uniform labels are what keep that legible in a proportional font.
 */
function field(label, value, width) {
    const w = Number.isFinite(width) && width > 0 ? Math.round(width) : String(label).length;
    return `  ${String(label).toUpperCase().padEnd(w, ' ')} = ${value == null ? '' : value}`;
}

/** Widen every label in a set of fields to the same gutter. */
function fields(pairs, opts = {}) {
    const clean = (pairs || []).filter(([k, v]) => String(k || '').trim() !== '' && v !== undefined && v !== null && v !== '');
    if (!clean.length) return [];
    const width = opts.width || Math.max(...clean.map(([k]) => String(k).length));
    return clean.map(([k, v]) => field(k, v, width));
}

/** Numbered setting row: `[01] LABEL :: VALUE`. */
function entry(n, label, value) {
    const idx = String(n).padStart(2, '0');
    return `[${idx}] ${String(label).toUpperCase().padEnd(9, ' ')} :: ${value == null ? '' : value}`;
}

/** A numbered config block. */
function entries(pairs) {
    return (pairs || []).map(([k, v], i) => entry(i + 1, k, v));
}

/**
 * One record: `> RECORD_01` then its fields.
 *
 * @param {string} id    e.g. `CONTACT_ENTRY_01` — the caller owns the scheme
 * @param {Array<[string,string]>} pairs
 * @param {object} [opts] `{ gap: true }` puts a blank line after the block
 */
function record(id, pairs, opts = {}) {
    const lines = [quote(id), ...fields(pairs)];
    if (opts.gap) lines.push('');
    return lines;
}

/** A removeable/recorded summary line, always in the `[SYSTEM]` voice. */
function summary(count, unit, extra) {
    const noun = extra || unit;
    const plural = Number(count) === 1 ? '' : 'S';
    return `${Number(count)} ${String(unit).toUpperCase()}${plural}${extra ? ` ${extra}` : ''}`;
}

/** ENABLED / DISABLED / UNAVAILABLE / UNKNOWN — never a bare word. */
function state(value) {
    if (value === true) return 'ENABLED';
    if (value === false) return 'DISABLED';
    if (value === 'unknown') return 'UNKNOWN';
    return 'UNAVAILABLE';
}

/**
 * Empty result. An empty list is information, so it gets a block, not a shrug.
 * @param {string} what e.g. `CONTACTS`
 */
function emptyResult(what, hint) {
    const lines = [`> NO ${String(what).toUpperCase()} IN CACHE`, ''];
    if (hint) lines.push(`[INFO] ${hint}`);
    return lines;
}

// ── cards ───────────────────────────────────────────────────────────────────

/**
 * The card: a framed "icon rail" box with a heading on the top rail.
 *
 * `label` is normalised into a module name, so any existing call site keeps
 * working while taking on the terminal identity:
 *
 *     ╔══ OPTIMUS · STATUS_CACHE.SYS ════════════╗
 *     ║ [01] AUTO-SAVE :: ENABLED                 ║
 *     ╚═══════════════════════════════════════════╝
 *
 * The previous design led with `OPTIMUS / <NAME>` + a `━` rule; the box frame
 * replaces the loose rule so every reply reads as the same machine writing it.
 *
 * @param {string} label    e.g. `'📸 STATUS CACHE'` → `OPTIMUS · STATUS_CACHE.SYS`
 * @param {string|string[]} content  body lines
 * @param {{module?: string, footer?: string|string[], accent?: string}} [opts]
 */
function card(label, content, opts = {}) {
    const name = opts.module ? moduleName(opts.module) : moduleName(label);
    const icon = opts.icon ? `${opts.icon} ` : '';
    const title = `${icon}${BOT} · ${name}`;
    const rows = [];
    for (const raw of (Array.isArray(content) ? content : [content])) {
        for (const line of String(raw).split('\n')) rows.push(line);
    }

    // Inner content width: at least the title (plus its framing), clamped to
    // the phone budget. The title is embedded in the top rail, which needs
    // `title.length + 1` of inner width before any filler.
    let inner = 12;
    for (const r of rows) inner = Math.max(inner, r.length);
    inner = Math.min(inner, BOX_INNER_MAX);
    inner = Math.max(inner, title.length + 1);
    const pad = (s) => s + ' '.repeat(Math.max(0, inner - s.length));

    const out = [];
    out.push(`${BOX.tl}${BOX.h} ${title} ${BOX.h.repeat(Math.max(0, inner - title.length - 1))}${BOX.tr}`);
    if (rows.length === 0) out.push(`${BOX.v} ${' '.repeat(inner)} ${BOX.v}`);
    for (const r of rows) out.push(`${BOX.v} ${pad(r)} ${BOX.v}`);
    out.push(`${BOX.bl}${BOX.h.repeat(inner + 2)}${BOX.br}`);
    for (const f of [].concat(opts.footer || [])) {
        for (const line of String(f).split('\n')) out.push(line);
    }
    return out.join('\n');
}

// Kept as the historical name: ~240 call sites use `box()`, and they should not
// all have to change to get the new identity.
function box(label, content, opts = {}) {
    return card(label, content, opts);
}

const ACCENTS = { success: '🟩', error: '🟥', warning: '🟨', info: '🟦' };
function accentFor(label) { return ACCENTS.info; }

// ── short messages ──────────────────────────────────────────────────────────

function make(kind, message, opts = {}) {
    const text = String(message == null ? '' : message).trim();
    if (opts.box) {
        const body = [tag(kind, text)];
        // `usage` is the original option for "here is how to call it properly";
        // it must survive the terminal redesign unchanged, because every
        // invalid-input card depends on it.
        if (opts.usage) body.push('', `Usage: ${opts.usage}`);
        for (const f of [].concat(opts.footer || [])) body.push('', ...String(f).split('\n'));
        return card(kindLabel(kind), body, { module: opts.module });
    }
    return tag(kind, text);
}

function kindLabel(kind) {
    switch (String(kind).toLowerCase()) {
        case 'success': return 'OPERATION.SYS';
        case 'error': return 'ERROR.SYS';
        case 'warning': return 'WARNING.SYS';
        case 'info': return 'INFO.SYS';
        default: return 'SYSTEM.SYS';
    }
}

/** `[SUCCESS] done` — or a card with `{ box: true }`. */
function success(message, opts) { return make('success', message, opts); }
/** `[ERROR] …`. `{ box: true }` for the card form. */
function error(message, opts) { return make('error', message, opts); }
/** `[WARNING] …`. */
function warning(message, opts) { return make('warning', message, opts); }
/** `[INFO] …`. */
function info(message, opts) { return make('info', message, opts); }
/** `[PROCESS] …` — kept compact: one line, no card, trailing ellipsis stripped. */
function processing(message) {
    return tag('process', String(message == null ? '' : message).replace(/\.{3,}$/, ''));
}

/** `[SUCCESS] …` (alias of success, kept for call-site compatibility). */
function completed(message, opts) { return success(message, opts); }

// ── the standard error / permission templates ────────────────────────────────

const PERMISSION_TEXT = {
    owner: 'Only the bot owner can use this command.',
    ownerOrSudo: 'This command is only available for the owner or sudo.',
    admin: 'Only group admins can use this command.',
    botAdmin: 'Please make the bot an admin to use this command.',
    group: 'This command can only be used in groups.',
    private: 'This command can only be used in a private chat.',
};

/**
 * Permission denial. `[ERROR] ACCESS DENIED` is the compact form; the card form
 * prefixes heading and rule.
 */
function permissionDenied(scope, opts = {}) {
    const text = PERMISSION_TEXT[scope] || PERMISSION_TEXT.ownerOrSudo;
    if (opts.box === false) return `${tag('error', 'ACCESS DENIED')} ${text}`;
    return card('ACCESS.SYS', [tag('error', 'ACCESS DENIED'), '', quote(text)]);
}

/** `[ERROR] X not found.` / card form. */
function notFound(what, opts = {}) {
    const text = `${what} not found.`;
    if (opts.box === false) return `${tag('error', 'NOT FOUND')} ${text}`;
    return card('SEARCH.SYS', [tag('error', 'NOT FOUND'), '', quote(text)]);
}

/**
 * Invalid input, with an optional usage hint.
 * `Usage:` is kept as a literal token — it is part of the documented contract in
 * the smoke tests, and it reads as a label rather than as prose.
 */
function invalidInput(what, usage, opts = {}) {
    const body = [tag('warning', 'INVALID INPUT'), ''];
    for (const line of String(what || 'Invalid input.').split('\n')) body.push(quote(line));
    if (usage) body.push('', `Usage: ${usage}`);
    if (opts.box === false) {
        // Compact: same words, no heading.
        const lines = [`${tag('warning', 'INVALID INPUT')} ${what || 'Invalid input.'}`];
        if (usage) lines.push(`Usage: ${usage}`);
        return lines.join('\n');
    }
    return card('INPUT.SYS', body);
}

// ── helpers that commands already depend on ──────────────────────────────────

/**
 * Menu / index header.
 * @param {{user?: string, prefix?: string, mode?: string}} ctx
 */
function menuHeader(ctx = {}) {
    // One `fields()` call, not three: the gutter is shared, so USER / PREFIX /
    // MODE line up instead of each field being padded to its own label width.
    const pairs = [];
    if (ctx.user) pairs.push(['USER', ctx.user]);
    if (ctx.prefix) pairs.push(['PREFIX', ctx.prefix]);
    if (ctx.mode) pairs.push(['MODE', ctx.mode]);
    const lines = pairs.length ? fields(pairs) : [`> ${BOT_NAME().toUpperCase()} READY`];
    return card('SYSTEM.SYS', lines);
}

function BOT_NAME() { return settings.botName || 'Optimus Bot'; }

/**
 * Split a long message into chunks at newline boundaries, never splitting a
 * single line in half. Safe for any message; menu blocks use splitBlocks.
 */
function splitLong(text, maxLen = 3000) {
    const chunks = [];
    let current = '';
    for (const line of String(text).split('\n')) {
        if (line.length > maxLen) {
            // Pathological single line: hard-slice it (keeps the function total).
            if (current) { chunks.push(current); current = ''; }
            for (let i = 0; i < line.length; i += maxLen) chunks.push(line.slice(i, i + maxLen));
            continue;
        }
        if (current && current.length + 1 + line.length > maxLen) {
            chunks.push(current);
            current = '';
        }
        current = current ? `${current}\n${line}` : line;
    }
    if (current) chunks.push(current);
    return chunks;
}

/**
 * Split pre-built blocks into chunks of ≤ maxLen. Blocks are atomic: a block
 * never straddles two chunks.
 */
function splitBlocks(blocks, maxLen = 3000) {
    const chunks = [];
    let current = '';
    for (const block of blocks) {
        const sep = current ? '\n\n' : '';
        if (block.length > maxLen) {
            // Overlong single block: fall back to line-based splitting.
            if (current) { chunks.push(current); current = ''; }
            chunks.push(...splitLong(block, maxLen));
            continue;
        }
        if (current && current.length + sep.length + block.length > maxLen) {
            chunks.push(current);
            current = block;
        } else {
            current = current ? current + sep + block : block;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

module.exports = {
    BOT,
    TAGS,
    // primitives
    divider: rule,
    rule,
    header,
    moduleName,
    tag,
    quote,
    field,
    fields,
    entry,
    entries,
    record,
    summary,
    state,
    emptyResult,
    // cards
    card,
    box,
    accentFor,
    make,
    success,
    error,
    warning,
    info,
    processing,
    completed,
    permissionDenied,
    notFound,
    invalidInput,
    menuHeader,
    splitLong,
    splitBlocks,
};
