// Smoke test for the CURRENT capability-based AI model configuration.
//
// Validates lib/aiConfig.js — the single source of truth for model IDs,
// provider fallback chains, and readiness gating.
//
// This is intentionally strict: it asserts the CURRENT schema (text / speech /
// image.primary + image.fallbacks + isProviderReady + timeouts). It does NOT
// fall back to the obsolete pre-migration schema (chatModel / sttModel /
// imageModel / pixazo). It ALSO guards against the old schema leaking back, so
// the migration can't silently regress.
//
// Run: node scripts/smoke-models.js

const path = require('path');
const fs = require('fs');

const settings = require('../settings');
const aiConfig = require('../lib/aiConfig');

const aiConfigSrc = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'aiConfig.js'),
    'utf8'
);

// ---------------------------------------------------------------------------
// Tiny assert framework
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
    if (cond) {
        passed++;
        console.log('  ✅ ' + name);
    } else {
        failed++;
        failures.push(name + (detail ? ' — ' + detail : ''));
        console.log('  ❌ ' + name + (detail ? ' — ' + detail : ''));
    }
}

function eq(name, actual, expected) {
    check(name, actual === expected, `expected "${expected}", got "${actual}"`);
}

console.log('══════════════════════════════════════════════');
console.log(' Optimus Bot — AI MODEL CONFIG validation');
console.log(' (capability-based schema: text / speech / image)');
console.log('══════════════════════════════════════════════');

// ---------------------------------------------------------------------------
// 1. Capability blocks exist (schema shape)
// ---------------------------------------------------------------------------
console.log('\n[1] Schema shape');
check('aiConfig.text is an object', typeof aiConfig.text === 'object' && aiConfig.text !== null);
check('aiConfig.speech is an object', typeof aiConfig.speech === 'object' && aiConfig.speech !== null);
check('aiConfig.image is an object', typeof aiConfig.image === 'object' && aiConfig.image !== null);
check('aiConfig.image.primary is an object', typeof aiConfig.image.primary === 'object' && aiConfig.image.primary !== null);
check('aiConfig.image.fallbacks is an array', Array.isArray(aiConfig.image.fallbacks));
check('aiConfig.isProviderReady is a function', typeof aiConfig.isProviderReady === 'function');
check('aiConfig.timeouts is an object', typeof aiConfig.timeouts === 'object' && aiConfig.timeouts !== null);

// ---------------------------------------------------------------------------
// 2. CURRENT TEXT model IDs
// ---------------------------------------------------------------------------
console.log('\n[2] Text model IDs (current)');
eq('text.primary.model', aiConfig.text.model, 'openai/gpt-oss-120b');
eq('text.primary.provider', aiConfig.text.provider, 'groq');
check('text.fallback exists', typeof aiConfig.text.fallback === 'object' && aiConfig.text.fallback !== null);
eq('text.fallback.provider', aiConfig.text.fallback.provider, 'gemini');
eq('text.fallback.model', aiConfig.text.fallback.model, 'gemini-2.5-flash');

// OpenAI-Compatible custom chat provider (optional, configured via settings)
check('text.custom exists', typeof aiConfig.text.custom === 'object' && aiConfig.text.custom !== null);
eq('text.custom.provider', aiConfig.text.custom && aiConfig.text.custom.provider, 'openai');
check('text.custom.model is a non-empty string',
    typeof (aiConfig.text.custom && aiConfig.text.custom.model) === 'string'
        && aiConfig.text.custom.model.length > 0,
    aiConfig.text.custom && aiConfig.text.custom.model);

// ---------------------------------------------------------------------------
// 3. CURRENT SPEECH model ID
// ---------------------------------------------------------------------------
console.log('\n[3] Speech model ID (current)');
eq('speech.provider', aiConfig.speech.provider, 'groq');
eq('speech.model', aiConfig.speech.model, 'whisper-large-v3-turbo');

// ---------------------------------------------------------------------------
// 4. CURRENT IMAGE model ID + provider fallback chain
// ---------------------------------------------------------------------------
console.log('\n[4] Image model ID (current) + fallback chain');
eq('image.primary.provider', aiConfig.image.primary.provider, 'gemini');
eq('image.primary.model', aiConfig.image.primary.model, 'gemini-3.1-flash-image');
check(
    'image.primary.url is the Gemini Interactions API',
    typeof aiConfig.image.primary.url === 'string'
        && aiConfig.image.primary.url.includes('generativelanguage.googleapis.com')
        && aiConfig.image.primary.url.includes('/v1beta/interactions'),
    aiConfig.image.primary.url
);

check('image fallback chain has >= 2 providers', aiConfig.image.fallbacks.length >= 2,
    `got ${aiConfig.image.fallbacks.length}`);

const fb1 = aiConfig.image.fallbacks[0];
const fb2 = aiConfig.image.fallbacks[1];
check('fallback #1 is Cloudflare', fb1 && fb1.provider === 'cloudflare', fb1 && fb1.provider);
eq('fallback #1 model', fb1 && fb1.model, '@cf/black-forest-labs/flux-1-schnell');
check('fallback #1 has a URL', fb1 && typeof fb1.url === 'string' && fb1.url.includes('cloudflare.com'));
check('fallback #2 is Pollinations', fb2 && fb2.provider === 'pollinations', fb2 && fb2.provider);
eq('fallback #2 model', fb2 && fb2.model, 'flux');
check('fallback #2 has a URL', fb2 && typeof fb2.url === 'string' && fb2.url.includes('pollinations.ai'));

// ---------------------------------------------------------------------------
// 5. Provider fallback configuration integrity
// ---------------------------------------------------------------------------
console.log('\n[5] Fallback configuration integrity');
// Text: primary groq -> fallback gemini (distinct providers)
check('text primary & fallback are distinct providers',
    aiConfig.text.provider !== aiConfig.text.fallback.provider);
// Image: ordered gemini -> cloudflare -> pollinations, all distinct
const imgProviders = [aiConfig.image.primary.provider, ...aiConfig.image.fallbacks.map(f => f.provider)];
check('image provider chain = gemini,cloudflare,pollinations',
    JSON.stringify(imgProviders) === JSON.stringify(['gemini', 'cloudflare', 'pollinations']),
    imgProviders.join(','));
const uniq = new Set(imgProviders);
check('image providers are all distinct', uniq.size === imgProviders.length);

// ---------------------------------------------------------------------------
// 6. Readiness configuration (gating logic)
// ---------------------------------------------------------------------------
console.log('\n[6] Readiness configuration (isProviderReady)');
check('pollinations is always ready (no key)', aiConfig.isProviderReady('pollinations') === true);
check('unknown provider is never ready', aiConfig.isProviderReady('does-not-exist') === false);

// Hermetic gate checks: each credential is explicitly driven to its placeholder
// state (and back) so these assertions hold whether or not real keys happen to
// be configured in the current environment. Raw credential values are NEVER
// printed — only masked/summarised.
function maskCred(v) {
    if (!v) return '(empty)';
    const s = String(v);
    if (s.startsWith('YOUR_')) return '(placeholder)';
    return s.slice(0, 3) + '••••' + s.slice(-3);
}

const savedCreds = {
    groq: settings.groqApiKey,
    gemini: settings.geminiApiKey,
    cfAcc: settings.cloudflareAccountId,
    cfTok: settings.cloudflareApiToken,
    openai: settings.openaiApiKey,
};

// --- placeholders => NOT ready ---
settings.groqApiKey = 'YOUR_GROQ_API_KEY';
check('groq not ready with placeholder key',
    aiConfig.isProviderReady('groq') === false, `key=${maskCred(settings.groqApiKey)}`);

settings.geminiApiKey = 'YOUR_GEMINI_API_KEY';
check('gemini not ready with placeholder key',
    aiConfig.isProviderReady('gemini') === false, `key=${maskCred(settings.geminiApiKey)}`);

settings.cloudflareAccountId = 'YOUR_CLOUDFLARE_ACCOUNT_ID';
settings.cloudflareApiToken = 'YOUR_CLOUDFLARE_API_TOKEN';
check('cloudflare not ready with placeholder creds',
    aiConfig.isProviderReady('cloudflare') === false, 'both creds placeholder');

settings.openaiApiKey = 'YOUR_OPENAI_API_KEY';
check('openai not ready with placeholder key',
    aiConfig.isProviderReady('openai') === false, `key=${maskCred(settings.openaiApiKey)}`);

// --- real-looking values => ready, and back to placeholder => not ready ---
settings.groqApiKey = 'sk-real-key-abc123';
check('groq becomes ready with a real key', aiConfig.isProviderReady('groq') === true);
settings.groqApiKey = 'YOUR_GROQ_API_KEY';
check('groq reverts to not-ready with placeholder again', aiConfig.isProviderReady('groq') === false);

settings.geminiApiKey = 'AIzaSy-real-key-here';
check('gemini becomes ready with a real key', aiConfig.isProviderReady('gemini') === true);
settings.geminiApiKey = 'YOUR_GEMINI_API_KEY';
check('gemini reverts to not-ready with placeholder again', aiConfig.isProviderReady('gemini') === false);

settings.openaiApiKey = 'sk-openai-real-123';
check('openai becomes ready with a real key', aiConfig.isProviderReady('openai') === true);
settings.openaiApiKey = 'YOUR_OPENAI_API_KEY';
check('openai reverts to not-ready with placeholder again', aiConfig.isProviderReady('openai') === false);

// --- Cloudflare needs BOTH account id and token ---
settings.cloudflareAccountId = 'real-account-123';
settings.cloudflareApiToken = 'real-token-456';
check('cloudflare ready with both creds', aiConfig.isProviderReady('cloudflare') === true);

settings.cloudflareAccountId = 'real-account-123';
settings.cloudflareApiToken = 'YOUR_CLOUDFLARE_API_TOKEN';
check('cloudflare NOT ready with only account id', aiConfig.isProviderReady('cloudflare') === false);

settings.cloudflareAccountId = 'YOUR_CLOUDFLARE_ACCOUNT_ID';
settings.cloudflareApiToken = 'real-token-456';
check('cloudflare NOT ready with only token', aiConfig.isProviderReady('cloudflare') === false);

// --- Restore the environment's actual values so nothing downstream is affected ---
settings.groqApiKey = savedCreds.groq;
settings.geminiApiKey = savedCreds.gemini;
settings.cloudflareAccountId = savedCreds.cfAcc;
settings.cloudflareApiToken = savedCreds.cfTok;
settings.openaiApiKey = savedCreds.openai;

// ---------------------------------------------------------------------------
// 7. Guard: obsolete pre-migration schema must NOT be present
// ---------------------------------------------------------------------------
console.log('\n[7] Obsolete schema guard (migration completeness)');
check('no top-level chatModel key', !('chatModel' in aiConfig));
check('no top-level sttModel key', !('sttModel' in aiConfig));
check('no top-level imageModel key', !('imageModel' in aiConfig));
check('aiConfig source has no "chatModel:" field', !/chatModel\s*:/.test(aiConfigSrc));
check('aiConfig source has no "sttModel:" field', !/sttModel\s*:/.test(aiConfigSrc));
check('aiConfig source has no "imageModel:" field', !/imageModel\s*:/.test(aiConfigSrc));
check('aiConfig source has no "pixazo" model usage', !/pixazo/i.test(aiConfigSrc));

// Obsolete model IDs must not appear anywhere in the config source.
const OBSOLETE_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile',
    'gemini-2.0-flash',
    'gpt-4',
    'dall-e',
    'dall-e-3',
];
for (const m of OBSOLETE_MODELS) {
    check(`obsolete model "${m}" absent from config`, !aiConfigSrc.includes(m));
}

// ---------------------------------------------------------------------------
// 8. Timeout configuration sanity
// ---------------------------------------------------------------------------
console.log('\n[8] Timeout configuration');
check('timeouts.text is a positive number', typeof aiConfig.timeouts.text === 'number' && aiConfig.timeouts.text > 0);
check('timeouts.speech is a positive number', typeof aiConfig.timeouts.speech === 'number' && aiConfig.timeouts.speech > 0);
check('timeouts.image.gemini is a positive number', aiConfig.timeouts.image && aiConfig.timeouts.image.gemini > 0);
check('timeouts.image.cloudflare is a positive number', aiConfig.timeouts.image && aiConfig.timeouts.image.cloudflare > 0);
check('timeouts.image.pollinations is a positive number', aiConfig.timeouts.image && aiConfig.timeouts.image.pollinations > 0);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n══════════════════════════════════════════════');
console.log(` RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  • ' + f);
    process.exit(1);
}
console.log('✅ AI model configuration is valid and matches the current schema.');
process.exit(0);
