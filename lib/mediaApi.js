/**
 * mediaApi — shared HTTP helpers for the media / downloader commands.
 *
 * Most of the downloaders call the NexOracle aggregator:
 *
 *     GET  https://api.nexoracle.com/<path>?apikey=<key>&<params>
 *
 * The API key is the shared public key shipped by Shadow. It is centralised
 * here (and overridable via NEXORACLE_API_KEY) so it can be swapped in ONE
 * place without touching any command — if you hit rate limits, set your own
 * key in the environment and every downloader picks it up.
 *
 * Nothing here throws to the caller by accident: fetchJson/nexoracle reject on
 * network/HTTP errors, and each command catches and maps them to a styled
 * user-facing error.
 */
const proxyPool = require('./proxyPool');

const NEXORACLE_API = process.env.NEXORACLE_API || 'https://api.nexoracle.com/';
const NEXORACLE_KEY = process.env.NEXORACLE_API_KEY || 'free_key@maher_apis&q';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * GET a URL and return the parsed JSON body. Rejects on network/HTTP error.
 * @param {string} url
 * @param {{timeout?: number, headers?: object}} [opts]
 */
async function fetchJson(url, opts = {}) {
    const res = await proxyPool.get(url, {
        timeout: opts.timeout || 30000,
        headers: { 'User-Agent': UA, accept: '*/*', ...(opts.headers || {}) },
    });
    return res.data;
}

/**
 * Call a NexOracle endpoint.
 * @param {string} path   e.g. 'downloader/mediafire' (leading slashes are trimmed)
 * @param {object} [params] query params — `apikey` is added automatically
 * @returns {Promise<any>} parsed JSON
 */
async function nexoracle(path, params = {}) {
    const extra = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
    const cleanPath = String(path).replace(/^\/+/, '');
    const url = `${NEXORACLE_API}${cleanPath}?apikey=${NEXORACLE_KEY}${extra ? '&' + extra : ''}`;
    return fetchJson(url);
}

module.exports = { nexoracle, fetchJson, NEXORACLE_API, NEXORACLE_KEY };
