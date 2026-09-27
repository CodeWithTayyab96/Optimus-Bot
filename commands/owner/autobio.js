/**
 * Optimus Bot — .autobio
 * Keep the bot's WhatsApp "About" status alive with a live clock.
 *
 * Behaviour ported from Shadow MD (`drenox.js:3021` toggle + the per-message
 * refresh handler at `drenox.js:808`). Two differences:
 *   - Shadow refreshes on every incoming message (so the bio freezes when the
 *     group is quiet). Optimus refreshes on an interval instead.
 *   - Shadow keeps the flag in `global.autobio`, so it is lost on restart.
 *     Optimus persists it to data/autobio.json and resumes on connect.
 *
 * Placeholders in the text: {time} {date} {bot}
 */
const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../../lib/isOwner');
const style = require('../../lib/messageStyle');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'autobio.json');

const REFRESH_MS = 60 * 1000;
const DEFAULT_TEMPLATE = '🤖 {bot} | {time}';

let timer = null;

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            return {
                enabled: parsed.enabled === true,
                template: typeof parsed.template === 'string' && parsed.template ? parsed.template : DEFAULT_TEMPLATE
            };
        }
    } catch (e) {
        console.error('[autobio] load error:', e.message);
    }
    return { enabled: false, template: DEFAULT_TEMPLATE };
}

function saveState(state) {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('[autobio] save error:', e.message);
        return false;
    }
}

function render(template) {
    const now = new Date();
    return String(template)
        .replace(/\{time\}/g, now.toLocaleTimeString())
        .replace(/\{date\}/g, now.toLocaleDateString())
        .replace(/\{bot\}/g, (require('../../settings').botName) || 'Optimus Bot')
        .slice(0, 139); // WhatsApp About field limit
}

function stopAutobio() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

/** Writes the bio once. Returns true on success. */
async function writeBio(sock, template) {
    if (!sock || typeof sock.updateProfileStatus !== 'function') return false;
    try {
        await sock.updateProfileStatus(render(template));
        return true;
    } catch (e) {
        console.error('[autobio] updateProfileStatus failed:', e.message);
        return false;
    }
}

/**
 * Starts (or resumes) the auto-bio interval. Safe to call repeatedly.
 * Called from index.js when the connection opens so the feature survives a
 * restart, and from the command when it is switched on.
 */
async function initAutobio(sock) {
    try {
        const state = loadState();
        if (!state.enabled) return false;
        stopAutobio();
        await writeBio(sock, state.template);
        timer = setInterval(() => {
            writeBio(sock, state.template).catch(() => { });
        }, REFRESH_MS);
        // Never hold the event loop open just for the bio.
        if (timer && typeof timer.unref === 'function') timer.unref();
        return true;
    } catch (e) {
        console.error('[autobio] init error:', e.message);
        return false;
    }
}

async function handleAutobioCommand(sock, chatId, message, args, senderId) {
    try {
        if (!(await isOwnerOrSudo(senderId, sock, chatId))) {
            await sock.sendMessage(chatId, { text: style.permissionDenied('ownerOrSudo', { box: false }) }, { quoted: message });
            return;
        }

        const prefix = require('../../settings').prefix || '.';
        const sub = (args[0] || '').toLowerCase();
        const state = loadState();

        const usage = () => style.box('📝 AUTOBIO', [
            'Setup:',
            ` ${prefix}autobio on [text]`,
            ` ${prefix}autobio set <text>`,
            ` ${prefix}autobio off`,
            ``,
            'Placeholders: {time} {date} {bot}',
            `Refreshes every ${Math.round(REFRESH_MS / 1000)}s.`
        ]);

        if (!sub) {
            await sock.sendMessage(chatId, {
                text: style.box('📝 AUTOBIO', [
                    `Status: ${state.enabled ? 'ON' : 'OFF'}`,
                    `Text: ${state.template}`
                ])
            }, { quoted: message });
            return;
        }

        if (sub === 'off') {
            stopAutobio();
            saveState({ ...state, enabled: false });
            await sock.sendMessage(chatId, { text: style.success('Autobio has been turned OFF.') }, { quoted: message });
            return;
        }

        if (sub === 'on') {
            const template = args.slice(1).join(' ').trim() || state.template || DEFAULT_TEMPLATE;
            const ok = saveState({ enabled: true, template });
            if (!ok) {
                await sock.sendMessage(chatId, { text: style.error('Failed to save autobio settings.') }, { quoted: message });
                return;
            }
            const started = await initAutobio(sock);
            await sock.sendMessage(chatId, {
                text: started
                    ? style.success(`Autobio is ON — "${render(template)}"`)
                    : style.warning('Autobio saved, but the status could not be updated right now.')
            }, { quoted: message });
            return;
        }

        if (sub === 'set') {
            const template = args.slice(1).join(' ').trim();
            if (!template) {
                await sock.sendMessage(chatId, {
                    text: style.invalidInput('Please provide the bio text.', `${prefix}autobio set <text>`, { box: false })
                }, { quoted: message });
                return;
            }
            saveState({ enabled: true, template });
            await initAutobio(sock);
            await sock.sendMessage(chatId, {
                text: style.success(`Autobio text set to "${render(template)}"`)
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { text: usage() }, { quoted: message });
    } catch (error) {
        console.error('[autobio] command error:', error.message);
        await sock.sendMessage(chatId, { text: style.error('Failed to process the autobio command.') }, { quoted: message });
    }
}

module.exports = {
    name: 'autobio',
    aliases: ['setbio', 'biosaver'],
    category: 'owner',
    description: 'Keep the bot About status updated with a live clock',
    usage: '.autobio on|off|set <text>',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await handleAutobioCommand(sock, extra.chatId, message, args, extra.senderId);
    },
    handleAutobioCommand,
    initAutobio,
    stopAutobio,
    loadState,
    render,
    DEFAULT_TEMPLATE,
};
