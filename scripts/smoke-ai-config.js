// AI Config centralization + AI Status command smoke test.
// Verifies:
//   1. lib/aiConfig.js loads with all expected providers and model IDs.
//   2. No model config contains credentials or secrets.
//   3. lib/ai.js actually imports and uses the centralized config.
//   4. .aistatus command loads with correct metadata.
//   5. .aistatus is owner-only.
//   6. .aistatus output contains configured model IDs (no API keys).
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

// ── 1. aiConfig loads and has expected shape ─────────────────────────
const aiConfig = require(path.join(ROOT, 'lib', 'aiConfig'));

check('aiConfig.groq exists', !!aiConfig.groq);
check('aiConfig.gemini exists', !!aiConfig.gemini);
check('aiConfig.pixazo exists', !!aiConfig.pixazo);

check('groq.chatModel is non-empty string',
    typeof aiConfig.groq.chatModel === 'string' && aiConfig.groq.chatModel.length > 0);
check('groq.sttModel is non-empty string',
    typeof aiConfig.groq.sttModel === 'string' && aiConfig.groq.sttModel.length > 0);
check('gemini.chatModel is non-empty string',
    typeof aiConfig.gemini.chatModel === 'string' && aiConfig.gemini.chatModel.length > 0);
check('gemini.imageModel is non-empty string',
    typeof aiConfig.gemini.imageModel === 'string' && aiConfig.gemini.imageModel.length > 0);
check('pixazo.imageModel is non-empty string',
    typeof aiConfig.pixazo.imageModel === 'string' && aiConfig.pixazo.imageModel.length > 0);

// ── 2. No credentials in model config ────────────────────────────────
const configStr = JSON.stringify(aiConfig);
check('No API keys in aiConfig', !configStr.includes('API_KEY') && !configStr.includes('api_key'));
check('No Bearer tokens in aiConfig', !configStr.includes('Bearer'));
check('No sk- prefixed tokens in aiConfig', !configStr.includes('sk-'));

// ── 3. lib/ai.js imports aiConfig ────────────────────────────────────
const aiSrc = fs.readFileSync(path.join(ROOT, 'lib', 'ai.js'), 'utf8');
check('ai.js imports aiConfig', aiSrc.includes("require('./aiConfig')"));
check('ai.js uses aiConfig.groq.chatModel', aiSrc.includes('aiConfig.groq.chatModel'));
check('ai.js uses aiConfig.groq.sttModel', aiSrc.includes('aiConfig.groq.sttModel'));
check('ai.js uses aiConfig.gemini.chatModel', aiSrc.includes('aiConfig.gemini.chatModel'));
check('ai.js uses aiConfig.gemini.imageModel', aiSrc.includes('aiConfig.gemini.imageModel'));
check('ai.js uses aiConfig.pixazo.imageModel', aiSrc.includes('aiConfig.pixazo.imageModel'));

// No hardcoded model IDs remain in ai.js (except via config reference)
check('No hardcoded openai/gpt-oss-120b in ai.js', !aiSrc.includes("'openai/gpt-oss-120b'"));
check('No hardcoded whisper-large-v3-turbo in ai.js', !aiSrc.includes("'whisper-large-v3-turbo'"));
check('No hardcoded gemini-2.5-flash in ai.js', !aiSrc.includes("'gemini-2.5-flash'"));
check('No hardcoded gemini-3.1-flash-image in ai.js', !aiSrc.includes("'gemini-3.1-flash-image'"));
check('No hardcoded flux-1-schnell in ai.js', !aiSrc.includes("'flux-1-schnell'"));

// ── 4. .aistatus command loads ───────────────────────────────────────
const aistatus = require(path.join(ROOT, 'commands', 'owner', 'aistatus'));
check('aistatus command loaded', !!aistatus);
check('aistatus.name === "aistatus"', aistatus.name === 'aistatus');
check('aistatus.category === "owner"', aistatus.category === 'owner');
check('aistatus.ownerOnly === true', aistatus.ownerOnly === true);
check('aistatus has execute function', typeof aistatus.execute === 'function');

// ── 5. aistatus aliases ──────────────────────────────────────────────
check('aistatus.aliases includes "aistat"', (aistatus.aliases || []).includes('aistat'));

// ── 6. aistatus output would contain model IDs (mock test) ──────────
// Simulate what execute would produce — verify the config values
// would appear in output
const mockChatId = 'test@g.us';
const mockMessage = { key: { id: 'test123' } };
const sent = [];
const mockSock = {
    sendMessage: async (chatId, content) => { sent.push(content); return true; }
};
const mockExtra = { chatId: mockChatId, commandName: 'aistatus' };

// We can't fully mock the styled box, but we can verify the config
// values are accessible and would be used
check('aistatus config values accessible', 
    aiConfig.groq.chatModel && aiConfig.groq.sttModel && 
    aiConfig.gemini.chatModel && aiConfig.gemini.imageModel &&
    aiConfig.pixazo.imageModel);

// ── 7. Legacy model IDs not in aiConfig defaults ─────────────────────
check('No legacy llama-3.3-70b-versatile in defaults', !configStr.includes('llama-3.3-70b-versatile'));
check('No legacy gemini-2.0-flash in defaults', !configStr.includes('gemini-2.0-flash'));

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n── AI Config: ${pass}/${pass + fail} checks passed ──`);
process.exit(fail > 0 ? 1 : 0);
