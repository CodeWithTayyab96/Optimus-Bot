const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/userGroupData.json');
let _cache = null;

const DEFAULT_DATA = {
    antibadword: {},
    antilink: {},
    welcome: {},
    goodbye: {},
    chatbot: {},
    warnings: {},
    sudo: [],
    // Added with the Shadow-MD port: per-group moderation settings.
    // See lib/antispam.js, lib/antibot.js and lib/antiHijack.js.
    antispam: {},
    antibot: {},
    antihijack: {},
    protectedAdmins: {}
};

// Function to load user and group data (cached in memory)
function loadUserGroupData() {
    if (_cache) return _cache;
    try {
        if (!fs.existsSync(DATA_PATH)) {
            _cache = JSON.parse(JSON.stringify(DEFAULT_DATA));
            saveUserGroupData(_cache);
            return _cache;
        }
        _cache = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
        return _cache;
    } catch (error) {
        console.error('Error loading user group data:', error);
        _cache = JSON.parse(JSON.stringify(DEFAULT_DATA));
        return _cache;
    }
}

// Function to save user and group data to JSON file
function saveUserGroupData(data) {
    try {
        const dir = path.dirname(DATA_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
        _cache = data;
        return true;
    } catch (error) {
        console.error('Error saving user group data:', error);
        return false;
    }
}

// Invalidate cache (e.g. after external process modifies the file)
function invalidateUserGroupData() { _cache = null; }

// Add these functions to your SQL helper file
async function setAntilink(groupId, type, action) {
    try {
        const data = loadUserGroupData();
        if (!data.antilink) data.antilink = {};
        if (!data.antilink[groupId]) data.antilink[groupId] = {};
        
        data.antilink[groupId] = {
            enabled: type === 'on',
            action: action || 'delete' // Set default action to delete
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting antilink:', error);
        return false;
    }
}

async function getAntilink(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (!data.antilink || !data.antilink[groupId]) return null;
        
        return type === 'on' ? data.antilink[groupId] : null;
    } catch (error) {
        console.error('Error getting antilink:', error);
        return null;
    }
}

async function removeAntilink(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (data.antilink && data.antilink[groupId]) {
            delete data.antilink[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing antilink:', error);
        return false;
    }
}

// Add antitag functions
async function setAntitag(groupId, type, action) {
    try {
        const data = loadUserGroupData();
        if (!data.antitag) data.antitag = {};
        if (!data.antitag[groupId]) data.antitag[groupId] = {};
        
        data.antitag[groupId] = {
            enabled: type === 'on',
            action: action || 'delete' // Set default action to delete
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting antitag:', error);
        return false;
    }
}

async function getAntitag(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (!data.antitag || !data.antitag[groupId]) return null;
        
        return type === 'on' ? data.antitag[groupId] : null;
    } catch (error) {
        console.error('Error getting antitag:', error);
        return null;
    }
}

async function removeAntitag(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (data.antitag && data.antitag[groupId]) {
            delete data.antitag[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing antitag:', error);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Per-group moderation settings (antispam / antibot / antihijack / protect)
//
// These follow the same shape as antilink/antibadword above: a single JSON
// document keyed by group JID, read through the in-memory cache. They were
// added for the Shadow-MD port so the new moderation features persist across
// restarts (Shadow kept the equivalent flags in `global.*` and lost them).
// ---------------------------------------------------------------------------

function readGroupSetting(collection, groupId) {
    const data = loadUserGroupData();
    return (data[collection] && data[collection][groupId]) || null;
}

function writeGroupSetting(collection, groupId, value) {
    const data = loadUserGroupData();
    if (!data[collection]) data[collection] = {};
    if (value === null) delete data[collection][groupId];
    else data[collection][groupId] = value;
    return saveUserGroupData(data);
}

// --- antispam (flood detection) ---
// value: { enabled, action: 'warn'|'kick'|'delete', threshold, window }
function getAntispam(groupId) {
    return readGroupSetting('antispam', groupId);
}

function setAntispam(groupId, patch) {
    const current = getAntispam(groupId) || {
        enabled: true,
        action: 'warn',
        threshold: 5,
        window: 5000
    };
    return writeGroupSetting('antispam', groupId, { ...current, ...patch });
}

function removeAntispam(groupId) {
    return writeGroupSetting('antispam', groupId, null);
}

// --- antibot (foreign/unknown command detection) ---
// value: { enabled, action: 'warn'|'kick'|'delete' }
function getAntibot(groupId) {
    return readGroupSetting('antibot', groupId);
}

function setAntibot(groupId, patch) {
    const current = getAntibot(groupId) || { enabled: true, action: 'warn' };
    return writeGroupSetting('antibot', groupId, { ...current, ...patch });
}

function removeAntibot(groupId) {
    return writeGroupSetting('antibot', groupId, null);
}

// --- antihijack (auto re-promote demoted admins, remove the demoter) ---
// value: { enabled }
function getAntihijack(groupId) {
    return readGroupSetting('antihijack', groupId);
}

function setAntihijack(groupId, enabled) {
    return writeGroupSetting('antihijack', groupId, { enabled: !!enabled });
}

// --- protected admins (per-group allow-list of JIDs) ---
function getProtectedAdmins(groupId) {
    const list = readGroupSetting('protectedAdmins', groupId);
    return Array.isArray(list) ? list : [];
}

function addProtectedAdmin(groupId, jid) {
    const list = getProtectedAdmins(groupId);
    if (!list.includes(jid)) list.push(jid);
    return writeGroupSetting('protectedAdmins', groupId, list) ? list : list;
}

function removeProtectedAdmin(groupId, jid) {
    const list = getProtectedAdmins(groupId).filter(x => x !== jid);
    return writeGroupSetting('protectedAdmins', groupId, list) ? list : list;
}

function isProtectedAdmin(groupId, jid) {
    const normalized = String(jid || '').split('@')[0].split(':')[0];
    return getProtectedAdmins(groupId).some(x => String(x).split('@')[0].split(':')[0] === normalized);
}

// Automated moderation warning store (antilink/antibadword 'warn' action),
// stored in userGroupData.json.warnings. Distinct from the manual admin store
// data/warnings.json used by .warn / .warnings / .resetwarn — see
// commands/admin/warnings.js for the distinction.
async function incrementWarningCount(groupId, userId) {
    try {
        const data = loadUserGroupData();
        if (!data.warnings) data.warnings = {};
        if (!data.warnings[groupId]) data.warnings[groupId] = {};
        if (!data.warnings[groupId][userId]) data.warnings[groupId][userId] = 0;
        
        data.warnings[groupId][userId]++;
        saveUserGroupData(data);
        return data.warnings[groupId][userId];
    } catch (error) {
        console.error('Error incrementing warning count:', error);
        return 0;
    }
}

async function resetWarningCount(groupId, userId) {
    try {
        const data = loadUserGroupData();
        if (data.warnings && data.warnings[groupId] && data.warnings[groupId][userId]) {
            data.warnings[groupId][userId] = 0;
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error resetting warning count:', error);
        return false;
    }
}

// Add sudo check function
async function isSudo(userId) {
    try {
        const data = loadUserGroupData();
        return data.sudo && data.sudo.includes(userId);
    } catch (error) {
        console.error('Error checking sudo:', error);
        return false;
    }
}

// Manage sudo users
async function addSudo(userJid) {
    try {
        const data = loadUserGroupData();
        if (!data.sudo) data.sudo = [];
        if (!data.sudo.includes(userJid)) {
            data.sudo.push(userJid);
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error adding sudo:', error);
        return false;
    }
}

async function removeSudo(userJid) {
    try {
        const data = loadUserGroupData();
        if (!data.sudo) data.sudo = [];
        const idx = data.sudo.indexOf(userJid);
        if (idx !== -1) {
            data.sudo.splice(idx, 1);
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing sudo:', error);
        return false;
    }
}

async function getSudoList() {
    try {
        const data = loadUserGroupData();
        return Array.isArray(data.sudo) ? data.sudo : [];
    } catch (error) {
        console.error('Error getting sudo list:', error);
        return [];
    }
}

// Add these functions
async function addWelcome(jid, enabled, message) {
    try {
        const data = loadUserGroupData();
        if (!data.welcome) data.welcome = {};
        
        data.welcome[jid] = {
            enabled: enabled,
            message: message || '╔═⚔️ WELCOME ⚔️═╗\n║ 🛡️ User: {user}\n║ 🏰 Kingdom: {group}\n╠═══════════════╣\n║ 📜 Message:\n║ {description}\n╚═══════════════╝',
            channelId: '120363424568988623@newsletter'
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error in addWelcome:', error);
        return false;
    }
}

async function delWelcome(jid) {
    try {
        const data = loadUserGroupData();
        if (data.welcome && data.welcome[jid]) {
            delete data.welcome[jid];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error in delWelcome:', error);
        return false;
    }
}

async function isWelcomeOn(jid) {
    try {
        const data = loadUserGroupData();
        return data.welcome && data.welcome[jid] && data.welcome[jid].enabled;
    } catch (error) {
        console.error('Error in isWelcomeOn:', error);
        return false;
    }
}

async function addGoodbye(jid, enabled, message) {
    try {
        const data = loadUserGroupData();
        if (!data.goodbye) data.goodbye = {};
        
        data.goodbye[jid] = {
            enabled: enabled,
            message: message || '╔═⚔️ GOODBYE ⚔️═╗\n║ 🛡️ User: {user}\n║ 🏰 Kingdom: {group}\n╠═══════════════╣\n║ ⚰️ We will never miss you!\n╚═══════════════╝',
            channelId: '120363424568988623@newsletter'
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error in addGoodbye:', error);
        return false;
    }
}

async function delGoodBye(jid) {
    try {
        const data = loadUserGroupData();
        if (data.goodbye && data.goodbye[jid]) {
            delete data.goodbye[jid];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error in delGoodBye:', error);
        return false;
    }
}

async function isGoodByeOn(jid) {
    try {
        const data = loadUserGroupData();
        return data.goodbye && data.goodbye[jid] && data.goodbye[jid].enabled;
    } catch (error) {
        console.error('Error in isGoodByeOn:', error);
        return false;
    }
}

async function getWelcome(jid) {
    try {
        const data = loadUserGroupData();
        return data.welcome && data.welcome[jid] ? data.welcome[jid].message : null;
    } catch (error) {
        console.error('Error in getWelcome:', error);
        return null;
    }
}

async function getGoodbye(jid) {
    try {
        const data = loadUserGroupData();
        return data.goodbye && data.goodbye[jid] ? data.goodbye[jid].message : null;
    } catch (error) {
        console.error('Error in getGoodbye:', error);
        return null;
    }
}

// Add these functions to your existing SQL helper file
async function setAntiBadword(groupId, type, action) {
    try {
        const data = loadUserGroupData();
        if (!data.antibadword) data.antibadword = {};
        if (!data.antibadword[groupId]) data.antibadword[groupId] = {};
        
        data.antibadword[groupId] = {
            enabled: type === 'on',
            action: action || 'delete'
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting antibadword:', error);
        return false;
    }
}

async function getAntiBadword(groupId, type) {
    try {
        const data = loadUserGroupData();
        //console.log('Loading antibadword config for group:', groupId);
        //console.log('Current data:', data.antibadword);
        
        if (!data.antibadword || !data.antibadword[groupId]) {
            console.log('No antibadword config found');
            return null;
        }
        
        const config = data.antibadword[groupId];
       // console.log('Found config:', config);
        
        return type === 'on' ? config : null;
    } catch (error) {
        console.error('Error getting antibadword:', error);
        return null;
    }
}

async function removeAntiBadword(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (data.antibadword && data.antibadword[groupId]) {
            delete data.antibadword[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing antibadword:', error);
        return false;
    }
}

async function setChatbot(groupId, enabled) {
    try {
        const data = loadUserGroupData();
        if (!data.chatbot) data.chatbot = {};
        
        data.chatbot[groupId] = {
            enabled: enabled
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting chatbot:', error);
        return false;
    }
}

async function getChatbot(groupId) {
    try {
        const data = loadUserGroupData();
        return data.chatbot?.[groupId] || null;
    } catch (error) {
        console.error('Error getting chatbot:', error);
        return null;
    }
}

async function removeChatbot(groupId) {
    try {
        const data = loadUserGroupData();
        if (data.chatbot && data.chatbot[groupId]) {
            delete data.chatbot[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing chatbot:', error);
        return false;
    }
}

// Auto-reaction (global boolean)
function getAutoReaction() {
    const data = loadUserGroupData();
    return !!data.autoReaction;
}

function setAutoReaction(enabled) {
    const data = loadUserGroupData();
    data.autoReaction = !!enabled;
    saveUserGroupData(data);
}

module.exports = {
    loadUserGroupData,
    setAntilink,
    getAntilink,
    removeAntilink,
    setAntitag,
    getAntitag,
    removeAntitag,
    incrementWarningCount,
    resetWarningCount,
    isSudo,
    addSudo,
    removeSudo,
    getSudoList,
    addWelcome,
    delWelcome,
    isWelcomeOn,
    getWelcome,
    addGoodbye,
    delGoodBye,
    isGoodByeOn,
    getGoodbye,
    setAntiBadword,
    getAntiBadword,
    removeAntiBadword,
    setChatbot,
    getChatbot,
    removeChatbot,
    getAutoReaction,
    setAutoReaction,
    invalidateUserGroupData,
    getAntispam,
    setAntispam,
    removeAntispam,
    getAntibot,
    setAntibot,
    removeAntibot,
    getAntihijack,
    setAntihijack,
    getProtectedAdmins,
    addProtectedAdmin,
    removeProtectedAdmin,
    isProtectedAdmin,
};