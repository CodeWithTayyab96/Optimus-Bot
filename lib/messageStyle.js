/**
 * messageStyle — the outgoing-message design system for Optimus Bot.
 *
 * IDENTITY: clean, readable, emoji-marked plain text. Every message uses
 * plain lines, emoji prefixes for status, and `Label: value` fields.
 * No box-drawing frames, no module headers, no `[TAG]` brackets.
 *
 * The approved style matches the main menu:
 *
 *     🤖 Optimus Bot
 *     240 commands
 *
 *     📦 General (38) — .general
 *     🛡️ Admin (51) — .admin
 *
 *     ℹ️ .help <command> for details
 *
 * WHY IT LIVES HERE AND NOT PER COMMAND
 *   ~240 commands go through this module. One shared formatter makes the
 *   visual identity hold together: changing this file restyles every reply.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   - No ANSI escapes, no HTML/CSS, no generated images. WhatsApp renders
 *     plain text; that is the whole surface.
 *   - No third-party dependencies, no template engine, no class hierarchy.
 */

const settings = require('../settings');

const TAG_EMOJIS = {
    system: 'ℹ️',
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    process: '⏳',
    prompt: '💬',
};

// ── primitives ──────────────────────────────────────────────────────────────

function rule() {
    return '';
}

/**
 * Clean a raw label into a readable plain title.
 * `'📸 STATUS CACHE'` → `'Status Cache'`, `'ERROR.SYS'` → `'Error'`.
 */
function moduleName(label) {
    const direct = String(label == null ? '' : label).trim()
        .replace(/\.SYS$/i, '')
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, ' ')
        .replace(/[_]+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .trim();

    const words = direct.split(/\s+/).filter(Boolean);
    if (!words.length) return 'System';

    return words
        .map(w => {
            if (w.length <= 2 && /^[A-Z]+$/.test(w)) return w;
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        })
        .join(' ');
}

function header(label) {
    const name = moduleName(label);
    return [`📋 ${name}`, ''];
}

/** Emoji-prefixed status line. */
function tag(kind, content) {
    const emoji = TAG_EMOJIS[String(kind).toLowerCase()] || TAG_EMOJIS.system;
    return content == null || content === '' ? emoji : `${emoji} ${content}`;
}

function quote(content) {
    return `> ${String(content == null ? '' : content)}`;
}

/** `Label: value` — plain field, sentence-case label. */
function field(label, value, width) {
    const raw = String(label);
    const lbl = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    return `${lbl}: ${value == null ? '' : value}`;
}

function fields(pairs, opts = {}) {
    const clean = (pairs || []).filter(([k, v]) => String(k || '').trim() !== '' && v !== undefined && v !== null && v !== '');
    if (!clean.length) return [];
    return clean.map(([k, v]) => field(k, v));
}

/** `N. Label: value` — plain numbered row. */
function entry(n, label, value) {
    const raw = String(label);
    const lbl = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    return `${n}. ${lbl}: ${value == null ? '' : value}`;
}

function entries(pairs) {
    return (pairs || []).map(([k, v], i) => entry(i + 1, k, v));
}

function record(id, pairs, opts = {}) {
    const lines = [quote(id), ...fields(pairs)];
    if (opts.gap) lines.push('');
    return lines;
}

function summary(count, unit, extra) {
    const plural = Number(count) === 1 ? '' : 's';
    return `${Number(count)} ${String(unit).toLowerCase()}${plural}${extra ? ` ${extra}` : ''}`;
}

function state(value) {
    if (value === true) return 'ENABLED';
    if (value === false) return 'DISABLED';
    if (value === 'unknown') return 'UNKNOWN';
    return 'UNAVAILABLE';
}

function emptyResult(what, hint) {
    const lines = [`No ${String(what).toLowerCase()} found`, ''];
    if (hint) lines.push(`ℹ️ ${hint}`);
    return lines;
}

// ── cards ───────────────────────────────────────────────────────────────────

function extractEmoji(label) {
    const str = String(label == null ? '' : label).trim();
    const m = str.match(/^([\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}][\u{FE0E}\u{FE0F}]?)/u);
    return m ? m[1] : null;
}

/**
 * Plain card: emoji heading, blank line, content, optional footer.
 *
 *     📋 Status Cache
 *
 *     Auto-save: Enabled
 *     Interval: 30s
 *
 *     ℹ️ Tip text
 */
function card(label, content, opts = {}) {
    const name = opts.module ? moduleName(opts.module) : moduleName(label);
    const icon = opts.icon || extractEmoji(label) || '📋';
    const heading = `${icon} ${name}`;

    const rows = [];
    for (const raw of (Array.isArray(content) ? content : [content])) {
        for (const line of String(raw).split('\n')) rows.push(line);
    }

    const out = [heading, ''];
    out.push(...rows);

    for (const f of [].concat(opts.footer || [])) {
        out.push('');
        for (const line of String(f).split('\n')) out.push(line);
    }
    return out.join('\n');
}

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
        if (opts.usage) body.push('', `Usage: ${opts.usage}`);
        for (const f of [].concat(opts.footer || [])) body.push('', ...String(f).split('\n'));
        return card(kindLabel(kind), body, { module: opts.module });
    }
    return tag(kind, text);
}

function kindLabel(kind) {
    switch (String(kind).toLowerCase()) {
        case 'success': return 'Done';
        case 'error': return 'Error';
        case 'warning': return 'Warning';
        case 'info': return 'Info';
        default: return 'System';
    }
}

function success(message, opts) { return make('success', message, opts); }
function error(message, opts) { return make('error', message, opts); }
function warning(message, opts) { return make('warning', message, opts); }
function info(message, opts) { return make('info', message, opts); }
function processing(message) {
    return tag('process', String(message == null ? '' : message).replace(/\.{3,}$/, ''));
}
function completed(message, opts) { return success(message, opts); }

// ── standard error / permission templates ──────────────────────────────────

const PERMISSION_TEXT = {
    owner: 'Only the bot owner can use this command.',
    ownerOrSudo: 'This command is only available for the owner or sudo.',
    admin: 'Only group admins can use this command.',
    botAdmin: 'Please make the bot an admin to use this command.',
    group: 'This command can only be used in groups.',
    private: 'This command can only be used in a private chat.',
};

function permissionDenied(scope, opts = {}) {
    const text = PERMISSION_TEXT[scope] || PERMISSION_TEXT.ownerOrSudo;
    if (opts.box === false) return `❌ Access denied. ${text}`;
    return card('Access', [tag('error', 'Access denied'), '', text]);
}

function notFound(what, opts = {}) {
    const text = `${what} not found.`;
    if (opts.box === false) return `❌ Not found. ${text}`;
    return card('Search', [tag('error', 'Not found'), '', text]);
}

function invalidInput(what, usage, opts = {}) {
    const body = [tag('warning', 'Invalid input'), ''];
    for (const line of String(what || 'Invalid input.').split('\n')) body.push(line);
    if (usage) body.push('', `Usage: ${usage}`);
    if (opts.box === false) {
        const lines = [`⚠️ Invalid input. ${what || 'Invalid input.'}`];
        if (usage) lines.push(`Usage: ${usage}`);
        return lines.join('\n');
    }
    return card('Input', body);
}

// ── helpers ─────────────────────────────────────────────────────────────────

function menuHeader(ctx = {}) {
    const lines = [];
    if (ctx.user) lines.push(`User: ${ctx.user}`);
    if (ctx.prefix) lines.push(`Prefix: ${ctx.prefix}`);
    if (ctx.mode) lines.push(`Mode: ${ctx.mode}`);
    if (!lines.length) lines.push(`${BOT_NAME()} ready`);
    return card('System', lines, { icon: '🤖' });
}

function BOT_NAME() { return settings.botName || 'Optimus Bot'; }

function splitLong(text, maxLen = 3000) {
    const chunks = [];
    let current = '';
    for (const line of String(text).split('\n')) {
        if (line.length > maxLen) {
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

function splitBlocks(blocks, maxLen = 3000) {
    const chunks = [];
    let current = '';
    for (const block of blocks) {
        const sep = current ? '\n\n' : '';
        if (block.length > maxLen) {
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
