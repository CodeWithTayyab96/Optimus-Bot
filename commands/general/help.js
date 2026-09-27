/**
 * help.js — dynamic command menu.
 *
 * The menu is generated from the real command registry (lib/commandLoader),
 * never from a second hardcoded list, so it always reflects the actual
 * commands, aliases, categories and permission flags in the tree.
 *
 *   The full command list no longer fits in one chat message, so it is split:
 *
 *   .help / .menu / .bot / .list   → compact CATEGORY INDEX (counts + how to open each)
 *   .ai / .fun / .admin / …        → that single category's commands
 *   .help <category>               → same as typing the category command
 *   .help <command>                → detail card from the command's metadata
 *
 * Visibility respects the existing permission model without changing it:
 *   - owner/sudo viewers see every command
 *   - group admins additionally see admin-only commands
 *   - everyone else sees only commands they are allowed to run
 *
 * Long output is still split at category-block boundaries (never mid-block).
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

const CATEGORY_ORDER = ['general', 'admin', 'owner', 'ai', 'fun', 'games', 'media', 'anime', 'textmaker', 'utility', 'productivity', 'group'];

// ── Per-category menus ───────────────────────────────────────────────────────
// The full menu is far too long for one chat message, so `.menu` now shows a
// compact index and each category gets its own command (.ai, .fun, .admin, …).
//
// Two categories cannot use their own name because a command with that name
// already exists in the tree — they get explicit alternates instead:
//   owner      → .ownercmds   (`.owner` is the owner-info command)
//   textmaker  → .textart     (`.textmaker` + `.textstyle` are already taken)
// Everything else uses the category name verbatim.
const CATEGORY_COMMANDS = {
    general: 'general',
    admin: 'admin',
    owner: 'ownercmds',
    ai: 'ai',
    fun: 'fun',
    media: 'media',
    anime: 'anime',
    textmaker: 'textart',
    productivity: 'productivity',
    group: 'group',
    games: 'games',
    misc: 'misc',
};

const CATEGORY_ICONS = {
    general: '📦',
    admin: '🛡️',
    owner: '👑',
    ai: '🤖',
    fun: '🎮',
    media: '📥',
    anime: '🌸',
    textmaker: '🔤',
    productivity: '📝',
    utility: '🧰',
    group: '👥',
    games: '🎲',
    misc: '📁',
};

// Colour square for the band under each category title (WhatsApp has no text
// colour, so the band carries it).
const CATEGORY_ACCENTS = {
    general: '🟦',
    admin: '🟥',
    owner: '🟨',
    ai: '🟪',
    fun: '🟪',
    media: '🟩',
    anime: '🟪',
    textmaker: '🟦',
    productivity: '🟩',
    utility: '🟦',
    group: '🟩',
    games: '🟨',
    misc: '🟦',
};

/** The command a user types to open a category (defaults to the category name). */
function categoryCommand(cat) {
    return CATEGORY_COMMANDS[cat] || cat;
}

/** Reverse lookup: which category does a typed command/alias open? */
function categoryFromCommand(name) {
    const key = String(name || '').toLowerCase();
    for (const [cat, cmd] of Object.entries(CATEGORY_COMMANDS)) {
        if (cmd === key) return cat;
    }
    return null;
}

function compareCategories(a, b) {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
}

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

/** One atomic block per category — banner style: *📦 GENERAL* / ━━━ / ✦ name. */
function buildBlocks(viewer = {}) {
    const byCat = collectCommands(viewer);
    const cats = [...byCat.keys()].sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a);
        const ib = CATEGORY_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
    return cats.map(cat => {
        const names = byCat.get(cat).map(c => c.name).sort();
        return style.box(`${CATEGORY_ICONS[cat] || '📁'} ${categoryLabel(cat)}`, names.map(n => `✦ ${n}`), CATEGORY_ACCENTS[cat] || '🟦');
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
    const footer = style.box(
        `📢 ${settings.botName || 'Optimus Bot'}`,
        [settings.channelLink || 'Join our channel for updates']
    );
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
 * Compact category index — this is what `.menu` / `.help` now send.
 * Lists every category with its visible command count and the command that
 * opens it, instead of dumping all 179 commands into one huge message.
 */
function buildCategoryIndex(viewer = {}, opts = {}) {
    const prefix = String(opts.prefix || settings.prefix || '.').replace(/\\$/, '');
    const byCat = collectCommands(viewer);
    const cats = [...byCat.keys()].sort(compareCategories);
    const total = visibleCommandCount(viewer);

    const lines = [`${total} commands available to you.`, 'Pick a category:', ''];
    for (const cat of cats) {
        const count = byCat.get(cat).length;
        lines.push(`${CATEGORY_ICONS[cat] || '📁'} ${categoryTitle(cat)}  (${count})`);
        lines.push(`    ${prefix}${categoryCommand(cat)}`);
    }
    lines.push('');
    lines.push(`${prefix}help <command>  → details for one command`);
    return style.box('📚 COMMAND CATEGORIES', lines);
}

/**
 * Menu for a single category, as chunks split at block boundaries.
 * @returns {string[]|null} null when the category is unknown/has no visible commands.
 */
function buildCategoryChunks(cat, viewer = {}, opts = {}) {
    const prefix = String(opts.prefix || settings.prefix || '.').replace(/\\$/, '');
    const byCat = collectCommands(viewer);
    const list = byCat.get(cat);
    if (!list || !list.length) return null;

    const names = list.map(c => c.name).sort();
    const header = style.menuHeader({
        user: viewer.userName || '',
        prefix,
        mode: readMode() ? 'public' : 'private'
    });
    const block = style.box(`${CATEGORY_ICONS[cat] || '📁'} ${categoryLabel(cat)}`, names.map(n => `✦ ${n}`), CATEGORY_ACCENTS[cat] || '🟦');
    const footer = `ℹ️ ${names.length} command(s) · ${prefix}help <command> for details · ${prefix}menu for all categories`;
    return style.splitBlocks([header, block, footer], opts.maxLen || 3000);
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

/** Send pre-built chunks; optionally attach the bot image to the first one. */
async function sendChunks(sock, chatId, message, chunks, includeImage = false) {
    const imagePath = path.join(__dirname, '../../assets/bot_image.jpg');
    const imageExists = includeImage && fs.existsSync(imagePath);

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

async function helpCommand(sock, chatId, message, args, extra) {
    const viewer = viewerFromExtra(extra);
    const prefix = extra?.prefix;

    // --- 1. A category command was used directly (e.g. .ai / .fun / .admin) ---
    const catFromCmd = categoryFromCommand(extra?.commandName);
    if (catFromCmd) {
        const chunks = buildCategoryChunks(catFromCmd, viewer, { prefix });
        if (!chunks) {
            return sock.sendMessage(chatId, {
                text: style.notFound(`Category "${catFromCmd}"`), ...channelInfo
            }, { quoted: message });
        }
        return sendChunks(sock, chatId, message, chunks, false);
    }

    // --- 2. .help <query> → category menu, otherwise command detail card ---
    const query = (args && args[0]) ? String(args[0]) : '';
    if (query) {
        const bare = query.toLowerCase().replace(/^[^a-z0-9]+/, '');
        const cat = categoryFromCommand(bare) || (collectCommands(viewer).has(bare) ? bare : null);
        if (cat) {
            const chunks = buildCategoryChunks(cat, viewer, { prefix });
            if (chunks) return sendChunks(sock, chatId, message, chunks, false);
            return sock.sendMessage(chatId, {
                text: style.notFound(`Category "${bare}"`), ...channelInfo
            }, { quoted: message });
        }

        const detail = buildCommandDetail(query, viewer);
        if (!detail) {
            const hidden = getCommands().has(bare);
            const text = hidden
                ? style.permissionDenied('ownerOrSudo', { box: false })
                : style.notFound(`Command "${query}"`);
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }
        return sock.sendMessage(chatId, { text: detail, ...channelInfo }, { quoted: message });
    }

    // --- 3. Default: compact category index (was: one huge command dump) ---
    return sendChunks(sock, chatId, message, [buildCategoryIndex(viewer, { prefix })], true);
}

module.exports = {
    name: 'help',
    aliases: ['menu', 'bot', 'list',
        // Per-category menus (see CATEGORY_COMMANDS above)
        'ai', 'fun', 'admin', 'general', 'group', 'media', 'anime',
        'productivity', 'ownercmds', 'textart'],
    category: 'general',
    description: 'Show command categories (use .ai / .fun / … to open one category)',
    usage: '.menu · .ai · .fun · .help <command>',
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
    buildCategoryIndex,
    buildCategoryChunks,
    buildCommandDetail,
    visibleCommandCount,
    isVisibleTo,
    categoryLabel,
    categoryCommand,
    categoryFromCommand
};
