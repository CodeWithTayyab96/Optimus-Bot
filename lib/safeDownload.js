/**
 * safeDownload — guarded HTTPS GET for user-supplied links.
 *
 * Downloading a URL a user pastes into a group is an SSRF surface: without
 * checks, "https://169.254.169.254/latest/meta-data/" or a redirect to an
 * internal host would make the BOT fetch it and then send the result back to
 * the chat. This helper is the single place that decides which hosts are safe.
 *
 * GUARANTEES
 *   - https only; no credentials embedded in the URL; IP-literal hosts refused.
 *   - Every redirect hop is resolved manually and re-validated against the
 *     allowlist before it is followed (max 5 hops). A redirect to an off-list
 *     host is refused rather than silently followed.
 *   - Content-Length and the streamed body are both capped, so a "download"
 *     cannot exhaust the process memory.
 *   - A hard timeout is applied per hop; Set-Cookie values are carried forward
 *     (Google Drive's large-file confirmation flow needs the first cookie).
 *
 * Host rules are exact strings, or a leading-dot suffix for subdomains, e.g.
 *   ['github.com', '.googleusercontent.com'].
 * The fetch implementation is injectable so this can be tested entirely offline.
 */
const net = require('net');

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024; // 64 MiB — safe for WhatsApp documents
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_REDIRECTS = 5;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

/** Is this hostname permitted by the rule list? */
function hostAllowed(hostname, rules) {
    const host = String(hostname || '').toLowerCase();
    return (rules || []).some((rule) => {
        const r = String(rule).toLowerCase();
        if (r.startsWith('.')) return host.endsWith(r) && host.length > r.length;
        return host === r;
    });
}

/** Validate a URL before any network I/O. Returns the parsed URL. */
function assertSafeUrl(raw, rules) {
    let url;
    try {
        url = new URL(String(raw));
    } catch {
        throw new Error('that is not a valid URL');
    }
    if (url.protocol !== 'https:') throw new Error('only https links are allowed');
    if (url.username || url.password) throw new Error('links with embedded credentials are not allowed');
    const bareHost = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(bareHost)) throw new Error('raw IP-address links are not allowed');
    if (!hostAllowed(bareHost, rules)) throw new Error(`host is not on the allowlist: ${bareHost}`);
    return url;
}

function headerValue(headers, name) {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    const v = headers[name] ?? headers[String(name).toLowerCase()];
    return v === undefined ? null : v;
}

function collectCookies(headers) {
    if (!headers) return [];
    if (typeof headers.getSetCookie === 'function') return headers.getSetCookie() || [];
    const single = headerValue(headers, 'set-cookie');
    return single ? [single] : [];
}

/** Merge Set-Cookie name=value pairs into a simple Cookie header value. */
function mergeCookies(existing, setCookies) {
    const jar = new Map();
    for (const pair of String(existing || '').split(';')) {
        const idx = pair.indexOf('=');
        if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
    for (const line of setCookies) {
        const first = String(line).split(';')[0];
        const idx = first.indexOf('=');
        if (idx > 0) jar.set(first.slice(0, idx).trim(), first.slice(idx + 1).trim());
    }
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function readCapped(body, maxBytes) {
    if (!body) return Buffer.alloc(0);
    if (Buffer.isBuffer(body)) {
        if (body.length > maxBytes) throw new Error('file exceeds the download size limit');
        return body;
    }
    if (typeof body.getReader === 'function') {
        const reader = body.getReader();
        const chunks = [];
        let total = 0;
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = Buffer.from(value || []);
                total += chunk.length;
                if (total > maxBytes) throw new Error('file exceeds the download size limit');
                chunks.push(chunk);
            }
        } finally {
            try { reader.releaseLock?.(); } catch { /* already released */ }
        }
        return Buffer.concat(chunks);
    }
    if (typeof body.arrayBuffer === 'function') {
        const buffer = Buffer.from(await body.arrayBuffer());
        if (buffer.length > maxBytes) throw new Error('file exceeds the download size limit');
        return buffer;
    }
    throw new Error('unsupported response body');
}

/**
 * Fetch a URL into a Buffer, validating every hop.
 *
 * @param {string} url
 * @param {{allowedHosts:string[], maxBytes?:number, timeoutMs?:number,
 *          headers?:object, cookies?:string, fetchImpl?:Function}} opts
 * @returns {Promise<{buffer:Buffer, contentType:string|null,
 *           contentDisposition:string|null, finalUrl:string, cookies:string}>}
 */
async function downloadBuffer(url, opts = {}) {
    const fetchImpl = opts.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('no fetch implementation available');
    const rules = opts.allowedHosts || [];
    const maxBytes = Number(opts.maxBytes) || DEFAULT_MAX_BYTES;
    const timeoutMs = Number(opts.timeoutMs) || DEFAULT_TIMEOUT_MS;

    let current = String(url);
    let cookies = String(opts.cookies || '');

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        assertSafeUrl(current, rules);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let res;
        try {
            res = await fetchImpl(current, {
                method: 'GET',
                redirect: 'manual',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'OptimusBot/1.0 (+https://github.com/CodeWithTayyab96/Optimus-Bot)',
                    Accept: '*/*',
                    ...(opts.headers || {}),
                    ...(cookies ? { Cookie: cookies } : {}),
                },
            });
        } catch (e) {
            if (e && e.name === 'AbortError') throw new Error('download timed out');
            throw new Error(`download failed: ${e && e.message ? e.message : e}`);
        } finally {
            clearTimeout(timer);
        }

        cookies = mergeCookies(cookies, collectCookies(res.headers));

        if (REDIRECT_CODES.has(res.status)) {
            const location = headerValue(res.headers, 'location');
            if (!location) throw new Error('redirect without a Location header');
            // Validate BEFORE following — the whole point of manual redirects.
            current = new URL(location, current).href;
            assertSafeUrl(current, rules);
            continue;
        }

        if (res.ok === false || res.status < 200 || res.status >= 300) {
            throw new Error(`download failed with HTTP ${res.status}`);
        }

        const declared = Number(headerValue(res.headers, 'content-length') || 0);
        if (declared > maxBytes) throw new Error('file exceeds the download size limit');

        const buffer = await readCapped(res.body, maxBytes);
        return {
            buffer,
            contentType: headerValue(res.headers, 'content-type'),
            contentDisposition: headerValue(res.headers, 'content-disposition'),
            finalUrl: current,
            cookies,
        };
    }
    throw new Error('too many redirects');
}

/** Pull a safe filename out of Content-Disposition, or a URL path. */
function filenameFrom(disposition, finalUrl, fallback = 'download.bin') {
    let name = '';
    const raw = String(disposition || '');
    const starred = raw.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    const plain = raw.match(/filename\s*=\s*(?:"([^"]*)"|([^;]+))/i);
    if (starred) {
        try { name = decodeURIComponent(starred[1].trim()); } catch { name = starred[1].trim(); }
    } else if (plain) {
        name = (plain[1] || plain[2] || '').trim();
    }
    if (!name) {
        try { name = decodeURIComponent(new URL(finalUrl).pathname.split('/').filter(Boolean).pop() || ''); } catch { name = ''; }
    }
    name = String(name || '')
        .replace(/[\/\\\x00-\x1f]/g, '_')
        .replace(/^\.+/, '')
        .trim()
        .slice(0, 120);
    return name || fallback;
}

/** Very small MIME guess for the file types these commands produce. */
function mimetypeFor(filename, contentType) {
    const type = String(contentType || '').split(';')[0].trim().toLowerCase();
    if (type && type !== 'application/octet-stream' && !type.includes('html')) return type;
    const ext = String(filename || '').toLowerCase().split('.').pop();
    const map = {
        zip: 'application/zip', pdf: 'application/pdf', mp3: 'audio/mpeg',
        mp4: 'video/mp4', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', txt: 'text/plain', json: 'application/json',
        md: 'text/markdown', tar: 'application/x-tar', gz: 'application/gzip',
    };
    return map[ext] || 'application/octet-stream';
}

module.exports = {
    downloadBuffer,
    assertSafeUrl,
    hostAllowed,
    filenameFrom,
    mimetypeFor,
    constants: { DEFAULT_MAX_BYTES, DEFAULT_TIMEOUT_MS, MAX_REDIRECTS },
};
