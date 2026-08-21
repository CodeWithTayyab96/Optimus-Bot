/**
 * Optimus Bot - Centralized AI Client
 * Groq (primary text + STT) + Gemini (fallback text)
 * Image generation via imageGeneration.js service (Gemini → Cloudflare → Pollinations)
 *
 * Preserved for backward compatibility:
 *   - generateImagePixazo — retained but no longer part of the primary fallback chain.
 *     Pixazo was the previous image provider; kept in case external code references it.
 */
const axios = require('axios');
const FormData = require('form-data');
const settings = require('../settings');
const aiConfig = require('./aiConfig');
const imageGen = require('./imageGeneration');

// ---------------------------------------------------------------------------
// Provider URLs — model IDs now come from aiConfig
// ---------------------------------------------------------------------------
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

const GEMINI_TEXT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Legacy Pixazo endpoint — kept for backward compatibility
const PIXAZO_URL = 'https://gateway.pixazo.ai/flux-1-schnell/v1/getData';

// ---------------------------------------------------------------------------
// TEXT / CHAT
// ---------------------------------------------------------------------------

/**
 * Chat with Groq (fast LPU inference)
 * Model: openai/gpt-oss-120b (from aiConfig)
 */
async function chatGroq(systemPrompt, userMessage, options = {}) {
    try {
        const apiKey = settings.groqApiKey;
        if (!apiKey) return null;

        const res = await axios.post(GROQ_URL, {
            model: options.model || aiConfig.text.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            max_tokens: options.maxTokens || 1024,
            temperature: options.temperature ?? 0.9,
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: aiConfig.timeouts.text
        });

        return res.data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
        console.error('Groq API error:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

/**
 * Chat with Gemini (Google AI)
 * Model: gemini-2.5-flash (from aiConfig — fallback text provider)
 */
async function chatGemini(systemPrompt, userMessage, options = {}) {
    try {
        const apiKey = settings.geminiApiKey;
        if (!apiKey) return null;

        const modelId = aiConfig.text.fallback.model;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

        const res = await axios.post(`${url}?key=${apiKey}`, {
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [{
                parts: [{ text: userMessage }]
            }],
            generationConfig: {
                maxOutputTokens: options.maxTokens || 1024,
                temperature: options.temperature ?? 0.9
            }
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: aiConfig.timeouts.text
        });

        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (err) {
        console.error('Gemini API error:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

/**
 * Chat with automatic fallback: Groq first, Gemini second
 */
async function chat(systemPrompt, userMessage, options = {}) {
    const result = await chatGroq(systemPrompt, userMessage, options);
    if (result) return result;
    return chatGemini(systemPrompt, userMessage, options);
}

// ---------------------------------------------------------------------------
// IMAGE GENERATION — delegated to imageGeneration.js
// ---------------------------------------------------------------------------

/**
 * Generate an image from a text prompt.
 * Uses the image generation service (Gemini → Cloudflare → Pollinations).
 */
async function generateImage(prompt) {
    return imageGen.generateImage(prompt);
}

/**
 * Legacy: Generate an image using Pixazo.
 * RETAINED for backward compatibility — no longer in the primary chain.
 */
async function generateImagePixazo(prompt) {
    try {
        const apiKey = settings.pixazoApiKey;
        if (!apiKey) return null;

        const res = await axios.post(PIXAZO_URL, {
            prompt: prompt,
            num_steps: 4,
            seed: Math.floor(Math.random() * 100000),
            width: 1024,
            height: 1024
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'Ocp-Apim-Subscription-Key': apiKey
            },
            timeout: 60000
        });

        const imageUrl = res.data?.output;
        if (!imageUrl) return null;

        const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
        return Buffer.from(imgRes.data);
    } catch (err) {
        console.error('Pixazo API error:', err.response?.data || err.message);
        return null;
    }
}

/**
 * Legacy: Generate an image using Gemini directly.
 * RETAINED for backward compatibility — imageGeneration.js now handles Gemini.
 */
async function generateImageGemini(prompt) {
    return imageGen.generateWithGemini(prompt);
}

// ---------------------------------------------------------------------------
// SPEECH-TO-TEXT
// ---------------------------------------------------------------------------

/**
 * Speech-to-Text using Groq Whisper
 * Model: whisper-large-v3-turbo (from aiConfig)
 */
async function speechToText(audioBuffer, options = {}) {
    try {
        const apiKey = settings.groqApiKey;
        if (!apiKey) return null;

        const form = new FormData();
        form.append('file', audioBuffer, {
            filename: options.filename || 'audio.ogg',
            contentType: options.contentType || 'audio/ogg',
        });
        form.append('model', aiConfig.speech.model);
        if (options.language) {
            form.append('language', options.language);
        }

        const res = await axios.post(GROQ_STT_URL, form, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...form.getHeaders()
            },
            timeout: aiConfig.timeouts.speech
        });

        return res.data?.text?.trim() || null;
    } catch (err) {
        console.error('Groq STT error:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

module.exports = {
    chatGroq,
    chatGemini,
    chat,
    generateImage,
    generateImagePixazo,
    generateImageGemini,
    speechToText
};
