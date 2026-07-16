/**
 * AFK (Away From Keyboard) — owner offline mode
 * State stored in data/afk.json; per-user notify tracking in memory.
 * Ported from KnightBot-Mini utils/afk.js, adapted to Optimus data/ layout.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const AFK_FILE = path.join(DATA_DIR, 'afk.json');

const notifiedUsers = new Set();

const DEFAULT_MESSAGE =
    '🔴 *AFK Mode ON*\n\nMy owner is currently offline. Please try again later.';

function loadState() {
    try {
        if (fs.existsSync(AFK_FILE)) {
            return JSON.parse(fs.readFileSync(AFK_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[afk] load error:', e.message);
    }
    return { enabled: false, message: DEFAULT_MESSAGE };
}

function saveState(state) {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(AFK_FILE, JSON.stringify(state, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('[afk] save error:', e.message);
        return false;
    }
}

function notifyKey(chatId, senderId) {
    return `${chatId}|${senderId}`;
}

function isEnabled() {
    return loadState().enabled === true;
}

function getMessage() {
    const state = loadState();
    return state.message || DEFAULT_MESSAGE;
}

function setEnabled(enabled, customMessage) {
    notifiedUsers.clear();
    const state = loadState();
    state.enabled = enabled;
    if (enabled && customMessage) {
        state.message = customMessage;
    } else if (!enabled) {
        state.message = DEFAULT_MESSAGE;
    }
    state.enabledAt = enabled ? Date.now() : null;
    return saveState(state);
}

function shouldNotify(chatId, senderId) {
    return !notifiedUsers.has(notifyKey(chatId, senderId));
}

function markNotified(chatId, senderId) {
    notifiedUsers.add(notifyKey(chatId, senderId));
}

module.exports = {
    isEnabled,
    getMessage,
    setEnabled,
    shouldNotify,
    markNotified,
    DEFAULT_MESSAGE,
};
