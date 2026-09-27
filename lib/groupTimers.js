/**
 * groupTimers — scheduled group open/close reverts that survive a restart.
 *
 * `.open 30m` / `.close 30m` schedule a revert. If the bot restarts before it
 * fires, the pending revert is re-armed from disk on startup (or fired
 * immediately if it went overdue while the bot was down) — otherwise a group
 * could be left stuck open or closed indefinitely.
 *
 * State: data/groupTimers.json
 */
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'data', 'groupTimers.json');
const GRACE_MS = 60000; // fire immediately if overdue by more than this

let sockRef = null;
const timers = new Map(); // jid -> Timeout

function load() {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

function save(state) {
    try {
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) { console.error('[groupTimers] save failed:', e.message); }
}

function clearTimer(jid) {
    const t = timers.get(jid);
    if (t) { clearTimeout(t); timers.delete(jid); }
}

/** Perform the revert and notify the group. */
async function apply(jid, setting) {
    if (!sockRef) {
        console.warn(`[groupTimers] no sock — cannot revert ${jid} to ${setting}`);
        return false;
    }
    try {
        await sockRef.groupSettingUpdate(jid, setting);
        const verb = setting === 'announcement' ? 'closed' : 'opened';
        await sockRef.sendMessage(jid, { text: `⏰ Group ${verb} automatically (scheduled revert).` });
        console.log(`[groupTimers] reverted ${jid} -> ${setting}`);
        return true;
    } catch (e) {
        console.error(`[groupTimers] revert failed for ${jid}:`, e.message);
        return false;
    }
}

function arm(jid, setting, dueAt) {
    clearTimer(jid);
    const delay = dueAt - Date.now();
    const t = setTimeout(async () => {
        timers.delete(jid);
        const state = load();
        delete state[jid];
        save(state);
        await apply(jid, setting);
    }, Math.max(delay, 0));
    timers.set(jid, t);
}

/**
 * Schedule a revert.
 * @param {string} jid
 * @param {'announcement'|'not_announcement'} setting what to switch to
 * @param {number} delayMs
 */
function schedule(jid, setting, delayMs) {
    const dueAt = Date.now() + delayMs;
    const state = load();
    state[jid] = { setting, dueAt };
    save(state);
    arm(jid, setting, dueAt);
    console.log(`[groupTimers] scheduled ${jid} -> ${setting} in ${Math.round(delayMs / 1000)}s`);
    return dueAt;
}

function cancel(jid) {
    clearTimer(jid);
    const state = load();
    const had = Boolean(state[jid]);
    delete state[jid];
    save(state);
    return had;
}

function pending(jid) {
    const e = load()[jid];
    if (!e) return null;
    return { setting: e.setting, dueAt: e.dueAt };
}

/**
 * Re-arm any pending timers after startup. Call once with the socket.
 * Overdue entries (bot was down past the deadline) fire immediately.
 */
function init(sock) {
    sockRef = sock;
    const state = load();
    const now = Date.now();
    let armed = 0;
    let fired = 0;

    for (const [jid, e] of Object.entries(state)) {
        if (!e || !e.setting || !e.dueAt) { delete state[jid]; continue; }
        if (e.dueAt <= now) {
            if (now - e.dueAt > GRACE_MS) {
                // Well past due — apply straight away rather than leaving the
                // group in the wrong state any longer.
                delete state[jid];
                fired++;
                apply(jid, e.setting).catch(() => {});
                continue;
            }
            arm(jid, e.setting, e.dueAt);
            armed++;
        } else {
            arm(jid, e.setting, e.dueAt);
            armed++;
        }
    }
    save(state);
    console.log(`[groupTimers] init: ${armed} re-armed, ${fired} fired (overdue)`);
    return { armed, fired };
}

function stop() {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
}

module.exports = { schedule, cancel, pending, init, stop, apply, STATE_FILE };
