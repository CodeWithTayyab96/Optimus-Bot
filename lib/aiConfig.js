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
// IMAGE GENERATION — Gemini (primary), Cloudflare (fallback 1), Pollinations (fallback 2)
// ---------------------------------------------------------------------------
const image = {
    primary: {
        provider: 'gemini',
        model: 'gemini-3.1-flash-image',
        // Gemini Interactions API (recommended for image generation)
        url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    },
    fallbacks: [
        {
            provider: 'cloudflare',
            model: '@cf/black-forest-labs/flux-1-schnell',
            url: 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell',
            // ACCOUNT_ID is resolved at runtime from settings.cloudflareAccountId
        },
        {
            provider: 'pollinations',
            model: 'flux',
            // Pollinations uses a simple GET endpoint — no model ID needed in URL
            url: 'https://image.pollinations.ai/prompt/{PROMPT}',
        },
    ],
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
