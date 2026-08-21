// AI Config centralization + AI Status command smoke test.
// Verifies:
//   1. lib/aiConfig.js loads with the capability-based structure (text/speech/image/isProviderReady/timeouts).
//   2. No model config contains credentials or secrets.
//   3. lib/ai.js imports imageGeneration.js (no dead-code image service).
//   4. .aistatus command loads with correct metadata.
//   5. .aistatus is owner-only.
//   6. Model IDs are centralized (not hardcoded in ai.js).
// Usage: node scripts/smoke-ai-config.js

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const ROOT = path.join(__dirname, '..');

// ── 1. aiConfig loads and has expected capability-based shape ────────
const aiConfig = require(path.join(ROOT, 'lib', 'aiConfig'));

check('aiConfig.text exists', !!aiConfig.text);
check('aiConfig.speech exists', !!aiConfig.speech);
check('aiConfig.image exists', !!aiConfig.image);
check('aiConfig.image.primary exists', !!aiConfig.image.primary);
check('Array.isArray(aiConfig.image.fallbacks)', Array.isArray(aiConfig.image.fallbacks));
check('aiConfig.image.fallbacks.length >= 2', aiConfig.image.fallbacks.length >= 2);
check('typeof aiConfig.isProviderReady === function', typeof aiConfig.isProviderReady === 'function');
check('aiConfig.timeouts exists', !!aiConfig.timeouts);

// ── 2. Text provider configuration ───────────────────────────────────
check('text.provider is non-empty string',
    typeof aiConfig.text.provider === 'string' && aiConfig.text.provider.length > 0);
check('text.model is non-empty string',
    typeof aiConfig.text.model === 'string' && aiConfig.text.model.length > 0);
check('text.fallback.provider is non-empty string',
    typeof aiConfig.text.fallback?.provider === 'string' && aiConfig.text.fallback.provider.length > 0);
check('text.fallback.model is non-empty string',
    typeof aiConfig.text.fallback?.model === 'string' && aiConfig.text.fallback.model.length > 0);

// ── 3. Speech provider configuration ─────────────────────────────────
check('speech.provider is non-empty string',
    typeof aiConfig.speech.provider === 'string' && aiConfig.speech.provider.length > 0);
check('speech.model is non-empty string',
    typeof aiConfig.speech.model === 'string' && aiConfig.speech.model.length > 0);

// ── 4. Image provider configuration ──────────────────────────────────
check('image.primary.provider is non-empty string',
    typeof aiConfig.image.primary.provider === 'string' && aiConfig.image.primary.provider.length > 0);
check('image.primary.model is non-empty string',
    typeof aiConfig.image.primary.model === 'string' && aiConfig.image.primary.model.length > 0);
check('image.primary.url is non-empty string',
    typeof aiConfig.image.primary.url === 'string' && aiConfig.image.primary.url.length > 0);

// Fallback providers
const [cf, pollinations] = aiConfig.image.fallbacks;
check('fallback #1 is Cloudflare',
    cf && typeof cf.provider === 'string' && cf.provider === 'cloudflare');
check('fallback #1 has model',
    cf && typeof cf.model === 'string' && cf.model.length > 0);
check('fallback #2 is Pollinations',
    pollinations && typeof pollinations.provider === 'string' && pollinations.provider === 'pollinations');
check('fallback #2 has model',
    pollinations && typeof pollinations.model === 'string' && pollinations.model.length > 0);

// ── 5. Timeout configuration ─────────────────────────────────────────
check('timeouts.text is a number',
    typeof aiConfig.timeouts.text === 'number' && aiConfig.timeouts.text > 0);
check('timeouts.speech is a number',
    typeof aiConfig.timeouts.speech === 'number' && aiConfig.timeouts.speech > 0);
check('timeouts.image.gemini is a number',
    typeof aiConfig.timeouts.image?.gemini === 'number' && aiConfig.timeouts.image.gemini > 0);
check('timeouts.image.cloudflare is a number',
    typeof aiConfig.timeouts.image?.cloudflare === 'number' && aiConfig.timeouts.image.cloudflare > 0);
check('timeouts.image.pollinations is a number',
    typeof aiConfig.timeouts.image?.pollinations === 'number' && aiConfig.timeouts.image.pollinations > 0);

// ── 6. isProviderReady function works ─────────────────────────────────
check('isProviderReady("pollinations") === true',
    aiConfig.isProviderReady('pollinations') === true);
check('isProviderReady("invalid") === false',
    aiConfig.isProviderReady('invalid') === false);

// ── 7. No credentials in model config ────────────────────────────────
const configStr = JSON.stringify(aiConfig);
check('No API keys in aiConfig', !configStr.includes('API_KEY') && !configStr.includes('api_key'));
check('No Bearer tokens in aiConfig', !configStr.includes('Bearer'));
check('No sk- prefixed tokens in aiConfig', !configStr.includes('sk-'));

// ── 8. lib/ai.js imports imageGeneration.js (no dead code) ───────────
const aiSrc = fs.readFileSync(path.join(ROOT, 'lib', 'ai.js'), 'utf8');
check('ai.js imports aiConfig', aiSrc.includes("require('./aiConfig')"));
check('ai.js imports imageGeneration.js', aiSrc.includes("require('./imageGeneration')"));
check('ai.js imports settings', aiSrc.includes("require('../settings')"));

// ── 9. Model IDs are centralized (not hardcoded in ai.js) ────────────
check('No hardcoded openai/gpt-oss-120b in ai.js', !aiSrc.includes("'openai/gpt-oss-120b'"));
check('No hardcoded whisper-large-v3-turbo in ai.js', !aiSrc.includes("'whisper-large-v3-turbo'"));
check('No hardcoded gemini-2.5-flash in ai.js', !aiSrc.includes("'gemini-2.5-flash'"));
check('No hardcoded gemini-3.1-flash-image in ai.js', !aiSrc.includes("'gemini-3.1-flash-image'"));
check('No hardcoded flux-1-schnell in ai.js', !aiSrc.includes("'flux-1-schnell'"));

// ── 10. Expected model IDs match known values ────────────────────────
check('text model is openai/gpt-oss-120b', aiConfig.text.model === 'openai/gpt-oss-120b');
check('speech model is whisper-large-v3-turbo', aiConfig.speech.model === 'whisper-large-v3-turbo');
check('image primary model is gemini-3.1-flash-image', aiConfig.image.primary.model === 'gemini-3.1-flash-image');

// ── 11. .aistatus command loads ──────────────────────────────────────
const aistatus = require(path.join(ROOT, 'commands', 'owner', 'aistatus'));
check('aistatus command loaded', !!aistatus);
check('aistatus.name === "aistatus"', aistatus.name === 'aistatus');
check('aistatus.category === "owner"', aistatus.category === 'owner');
check('aistatus.ownerOnly === true', aistatus.ownerOnly === true);
check('aistatus has execute function', typeof aistatus.execute === 'function');

// ── 12. aistatus aliases ─────────────────────────────────────────────
check('aistatus.aliases includes "aistat"', (aistatus.aliases || []).includes('aistat'));

// ── 13. Legacy model IDs not present ─────────────────────────────────
check('No legacy llama-3.3-70b-versatile in config', !configStr.includes('llama-3.3-70b-versatile'));
check('No legacy gemini-2.0-flash in config', !configStr.includes('gemini-2.0-flash'));

// ── 14. Old flat structure no longer exported ────────────────────────
check('No aiConfig.groq export', !('groq' in aiConfig));
check('No aiConfig.gemini export', !('gemini' in aiConfig));
check('No aiConfig.pixazo export', !('pixazo' in aiConfig));

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n── AI Config: ${pass}/${pass + fail} checks passed ──`);
process.exit(fail > 0 ? 1 : 0);
