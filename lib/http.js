/**
 * http — tiny generic JSON GET helper for the keyless public-API commands.
 *
 * Wraps axios with a shared User-Agent and timeout so each command stays a few
 * lines. Rejects on network/HTTP error; callers catch and map to a styled error.
 */
const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * GET a URL and return the parsed JSON body.
 * @param {string} url
 * @param {{timeout?: number, headers?: object, params?: object}} [opts]
 */
async function getJson(url, opts = {}) {
    const res = await axios.get(url, {
        timeout: opts.timeout || 20000,
        headers: { 'User-Agent': UA, accept: 'application/json', ...(opts.headers || {}) },
        params: opts.params,
    });
    return res.data;
}

/**
 * POST a JSON body and return the parsed JSON response (used for GraphQL).
 * @param {string} url
 * @param {object} body
 * @param {{timeout?: number, headers?: object}} [opts]
 */
async function postJson(url, body, opts = {}) {
    const res = await axios.post(url, body, {
        timeout: opts.timeout || 20000,
        headers: { 'User-Agent': UA, accept: 'application/json', 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    return res.data;
}

module.exports = { getJson, postJson };
