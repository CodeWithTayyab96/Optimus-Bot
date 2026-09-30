/**
 * Optimus Bot — Centralized AI Provider Configuration
 *
 * Single source of truth for model IDs, provider URLs, and capability routing.
 * Credentials live in settings.js — this file only holds model/endpoints metadata.
 */

const settings = require('../settings');

// ---------------------------------------------------------------------------
// TEXT / CHAT — Groq (primary), Gemini (fallback)
// ---------------------------------------------------------------------------
const text = {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    fallback: {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
    },
    // OpenAI-Compatible chat provider (optional). Used as an additional chat
    // fallback when configured. Any endpoint implementing /chat/completions.
    custom: {
        provider: 'openai',
        model: settings.openaiModel,
    },
};

// ---------------------------------------------------------------------------
// SPEECH-TO-TEXT — Groq Whisper
// ---------------------------------------------------------------------------
const speech = {
    provider: 'groq',
    model: 'whisper-large-v3-turbo',
};

// ---------------------------------------------------------------------------
// IMAGE GENERATION — Cloudflare (primary), AI Horde (fallback 1),
//                    Pollinations (fallback 2), Gemini (last — paid only)
//
// Order reflects what actually works on free tiers, verified 2026-09-30.
// See lib/imageGeneration.js for the full reasoning.
// ---------------------------------------------------------------------------
const image = {
    primary: {
        provider: 'gemini',
        model: 'gemini-3.1-flash-image',
        // Gemini Interactions API (recommended for image generation)
        url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
        // NOTE: kept for reference / paid tiers only. Every Gemini image model
        // returns 429 "limit: 0 input tokens per minute on Free Tier", so this is
        // deliberately tried LAST in the chain, not first.
    },
    fallbacks: [
        {
            provider: 'cloudflare',
            model: '@cf/black-forest-labs/flux-1-schnell',
            url: 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell',
            // ACCOUNT_ID is resolved at runtime from settings.cloudflareAccountId
            // NOTE: generateWithCloudflare() reads fallbacks[0].model — keep
            // Cloudflare at index 0 when reordering.
        },
        {
            provider: 'pollinations',
            model: 'flux',
            // Pollinations uses a simple GET endpoint — no model ID needed in URL
            url: 'https://image.pollinations.ai/prompt/{PROMPT}',
        },
    ],
    // AI Horde — crowd-sourced and genuinely free, no key required. Tuning lives
    // here because the poll cadence and deadline are provider mechanics, not
    // command concerns.
    //
    // THE KUDOS RULE (this bit us once): anonymous clients start at -50 kudos and
    // the Horde REJECTS any request over 600x600 or an equivalent sampler work
    // budget — "This request requires N kudos to fulfil". So the anonymous path
    // must stay small. A registered key earns kudos and can afford the big one.
    horde: {
        provider: 'horde',
        url: 'https://stablehorde.net/api/v2',
        // Used when settings.hordeApiKey is set (registered, has kudos).
        width: 1024,
        height: 1024,
        steps: 25,
        // Used for the anonymous key. 512x512 @ 20 steps is comfortably inside
        // the anonymous work budget and still returns a clean 512px image.
        anonWidth: 512,
        anonHeight: 512,
        anonSteps: 20,
        // Anonymous requests queue behind registered users, so poll patiently but
        // never longer than maxWaitMs — a chat command must not hang forever.
        pollMs: 2500,
        maxWaitMs: 90000,
    },
};

// ---------------------------------------------------------------------------
// Provider readiness check
// ---------------------------------------------------------------------------
function isProviderReady(providerName) {
    switch (providerName) {
        case 'groq':
            return !!settings.groqApiKey && settings.groqApiKey !== 'YOUR_GROQ_API_KEY';
        case 'openai':
            return !!settings.openaiApiKey && settings.openaiApiKey !== 'YOUR_OPENAI_API_KEY';
        case 'gemini':
            return !!settings.geminiApiKey && settings.geminiApiKey !== 'YOUR_GEMINI_API_KEY';
        case 'cloudflare':
            return !!settings.cloudflareAccountId
                && settings.cloudflareAccountId !== 'YOUR_CLOUDFLARE_ACCOUNT_ID'
                && !!settings.cloudflareApiToken
                && settings.cloudflareApiToken !== 'YOUR_CLOUDFLARE_API_TOKEN';
        case 'pollinations':
            // Pollinations does not require an API key for basic usage
            return true;
        case 'horde':
            // Keyless by design. The anonymous key (ten zeros) always works; a
            // registered key only raises queue priority, never quality.
            return true;
        default:
            return false;
    }
}

// ---------------------------------------------------------------------------
// Timeout configuration (ms)
// ---------------------------------------------------------------------------
const timeouts = {
    text: 30000,
    speech: 60000,
    image: {
        gemini: 60000,
        cloudflare: 60000,
        horde: 90000,
        pollinations: 45000,
    },
};

module.exports = {
    text,
    speech,
    image,
    isProviderReady,
    timeouts,
};
