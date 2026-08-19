// Model availability smoke test.
// Verifies that configured AI model IDs are not dead/deprecated.
// Does NOT require network access or API keys.
// Usage: node scripts/smoke-models.js

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const ROOT = path.join(__dirname, '..');
const aiSrc = fs.readFileSync(path.join(ROOT, 'lib', 'ai.js'), 'utf8');
const configSrc = fs.readFileSync(path.join(ROOT, 'lib', 'aiConfig.js'), 'utf8');

// Combined source — check both files for dead models
const combinedSrc = aiSrc + '\n' + configSrc;

// ── Known DEAD/SHUT-DOWN model IDs (as of August 2026) ──────────────
const DEAD_MODELS = [
    // Groq — shut down August 16, 2026
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    // Groq — shut down earlier
    'qwen/qwen3-32b',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'moonshotai/kimi-k2-instruct-0905',
    'moonshotai/kimi-k2-instruct',
    'playai-tts',
    'playai-tts-arabic',
    // Gemini — shut down June 1, 2026
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash-lite-001',
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash-preview-image-generation',
    // Gemini — shut down earlier
    'gemini-1.5-flash',
    'gemini-1.5-pro',
];

// ── Known ACTIVE model IDs (as of August 2026) ──────────────────────
const EXPECTED_MODELS = {
    groq_text: 'openai/gpt-oss-120b',
    groq_stt: 'whisper-large-v3-turbo',
    gemini_text: 'gemini-2.5-flash',
    gemini_image: 'gemini-3.1-flash-image',
};

// ── Test 1: No dead models in source ─────────────────────────────────
for (const dead of DEAD_MODELS) {
    // Check if the dead model ID appears as a quoted string in either file
    const patterns = [`'${dead}'`, `"${dead}"`];
    const foundInAi = patterns.some(p => aiSrc.includes(p));
    const foundInConfig = patterns.some(p => configSrc.includes(p));
    check(`No dead model: ${dead}`, !foundInAi && !foundInConfig,
        foundInAi ? 'FOUND in ai.js' : foundInConfig ? 'FOUND in aiConfig.js' : undefined);
}

// ── Test 2: Expected models present in config ────────────────────────
for (const [label, modelId] of Object.entries(EXPECTED_MODELS)) {
    check(`Expected model present: ${label} = ${modelId}`, configSrc.includes(modelId));
}

// ── Test 3: aiConfig.js has correct structure ────────────────────────
check('config exports groq.chatModel', configSrc.includes('chatModel'));
check('config exports groq.sttModel', configSrc.includes('sttModel'));
check('config exports gemini.chatModel', configSrc.includes('gemini'));
check('config exports gemini.imageModel', configSrc.includes('imageModel'));
check('config exports pixazo.imageModel', configSrc.includes('pixazo'));

// ── Test 4: ai.js imports and uses aiConfig ──────────────────────────
check('ai.js imports aiConfig', aiSrc.includes("require('./aiConfig')"));
check('ai.js references aiConfig.groq', aiSrc.includes('aiConfig.groq'));
check('ai.js references aiConfig.gemini', aiSrc.includes('aiConfig.gemini'));
check('ai.js references aiConfig.pixazo', aiSrc.includes('aiConfig.pixazo'));

// ── Test 5: No hardcoded model IDs in ai.js ─────────────────────────
check('No hardcoded openai/gpt-oss-120b in ai.js', !aiSrc.includes("'openai/gpt-oss-120b'"));
check('No hardcoded whisper-large-v3-turbo in ai.js', !aiSrc.includes("'whisper-large-v3-turbo'"));
check('No hardcoded gemini-2.5-flash in ai.js', !aiSrc.includes("'gemini-2.5-flash'"));
check('No hardcoded gemini-3.1-flash-image in ai.js', !aiSrc.includes("'gemini-3.1-flash-image'"));

// ── Test 6: Version sanity ───────────────────────────────────────────
check('Gemini chat model is 2.5+ or 3.x', /^gemini-(2\.[5-9]|3\.)/.test(
    configSrc.match(/gemini:\s*\{[^}]*chatModel:\s*'([^']+)'/)?.[1] || ''));
check('Gemini image model is 2.5+ or 3.x', /^gemini-(2\.[5-9]|3\.)/.test(
    configSrc.match(/gemini:\s*\{[^}]*imageModel:\s*'([^']+)'/)?.[1] || ''));

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n── Model Availability: ${pass}/${pass + fail} checks passed ──`);
process.exit(fail > 0 ? 1 : 0);
