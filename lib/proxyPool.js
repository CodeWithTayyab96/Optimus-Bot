/**
 * proxyPool — outbound proxy selection for the download commands.
 *
 * Reads `settings.proxies` (comma-separated via the PROXIES env var). Picks a
 * proxy at random per request, falls back to a DIRECT connection when the list
 * is empty, and remembers recent failures in memory so a proxy that just timed
 * out is deprioritised for the next few minutes (never persisted).
 *
 * Supported forms:
 *   http://user:pass@host:port   https://host:port   socks5://host:port
 *
 * If a socks agent isn't installed, socks entries fall back to direct.
 */
const axios = require('axios');
const settings = require('../settings');

const FAIL_TTL_MS = 5 * 60 * 1000; // deprioritise a failed proxy for 5 minutes

const failures = new Map(); // proxyUrl -> last failure timestamp
let lastUsed = null;        // most recently selected proxy (or null = direct)

/** Configured proxy URLs (empty array = direct). */
function list() {
    return Array.isArray(settings.proxies) ? settings.proxies.filter(Boolean) : [];
}

function isDeprioritised(url) {
    const t = failures.get(url);
    return Boolean(t) && (Date.now() - t) < FAIL_TTL_MS;
}

/** Pick a proxy at random, skipping recently-failed ones. Returns null = direct. */
function pick() {
    const all = list();
    if (!all.length) return null;
    const healthy = all.filter((u) => !isDeprioritised(u));
    const pool = healthy.length ? healthy : all; // if all are down, still try rather than hard-fail
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    lastUsed = chosen;
    return chosen;
}

/** Record the outcome of a request so failures get deprioritised. */
function report(url, ok) {
    if (!url) return;
    if (ok) failures.delete(url);
    else failures.set(url, Date.now());
}

/** Apply a proxy URL to an axios request config. Returns true if applied. */
function applyToAxios(proxyUrl, opts) {
    try {
        const u = new URL(proxyUrl);
        if (u.protocol === 'http:' || u.protocol === 'https:') {
            const { HttpsProxyAgent } = require('https-proxy-agent');
            const agent = new HttpsProxyAgent(proxyUrl);
            opts.httpAgent = agent;
            opts.httpsAgent = agent;
            opts.proxy = false; // stop axios applying its own proxy handling
            return true;
        }
        if (u.protocol === 'socks5:' || u.protocol === 'socks4:' || u.protocol === 'socks:') {
            const { SocksProxyAgent } = require('socks-proxy-agent');
            const agent = new SocksProxyAgent(proxyUrl);
            opts.httpAgent = agent;
            opts.httpsAgent = agent;
            opts.proxy = false;
            return true;
        }
    } catch {
        // unsupported / malformed / agent missing -> direct
    }
    return false;
}

/**
 * axios GET through the pool (falls back to direct). Records success/failure.
 * @returns {Promise<import('axios').AxiosResponse>}
 */
async function get(url, config = {}) {
    const proxy = pick();
    const opts = { ...config };
    let used = proxy;
    if (proxy && !applyToAxios(proxy, opts)) used = null; // couldn't apply -> direct

    try {
        const res = await axios.get(url, opts);
        report(used, true);
        lastUsed = used;
        return res;
    } catch (err) {
        report(used, false);
        throw err;
    }
}

/** Snapshot of pool health for .dlstatus. */
function status() {
    return list().map((url) => ({ url, healthy: !isDeprioritised(url), failedAt: failures.get(url) || null }));
}

function getLastUsed() {
    return lastUsed;
}

module.exports = { list, pick, report, get, status, getLastUsed, applyToAxios, isDeprioritised };
