// Command-interface verification for the Optimus AI commands.
//
// Purpose: prove that every AI command is reachable and correctly parsed
// through the SAME dispatch contract main.js uses — NOT just by calling a
// function directly. We feed a raw message string, derive commandName + args
// exactly like main.js (handleMessages, lines ~308-312), look the command up
// in a registry built from the real command modules, build the real `extra`
// object shape, and invoke `command.execute(sock, message, args, extra)`.
//
// Network + media layers are mocked (lib/ai, @whiskeysockets/baileys,
// sharp, pdf-parse) so this verifies PARSING + ROUTING + DISPATCH with zero
// network calls and zero API keys. It does NOT certify live provider health —
// that is the job of smoke-ai-live.js.
//
// Commands covered (13):  .gpt .gemini .openai .imagine .gptimage
//                         .magicstudio .reply .rewrite .stt .voicesummary
//                         .summarize .study .aistatus
//
// Run: node scripts/verify-ai-commands.js

const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const PREFIX = '.';

// ---------------------------------------------------------------------------
// Mocks (installed via Module._load BEFORE any command module is required)
// ---------------------------------------------------------------------------
const MOCK_AI = {
    chat: async () => 'MOCK_CHAT_RESPONSE',
    chatGroq: async () => 'MOCK_GROQ',
    chatGemini: async () => 'MOCK_GEMINI',
    chatOpenAI: async () => 'MOCK_OPENAI',
    chatGeminiVision: async () => 'MOCK_VISION_ANALYSIS',
    generateImage: async () => Buffer.from('x'.repeat(200)),
    generateImageEdit: async () => Buffer.from('x'.repeat(200)),
    generateImagePixazo: async () => null,
    generateImageGemini: async () => Buffer.from('x'.repeat(200)),
    speechToText: async () => 'MOCK_TRANSCRIPT',
};

// pdf-parse returns this text at call time (mutable per test).
let MOCK_PDF_TEXT = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5);

const MOCK_BAILEYS = {
    downloadMediaMessage: async () => Buffer.from('A'.repeat(80)),
};

function MOCK_SHARP() {
    return {
        metadata: async () => ({ format: 'jpeg' }),
        jpeg: () => ({ toBuffer: async () => Buffer.from('x'.repeat(80)) }),
    };
}

const MOCK_PDF_PARSE = async () => ({ text: MOCK_PDF_TEXT });
const MOCK_MAMMOTH = { extractRawText: async () => ({ value: '' }) };

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    switch (request) {
        case '../../lib/ai':
        case '../lib/ai':
        case './ai':
            return MOCK_AI;
        case '@whiskeysockets/baileys':
            return MOCK_BAILEYS;
        case 'sharp':
            return MOCK_SHARP;
        case 'pdf-parse':
            return MOCK_PDF_PARSE;
        case 'mammoth':
            return MOCK_MAMMOTH;
        default:
            return originalLoad.apply(this, arguments);
    }
};

// ---------------------------------------------------------------------------
// Load real command modules (AI category + owner/aistatus)
// ---------------------------------------------------------------------------
function loadRegistry() {
    const registry = new Map();
    const dirs = [
        path.join(ROOT, 'commands', 'ai'),
        path.join(ROOT, 'commands', 'owner'),
    ];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
            const mod = require(path.join(dir, file));
            if (!mod || typeof mod.name !== 'string' || typeof mod.execute !== 'function') continue;
            if (!registry.has(mod.name)) registry.set(mod.name, mod);
            for (const alias of mod.aliases || []) {
                if (!registry.has(alias)) registry.set(alias, mod);
            }
        }
    }
    return registry;
}

// ---------------------------------------------------------------------------
// Replicate main.js command parsing EXACTLY
// ---------------------------------------------------------------------------
function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parse(rawText) {
    const userMessage = rawText.toLowerCase().trim()
        .replace(new RegExp(`^${escapeRegex(PREFIX)}\\s+`), PREFIX);
    const commandName = userMessage.slice(PREFIX.length).trim().split(/\s+/)[0] || '';
    let rawAfterPrefix = rawText.trim().replace(new RegExp(`^${escapeRegex(PREFIX)}\\s*`), '');
    const args = rawAfterPrefix.split(/\s+/).slice(1).filter(a => a.length > 0);
    return { commandName, args, userMessage };
}

// ---------------------------------------------------------------------------
// Fake WhatsApp socket — captures every sendMessage
// ---------------------------------------------------------------------------
function makeSock() {
    const sent = [];
    return {
        sent,
        user: { id: '1234567890@s.whatsapp.net' },
        sendMessage: async (chatId, content, opts) => {
            sent.push({ chatId, content, opts });
            return { key: { id: 'sent-' + sent.length } };
        },
        updateMediaMessage: async () => ({}),
        updateBlockStatus: async () => ({}),
    };
}

// Extract the raw text from a message the same way main.js does (rawText).
function extractRawText(message) {
    return (
        message?.message?.conversation?.trim()
        || message?.message?.extendedTextMessage?.text?.trim()
        || message?.message?.imageMessage?.caption?.trim()
        || message?.message?.videoMessage?.caption?.trim()
        || ''
    );
}

function buildExtra(command, sock, chatId, commandName, fromMe) {
    const senderId = '923701609799@s.whatsapp.net';
    const isOwner = !!fromMe;
    const channelInfo = { contextInfo: {} };
    return {
        chatId,
        senderId,
        isGroup: false,
        isSenderAdmin: false,
        isBotAdmin: false,
        senderIsSudo: isOwner,
        senderIsOwnerOrSudo: isOwner,
        isOwnerOrSudoCheck: isOwner,
        userMessage: PREFIX + commandName,
        rawText: PREFIX + commandName,
        prefix: PREFIX,
        commandName,
        channelInfo,
        isPublic: true,
        reply: (content, options = {}) => sock.sendMessage(
            chatId,
            typeof content === 'string' ? { text: content, ...channelInfo } : content,
            { quoted: {}, ...options }
        ),
    };
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------
const CHAT = '1234567890@s.whatsapp.net';

function textMessage(text) {
    return {
        key: { remoteJid: CHAT, fromMe: true, id: 'm' + Math.random() },
        message: { conversation: text },
    };
}

function quotedTextMessage(cmd, quotedText) {
    return {
        key: { remoteJid: CHAT, fromMe: true, id: 'm' + Math.random() },
        message: {
            extendedTextMessage: {
                text: cmd,
                contextInfo: { quotedMessage: { conversation: quotedText } },
            },
        },
    };
}

function quotedAudioMessage(cmd, mimetype = 'audio/ogg') {
    return {
        key: { remoteJid: CHAT, fromMe: true, id: 'm' + Math.random() },
        message: {
            extendedTextMessage: {
                text: cmd,
                contextInfo: { quotedMessage: { audioMessage: { mimetype } } },
            },
        },
    };
}

function quotedImageMessage(cmd) {
    return {
        key: { remoteJid: CHAT, fromMe: true, id: 'm' + Math.random() },
        message: {
            extendedTextMessage: {
                text: cmd,
                contextInfo: { quotedMessage: { imageMessage: { mimetype: 'image/jpeg' } } },
            },
        },
    };
}

function documentMessage(cmd, fileName) {
    return {
        key: { remoteJid: CHAT, fromMe: true, id: 'm' + Math.random() },
        message: {
            extendedTextMessage: { text: cmd, contextInfo: {} },
            documentMessage: { fileName, mimetype: 'application/pdf' },
        },
    };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const registry = loadRegistry();

// Each test: raw text + a message object + whether owner context is needed.
// `setup` lets a test configure mocks (e.g. scanned-PDF behaviour) first.
const TESTS = [
    { cmd: '.gpt', label: '.gpt (parse + dispatch, Groq→Gemini chain)', msg: textMessage('.gpt What is quantum computing?'), owner: false },
    { cmd: '.gemini', label: '.gemini (alias of gpt, Gemini→Groq chain)', msg: textMessage('.gemini Explain gravity'), owner: false },
    { cmd: '.openai', label: '.openai (OpenAI-compatible custom model)', msg: textMessage('.openai What is quantum computing?'), owner: false },
    { cmd: '.imagine', label: '.imagine (text→image)', msg: textMessage('.imagine a red sports car'), owner: false },
    { cmd: '.gptimage', label: '.gptimage (reply-to-image edit)', msg: quotedImageMessage('.gptimage turn the sky purple'), owner: false },
    { cmd: '.magicstudio', label: '.magicstudio (alias magic/magicai/generate)', msg: textMessage('.magicstudio a fantasy castle'), owner: false },
    { cmd: '.reply', label: '.reply (quoted text + mode)', msg: quotedTextMessage('.reply polite', 'Thanks for the help earlier!'), owner: false },
    { cmd: '.rewrite', label: '.rewrite (inline text + mode)', msg: textMessage('.rewrite formal please confirm the meeting time'), owner: false },
    { cmd: '.stt', label: '.stt (reply-to-audio transcription)', msg: quotedAudioMessage('.stt'), owner: false },
    { cmd: '.voicesummary', label: '.voicesummary (reply-to-audio + summary)', msg: quotedAudioMessage('.voicesummary'), owner: false },
    { cmd: '.summarize', label: '.summarize (reply-to-text TL;DR)', msg: quotedTextMessage('.summarize', 'The quick brown fox jumps over the lazy dog repeatedly.'), owner: false },
    {
        cmd: '.study', label: '.study (text PDF → chat analysis)', msg: documentMessage('.study', 'notes.pdf'), owner: false,
        setup: () => { MOCK_PDF_TEXT = 'Chapter 1: Photosynthesis. Plants convert sunlight into chemical energy. '.repeat(6); },
    },
    {
        cmd: '.study', label: '.study (scanned/image PDF → graceful vision fallback)', msg: documentMessage('.study', 'scan.pdf'), owner: false,
        setup: () => { MOCK_PDF_TEXT = ''; }, // forces the scanned path; pdf-to-img absent → graceful message
    },
    { cmd: '.aistatus', label: '.aistatus (owner-only status, no network)', msg: textMessage('.aistatus'), owner: true },
];

let passed = 0;
let failed = 0;
const failures = [];

async function runTest(t) {
    // Parse from the REAL message text, exactly like main.js, so multi-word
    // arguments and alias resolution are genuinely exercised.
    const rawText = extractRawText(t.msg);
    const { commandName, args } = parse(rawText);
    const command = registry.get(commandName);
    if (!command) {
        failed++;
        failures.push(`${t.label} — command "${commandName}" not found in registry`);
        console.log('  ❌ ' + t.label + ' — command not registered');
        return;
    }
    if (t.setup) t.setup();
    const sock = makeSock();
    const extra = buildExtra(command, sock, CHAT, commandName, t.owner);
    try {
        await command.execute(sock, t.msg, args, extra);
    } catch (e) {
        failed++;
        failures.push(`${t.label} — threw: ${e.message}`);
        console.log('  ❌ ' + t.label + ' — threw: ' + e.message);
        return;
    }
    const nonEmpty = sock.sent.some(s => {
        const c = s.content || {};
        if (typeof c === 'string') return c.length > 0;
        if (c.text) return c.text.length > 0;
        if (c.image) return Buffer.isBuffer(c.image) && c.image.length > 0;
        return false;
    });
    if (sock.sent.length === 0) {
        failed++;
        failures.push(`${t.label} — produced no reply`);
        console.log('  ❌ ' + t.label + ' — no reply produced');
    } else if (!nonEmpty) {
        failed++;
        failures.push(`${t.label} — reply was empty`);
        console.log('  ❌ ' + t.label + ' — empty reply');
    } else {
        passed++;
        const kinds = sock.sent.map(s => (s.content && s.content.image ? 'image' : 'text')).join(',');
        console.log(`  ✅ ${t.label}  [args=${JSON.stringify(args)} · sends=${sock.sent.length} (${kinds})]`);
    }
}

(async () => {
    console.log('══════════════════════════════════════════════');
    console.log(' Optimus Bot — AI COMMAND INTERFACE verification');
    console.log(' (real command modules · main.js parsing · mocked providers)');
    console.log('══════════════════════════════════════════════');
    console.log(`Registry: ${registry.size} names/aliases loaded`);
    for (const t of TESTS) {
        await runTest(t);
    }

    console.log('\n══════════════════════════════════════════════');
    console.log(` RESULT: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        console.log('\nFailures:');
        for (const f of failures) console.log('  • ' + f);
        process.exit(1);
    }
    console.log('✅ All 13 AI commands parse and dispatch correctly through the Optimus command interface.');
    process.exit(0);
})();
