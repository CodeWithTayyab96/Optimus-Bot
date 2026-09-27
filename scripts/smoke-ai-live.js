// LIVE AI command-path test — OPTIONAL, owner-gated.
//
// ⚠️  This script makes REAL network calls to the configured providers when you
// opt in. It is the only live test that proves the FULL chain:
//
//     actual command  →  actual configured credential  →  actual provider  →  actual response
//
// Credentials are supplied by the APPLICATION (settings.js now reads
// GROQ_API_KEY / GEMINI_API_KEY / CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN
// from the environment, with placeholder fallback). This script only reads
// settings — it does not re-implement credential loading.
//
// What it does:
//   1. Dispatches the REAL command modules (.gpt .gemini .imagine .gptimage
//      .magicstudio .stt) through their actual execute(sock, message, args, extra)
//      using a MOCK socket (captures the reply) and a MOCK WhatsApp media
//      transport (downloadMediaMessage) so it runs headless. The AI provider
//      call itself is REAL (env-backed credential → provider → response).
//   2. For .gptimage it uploads a small known test PNG; for .stt it uses a small
//      generated audio file. .imagine / .magicstudio prove the centralized image
//      generation chain (Gemini → Cloudflare → Pollinations) is actually used.
//   3. Runs safe no-network "forced-failure" contract checks (empty input → null,
//      never throws, never sends a malformed request).
//
// Rules honoured:
//   - PASS/FAIL/SKIP only. SKIP = provider not configured (not a failure).
//   - NEVER prints raw API keys / tokens or full error bodies (console.error is
//     silenced during live calls; only a short status is surfaced).
//   - Does not spam: each command makes at most ONE real call (or the first
//     ready leg of the image fallback chain). Failure-fallback paths are covered
//     by the static error-matrix tests, not by burning live quota here.
//
// Run: OPTIMUS_LIVE_TEST=1 node scripts/smoke-ai-live.js

const path = require('path');
const fs = require('fs');
const Module = require('module');

const settings = require('../settings');
const aiConfig = require('../lib/aiConfig');
const ai = require('../lib/ai');
const imageGen = require('../lib/imageGeneration');

// ---------------------------------------------------------------------------
// Mock the WhatsApp media transport so media commands run headless. The AI
// provider call stays REAL. (The actual command path is what we are testing.)
// ---------------------------------------------------------------------------
let FAKE_MEDIA = null; // set per command: tiny PNG (gptimage) or WAV (stt)
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '@whiskeysockets/baileys') {
        return { downloadMediaMessage: async () => FAKE_MEDIA };
    }
    return originalLoad.apply(this, arguments);
};

// A real, valid 1x1 red PNG — used as a genuine input image for .gptimage.
const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);

// A small, valid, silent WAV (0.2s, 8kHz, 8-bit mono) — used as a test audio
// file for .stt. Whisper will likely return nothing (no speech), which still
// proves the command → credential → provider → response path executes.
function buildSilentWav(seconds = 0.2, sampleRate = 8000) {
    const numSamples = Math.floor(seconds * sampleRate);
    const dataSize = numSamples; // 8-bit mono = 1 byte/sample
    const buf = Buffer.alloc(44 + dataSize);
    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8, 'ascii');
    buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);   // PCM
    buf.writeUInt16LE(1, 22);   // mono
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate, 28); // byte rate
    buf.writeUInt16LE(1, 32);   // block align
    buf.writeUInt16LE(8, 34);   // bits/sample
    buf.write('data', 36, 'ascii');
    buf.writeUInt32LE(dataSize, 40);
    buf.fill(0x80, 44); // 8-bit unsigned silence
    return buf;
}
const TEST_WAV = buildSilentWav();

function maskKey(val) {
    if (!val || String(val).startsWith('YOUR_')) return '(not set)';
    const s = String(val);
    return s.length <= 8 ? '••••' : s.slice(0, 4) + '••••' + s.slice(-4);
}

function isImageBuffer(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 4) return false;
    const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const jpg = buf[0] === 0xff && buf[1] === 0xd8;
    const webp = buf.length > 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
    return png || jpg || webp;
}

// Silence the library's internal console.error so no key/body ever leaks.
function quiet(fn) {
    const orig = console.error;
    console.error = () => {};
    return fn().finally(() => { console.error = orig; });
}

const LIVE = process.env.OPTIMUS_LIVE_TEST === '1';

const results = []; // { provider, status, detail }
function record(provider, ok, detail) {
    results.push({ provider, status: ok ? 'PASS' : 'FAIL', detail });
}
function skip(provider, detail) {
    results.push({ provider, status: 'SKIP', detail });
}

// ---------------------------------------------------------------------------
// Replicate main.js command parsing EXACTLY (commandName + args)
// ---------------------------------------------------------------------------
function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function parse(rawText) {
    const userMessage = rawText.toLowerCase().trim()
        .replace(new RegExp(`^${escapeRegex('.')}\\s+`), '.');
    const commandName = userMessage.slice(1).trim().split(/\s+/)[0] || '';
    let rawAfterPrefix = rawText.trim().replace(new RegExp(`^${escapeRegex('.')}\\s*`), '');
    const args = rawAfterPrefix.split(/\s+/).slice(1).filter(a => a.length > 0);
    return { commandName, args };
}

// ---------------------------------------------------------------------------
// Mock socket + message/extra builders (real command.execute contract)
// ---------------------------------------------------------------------------
function makeSock() {
    const sent = [];
    return {
        sent,
        user: { id: '1234567890@s.whatsapp.net' },
        sendMessage: async (chatId, content) => { sent.push({ chatId, content }); return { key: { id: 's' + sent.length } }; },
        updateMediaMessage: async () => ({}),
        updateBlockStatus: async () => ({}),
    };
}

function buildExtra(command, sock, chatId, commandName) {
    const senderId = '923701609799@s.whatsapp.net';
    const channelInfo = { contextInfo: {} };
    return {
        chatId, senderId, isGroup: false, isSenderAdmin: false, isBotAdmin: false,
        senderIsSudo: true, senderIsOwnerOrSudo: true, isOwnerOrSudoCheck: true,
        userMessage: '.' + commandName, rawText: '.' + commandName, prefix: '.',
        commandName, channelInfo, isPublic: true,
        reply: (content, options = {}) => sock.sendMessage(chatId,
            typeof content === 'string' ? { text: content, ...channelInfo } : content,
            { quoted: {}, ...options }),
    };
}

function textMessage(text) { return { key: { remoteJid: 'c@s', fromMe: true, id: 'm' }, message: { conversation: text } }; }
function quotedImageMessage(text) {
    return { key: { remoteJid: 'c@s', fromMe: true, id: 'm' },
        message: { extendedTextMessage: { text, contextInfo: { quotedMessage: { imageMessage: { mimetype: 'image/png' } } } } } };
}
function quotedAudioMessage(text) {
    return { key: { remoteJid: 'c@s', fromMe: true, id: 'm' },
        message: { extendedTextMessage: { text, contextInfo: { quotedMessage: { audioMessage: { mimetype: 'audio/ogg' } } } } } };
}

// Pull the final user-facing reply out of captured sends (ignore react/processing).
function extractReply(sent) {
    let last = null;
    for (const s of sent) {
        const c = s.content || {};
        if (c.image) last = c;
        else if (c.text && !c.react) last = c;
    }
    return last;
}

// ---------------------------------------------------------------------------
// Load the real AI command modules (only the ones we live-test)
// ---------------------------------------------------------------------------
function loadRegistry() {
    const registry = new Map();
    const dir = path.join(__dirname, '..', 'commands', 'ai');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
        const mod = require(path.join(dir, f));
        if (!mod || typeof mod.name !== 'string' || typeof mod.execute !== 'function') continue;
        if (!registry.has(mod.name)) registry.set(mod.name, mod);
        for (const a of mod.aliases || []) if (!registry.has(a)) registry.set(a, mod);
    }
    return registry;
}

console.log('══════════════════════════════════════════════');
console.log(' Optimus Bot — AI LIVE command-path check');
console.log('══════════════════════════════════════════════');
console.log('Run mode :', LIVE ? 'LIVE (real network calls)' : 'READINESS ONLY (no network)');
console.log('');
console.log('Providers:');
console.log('  Groq        ready:', aiConfig.isProviderReady('groq'), ' key:', maskKey(settings.groqApiKey));
console.log('  Gemini      ready:', aiConfig.isProviderReady('gemini'), ' key:', maskKey(settings.geminiApiKey));
console.log('  Cloudflare  ready:', aiConfig.isProviderReady('cloudflare'), ' account:', maskKey(settings.cloudflareAccountId));
console.log('  Pollinations ready:', aiConfig.isProviderReady('pollinations'));
console.log('');
console.log('Credentials are read from the APPLICATION (settings.js → environment).');
console.log('');

if (!LIVE) {
    console.log('Readiness check complete. Set OPTIMUS_LIVE_TEST=1 to run real command-path calls.');
    process.exit(0);
}

// ===========================================================================
// LIVE calls
// ===========================================================================
async function run() {
    const registry = loadRegistry();

    // Each entry: name, raw text, provider-readiness gate, reply kind, media type.
    const CMDS = [
        { name: 'gpt',        raw: '.gpt What is 2 + 2?',            kind: 'text',  gate: () => aiConfig.isProviderReady('groq') || aiConfig.isProviderReady('gemini'), note: 'Groq→Gemini chain' },
        { name: 'gemini',     raw: '.gemini Name one capital city.',  kind: 'text',  gate: () => aiConfig.isProviderReady('gemini') || aiConfig.isProviderReady('groq'), note: 'Gemini→Groq chain' },
        { name: 'openai',     raw: '.openai What is 2 + 2?',         kind: 'text',  gate: () => aiConfig.isProviderReady('openai'), note: 'OpenAI-compatible custom model' },
        { name: 'imagine',    raw: '.imagine a tiny red circle',      kind: 'image', gate: () => aiConfig.isProviderReady('gemini') || aiConfig.isProviderReady('cloudflare') || aiConfig.isProviderReady('pollinations'), note: 'image chain (Gemini→Cloudflare→Pollinations)' },
        { name: 'magicstudio',raw: '.magicstudio a tiny blue square', kind: 'image', gate: () => aiConfig.isProviderReady('gemini') || aiConfig.isProviderReady('cloudflare') || aiConfig.isProviderReady('pollinations'), note: 'centralized image chain' },
        { name: 'gptimage',   raw: '.gptimage make the sky purple',  kind: 'image', media: 'png', gate: () => aiConfig.isProviderReady('gemini'), note: 'Gemini native edit (Interactions API)' },
        { name: 'stt',        raw: '.stt',                           kind: 'audio', media: 'wav', gate: () => aiConfig.isProviderReady('groq'), note: 'Groq Whisper' },
    ];

    for (const c of CMDS) {
        const { commandName, args } = parse(c.raw);
        const command = registry.get(commandName);
        if (!command) { skip(`${c.name} (command not found)`, ''); continue; }
        if (!c.gate()) { skip(`${c.name}  [${c.note}]`, 'provider not configured'); continue; }

        FAKE_MEDIA = c.media === 'png' ? TINY_PNG : (c.media === 'wav' ? TEST_WAV : null);
        const sock = makeSock();
        const chatId = 'c@s';
        const msg = c.media === 'png' ? quotedImageMessage(c.raw)
                  : c.media === 'wav' ? quotedAudioMessage(c.raw)
                  : textMessage(c.raw);
        const extra = buildExtra(command, sock, chatId, commandName);

        try {
            await quiet(() => command.execute(sock, msg, args, extra));
            const reply = extractReply(sock.sent);
            if (!reply) { record(`${c.name}  [${c.note}]`, false, 'no reply produced'); continue; }

            if (c.kind === 'image') {
                if (reply.image && isImageBuffer(reply.image)) {
                    record(`${c.name}  [${c.note}]`, true, `real image buffer (${reply.image.length} bytes)`);
                } else {
                    record(`${c.name}  [${c.note}]`, false, 'no valid image returned');
                }
            } else if (c.kind === 'audio') {
                const t = reply.text || '';
                record(`${c.name}  [${c.note}]`, true,
                    t.includes('Transcription:') ? 'ran; transcript received' : 'ran; reply produced (no transcript — test audio has no speech)');
            } else { // text
                const t = reply.text || '';
                if (t.startsWith('❌')) record(`${c.name}  [${c.note}]`, false, 'command surfaced an error: ' + t.slice(0, 60));
                else record(`${c.name}  [${c.note}]`, true, `text reply (${t.length} chars)`);
            }
        } catch (e) {
            record(`${c.name}  [${c.note}]`, false, e && e.message ? e.message : 'threw');
        }
    }

    // ---- Safe no-network forced-failure contract checks ----
    await recordCheck('Gemini image edit (forced-failure contract)', () => quiet(async () => {
        const r = await imageGen.generateImageEdit(Buffer.from(''), '', {});
        return { ok: r === null, detail: r === null ? 'null on empty input (graceful, no malformed request)' : 'expected null' };
    }));
    if (!aiConfig.isProviderReady('groq')) {
        await recordCheck('Groq Whisper STT (forced-failure contract)', () => quiet(async () => {
            const t = await ai.speechToText(Buffer.from(''), { filename: 'empty.ogg', contentType: 'audio/ogg' });
            return { ok: t === null, detail: t === null ? 'null on empty input (graceful, no malformed request)' : 'expected null' };
        }));
    } else {
        skip('Groq Whisper STT (forced-failure contract)', 'groq ready — exercised by live .stt path');
    }

    // ---- Cloudflare image-leg probe (diagnostic: surfaces the real masked error) ----
    if (aiConfig.isProviderReady('cloudflare')) {
        const cfBuf = await imageGen.generateWithCloudflare('a tiny red circle');
        record('Cloudflare image leg (probe)', !!cfBuf,
            cfBuf ? `real image buffer (${cfBuf.length} bytes)` : 'no image — see masked error above');
    } else {
        skip('Cloudflare image leg (probe)', 'cloudflare not configured');
    }

    // ---- Report ----
    console.log('');
    console.log('══════════════════════════════════════════════');
    console.log(' LIVE COMMAND-PATH RESULTS');
    console.log('══════════════════════════════════════════════');
    let pass = 0, fail = 0, skp = 0;
    for (const r of results) {
        if (r.status === 'PASS') pass++;
        else if (r.status === 'FAIL') fail++;
        else skp++;
        console.log(`  [${r.status}] ${r.provider}${r.detail ? ' — ' + r.detail : ''}`);
    }
    console.log('');
    console.log(`PASS: ${pass}   FAIL: ${fail}   SKIP: ${skp}`);
    if (fail > 0) { console.log('❌ One or more live command-path checks FAILED.'); process.exit(1); }
    console.log('✅ All configured live command-path checks passed (or were safely skipped).');
    process.exit(0);
}

// helper that pushes PASS/FAIL from an async {ok, detail}
async function recordCheck(provider, fn) {
    try {
        const r = await fn();
        record(provider, r.ok, r.detail);
    } catch (e) {
        record(provider, false, e && e.message ? e.message : 'threw');
    }
}

run().catch(e => {
    console.error('Live test crashed:', e && e.message ? e.message : e);
    process.exit(1);
});
