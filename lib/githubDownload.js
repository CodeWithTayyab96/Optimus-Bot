/**
 * githubDownload — download public GitHub content by link.
 *
 * No API key and no third-party service. Four link shapes are supported:
 *   repo            https://github.com/owner/repo            -> default-branch ZIP
 *   release asset   .../releases/download/tag/asset.zip      -> that asset
 *   release tag     .../releases/tag/v1.2.3                 -> first published asset
 *   file            .../blob/main/path/file  OR  raw.githubusercontent.com/...
 *
 * Repo archives and release assets are plain HTTPS downloads; the GitHub REST
 * API is only used for metadata (default branch / release asset list) and is
 * unauthenticated (60 requests/hour per IP). Every hop goes through
 * lib/safeDownload.js, so redirects to GitHub's asset CDN are validated.
 *
 * Private repos, LFS pointers and folders are out of scope — GitHub does not
 * expose those as a single anonymous download.
 */
const { downloadBuffer, filenameFrom, mimetypeFor } = require('./safeDownload');

const HOSTS = [
    'github.com', 'codeload.github.com', 'api.github.com',
    '.githubusercontent.com',
];
const DEFAULT_MAX_BYTES = Number(process.env.DOWNLOAD_MAX_BYTES) || 64 * 1024 * 1024;
const SEGMENT = '[A-Za-z0-9._-]+';

function options(opts) {
    return {
        allowedHosts: HOSTS,
        maxBytes: Number(opts.maxBytes) || DEFAULT_MAX_BYTES,
        timeoutMs: Number(opts.timeoutMs) || 30000,
        fetchImpl: opts.fetchImpl,
    };
}

/** Read a small JSON document through the same guarded fetch. */
async function getJson(url, opts) {
    const res = await downloadBuffer(url, { ...options(opts), maxBytes: 1024 * 1024 });
    try {
        return JSON.parse(res.buffer.toString('utf8'));
    } catch {
        throw new Error('GitHub returned an unreadable metadata response');
    }
}

/**
 * Turn any supported GitHub link into { url, filename }.
 * Pure apart from the optional metadata lookup, which is injected for tests.
 */
async function resolveGithub(link, opts = {}) {
    const raw = String(link || '').trim();
    if (!raw) throw new Error('no GitHub link provided');

    let url;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('that is not a GitHub link');
    }

    const host = url.hostname.toLowerCase();
    if (host === 'raw.githubusercontent.com' || host === 'codeload.github.com') {
        const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || 'download.bin');
        return { url: url.href, filename: name };
    }
    if (host !== 'github.com' && host !== 'www.github.com') {
        throw new Error('that is not a GitHub link');
    }

    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts.length < 2) throw new Error('that GitHub link has no repository');
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    if (!new RegExp(`^${SEGMENT}$`).test(owner) || !new RegExp(`^${SEGMENT}$`).test(repo)) {
        throw new Error('that GitHub repository name is not valid');
    }
    const base = `${owner}/${repo}`;
    const tail = parts.slice(2);

    // ── explicit release asset ─────────────────────────────────────────────
    if (tail[0] === 'releases' && tail[1] === 'download' && tail.length >= 4) {
        const filename = decodeURIComponent(parts[parts.length - 1]);
        return { url: url.href, filename };
    }

    // ── release tag: pick the first published asset via the API ─────────────
    if (tail[0] === 'releases' && tail[1] === 'tag' && tail[2]) {
        const tag = encodeURIComponent(tail[2]);
        const release = opts.metadata || await getJson(
            `https://api.github.com/repos/${base}/releases/tags/${tag}`, opts
        );
        const asset = release && Array.isArray(release.assets) && release.assets[0];
        if (!asset || !asset.browser_download_url) {
            throw new Error('that release has no downloadable assets — try the repo link for the source ZIP');
        }
        return {
            url: String(asset.browser_download_url),
            filename: String(asset.name || 'release-asset.bin'),
        };
    }

    // ── archive link (pass through; GitHub redirects to codeload) ───────────
    if (tail[0] === 'archive' && tail.length >= 2) {
        const filename = `${repo}-${decodeURIComponent(parts[parts.length - 1])}`;
        return { url: url.href, filename };
    }

    // ── blob / raw file -> raw.githubusercontent.com ────────────────────────
    if ((tail[0] === 'blob' || tail[0] === 'raw') && tail.length >= 3) {
        const ref = tail[1];
        const filePath = tail.slice(2);
        if (!new RegExp(`^${SEGMENT}$`).test(ref) || filePath.some((p) => p === '..' || p.includes('\\'))) {
            throw new Error('that GitHub file path is not valid');
        }
        const path = filePath.map(encodeURIComponent).join('/');
        return {
            url: `https://raw.githubusercontent.com/${base}/${encodeURIComponent(ref)}/${path}`,
            filename: filePath[filePath.length - 1],
        };
    }

    // ── plain repo (also /tree/<branch>) -> default-branch ZIP ──────────────
    let branch = (tail[0] === 'tree' && tail[1]) ? tail[1] : null;
    if (!branch) {
        try {
            const info = opts.metadata || await getJson(`https://api.github.com/repos/${base}`, opts);
            branch = info && info.default_branch ? String(info.default_branch) : 'main';
        } catch {
            branch = 'main'; // API rate-limited / offline — try the common default
        }
    }
    if (!new RegExp(`^${SEGMENT}$`).test(branch)) throw new Error('that branch name is not valid');
    return {
        url: `https://codeload.github.com/${base}/zip/refs/heads/${encodeURIComponent(branch)}`,
        filename: `${repo}-${branch}.zip`,
    };
}

/**
 * Download a GitHub file/repo archive into a Buffer.
 * @returns {Promise<{buffer:Buffer, filename:string, mimetype:string}>}
 */
async function downloadGithub(link, opts = {}) {
    const resolved = await resolveGithub(link, opts);
    const res = await downloadBuffer(resolved.url, options(opts));
    if (!res.buffer.length) throw new Error('GitHub returned an empty file');
    const filename = filenameFrom(res.contentDisposition, res.finalUrl, resolved.filename);
    return {
        buffer: res.buffer,
        filename,
        mimetype: mimetypeFor(filename, res.contentType),
    };
}

module.exports = { downloadGithub, resolveGithub, HOSTS, DEFAULT_MAX_BYTES };
