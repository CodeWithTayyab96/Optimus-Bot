/**
 * lib/aiHelpers — small shared helpers for AI commands.
 *
 * The single responsibility here is turning whatever the command received into
 * a clean prompt string WITHOUT assuming a hard-coded prefix. main.js already
 * hands commands their arguments pre-stripped of the prefix + command name via
 * `args`, plus `extra.prefix`. We prefer `args` (the canonical, prefix-agnostic
 * source) and only fall back to parsing the raw message when `args` is empty
 * (e.g. unusual invocation paths).
 */
const settings = require('../settings');

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the prompt text for an AI command.
 *
 * @param {string[]} args    tokens after the prefix + command name (from main.js)
 * @param {object}   message the raw WhatsApp message object
 * @param {string}   prefix  the configured command prefix (from extra.prefix)
 * @returns {string} the prompt, or '' when nothing usable is present
 */
function getPrompt(args, message, prefix) {
    const fromArgs = Array.isArray(args) && args.length ? args.join(' ').trim() : '';
    if (fromArgs) return fromArgs;

    const raw = (
        message?.message?.conversation
        || message?.message?.extendedTextMessage?.text
        || ''
    ).trim();
    if (!raw) return '';

    const px = prefix || settings.prefix || '.';
    // Strip the prefix followed by the command word (and any trailing space).
    return raw.replace(new RegExp('^' + escapeRegex(px) + '\\S*\\s*'), '').trim();
}

module.exports = { escapeRegex, getPrompt };
