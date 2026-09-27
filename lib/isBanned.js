const fs = require('fs');
const path = require('path');

const BANNED_FILE = path.join(__dirname, '..', 'data', 'banned.json');
let bannedSet = null;

function loadFromDisk() {
    try {
        if (fs.existsSync(BANNED_FILE)) {
            return new Set(JSON.parse(fs.readFileSync(BANNED_FILE, 'utf8')));
        }
    } catch (error) {
        console.error('[isBanned] load error:', error);
    }
    return new Set();
}

function ensureLoaded() {
    if (bannedSet === null) bannedSet = loadFromDisk();
    return bannedSet;
}

function isBanned(userId) {
    return ensureLoaded().has(userId);
}

function banUser(userId) {
    const s = ensureLoaded();
    s.add(userId);
    persist(s);
}

function unbanUser(userId) {
    const s = ensureLoaded();
    s.delete(userId);
    persist(s);
}

function persist(set) {
    try {
        const dir = path.dirname(BANNED_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(BANNED_FILE, JSON.stringify([...set], null, 2), 'utf8');
    } catch (e) {
        console.error('[isBanned] write error:', e);
    }
}

module.exports = { isBanned, banUser, unbanUser };