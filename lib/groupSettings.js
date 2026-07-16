/**
 * Per-group feature settings store (data/groupSettings.json).
 * Used by the group protection features (antisticker, antigroupstatus,
 * antigroupmention, autosticker) ported from KnightBot-Mini.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'groupSettings.json');

function loadAll() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[groupSettings] load error:', e.message);
    }
    return {};
}

function saveAll(data) {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('[groupSettings] save error:', e.message);
        return false;
    }
}

function getGroupSettings(chatId) {
    const all = loadAll();
    return all[chatId] || {};
}

function updateGroupSettings(chatId, patch) {
    const all = loadAll();
    all[chatId] = { ...(all[chatId] || {}), ...patch };
    return saveAll(all);
}

module.exports = { getGroupSettings, updateGroupSettings };
