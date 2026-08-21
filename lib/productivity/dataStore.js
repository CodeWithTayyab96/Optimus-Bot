/**
 * Productivity Data Store — persistent JSON file persistence for
 * reminders, bookmarks, and poll state.
 *
 * Survives bot restarts. Each data type has its own file in data/.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function readJson(filename, defaultValue = {}) {
    const filePath = path.join(DATA_DIR, filename);
    try {
        ensureDataDir();
        if (!fs.existsSync(filePath)) return defaultValue;
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error(`[DataStore] Error reading ${filename}:`, e.message);
        return defaultValue;
    }
}

function writeJson(filename, data) {
    const filePath = path.join(DATA_DIR, filename);
    try {
        ensureDataDir();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        console.error(`[DataStore] Error writing ${filename}:`, e.message);
        return false;
    }
}

module.exports = { readJson, writeJson };
