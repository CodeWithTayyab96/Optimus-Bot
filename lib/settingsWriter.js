/**
 * Safe writer for simple string values in settings.js.
 * Updates BOTH the file on disk and the in-memory settings object, so
 * changes (e.g. a new prefix) take effect immediately without a restart.
 */

const fs = require('fs');
const path = require('path');
const settings = require('../settings');

const SETTINGS_PATH = path.join(__dirname, '..', 'settings.js');

function updateSetting(key, value) {
    if (typeof value !== 'string') {
        throw new Error('updateSetting only supports string values');
    }

    const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const content = fs.readFileSync(SETTINGS_PATH, 'utf8');

    const regex = new RegExp(`(\\b${key}:\\s*)(['"\`])(?:\\\\.|(?!\\2).)*\\2`);
    if (!regex.test(content)) {
        throw new Error(`Setting '${key}' not found in settings.js`);
    }

    const updated = content.replace(regex, `$1'${escaped}'`);
    fs.writeFileSync(SETTINGS_PATH, updated, 'utf8');

    // Update in-memory object (same reference main.js holds)
    settings[key] = value;
    return true;
}

module.exports = { updateSetting };
