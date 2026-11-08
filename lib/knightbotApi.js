/**
 * knightbotApi — OPTIONAL, LAST-RESORT YouTube-audio fallback.
 *
 * WHY IT IS THE LAST RESORT
 *   lib/ytAudio.js deliberately removed third-party HTTP downloader APIs after
 *   three of them died (EliteProTech / Yupra / Okatsu, 2026-09-27). The chain is
 *   yt-dlp (primary) -> yt-dlp direct URL -> RapidAPI. This module is a further
 *   safety net for hosts where all three fail, and it is OFF unless the operator
 *   explicitly opts in. It must never become the primary source: the service
 *   offers no uptime guarantee, its limits/endpoints can change at any time, and
 *   it logs the URLs it is asked to fetch (see docs/knightbot-api-assessment.md).
 *
 * CONFIG (.env)
 *   KNIGHTBOT_API_ENABLED=1       required — explicit opt-in / kill switch
 *   KNIGHTBOT_API_KEY=...         required — a PRIVATE key, never the shared demo key
 *   KNIGHTBOT_API_BASE_URL=...    optional, https only (default below)
 *
 * SAFETY PROPERTIES
 *   - The key travels in the X-API-Key HEADER, never in the query string (GET-only
 *     API, and query keys leak into logs / browser history / error messages).
 *   - The shared demo key `knight` and placeholder values are refused.
 *   - The base URL must be https; result file URLs must be same-origin and are
 *     fetched with redirects disabled, so a hostile response cannot turn the bot
 *     into an SSRF client.
 *   - Every request has a timeout and at most one retry (429 / 5xx / network).
 *   - Hosted files expire after ~5 minutes, so a download is buffered into memory
 *     IMMEDIATELY; callers never receive a /files/ URL to send later.
 *   - Progress (job-style) responses are polled with a bounded deadline.
 */
const axios = require('axios');
const settings = require('../settings');

const DEFAULT_BASE_URL = 'https://knightbotapi.stream';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_FILE_TIMEOUT_MS = 90000;
const MAX_FILE_BYTES = 100 * 1024 * 1024; // service caps free downloads at 100MB
const MAX_ATTEMPTS = 2;                   // one bounded retry
const DEFAULT_RETRY_DELAY_MS = 700;
const DEFAULT_POLL_INTERVAL_MS = 1500;
const MAX_PROGRESS_POLLS = 20;            // ~30s ceiling on job-style responses

/** Values that must never be used as a production key. */
const FORBIDDEN_KEYS = new Set(['knight', 'your_key_here', 'changeme']);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Validate and return the configured base URL. Throws on an unsafe value. */
function configuredBase() {
    const raw = String(settings.knightbotApiBaseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
    let url;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('KNIGHTBOT_API_BASE_URL is not a valid URL');
    }
    if (url.protocol !== 'https:') {
        throw new Error('KNIGHTBOT_API_BASE_URL must use https (plain http would expose the key)');
    }
    return url;
}

/** The private key, or '' when it is missing / a known demo or placeholder value. */
function apiKey() {
    const key = String(settings.knightbotApiKey || '').trim();
    if (!key || FORBIDDEN_KEYS.has(key.toLowerCase()) || /^YOUR_/i.test(key)) return '';
    return key;
}

/** Why the fallback is unavailable — safe to log (never contains the key). */
function configurationError() {
    if (!settings.knightbotApiEnabled) return 'disabled (set KNIGHTBOT_API_ENABLED=1)';
    if (!apiKey()) return 'no private KNIGHTBOT_API_KEY (the shared demo key is refused)';
    try {
        configuredBase();
    } catch (e) {
        return e.message;
    }
    return '';
}

/** Cheap gate used by callers and by the health monitor. */
function isConfigured() {
    return configurationError() === '';
}

function status() {
    return {
        enabled: Boolean(settings.knightbotApiEnabled),
        configured: isConfigured(),
        baseUrl: (() => { try { return configuredBase().origin; } catch { return null; } })(),
        reason: configurationError() || null,
    };
}

/**
 * Build a request URL. The key is deliberately NOT a query parameter.
 * @param {string} path e.g. '/api/download/ytaudio'
 */
function buildUrl(path, params = {}) {
    const base = configuredBase();
    const url = new URL(String(path).replace(/^\/+/, ''), base.href.replace(/\/?$/, '/'));
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    if (url.origin !== base.origin) throw new Error('refusing off-host request URL');
    return url.toString();
}

function isNetworkError(err) {
    // axios throws without a `response` for DNS/timeout/abort. Those are worth
    // exactly one retry; HTTP status errors are handled in the loop below.
    return Boolean(err) && !err.response && !/refusing|not configured|must use https/i.test(String(err.message || ''));
}

/**
 * One GET. Returns `data.result` when present, otherwise the whole JSON body
 * (e.g. /api/usage has no `result`). Rejects success:false.
 *
 * Retries ONCE on 429, 5xx or a network error with a short, bounded delay.
 * Never logs the key or the full URL — only the path and status.
 */
async function request(path, params = {}, opts = {}) {
    if (!isConfigured()) throw new Error(`KnightBot API fallback is ${configurationError()}`);

    const attempts = Math.max(1, Math.min(MAX_ATTEMPTS, Number(opts.attempts) || MAX_ATTEMPTS));
    const timeoutMs = Number(opts.timeoutMs) || DEFAULT_TIMEOUT_MS;
    const retryDelayMs = Number.isFinite(opts.retryDelayMs) ? Number(opts.retryDelayMs) : DEFAULT_RETRY_DELAY_MS;
    const url = buildUrl(path, params);
    const label = String(path).split('?')[0];

    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        let res;
        try {
            const reqOpts = {
                headers: {
                    'X-API-Key': apiKey(),
                    Accept: 'application/json',
                },
                timeout: timeoutMs,
                // Hard wall even if the HTTP client's own timeout is bypassed.
                signal: typeof AbortSignal.timeout === 'function'
                    ? AbortSignal.timeout(timeoutMs + 2000)
                    : undefined,
                validateStatus: () => true, // classify statuses ourselves
                maxRedirects: 0,
                maxContentLength: 2 * 1024 * 1024, // JSON endpoints are small
            };
            res = await axios.get(url, reqOpts);
        } catch (err) {
            lastError = err;
            if (attempt < attempts && isNetworkError(err)) {
                await sleep(retryDelayMs * attempt);
                continue;
            }
            throw new Error(`KnightBot API ${label} request failed: ${err && err.message ? err.message : err}`);
        }

        const code = res.status;
        if ((code === 429 || code >= 500) && attempt < attempts) {
            lastError = new Error(`HTTP ${code}`);
            await sleep(retryDelayMs * attempt);
            continue;
        }
        if (code === 429) throw new Error(`KnightBot API ${label} rate limited (HTTP 429)`);
        if (code >= 500) throw new Error(`KnightBot API ${label} server error (HTTP ${code})`);
        if (code === 401 || code === 403) throw new Error(`KnightBot API ${label} key rejected (HTTP ${code})`);
        if (code < 200 || code >= 300) throw new Error(`KnightBot API ${label} failed (HTTP ${code})`);

        const data = res.data;
        if (!data || typeof data !== 'object') throw new Error(`KnightBot API ${label} returned a non-JSON body`);
        if (data.success === false || data.error) {
            throw new Error(`KnightBot API ${label}: ${data.error || 'success=false'}`);
        }
        return data.result !== undefined ? data.result : data;
    }
    throw new Error(`KnightBot API ${label} failed: ${lastError && lastError.message ? lastError.message : 'no response'}`);
}

/**
 * Resolve a `result.download` value to a same-origin https URL.
 * Relative `/files/...` paths are resolved against the configured base.
 * Absolute off-host URLs are REFUSED so a response cannot redirect the bot into
 * fetching an arbitrary (or internal) address.
 */
function resolveFileUrl(download, base = configuredBase()) {
    const raw = String(download || '').trim();
    if (!raw) throw new Error('KnightBot API response has no download URL');
    let url;
    try {
        url = new URL(raw, base.href);
    } catch {
        throw new Error('KnightBot API returned a malformed download URL');
    }
    if (url.protocol !== 'https:') throw new Error('KnightBot API file URL must use https');
    if (url.origin !== base.origin) throw new Error('refusing off-host file URL from KnightBot API');
    return url.toString();
}

/** Fetch the hosted file into a Buffer immediately (it expires in ~5 minutes). */
async function fetchFile(fileUrl, opts = {}) {
    const res = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: Number(opts.fileTimeoutMs) || DEFAULT_FILE_TIMEOUT_MS,
        maxContentLength: MAX_FILE_BYTES,
        maxBodyLength: MAX_FILE_BYTES,
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 300,
        headers: { Accept: '*/*' },
    });
    const buffer = Buffer.from(res.data || []);
    if (!buffer.length) throw new Error('KnightBot API returned an empty audio file');
    return buffer;
}

function downloadLinkFrom(value) {
    if (!value) return null;
    if (typeof value === 'string') return value.includes('/') ? value : null;
    if (typeof value !== 'object') return null;
    return value.download || value.url || value.file || null;
}

/**
 * Some downloader responses are job-style: the playground passes `progressId`
 * and polls /api/progress/{id}. Poll with a bounded deadline until a file URL
 * appears. Documented behaviour in the site's own bundle, not in its docs — so
 * this stays tolerant of several plausible shapes.
 */
async function resolveDownload(result, progressId, opts = {}) {
    const direct = downloadLinkFrom(result);
    if (direct) return direct;
    if (!progressId || opts.poll === false) {
        throw new Error('KnightBot API download did not return a file URL');
    }

    const maxPolls = Math.max(0, Math.min(MAX_PROGRESS_POLLS, Number(opts.maxPolls) || MAX_PROGRESS_POLLS));
    const interval = Number.isFinite(opts.pollIntervalMs) ? Number(opts.pollIntervalMs) : DEFAULT_POLL_INTERVAL_MS;
    let lastPollError = null;
    for (let i = 0; i < maxPolls; i += 1) {
        await sleep(interval);
        let data;
        try {
            data = await request(`/api/progress/${encodeURIComponent(progressId)}`, {}, {
                attempts: 1,
                timeoutMs: opts.timeoutMs,
                retryDelayMs: opts.retryDelayMs,
            });
        } catch (e) {
            // The progress endpoint is undocumented. A single transient 5xx /
            // timeout must not abandon a download that is still running upstream.
            lastPollError = e;
            continue;
        }
        if (data && data.stage === 'error') {
            throw new Error(`KnightBot API download job failed: ${data.message || 'unknown error'}`);
        }
        const link = downloadLinkFrom(data) || downloadLinkFrom(data && data.result);
        if (link) return link;
    }
    throw new Error(
        'KnightBot API download did not produce a file URL before the deadline' +
        (lastPollError ? ` (last progress error: ${lastPollError.message})` : '')
    );
}

/**
 * Fetch YouTube audio via /api/download/ytaudio.
 * Returns a Buffer — never a URL — so the caller can send it at any time.
 *
 * @param {string} youtubeUrl
 * @param {{title?:string, format?:string, attempts?:number, timeoutMs?:number,
 *          retryDelayMs?:number, fileTimeoutMs?:number, poll?:boolean,
 *          maxPolls?:number, pollIntervalMs?:number}} [opts]
 * @returns {Promise<{buffer:Buffer, title:string, source:string}>}
 */
async function fetchAudio(youtubeUrl, opts = {}) {
    if (!isConfigured()) throw new Error(`KnightBot API fallback is ${configurationError()}`);
    const url = String(youtubeUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('KnightBot API fallback needs a valid YouTube URL');

    const progressId = `optimus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await request('/api/download/ytaudio', {
        url,
        format: opts.format || '128kbps',
        progressId,
    }, opts);

    const download = await resolveDownload(result, progressId, opts);
    const buffer = await fetchFile(resolveFileUrl(download), opts);
    const title = (result && typeof result === 'object' && (result.title || result.name)) || opts.title || '';
    return { buffer, title: String(title), source: 'knightbot-api' };
}

/**
 * Lightweight health probe for lib/dlHealth.js. Uses a cheap endpoint and, when
 * available, reports remaining quota. Throws when the service is unusable.
 */
async function healthProbe(opts = {}) {
    const calc = await request('/api/tools/calc', { expr: '1+1' }, {
        attempts: 1,
        timeoutMs: Number(opts.timeoutMs) || 6000,
    });
    const value = calc && (calc.result !== undefined ? calc.result : calc.value);
    if (Number(value) !== 2) throw new Error('unexpected probe response');

    let quota = '';
    try {
        const usage = await request('/api/usage', {}, {
            attempts: 1,
            timeoutMs: Number(opts.timeoutMs) || 6000,
        });
        if (usage && usage.usage && usage.limits) {
            quota = ` · ${usage.usage.hour}/${usage.limits.hour} this hour`;
        }
    } catch {
        // Quota reporting is best-effort; the probe itself already succeeded.
    }
    return `ok${quota}`;
}

module.exports = {
    isConfigured,
    configurationError,
    status,
    buildUrl,
    resolveFileUrl,
    request,
    fetchFile,
    resolveDownload,
    fetchAudio,
    healthProbe,
    constants: { DEFAULT_BASE_URL, MAX_ATTEMPTS, MAX_FILE_BYTES, MAX_PROGRESS_POLLS },
};
