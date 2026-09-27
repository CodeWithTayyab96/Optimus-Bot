/**
 * Optimus Bot — Image Generation Service
 *
 * Provides a single entry point: generateImage(prompt, options)
 *
 * Provider chain:
 *   1. Gemini gemini-3.1-flash-image  (primary)
 *   2. Cloudflare Workers AI flux-1-schnell (fallback #1)
 *   3. Pollinations flux                (fallback #2)
 *
 * Each provider is isolated behind its own function. Failures are caught
 * internally and never leak technical details to callers.
 */

const axios = require('axios');
const FormData = require('form-data');
const aiConfig = require('./aiConfig');
const settings = require('../settings');

// ---------------------------------------------------------------------------
// Provider: Gemini (primary)
// ---------------------------------------------------------------------------
async function generateWithGemini(prompt) {
    const apiKey = settings.geminiApiKey;
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') return null;

    const url = aiConfig.image.primary.url;
    try {
        // Gemini Interactions API — the recommended way for image generation
        // See: https://ai.google.dev/gemini-api/docs/image-generation
        const res = await axios.post(url, {
            model: aiConfig.image.primary.model,
            input: [{ type: 'text', text: prompt }],
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            timeout: aiConfig.timeouts.image.gemini,
        });

        // Interactions API returns output_image.data (base64)
        const imageData = res.data?.output_image?.data;
        if (imageData) {
            return Buffer.from(imageData, 'base64');
        }

        return null;
    } catch (err) {
        console.error('[ImageGen] Gemini error:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Provider: Gemini native image editing (Interactions API) — primary
// ---------------------------------------------------------------------------
async function editWithGemini(imageBuffer, prompt, options = {}) {
    const apiKey = settings.geminiApiKey;
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') return null;

    const url = aiConfig.image.primary.url;
    try {
        const base64 = imageBuffer.toString('base64');
        const mimeType = options.mimeType || 'image/jpeg';

        const res = await axios.post(url, {
            model: aiConfig.image.primary.model,
            // Interactions API image-edit block shape (per Gemini image docs):
            // an array of typed content blocks; the image block uses
            // { type: 'image', data: <base64>, mime_type: <string> }.
            input: [
                { type: 'text', text: prompt },
                { type: 'image', data: base64, mime_type: mimeType }
            ],
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            timeout: aiConfig.timeouts.image.gemini,
        });

        // Interactions API returns output_image.data (base64).
        const imageData = res.data?.output_image?.data
            || res.data?.interaction?.output_image?.data;
        if (imageData) {
            return Buffer.from(imageData, 'base64');
        }

        return null;
    } catch (err) {
        console.error('[ImageGen] Gemini edit error:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Provider: OpenAI-Compatible image edit (/images/edits) — fallback
// ---------------------------------------------------------------------------
/**
 * Edit an image via any OpenAI-compatible `/images/edits` endpoint.
 * Gated on isProviderReady('openai') so it makes 0 requests when unconfigured.
 * Returns null on any failure (never throws).
 */
async function editWithOpenAI(imageBuffer, prompt, options = {}) {
    if (!aiConfig.isProviderReady('openai')) return null;
    try {
        const apiKey = settings.openaiApiKey;
        const baseUrl = String(settings.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const model = options.model || settings.openaiImageModel || 'gpt-image-1';
        const mimeType = options.mimeType || 'image/jpeg';
        const ext = mimeType.includes('png') ? 'png' : 'jpg';

        const form = new FormData();
        form.append('model', model);
        form.append('prompt', prompt);
        form.append('image', imageBuffer, { filename: `image.${ext}`, contentType: mimeType });

        const res = await axios.post(`${baseUrl}/images/edits`, form, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...form.getHeaders(),
            },
            timeout: aiConfig.timeouts.image.gemini,
            maxBodyLength: Infinity,
        });

        const b64 = res.data?.data?.[0]?.b64_json;
        if (b64) return Buffer.from(b64, 'base64');

        const imgUrl = res.data?.data?.[0]?.url;
        if (imgUrl) {
            const img = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 60000 });
            return Buffer.from(img.data);
        }

        return null;
    } catch (err) {
        console.error('[ImageGen] OpenAI edit error:', err.response?.data?.error?.message || err.message);
        return null;
    }
}

/**
 * Edit an existing image. Fallback chain: Gemini (Interactions API) →
 * OpenAI-Compatible (/images/edits) → null.
 *
 * @param {Buffer} imageBuffer the source image (sent as base64 / multipart)
 * @param {string} prompt      editing instruction, e.g. "change the background to a beach"
 * @param {object} [options]   { mimeType, model }
 * @returns {Promise<Buffer|null>} edited image buffer, or null on any failure
 *
 * Returns null (and makes 0 network requests) when no provider is configured
 * or the image is missing. Provider failures are isolated — they never throw.
 */
async function generateImageEdit(imageBuffer, prompt, options = {}) {
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || !prompt) return null;

    const gemini = await editWithGemini(imageBuffer, prompt, options);
    if (gemini) return gemini;

    const openai = await editWithOpenAI(imageBuffer, prompt, options);
    if (openai) return openai;

    return null;
}

// ---------------------------------------------------------------------------
// Provider: Cloudflare Workers AI (fallback #1)
// ---------------------------------------------------------------------------
async function generateWithCloudflare(prompt) {
    const accountId = settings.cloudflareAccountId;
    const apiToken = settings.cloudflareApiToken;
    if (!accountId || accountId === 'YOUR_CLOUDFLARE_ACCOUNT_ID'
        || !apiToken || apiToken === 'YOUR_CLOUDFLARE_API_TOKEN') {
        return null;
    }

    const model = aiConfig.image.fallbacks[0].model;
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

    try {
        const res = await axios.post(url, {
            prompt,
            num_steps: 4,
            width: 1024,
            height: 1024,
        }, {
            headers: {
                Authorization: `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
            timeout: aiConfig.timeouts.image.cloudflare,
        });

        // Cloudflare Workers AI image models return base64-encoded image data
        const result = res.data?.result;
        if (!result) return null;

        // The response can be base64 string or an object with image data
        if (typeof result === 'string') {
            return Buffer.from(result, 'base64');
        }

        // Some models return { image: base64 } or { images: [base64] }
        if (result.image) {
            return Buffer.from(result.image, 'base64');
        }
        if (result.images && result.images.length > 0) {
            return Buffer.from(result.images[0], 'base64');
        }

        return null;
    } catch (err) {
        console.error('[ImageGen] Cloudflare error:', err.response?.data?.errors?.[0]?.message || err.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Provider: Pollinations (fallback #2 — final)
// ---------------------------------------------------------------------------
async function generateWithPollinations(prompt) {
    try {
        // Pollinations simple GET endpoint — no auth required
        const encodedPrompt = encodeURIComponent(prompt);
        const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;

        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: aiConfig.timeouts.image.pollinations,
            headers: { 'User-Agent': 'OptimusBot/1.0' },
        });

        if (!res.data || res.data.length === 0) return null;

        const buffer = Buffer.from(res.data);
        // Validate we got an image (check magic bytes)
        const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
        const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
        const isWebp = buffer.length > 12
            && buffer[0] === 0x52 && buffer[1] === 0x49
            && buffer[2] === 0x46 && buffer[3] === 0x46;

        if (!isPng && !isJpeg && !isWebp) {
            console.error('[ImageGen] Pollinations returned non-image data');
            return null;
        }

        return buffer;
    } catch (err) {
        console.error('[ImageGen] Pollinations error:', err.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Main entry point — fallback chain
// ---------------------------------------------------------------------------
async function generateImage(prompt) {
    if (!prompt || typeof prompt !== 'string') return null;

    // 1. Try Gemini (primary)
    if (aiConfig.isProviderReady('gemini')) {
        const result = await generateWithGemini(prompt);
        if (result) return result;
        console.log('[ImageGen] Gemini failed, trying Cloudflare...');
    }

    // 2. Try Cloudflare (fallback #1)
    if (aiConfig.isProviderReady('cloudflare')) {
        const result = await generateWithCloudflare(prompt);
        if (result) return result;
        console.log('[ImageGen] Cloudflare failed, trying Pollinations...');
    }

    // 3. Try Pollinations (fallback #2)
    if (aiConfig.isProviderReady('pollinations')) {
        const result = await generateWithPollinations(prompt);
        if (result) return result;
        console.log('[ImageGen] Pollinations failed.');
    }

    // All providers failed
    return null;
}

module.exports = {
    generateImage,
    generateImageEdit,
    editWithGemini,
    editWithOpenAI,
    generateWithGemini,
    generateWithCloudflare,
    generateWithPollinations,
};
