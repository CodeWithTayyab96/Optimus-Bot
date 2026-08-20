/**
 * Bot mode (public/private) — stored in data/mode.json.
 *
 * Previously this lived inside data/messageCount.json alongside per-group
 * message statistics, which conflated two unrelated concerns and could
 * corrupt state. One-time migration reads the legacy file if mode.json
 * does not exist yet.
 *
 * The value is cached in memory: the only writer is commands/owner/mode.js,
 * which goes through setMode(), so the cache is always authoritative.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MODE_FILE = path.join(DATA_DIR, 'mode.json');
// Legacy location that held { isPublic, messageCount } — migration source only.
const LEGACY_MODE_FILE = path.join(DATA_DIR, 'messageCount.json');

let cached = null;

function writeModeFile(isPublic) {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(MODE_FILE, JSON.stringify({ isPublic }, null, 2));
    } catch (e) {
        console.error('[mode] failed to write mode.json:', e.message);
    }
}

/**
 * Returns the current bot mode: true = public, false = private. Defaults to
 * public when no state exists.
 */
function readMode() {
    if (cached !== null) return cached;

    let isPublic = true;
    try {
        if (fs.existsSync(MODE_FILE)) {
            const data = JSON.parse(fs.readFileSync(MODE_FILE, 'utf8'));
            if (typeof data.isPublic === 'boolean') isPublic = data.isPublic;
        } else if (fs.existsSync(LEGACY_MODE_FILE)) {
            // One-time migration from the legacy messageCount.json
            const legacy = JSON.parse(fs.readFileSync(LEGACY_MODE_FILE, 'utf8'));
            if (typeof legacy.isPublic === 'boolean') isPublic = legacy.isPublic;
            writeModeFile(isPublic);
        }
    } catch (e) {
        console.error('[mode] error reading mode, defaulting to public:', e.message);
    }

    cached = isPublic;
    return cached;
}

/**
 * Sets the bot mode (true = public, false = private) and persists it.
 */
function setMode(isPublic) {
    cached = !!isPublic;
    writeModeFile(cached);
}

module.exports = { readMode, setMode };
