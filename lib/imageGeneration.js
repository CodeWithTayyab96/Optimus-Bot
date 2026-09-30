/**
 * Optimus Bot — Image Generation Service
 *
 * Provides a single entry point: generateImage(prompt, options)
 *
 * Provider chain — ordered by what actually works (each verified 2026-09-30):
 *   1. Cloudflare Workers AI flux-1-schnell  — free tier (10k neurons/day), no watermark
 *   2. AI Horde (stablehorde.net)            — keyless, free, no watermark, crowdsourced
 *   3. Pollinations flux                     — now $0.01/image via x402; only cached prompts are free
 *   4. Gemini image                          — free tier is 0 input tokens/min; paid only
 *
 * WHY THE ORDER CHANGED (v2.2.0)
 *   Gemini used to be primary, but every one of its image models returns
 *   429 "limit: 0 input tokens per minute on Free Tier" — image output is simply
 *   not available on a free key, so as primary it burned ~1-3s on every call and
 *   always failed. Pollinations was the old last resort and is now paywalled.
 *   Cloudflare and AI Horde are the two that are genuinely free; Cloudflare goes
 *   first because it is faster and its model is better, and AI Horde covers the
 *   case where no Cloudflare token is configured.
 *
 * Each provider is isolated behind its own function. Failures are caught
 * internally and never leak technical details to callers.
 */

const axios = require('axios');
const FormData = require('form-data');
const aiConfig = require('./aiConfig');
const settings = require('../settings');

// AI Horde endpoint + the documented anonymous key (ten zeros). No account is
// required; registering only raises queue priority.
const HORDE_BASE = 'https://stablehorde.net/api/v2';
const HORDE_ANON_KEY = '0000000000';

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
            // flux-1-schnell on Workers AI accepts `prompt` and `steps` — and
            // NOTHING else. It rejects unknown keys with
            //   5006 "Additional or unevaluated properties '/num_steps, /width,
            //         /height' at '/' not allowed"
            // The old body sent num_steps/width/height, so this provider failed
            // on every single call even with a perfectly valid token — which made
            // it look like an auth problem. Output size is fixed by the model.
            steps: 4,
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
        // Cloudflare returns code 10000 "Authentication error" for BOTH a bad
        // token AND a token that simply lacks the Workers AI permission, so say
        // which one the status code implies instead of leaving a misleading
        // message in the log.
        const cfError = err.response?.data?.errors?.[0];
        const status = err.response?.status;
        const detail = cfError?.message || err.message;
        if (status === 403) {
            console.error(`[ImageGen] Cloudflare error: ${detail} — the token is valid but not authorised for Workers AI on this account (check CLOUDFLARE_ACCOUNT_ID and the token's Account → Workers AI permission)`);
        } else {
            console.error('[ImageGen] Cloudflare error:', detail);
        }
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
// Provider: AI Horde (fallback #2 — free, keyless)
// ---------------------------------------------------------------------------
/**
 * AI Horde is a crowd-sourced cluster: volunteers lend their GPUs, so it costs
 * nothing and needs no account. The anonymous key is literally ten zeros; a
 * free registered key (settings.hordeApiKey) only buys queue priority, never
 * image quality.
 *
 * It is ASYNC by design — you submit a job, then poll. That is why this function
 * has a deadline and gives up rather than hanging a command forever.
 *
 * Anonymous requests sit at the back of the queue, so this is a fallback, not a
 * primary. When it is quiet (the usual case) a 512-1024px image lands in ~5-15s.
 */
async function generateWithHorde(prompt) {
    const cfg = aiConfig.image.horde;
    const registeredKey = (settings.hordeApiKey || '').trim();
    const apiKey = registeredKey || HORDE_ANON_KEY;

    // Anonymous clients sit at -50 kudos and the Horde refuses anything over
    // 600x600 (or an equivalent sampler budget) with "This request requires N
    // kudos to fulfil". So the anonymous path deliberately asks for a smaller
    // image — a rejected 1024 request is worth less than a delivered 512 one.
    const width = registeredKey ? cfg.width : cfg.anonWidth;
    const height = registeredKey ? cfg.height : cfg.anonHeight;
    const steps = registeredKey ? cfg.steps : cfg.anonSteps;

    const headers = {
        apikey: apiKey,
        'Client-Agent': `OptimusBot:${settings.version || '0.0.0'}:(github.com/CodeWithTayyab96/Optimus-Bot)`,
        'Content-Type': 'application/json',
    };

    let jobId = null;
    try {
        const submit = await axios.post(`${HORDE_BASE}/generate/async`, {
            prompt,
            params: { width, height, steps, cfg_scale: 7, n: 1 },
            // Keep this bot's output safe for any chat it is used in. The Horde
            // has plenty of NSFW models on offer; we never want to be routed to one.
            nsfw: false,
            censor_nsfw: true,
            trusted_workers: false,
            slow_workers: true,
            // No `models` pin: letting the Horde route to whatever has live
            // workers is far more reliable than naming a model that may be idle.
        }, { headers, timeout: 30000 });

        jobId = submit.data?.id;
        if (!jobId) {
            console.error('[ImageGen] AI Horde error: no job id returned');
            return null;
        }

        // Poll until done, or until the deadline. kudos going negative just
        // means the queue is busy, not that the request failed.
        const deadline = Date.now() + cfg.maxWaitMs;
        while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, cfg.pollMs));

            const check = await axios.get(`${HORDE_BASE}/generate/check/${jobId}`, {
                headers, timeout: 15000,
            });

            if (check.data?.faulted) {
                console.error('[ImageGen] AI Horde error: job faulted on the worker');
                return null;
            }
            if (check.data?.is_possible === false) {
                console.error('[ImageGen] AI Horde error: no worker can serve this request');
                return null;
            }
            if (check.data?.done) break;
        }

        const status = await axios.get(`${HORDE_BASE}/generate/status/${jobId}`, { headers, timeout: 30000 });
        const gen = status.data?.generations?.[0];
        if (!gen) {
            console.error('[ImageGen] AI Horde error: finished with no generation');
            return null;
        }
        if (gen.censored) {
            console.error('[ImageGen] AI Horde returned a censored placeholder');
            return null;
        }

        // gen.img is a signed URL (valid ~30 min), not base64 — fetch it now.
        const img = await axios.get(gen.img, {
            responseType: 'arraybuffer',
            timeout: 60000,
        });

        const buffer = Buffer.from(img.data);
        if (!buffer.length) return null;

        const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
        const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
        const isWebp = buffer.length > 12
            && buffer[0] === 0x52 && buffer[1] === 0x49
            && buffer[2] === 0x46 && buffer[3] === 0x46;
        if (!isPng && !isJpeg && !isWebp) {
            console.error('[ImageGen] AI Horde returned non-image data');
            return null;
        }

        return buffer;
    } catch (err) {
        console.error('[ImageGen] AI Horde error:', err.response?.data?.message || err.message);
        return null;
    } finally {
        // Do not leave the job occupying a worker slot if we bailed early.
        if (jobId) {
            axios.delete(`${HORDE_BASE}/generate/status/${jobId}`, { headers, timeout: 10000 })
                .catch(() => {});
        }
    }
}

// ---------------------------------------------------------------------------
// Main entry point — fallback chain
// ---------------------------------------------------------------------------
async function generateImage(prompt) {
    if (!prompt || typeof prompt !== 'string') return null;

    // 1. Cloudflare Workers AI (fast, free tier, best quality of the free set)
    if (aiConfig.isProviderReady('cloudflare')) {
        const result = await generateWithCloudflare(prompt);
        if (result) return result;
        console.log('[ImageGen] Cloudflare failed, trying AI Horde...');
    }

    // 2. AI Horde (keyless, free, no watermark)
    if (aiConfig.isProviderReady('horde')) {
        const result = await generateWithHorde(prompt);
        if (result) return result;
        console.log('[ImageGen] AI Horde failed, trying Pollinations...');
    }

    // 3. Pollinations (now pay-per-image; only cached prompts still answer free)
    if (aiConfig.isProviderReady('pollinations')) {
        const result = await generateWithPollinations(prompt);
        if (result) return result;
        console.log('[ImageGen] Pollinations failed, trying Gemini...');
    }

    // 4. Gemini image — paid tier only. Kept last so a free-tier key never costs
    //    the user a wasted round-trip before a working provider is tried.
    if (aiConfig.isProviderReady('gemini')) {
        const result = await generateWithGemini(prompt);
        if (result) return result;
        console.log('[ImageGen] Gemini failed.');
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
    generateWithHorde,
    generateWithPollinations,
};
