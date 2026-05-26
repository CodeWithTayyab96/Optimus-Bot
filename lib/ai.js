/**
 * Optimus Bot - Centralized AI Client
 * Groq (primary text) + Gemini (fallback text)
 * Pixazo (primary images) + Gemini (fallback images)
 */
const axios = require('axios');
const settings = require('../settings');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const GEMINI_TEXT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GEMINI_IMAGE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

// Pixazo Flux 1 Schnell — free, synchronous, fast (1-2s)
const PIXAZO_URL = 'https://gateway.pixazo.ai/flux-1-schnell/v1/getData';

/**
 * Chat with Groq (fast LPU inference)
 * @param {string} systemPrompt - System instructions
 * @param {string} userMessage - User's message
 * @param {object} [options] - Optional: maxTokens, temperature
 * @returns {string|null} Response text or null on failure
 */
async function chatGroq(systemPrompt, userMessage, options = {}) {
    try {
        const apiKey = settings.groqApiKey;
        if (!apiKey) return null;

        const res = await axios.post(GROQ_URL, {
            model: options.model || GROQ_MODEL,
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
            timeout: 30000
        });

        return res.data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
        console.error('Groq API error:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

/**
 * Chat with Gemini (Google AI)
 * @param {string} systemPrompt - System instructions
 * @param {string} userMessage - User's message
 * @param {object} [options] - Optional: maxTokens, temperature
 * @returns {string|null} Response text or null on failure
 */
async function chatGemini(systemPrompt, userMessage, options = {}) {
    try {
        const apiKey = settings.geminiApiKey;
        if (!apiKey) return null;

        const res = await axios.post(`${GEMINI_TEXT_URL}?key=${apiKey}`, {
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
            timeout: 30000
        });

        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (err) {
        console.error('Gemini API error:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

/**
 * Chat with automatic fallback: Groq first, Gemini second
 * @param {string} systemPrompt - System instructions
 * @param {string} userMessage - User's message
 * @param {object} [options] - Optional: maxTokens, temperature
 * @returns {string|null} Response text or null if both fail
 */
async function chat(systemPrompt, userMessage, options = {}) {
    const result = await chatGroq(systemPrompt, userMessage, options);
    if (result) return result;
    return chatGemini(systemPrompt, userMessage, options);
}

/**
 * Generate an image using Pixazo (primary) with Gemini fallback
 * @param {string} prompt - Image description
 * @returns {Buffer|null} Image buffer or null on failure
 */
async function generateImage(prompt) {
    // Try Pixazo first
    const pixazoResult = await generateImagePixazo(prompt);
    if (pixazoResult) return pixazoResult;

    // Fall back to Gemini
    console.log('Pixazo failed, falling back to Gemini for image generation...');
    return generateImageGemini(prompt);
}

/**
 * Generate an image using Pixazo Flux 2 Klein (synchronous endpoint)
 * @param {string} prompt - Image description
 * @returns {Buffer|null} Image buffer or null on failure
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

        // Flux 2 Klein returns { output: "https://...png" }
        const imageUrl = res.data?.output;
        if (!imageUrl) return null;

        // Download the image
        const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
        return Buffer.from(imgRes.data);
    } catch (err) {
        console.error('Pixazo API error:', err.response?.data || err.message);
        return null;
    }
}

/**
 * Generate an image using Gemini (fallback)
 * @param {string} prompt - Image description
 * @returns {Buffer|null} Image buffer (PNG) or null on failure
 */
async function generateImageGemini(prompt) {
    try {
        const apiKey = settings.geminiApiKey;
        if (!apiKey) return null;

        const res = await axios.post(`${GEMINI_IMAGE_URL}?key=${apiKey}`, {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE']
            }
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
        });

        // Gemini returns inline_data with base64 image
        const parts = res.data?.candidates?.[0]?.content?.parts;
        if (!parts) return null;

        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                return Buffer.from(part.inlineData.data, 'base64');
            }
        }

        return null;
    } catch (err) {
        console.error('Gemini Image API error:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

module.exports = {
    chatGroq,
    chatGemini,
    chat,
    generateImage,
    generateImagePixazo,
    generateImageGemini
};
