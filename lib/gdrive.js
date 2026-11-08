/**
 * gdrive — download a PUBLIC Google Drive file by link.
 *
 * No third-party API and no credentials: Drive serves public files over plain
 * HTTPS. Two shapes exist:
 *   1. small files  -> the first /uc request returns the bytes directly;
 *   2. large files  -> Drive returns an HTML "virus scan / can't scan" page with
 *      hidden `confirm` and `uuid` fields, and the real download needs a second
 *      request carrying those fields plus the cookie from the first response.
 *
 * Everything goes through lib/safeDownload.js, so hosts, redirects, size and
 * timeouts are enforced on both hops. Requires the file to be shared publicly;
 * private files fail with a clear message instead of leaking an HTML page.
 */
const { downloadBuffer, filenameFrom, mimetypeFor } = require('./safeDownload');

const HOSTS = ['drive.google.com', 'drive.usercontent.google.com', '.googleusercontent.com'];
const DEFAULT_MAX_BYTES = Number(process.env.DOWNLOAD_MAX_BYTES) || 64 * 1024 * 1024;

/** Extract the file id from the common Drive link shapes (or a bare id). */
function fileIdFrom(input) {
    const raw = String(input || '').trim();
    if (!raw) throw new Error('no Google Drive link provided');

    let url;
    try {
        url = new URL(raw);
    } catch {
        // Allow a bare file id, which is what people often paste.
        if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return raw;
        throw new Error('that is not a Google Drive link');
    }

    if (!/(^|\.)drive\.google\.com$|(^|\.)drive\.usercontent\.google\.com$/i.test(url.hostname)) {
        throw new Error('that is not a Google Drive link');
    }
    if (/\/drive\/folders\//i.test(url.pathname) || /\/drive\/u\/\d+\/folders\//i.test(url.pathname)) {
        throw new Error('that is a Drive FOLDER — Google Drive folders cannot be downloaded as one file');
    }

    const inPath = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/i);
    if (inPath) return inPath[1];

    const inQuery = url.searchParams.get('id');
    if (inQuery && /^[A-Za-z0-9_-]{10,}$/.test(inQuery)) return inQuery;

    throw new Error('could not find a file id in that Drive link');
}

function hiddenValue(html, name) {
    const patterns = [
        new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)["']`, 'i'),
        new RegExp(`value=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i'),
    ];
    for (const re of patterns) {
        const m = html.match(re);
        if (m) return m[1];
    }
    return null;
}

function looksLikeHtml(buffer, contentType) {
    if (/text\/html/i.test(String(contentType || ''))) return true;
    const head = buffer.subarray(0, 512).toString('utf8', 0, Math.min(512, buffer.length)).trimStart();
    return /^<!doctype|^<html|^<script|^<meta/i.test(head);
}

/** Turn a bare HTTP status into something a user in a group can act on. */
function friendlyDriveError(error) {
    const message = String(error && error.message || error);
    if (/HTTP (401|403|404)/.test(message)) {
        return new Error('Drive did not return a file — the link may be private, deleted, or no longer shared publicly');
    }
    return error instanceof Error ? error : new Error(message);
}

/**
 * Download a public Drive file.
 * @param {string} link
 * @param {{maxBytes?:number, timeoutMs?:number, fetchImpl?:Function}} [opts]
 * @returns {Promise<{buffer:Buffer, filename:string, mimetype:string}>}
 */
async function downloadGDrive(link, opts = {}) {
    const id = fileIdFrom(link);
    const shared = {
        allowedHosts: HOSTS,
        maxBytes: Number(opts.maxBytes) || DEFAULT_MAX_BYTES,
        timeoutMs: Number(opts.timeoutMs) || 30000,
        fetchImpl: opts.fetchImpl,
    };

    const firstUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
    let res;
    try {
        res = await downloadBuffer(firstUrl, shared);
    } catch (e) {
        throw friendlyDriveError(e);
    }

    if (looksLikeHtml(res.buffer, res.contentType)) {
        const html = res.buffer.toString('utf8');
        const confirm = hiddenValue(html, 'confirm') || (html.match(/confirm=([A-Za-z0-9._-]+)/) || [])[1] || 't';
        const uuid = hiddenValue(html, 'uuid');
        const second = new URL('https://drive.usercontent.google.com/download');
        second.searchParams.set('id', id);
        second.searchParams.set('export', 'download');
        second.searchParams.set('confirm', confirm);
        if (uuid) second.searchParams.set('uuid', uuid);

        try {
            res = await downloadBuffer(second.toString(), { ...shared, cookies: res.cookies });
        } catch (e) {
            throw friendlyDriveError(e);
        }

        if (looksLikeHtml(res.buffer, res.contentType)) {
            // Usually "You need access" / quota exceeded / file no longer public.
            throw new Error('Drive did not return a file — the link may be private, deleted, or quota-limited');
        }
    }

    if (!res.buffer.length) throw new Error('Drive returned an empty file');
    const fallback = `${id}.bin`;
    const filename = filenameFrom(res.contentDisposition, res.finalUrl, fallback);
    return {
        buffer: res.buffer,
        filename,
        mimetype: mimetypeFor(filename, res.contentType),
    };
}

module.exports = { downloadGDrive, fileIdFrom, HOSTS, DEFAULT_MAX_BYTES };
