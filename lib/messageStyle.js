/**
 * messageStyle — central visual identity for Optimus Bot responses.
 *
 * Consistent symbols (Phase 12):
 *   ✅ success · ❌ error · ⚠️ warning · ℹ️ info · ⏳ processing
 *   🔒 permission · 👑 owner · 🛡️ admin · 🤖 bot
 *
 * Two shapes:
 *   - Compact (default): single line, e.g. `✅ Download completed successfully.`
 *   - Boxed (opts.box / dedicated helpers): structured card with a title bar,
 *     used for errors with usage hints, permission denials and the menu.
 *
 * Commands keep full control of their content; these helpers only provide the
 * shared frame. Nothing here talks to WhatsApp — callers pass the resulting
 * string to sock.sendMessage / reply as before.
 */

const settings = require('../settings');

const ICONS = Object.freeze({
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    processing: '⏳',
    lock: '🔒',
    owner: '👑',
    admin: '🛡️',
    bot: '🤖'
});

const BOT_NAME = () => settings.botName || 'Optimus Bot';

/**
 * Render a boxed card.
 * @param {string} label   title bar text, e.g. "✅ SUCCESS"
 * @param {string|string[]} content lines (each line gets a ┃ prefix)
 */
function box(label, content) {
    const lines = Array.isArray(content) ? content : [content];
    const inner = ['┃'];
    for (const raw of lines) {
        for (const line of String(raw).split('\n')) {
            inner.push(`┃ ${line}`);
        }
    }
    inner.push('┃');
    return [`╭━━〔 ${label} 〕━━╮`, ...inner, '╰━━━━━━━━━━━━━━━━━━━━━━╯'].join('\n');
}

function make(icon, label, message, opts = {}) {
    const text = String(message == null ? '' : message).trim();
    if (opts.box) {
        const lines = [text];
        if (opts.usage) lines.push('', 'Usage:', ` ${opts.usage}`);
        return box(`${icon} ${label}`, lines);
    }
    return `${icon} ${text}`;
}

/** ✅ Success message. `{ box: true }` for the card form, `usage` adds a usage line. */
function success(message, opts) { return make(ICONS.success, 'SUCCESS', message, opts); }

/** ❌ Error message. Never include stack traces / paths / keys in `message`. */
function error(message, opts) { return make(ICONS.error, 'ERROR', message, opts); }

/** ⚠️ Warning message. */
function warning(message, opts) { return make(ICONS.warning, 'WARNING', message, opts); }

/** ℹ️ Informational message. */
function info(message, opts) { return make(ICONS.info, 'INFO', message, opts); }

/** ⏳ Processing message (kept compact — one line, no box). */
function processing(message) {
    return `${ICONS.processing} ${String(message).replace(/\.{3,}$/, '')}...`;
}

/** ✅ Completion message (alias of success for symmetry). */
function completed(message, opts) { return success(message, opts); }

/**
 * 🔒 Permission-denied messages, one per existing permission scope.
 * Boxed by default; pass `{ box: false }` for a compact single line.
 */
function permissionDenied(scope, opts = {}) {
    const messages = {
        owner: `${ICONS.owner} Only the bot owner can use this command.`,
        ownerOrSudo: `${ICONS.owner} This command is only available for the owner or sudo.`,
        admin: `${ICONS.admin} Only group admins can use this command.`,
        botAdmin: `${ICONS.bot} Please make the bot an admin to use this command.`,
        group: `${ICONS.info} This command can only be used in groups.`,
        private: `${ICONS.info} This command can only be used in private chat.`
    };
    const text = messages[scope] || messages.ownerOrSudo;
    if (opts.box === false) return text;
    return box(`${ICONS.lock} ACCESS DENIED`, [text]);
}

/** ❌ "X not found." — boxed by default. */
function notFound(what, opts = {}) {
    const text = `${what} not found.`;
    if (opts.box === false) return `${ICONS.error} ${text}`;
    return box(`${ICONS.error} NOT FOUND`, [text]);
}

/** ❌ Invalid input, with an optional usage hint. */
function invalidInput(what, usage, opts = {}) {
    const lines = [what || 'Invalid input.'];
    if (usage) lines.push('', 'Usage:', ` ${usage}`);
    if (opts.box === false) return `${ICONS.error} ${lines[0]}`;
    return box(`${ICONS.error} INVALID INPUT`, lines);
}

/**
 * 🤖 Branded menu header.
 * @param {{ user?: string, prefix?: string, mode?: string }} ctx
 */
function menuHeader(ctx = {}) {
    const lines = [];
    if (ctx.user) lines.push(`${ICONS.bot} Welcome, ${ctx.user}`);
    if (ctx.prefix) lines.push(`${ICONS.info} Prefix : ${ctx.prefix}`);
    if (ctx.mode) lines.push(`${ICONS.lock} Mode   : ${ctx.mode}`);
    if (!lines.length) lines.push(`${ICONS.bot} ${BOT_NAME()}`);
    return box(`🤖 ${BOT_NAME().toUpperCase()}`, lines);
}

/**
 * Split a long message into chunks at newline boundaries, never splitting a
 * single line in half. Safe for any message; menu blocks use splitBlocks.
 * @param {string} text
 * @param {number} maxLen max characters per chunk
 * @returns {string[]}
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
 * Split pre-built blocks (category cards, headers, footers) into chunks of
 * ≤ maxLen. Blocks are atomic: a block never straddles two chunks.
 * @param {string[]} blocks
 * @param {number} maxLen
 * @returns {string[]}
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
    ICONS,
    BOT_NAME,
    box,
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
    splitBlocks
};
