/**
 * help.js — dynamic command menu.
 *
 * The menu is generated from the real command registry (lib/commandLoader),
 * never from a second hardcoded list, so it always reflects the actual
 * commands, aliases, categories and permission flags in the tree.
 *
 *   .help / .menu / .bot / .list   → full menu (split into messages when long)
 *   .help <command>                → detail card from the command's metadata
 *
 * Visibility respects the existing permission model without changing it:
 *   - owner/sudo viewers see every command
 *   - group admins additionally see admin-only commands
 *   - everyone else sees only commands they are allowed to run
 *
 * Long menus are split at category-block boundaries (never mid-block).
 */

const fs = require('fs');
const path = require('path');
const settings = require('../../settings');
const { loadCommands } = require('../../lib/commandLoader');
const { readMode } = require('../../lib/mode');
const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');

// Lazy + memoized: loadCommands() must not run during this module's own init
// (it would skip help.js itself — the require of this file would still be
// mid-execution). First real call happens after boot, exactly like main.js.
let commandsCache = null;
function getCommands() {
    if (!commandsCache) commandsCache = loadCommands();
    return commandsCache;
}

const CATEGORY_LABELS = {
    general: 'GENERAL',
    admin: 'ADMIN',
    owner: 'OWNER',
    ai: 'AI',
    fun: 'FUN ZONE',
    games: 'GAMES',
    media: 'DOWNLOADER',
    anime: 'ANIME',
    textmaker: 'TEXTMAKER',
    utility: 'UTILITY'
};

const CATEGORY_ORDER = ['general', 'admin', 'owner', 'ai', 'fun', 'games', 'media', 'anime', 'textmaker', 'utility'];

function categoryLabel(cat) {
    return CATEGORY_LABELS[cat] || String(cat || 'misc').toUpperCase();
}

function categoryTitle(cat) {
    const label = categoryLabel(cat);
    return label.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Permission-aware visibility. Mirrors the command flags; never changes them.
 * @param {{ownerOnly?: boolean, modOnly?: boolean, adminOnly?: boolean}} cmd
 * @param {{isOwnerOrSudo?: boolean, isAdmin?: boolean}} viewer
 */
function isVisibleTo(cmd, viewer = {}) {
    if (viewer.isOwnerOrSudo) return true;
    if (cmd.ownerOnly || cmd.modOnly) return false;
    if (cmd.adminOnly) return Boolean(viewer.isAdmin);
    return true;
}

/** Group every visible command by category (deduped by command name). */
function collectCommands(viewer = {}) {
    const seen = new Set();
    const byCat = new Map();
    for (const [, cmd] of getCommands()) {
        if (seen.has(cmd.name)) continue;
        seen.add(cmd.name);
        if (!isVisibleTo(cmd, viewer)) continue;
        const cat = cmd.category || 'misc';
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat).push(cmd);
    }
    return byCat;
}

/** One atomic block per category: ╭─「 GENERAL 」 … ╰────────────. */
function buildBlocks(viewer = {}) {
    const byCat = collectCommands(viewer);
    const cats = [...byCat.keys()].sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a);
        const ib = CATEGORY_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
    return cats.map(cat => {
        const names = byCat.get(cat).map(c => c.name).sort();
        return `╭─「 ${categoryLabel(cat)} 」\n${names.map(n => `│ ✦ ${n}`).join('\n')}\n╰────────────`;
    });
}

/**
 * Build the full menu as a list of messages (chunks), split at block
 * boundaries so no category card is ever cut in half.
 * @param {{isOwnerOrSudo?: boolean, isAdmin?: boolean, userName?: string}} viewer
 * @param {{prefix?: string, maxLen?: number}} opts
 */
function buildMenuChunks(viewer = {}, opts = {}) {
    const prefix = String(opts.prefix || settings.prefix || '.').replace(/\\$/, '');
    const mode = readMode() ? 'public' : 'private';
    const header = style.menuHeader({
        user: viewer.userName || '',
        prefix,
        mode
    });
    const footer = [
        `╭━━━〔 📢 ${settings.botName || 'Optimus Bot'} 〕━━━╮`,
        `┃ ${settings.channelLink || 'Join our channel for updates'}`,
        `╰━━━━━━━━━━━━━━━━━━━━━━╯`
    ].join('\n');
    return style.splitBlocks([header, ...buildBlocks(viewer), footer], opts.maxLen || 3000);
}

/** Full menu as one string (all chunks joined) — used by tests/coverage. */
function buildMenuText(viewer = {}, opts = {}) {
    return buildMenuChunks(viewer, opts).join('\n\n');
}

/** Count of visible commands for a viewer (used by the menu footer). */
function visibleCommandCount(viewer = {}) {
    const byCat = collectCommands(viewer);
    let total = 0;
    for (const list of byCat.values()) total += list.length;
    return total;
}

/**
 * Detail card for .help <command>.
 * @returns {string|null} null when unknown or not visible to the viewer.
 */
function buildCommandDetail(query, viewer = {}) {
    const name = String(query || '').toLowerCase().replace(/^[^a-z0-9]+/, '');
    if (!name) return null;
    const cmd = getCommands().get(name);
    if (!cmd || !isVisibleTo(cmd, viewer)) return null;

    const prefix = settings.prefix || '.';
    const lines = [
        `Name     : ${cmd.name}`,
        `Category : ${categoryTitle(cmd.category || 'misc')}`,
        '',
        'Description:',
        ` ${cmd.description || 'No description provided.'}`,
        '',
        'Usage:',
        ` ${cmd.usage || `${prefix}${cmd.name}`}`,
        '',
        'Aliases:',
        ` ${(cmd.aliases && cmd.aliases.length) ? cmd.aliases.map(a => `• ${a}`).join(' ') : '—'}`
    ];
    return style.box('🔎 COMMAND INFO', lines);
}

function viewerFromExtra(extra = {}) {
    return {
        isOwnerOrSudo: Boolean(extra.senderIsOwnerOrSudo || extra.isOwnerOrSudoCheck),
        isAdmin: Boolean(extra.isSenderAdmin),
        userName: extra.senderId ? `@${String(extra.senderId).split('@')[0]}` : ''
    };
}

async function helpCommand(sock, chatId, message, args, extra) {
    const viewer = viewerFromExtra(extra);
    const query = (args && args[0]) ? String(args[0]) : '';

    // --- .help <command> detail ---
    if (query) {
        const detail = buildCommandDetail(query, viewer);
        if (!detail) {
            const hidden = getCommands().has(String(query).toLowerCase().replace(/^[^a-z0-9]+/, ''));
            const text = hidden
                ? style.permissionDenied('ownerOrSudo', { box: false })
                : style.notFound(`Command "${query}"`);
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }
        return sock.sendMessage(chatId, { text: detail, ...channelInfo }, { quoted: message });
    }

    // --- full menu (possibly several messages) ---
    const chunks = buildMenuChunks(viewer, { prefix: extra?.prefix });
    const imagePath = path.join(__dirname, '../../assets/bot_image.jpg');
    const imageExists = fs.existsSync(imagePath);

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (i === 0 && imageExists) {
            try {
                await sock.sendMessage(chatId, {
                    image: fs.readFileSync(imagePath),
                    caption: chunk,
                    ...channelInfo
                }, { quoted: message });
                continue;
            } catch {
                // fall through to plain-text send
            }
        }
        await sock.sendMessage(chatId, { text: chunk, ...channelInfo }, { quoted: message });
    }
}

module.exports = {
    name: 'help',
    aliases: ['menu', 'bot', 'list'],
    category: 'general',
    description: 'Show the command menu (use .help <command> for details)',
    usage: '.help [command]',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await helpCommand(sock, extra.chatId, message, args, extra);
    },
    // Exported for tests / coverage checks
    buildMenuChunks,
    buildMenuText,
    buildCommandDetail,
    visibleCommandCount,
    isVisibleTo,
    categoryLabel
};
