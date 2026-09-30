/**
 * Optimus Bot - Centralized AI Client
 *
 * Text:    Groq (primary)  -> OpenAI-compatible (fallback)
 * Vision:  Gemini multimodal (scanned/image PDFs, .study)
 * STT:     Gemini -> Groq Whisper
 * TTS:     Gemini (Groq has no TTS model at all — playai-tts was decommissioned)
 * Image:   imageGeneration.js service (Cloudflare -> AI Horde -> Pollinations -> Gemini)
 * ImageEdit: Gemini native image editing (Interactions API)
 *
 * Provider readiness is centralized in lib/aiConfig.isProviderReady.
 * No low-level function ever sends a request with a placeholder or missing
 * credential: every entry point bails out (returns null, 0 network requests)
 * when the relevant provider is not actually configured. This is the core
 * reliability guarantee of the AI layer.
 *
 * Preserved for backward compatibility:
 *   - generateImagePixazo — retained but never part of the primary chain.
 *   - generateImageGemini — thin wrapper over imageGeneration.js.
 */
const axios = require('axios');
const FormData = require('form-data');
const settings = require('../settings');
const aiConfig = require('./aiConfig');
const imageGen = require('./imageGeneration');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
// Legacy Pixazo endpoint — kept for backward compatibility only.
const PIXAZO_URL = 'https://gateway.pixazo.ai/flux-1-schnell/v1/getData';

// ---------------------------------------------------------------------------
// TEXT / CHAT — Groq (primary) + Gemini (fallback)
// ---------------------------------------------------------------------------

/**
 * Chat with Groq (fast LPU inference). Model: openai/gpt-oss-120b (from aiConfig).
 * Returns null (and makes 0 network requests) when Groq is not configured.
 */
async function chatGroq(systemPrompt, userMessage, options = {}) {
    if (!aiConfig.isProviderReady('groq')) return null;
    try {
        const apiKey = settings.groqApiKey;
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
 * Chat with Gemini (Google AI). Model: gemini-2.5-flash (from aiConfig).
 * Returns null (and makes 0 network requests) when Gemini is not configured.
 */
async function chatGemini(systemPrompt, userMessage, options = {}) {
    if (!aiConfig.isProviderReady('gemini')) return null;
    try {
        const apiKey = settings.geminiApiKey;
        const modelId = aiConfig.geminiNative.model;
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
 * Gemini multimodal (vision). Used by .study for scanned/image-based PDFs.
 * Sends a base64 image as inline_data alongside the text prompt.
 * Returns null (and makes 0 network requests) when Gemini is not configured.
 */
async function chatGeminiVision(systemPrompt, imageBuffer, userPrompt, options = {}) {
    if (!aiConfig.isProviderReady('gemini')) return null;
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) return null;
    try {
        const apiKey = settings.geminiApiKey;
        const modelId = aiConfig.geminiNative.model;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

        const res = await axios.post(url, {
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [{
                parts: [
                    { text: userPrompt || 'Describe and analyze the content of this image.' },
                    {
                        inline_data: {
                            mime_type: options.mimeType || 'image/png',
                            data: imageBuffer.toString('base64')
                        }
                    }
                ]
            }],
            generationConfig: {
                maxOutputTokens: options.maxTokens || 2048,
                temperature: options.temperature ?? 0.4
            }
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: aiConfig.timeouts.text
        });

        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (err) {
        console.error('Gemini Vision error:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

/**
 * Chat with an OpenAI-Compatible provider (OpenAI, OpenRouter, Together, local
 * LLMs, etc.). Talks to the configured `${openaiBaseUrl}/chat/completions`.
 * Returns null (and makes 0 network requests) when not configured.
 */
async function chatOpenAI(systemPrompt, userMessage, options = {}) {
    if (!aiConfig.isProviderReady('openai')) return null;
    try {
        const apiKey = settings.openaiApiKey;
        const baseUrl = String(settings.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const model = options.model || settings.openaiModel || aiConfig.text.custom.model;
        const res = await axios.post(`${baseUrl}/chat/completions`, {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            max_tokens: options.maxTokens || 1024,
            temperature: options.temperature ?? 0.9,
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: aiConfig.timeouts.text,
        });

        return res.data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
        console.error('OpenAI-compatible API error:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

/**
 * Chat with automatic fallback: Groq first, then the OpenAI-compatible endpoint.
 *
 * Gemini is intentionally absent. It used to be the second link, but the model
 * it pointed at (`gemini-2.5-flash`) is no longer served to new accounts, so
 * that link was quietly dead. Gemini now does the jobs only it can do — vision
 * and speech — while chat falls through to OpenAI-compatible.
 */
async function chat(systemPrompt, userMessage, options = {}) {
    const result = await chatGroq(systemPrompt, userMessage, options);
    if (result) return result;
    return chatOpenAI(systemPrompt, userMessage, options);
}

// ---------------------------------------------------------------------------
// IMAGE GENERATION — delegated to imageGeneration.js
// ---------------------------------------------------------------------------

async function generateImage(prompt) {
    return imageGen.generateImage(prompt);
}

/**
 * Gemini native image editing (Interactions API). Delegates to imageGeneration.js.
 * Returns null (and makes 0 network requests) when Gemini is not configured.
 */
async function generateImageEdit(imageBuffer, prompt, options = {}) {
    return imageGen.generateImageEdit(imageBuffer, prompt, options);
}

/**
 * Legacy: Generate an image using Pixazo.
 * RETAINED for backward compatibility — not part of the primary chain.
 * Returns null on placeholder/missing key (0 network requests).
 */
async function generateImagePixazo(prompt) {
    try {
        const apiKey = settings.pixazoApiKey;
        if (!apiKey || apiKey === 'YOUR_PIXAZO_API_KEY') return null;

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
// SPEECH-TO-TEXT — Gemini (primary), Groq Whisper (fallback)
// ---------------------------------------------------------------------------

/**
 * Transcribe audio with Gemini. The clip goes in as `inline_data` on an ordinary
 * multimodal generateContent call — no separate ASR endpoint, and it handles
 * noisy, accented and mixed-language audio well.
 * Returns null (0 network requests) when Gemini is not configured.
 */
async function transcribeWithGemini(audioBuffer, options = {}) {
    if (!aiConfig.isProviderReady('gemini')) return null;
    if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) return null;
    try {
        const apiKey = settings.geminiApiKey;
        const modelId = aiConfig.geminiNative.model;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

        const res = await axios.post(url, {
            contents: [{
                parts: [
                    {
                        text: options.prompt
                            || 'Transcribe this audio exactly. Reply with only the transcription, no commentary.',
                    },
                    {
                        inline_data: {
                            mime_type: options.mimeType || 'audio/ogg',
                            data: audioBuffer.toString('base64'),
                        },
                    },
                ],
            }],
            generationConfig: { temperature: 0 },
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: aiConfig.timeouts.speech,
        });

        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (err) {
        console.error('Gemini STT error:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

/**
 * Speech-to-Text using Groq Whisper (fallback).
 * Model: whisper-large-v3-turbo (from aiConfig).
 * Returns null (and makes 0 network requests) when Groq is not configured.
 */
async function speechToTextGroq(audioBuffer, options = {}) {
    if (!aiConfig.isProviderReady('groq')) return null;
    try {
        const apiKey = settings.groqApiKey;
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

/**
 * Speech-to-Text: Gemini first, Groq Whisper second.
 */
async function speechToText(audioBuffer, options = {}) {
    const gemini = await transcribeWithGemini(audioBuffer, options);
    if (gemini) return gemini;
    return speechToTextGroq(audioBuffer, options);
}

// ---------------------------------------------------------------------------
// TEXT-TO-SPEECH — Gemini (primary)
//
// Groq is NOT a possible fallback here: it has no text-to-speech model at all
// (`playai-tts` was decommissioned and the account exposes 11 models, none of
// them speech synthesis). The fallback is the offline `gtts` path in
// commands/general/tts.js, which needs no API key.
// ---------------------------------------------------------------------------

/**
 * Text-to-speech with Gemini. Verified to return `audio/wav` base64, so the
 * caller gets a buffer WhatsApp can send directly — no PCM packing and no
 * ffmpeg step required.
 *
 * @returns {Promise<{buffer: Buffer, mimetype: string}|null>}
 */
async function textToSpeech(text, options = {}) {
    if (!aiConfig.isProviderReady('gemini')) return null;
    const clean = String(text || '').trim();
    if (!clean) return null;

    try {
        const apiKey = settings.geminiApiKey;
        const modelId = aiConfig.geminiNative.ttsModel;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

        const res = await axios.post(url, {
            contents: [{ parts: [{ text: clean }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: options.voice || aiConfig.geminiNative.ttsVoice },
                    },
                },
            },
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: aiConfig.timeouts.speech,
        });

        const part = (res.data?.candidates?.[0]?.content?.parts || [])
            .find((p) => p.inlineData || p.inline_data);
        const inline = part?.inlineData || part?.inline_data;
        if (!inline?.data) return null;

        return {
            buffer: Buffer.from(inline.data, 'base64'),
            mimetype: inline.mimeType || inline.mime_type || 'audio/wav',
        };
    } catch (err) {
        console.error('Gemini TTS error:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

module.exports = {
    chatGroq,
    chatGemini,
    chatGeminiVision,
    chatOpenAI,
    chat,
    generateImage,
    generateImageEdit,
    generateImagePixazo,
    generateImageGemini,
    speechToText,
    speechToTextGroq,
    transcribeWithGemini,
    textToSpeech
};
