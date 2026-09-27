/**
 * Bookmark Store — manages saved/bookmarked messages.
 *
 * Persists to data/savedMessages.json
 * Structure:
 * {
 *   "bookmarks": {
 *     "userJid": [
 *       { "id": "S001", "label": "Assignment", "chatJid": "...", "messageKey": "...", "sender": "...", "timestamp": 1234567890 }
 *     ]
 *   }
 * }
 */

const { readJson, writeJson } = require('./dataStore');
const FILE = 'savedMessages.json';

function loadAll() {
    return readJson(FILE, { bookmarks: {} });
}

function saveAll(data) {
    return writeJson(FILE, data);
}

/**
 * Generate next bookmark ID for a user.
 */
function nextId(userJid) {
    const data = loadAll();
    const userBookmarks = data.bookmarks[userJid] || [];
    const maxNum = userBookmarks.reduce((max, bm) => {
        const num = parseInt(bm.id.replace('S', ''), 10);
        return num > max ? num : max;
    }, 0);
    return 'S' + String(maxNum + 1).padStart(3, '0');
}

/**
 * Save a bookmark for a user.
 */
function saveBookmark(userJid, chatJid, messageKey, sender, label = '') {
    const data = loadAll();
    if (!data.bookmarks[userJid]) data.bookmarks[userJid] = [];

    const id = nextId(userJid);
    const bookmark = {
        id,
        label: label || 'Saved message',
        chatJid,
        messageKey,
        sender,
        timestamp: Date.now()
    };

    data.bookmarks[userJid].push(bookmark);
    saveAll(data);
    return bookmark;
}

/**
 * Get all bookmarks for a user.
 */
function getBookmarks(userJid) {
    const data = loadAll();
    return data.bookmarks[userJid] || [];
}

/**
 * Get a specific bookmark by ID for a user.
 */
function getBookmark(userJid, bookmarkId) {
    const bookmarks = getBookmarks(userJid);
    return bookmarks.find(bm => bm.id === bookmarkId) || null;
}

/**
 * Delete a bookmark by ID for a user. Returns true if deleted.
 */
function deleteBookmark(userJid, bookmarkId) {
    const data = loadAll();
    const bookmarks = data.bookmarks[userJid] || [];
    const idx = bookmarks.findIndex(bm => bm.id === bookmarkId);
    if (idx === -1) return false;

    bookmarks.splice(idx, 1);
    data.bookmarks[userJid] = bookmarks;
    saveAll(data);
    return true;
}

module.exports = {
    saveBookmark,
    getBookmarks,
    getBookmark,
    deleteBookmark
};
