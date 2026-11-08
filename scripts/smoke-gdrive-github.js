#!/usr/bin/env node
/**
 * Smoke test: Google Drive + GitHub downloads, entirely offline.
 *
 * A stubbed fetch (real Response objects) proves the SSRF/size/redirect guards
 * and both download flows without touching the network. This matters because
 * these commands take URLs straight from group messages.
 *
 * Usage: node scripts/smoke-gdrive-github.js
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const safe = require(path.join(ROOT, 'lib', 'safeDownload'));
const gdrive = require(path.join(ROOT, 'lib', 'gdrive'));
const github = require(path.join(ROOT, 'lib', 'githubDownload'));

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

// -------------------------------------------------------------- fetch stub ---
let calls = [];
let handlers = [];
function setHandlers(list) {
    calls = [];
    handlers = list.slice();
}
function json(data, headers = {}) {
    return { body: Buffer.from(JSON.stringify(data)), headers: { 'content-type': 'application/json', ...headers } };
}
function binary(text, headers = {}) {
    return { body: Buffer.from(text), headers: { 'content-type': 'application/octet-stream', ...headers } };
}
function html(text, headers = {}) {
    return { body: Buffer.from(text), headers: { 'content-type': 'text/html; charset=utf-8', ...headers } };
}
const fetchStub = async (url, init) => {
    calls.push({ url: String(url), headers: (init && init.headers) || {}, init: init || {} });
    if (!handlers.length) throw new Error('unexpected fetch: ' + url);
    const h = handlers.shift();
    if (h.networkError) throw Object.assign(new Error(h.networkError), { name: h.abort ? 'AbortError' : 'Error' });
    if (h.redirect) return new Response(null, { status: 302, headers: { location: h.redirect } });
    return new Response(h.body, { status: h.status || 200, headers: h.headers || {} });
};

const GH = ['github.com', 'codeload.github.com', 'api.github.com', '.githubusercontent.com'];
const DRIVE = gdrive.HOSTS;
const stub = { fetchImpl: fetchStub };

(async () => {
    console.log('\n=== safeDownload: URL guards ===');
    {
        setHandlers([binary('OK')]);
        const r = await safe.downloadBuffer('https://github.com/o/r/raw/x', { allowedHosts: GH, ...stub });
        check('an allowlisted https URL downloads', r.buffer.toString() === 'OK');
        check('redirects are handled manually, never auto-followed',
            calls[0].init.redirect === 'manual' && calls[0].init.signal);

        const beforeRejects = calls.length;
        for (const [url, pattern] of [
            ['http://github.com/o/r', /https/],
            ['https://127.0.0.1/latest/meta-data/', /IP-address/],
            ['https://user:pass@github.com/o/r', /credentials/],
            ['https://evil.example/o/r', /allowlist/],
        ]) {
            let threw = false;
            try { await safe.downloadBuffer(url, { allowedHosts: GH, ...stub }); } catch (e) {
                threw = pattern.test(e.message);
            }
            check(`refuses ${url.split('@').pop().slice(0, 38)}`, threw);
        }
        check('no network call was made for rejected URLs',
            calls.length === beforeRejects, `calls=${calls.length}`);
    }

    console.log('\n=== safeDownload: redirect / size / timeout guards ===');
    {
        setHandlers([
            { redirect: 'https://codeload.github.com/o/r/zip/main' },
            binary('ZIP'),
        ]);
        const r = await safe.downloadBuffer('https://github.com/o/r/archive/main.zip', { allowedHosts: GH, ...stub });
        check('a redirect to an allowlisted host is followed', r.buffer.toString() === 'ZIP');
        check('finalUrl is the last hop', r.finalUrl.includes('codeload.github.com'));

        setHandlers([{ redirect: 'https://evil.example/x' }, binary('SHOULD-NOT-READ')]);
        let threw = false;
        try { await safe.downloadBuffer('https://github.com/o/r', { allowedHosts: GH, ...stub }); } catch (e) {
            threw = /allowlist/.test(e.message);
        }
        check('a redirect to an off-list host is refused', threw);
        check('the off-list redirect is NOT fetched', calls.length === 1, `calls=${calls.length}`);

        setHandlers([{ headers: { 'content-length': '999999999' }, body: Buffer.from('small') }]);
        threw = false;
        try { await safe.downloadBuffer('https://github.com/o/r', { allowedHosts: GH, maxBytes: 100, ...stub }); } catch (e) {
            threw = /size limit/.test(e.message);
        }
        check('an oversized Content-Length is refused before reading', threw);

        setHandlers([binary('much-too-long')]);
        threw = false;
        try { await safe.downloadBuffer('https://github.com/o/r', { allowedHosts: GH, maxBytes: 4, ...stub }); } catch (e) {
            threw = /size limit/.test(e.message);
        }
        check('a streamed body over the cap is refused', threw);

        setHandlers([{ networkError: 'aborted', abort: true }]);
        threw = false;
        try { await safe.downloadBuffer('https://github.com/o/r', { allowedHosts: GH, timeoutMs: 10, ...stub }); } catch (e) {
            threw = /timed out/.test(e.message);
        }
        check('an abort is reported as a timeout', threw);

        setHandlers(Array.from({ length: 8 }, (_, i) => ({ redirect: `https://github.com/hop/${i}` })));
        threw = false;
        try { await safe.downloadBuffer('https://github.com/start', { allowedHosts: GH, ...stub }); } catch (e) {
            threw = /too many redirects/.test(e.message);
        }
        check('more than 5 redirects is refused', threw);
        check('the hop ceiling bounds the number of requests', calls.length <= 6, `calls=${calls.length}`);
    }

    console.log('\n=== filename / MIME helpers ===');
    {
        check('RFC5987 filename* is decoded',
            safe.filenameFrom("attachment; filename*=UTF-8''my%20file.zip", 'https://x/a') === 'my file.zip');
        check('quoted filename is used',
            safe.filenameFrom('attachment; filename="report.pdf"', 'https://x/a') === 'report.pdf');
        check('path fallback works', safe.filenameFrom(null, 'https://x/dir/thing.txt') === 'thing.txt');
        check('path traversal in a filename is neutralised',
            !safe.filenameFrom('attachment; filename="../../etc/passwd"', 'https://x/a').includes('/'));
        check('zip MIME is inferred', safe.mimetypeFor('a.zip', 'application/octet-stream') === 'application/zip');
        check('a real content-type wins', safe.mimetypeFor('a.bin', 'video/mp4; charset=x') === 'video/mp4');
    }

    console.log('\n=== Google Drive: link parsing ===');
    {
        const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
        check('/file/d/<id>/view', gdrive.fileIdFrom(`https://drive.google.com/file/d/${ID}/view?usp=sharing`) === ID);
        check('open?id=', gdrive.fileIdFrom(`https://drive.google.com/open?id=${ID}`) === ID);
        check('uc?id=', gdrive.fileIdFrom(`https://drive.usercontent.google.com/download?id=${ID}`) === ID);
        check('bare id', gdrive.fileIdFrom(ID) === ID);
        for (const [link, pattern] of [
            [`https://drive.google.com/drive/folders/${ID}`, /FOLDER/],
            ['https://example.com/file', /not a Google Drive link/],
        ]) {
            let threw = false;
            try { gdrive.fileIdFrom(link); } catch (e) { threw = pattern.test(e.message); }
            check(`rejects ${link.slice(0, 45)}`, threw);
        }
    }

    console.log('\n=== Google Drive: small + large file flows ===');
    {
        setHandlers([binary('DRIVE-BYTES', {
            'content-disposition': 'attachment; filename="notes.pdf"',
            'content-type': 'application/pdf',
        })]);
        const small = await gdrive.downloadGDrive('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view', stub);
        check('a small public file downloads directly', small.buffer.toString() === 'DRIVE-BYTES');
        check('filename comes from Content-Disposition', small.filename === 'notes.pdf');
        check('mimetype is preserved', small.mimetype === 'application/pdf');
        check('the /uc endpoint is used', calls[0].url.includes('drive.google.com/uc'));

        const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
        setHandlers([
            html('<form><input type="hidden" name="confirm" value="t7k"><input type="hidden" name="uuid" value="U-123"></form>',
                { 'set-cookie': 'download_warning=abc; Path=/' }),
            binary('LARGE-FILE', { 'content-disposition': 'attachment; filename="big.zip"' }),
        ]);
        const large = await gdrive.downloadGDrive(`https://drive.google.com/file/d/${ID}/view`, stub);
        check('the large-file confirm flow returns the bytes', large.buffer.toString() === 'LARGE-FILE');
        check('the second hop uses drive.usercontent.google.com',
            calls[1].url.includes('drive.usercontent.google.com'));
        check('the confirm token is forwarded', /confirm=t7k/.test(calls[1].url));
        check('the uuid is forwarded', /uuid=U-123/.test(calls[1].url));
        check('the first-hop cookie is carried forward',
            /download_warning=abc/.test(String(calls[1].headers.Cookie || '')),
            String(calls[1].headers.Cookie));

        setHandlers([
            html('<html>confirm form</html>'),
            html('<html>You need access</html>'),
        ]);
        let threw = false;
        try { await gdrive.downloadGDrive(`https://drive.google.com/file/d/${ID}/view`, stub); } catch (e) {
            threw = /private, deleted, or quota-limited/.test(e.message);
        }
        check('a private / unavailable file gives a clear error', threw);

        setHandlers([{ status: 404, body: Buffer.from('<html>Not Found</html>'), headers: { 'content-type': 'text/html' } }]);
        threw = false;
        try { await gdrive.downloadGDrive(`https://drive.google.com/file/d/${ID}/view`, stub); } catch (e) {
            threw = /private, deleted, or no longer shared/.test(e.message);
        }
        check('a dead link gives an actionable message instead of a bare 404', threw);

        setHandlers([binary('')]);
        threw = false;
        try { await gdrive.downloadGDrive(`https://drive.google.com/file/d/${ID}/view`, stub); } catch (e) {
            threw = /empty file/.test(e.message);
        }
        check('an empty file is refused', threw);
    }

    console.log('\n=== GitHub: URL resolution ===');
    {
        const meta = { default_branch: 'dev' };
        const resolved = await github.resolveGithub('https://github.com/WhiskeySockets/Baileys', { ...stub, metadata: meta });
        check('a repo link resolves to a codeload ZIP', resolved.url.includes('codeload.github.com'));
        check('the default branch from metadata is used', resolved.url.endsWith('/dev'));
        check('the archive filename is derived', resolved.filename === 'Baileys-dev.zip');

        setHandlers([json(meta)]);
        const apiResolved = await github.resolveGithub('https://github.com/o/r', stub);
        check('the GitHub API is queried for the default branch',
            calls.some((c) => c.url.includes('api.github.com/repos/o/r')) && apiResolved.filename === 'r-dev.zip');

        setHandlers([{ status: 403, body: Buffer.from('rate limited') }]);
        const offline = await github.resolveGithub('https://github.com/o/r', stub);
        check('an API failure falls back to main', offline.filename === 'r-main.zip');

        const asset = await github.resolveGithub('https://github.com/o/r/releases/download/v1/app.zip', stub);
        check('a release asset URL is used as-is', asset.url.includes('/releases/download/v1/app.zip'));
        check('the asset filename is preserved', asset.filename === 'app.zip');

        const tag = await github.resolveGithub('https://github.com/o/r/releases/tag/v1', {
            ...stub, metadata: { assets: [{ name: 'app.zip', browser_download_url: 'https://github.com/o/r/releases/download/v1/app.zip' }] },
        });
        check('a release tag picks its first asset', tag.filename === 'app.zip');

        const blob = await github.resolveGithub('https://github.com/o/r/blob/main/src/index.js', stub);
        check('a blob link becomes a raw URL', blob.url === 'https://raw.githubusercontent.com/o/r/main/src/index.js');
        check('the raw filename is preserved', blob.filename === 'index.js');

        const raw = await github.resolveGithub('https://raw.githubusercontent.com/o/r/main/README.md', stub);
        check('a raw URL passes through', raw.url.includes('raw.githubusercontent.com') && raw.filename === 'README.md');

        for (const [link, pattern] of [
            ['https://evil.example/o/r', /not a GitHub link/],
            ['https://github.com/o/r/blob/main/a%5Cb', /not valid/],
        ]) {
            let threw = false;
            try { await github.resolveGithub(link, stub); } catch (e) { threw = pattern.test(e.message); }
            check(`rejects ${link.slice(0, 48)}`, threw);
        }
    }

    console.log('\n=== GitHub: end-to-end download with a CDN redirect ===');
    {
        setHandlers([
            { redirect: 'https://objects.githubusercontent.com/asset.zip' },
            binary('ASSET-ZIP', { 'content-type': 'application/zip' }),
        ]);
        const file = await github.downloadGithub('https://github.com/o/r/releases/download/v1/app.zip', stub);
        check('a release asset downloads through the CDN redirect', file.buffer.toString() === 'ASSET-ZIP');
        check('the MIME is inferred as zip', file.mimetype === 'application/zip');

        setHandlers([{ redirect: 'https://evil.example/x' }, binary('NO')]);
        let threw = false;
        try { await github.downloadGithub('https://github.com/o/r/releases/download/v1/app.zip', stub); } catch (e) {
            threw = /allowlist/.test(e.message);
        }
        check('an off-list CDN redirect is refused', threw);
    }

    console.log('\n=== commands + .download router ===');
    {
        const realFetch = globalThis.fetch;
        globalThis.fetch = fetchStub;

        function fakeBot() {
            const sent = [];
            const sock = { sendMessage: async (_jid, content) => { sent.push(content); return {}; } };
            const message = { key: { id: 'x', remoteJid: 'g@g.us' } };
            const extra = { chatId: 'g@g.us', prefix: '.', reply: async (c) => { sent.push(c); return {}; } };
            return { sock, message, extra, sent };
        }

        setHandlers([binary('DRIVE-CMD', { 'content-disposition': 'attachment; filename="doc.pdf"' })]);
        const gcmd = require(path.join(ROOT, 'commands', 'media', 'gdrive'));
        const bot1 = fakeBot();
        await gcmd.execute(bot1.sock, bot1.message, ['https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view'], bot1.extra);
        const doc1 = bot1.sent.find((m) => m && m.document);
        check('.gdrive sends a document', Boolean(doc1));
        check('the document carries the downloaded bytes',
            doc1 && Buffer.isBuffer(doc1.document) && doc1.document.toString() === 'DRIVE-CMD');
        check('the document has a fileName', doc1 && doc1.fileName === 'doc.pdf');

        setHandlers([binary('GH-CMD', { 'content-disposition': 'attachment; filename="r-main.zip"' })]);
        const hcmd = require(path.join(ROOT, 'commands', 'media', 'githubdl'));
        const bot2 = fakeBot();
        await hcmd.execute(bot2.sock, bot2.message, ['https://github.com/o/r/releases/download/v1/r-main.zip'], bot2.extra);
        const doc2 = bot2.sent.find((m) => m && m.document);
        check('.githubdl sends a document', Boolean(doc2));
        check('the document has a fileName', doc2 && doc2.fileName === 'r-main.zip');

        setHandlers([{ status: 403, body: Buffer.from('no') }]);
        const bot3 = fakeBot();
        await gcmd.execute(bot3.sock, bot3.message, ['https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view'], bot3.extra);
        check('a failed download replies with an error, not a crash',
            bot3.sent.some((m) => typeof m === 'string' && /failed/i.test(m)));

        globalThis.fetch = realFetch;

        for (const file of ['commands/media/gdrive.js', 'commands/media/githubdl.js']) {
            const src = read(file);
            check(`${file} has command metadata`,
                /name:\s*'/.test(src) && /category:\s*'media'/.test(src) && /usage:\s*'/.test(src));
        }
        const router = read('commands/media/download.js');
        check('.download routes Drive links to .gdrive', /file: 'gdrive'/.test(router));
        check('.download routes GitHub links to .githubdl', /file: 'githubdl'/.test(router));
        check('.download help lists both new sources',
            /Google Drive, GitHub/.test(router));
        check('all download libs are dependency-free (no undeclared requires)',
            !/require\('(fluent-ffmpeg|node-webpmux|yt-search|cheerio|mumaker)'\)/.test(
                read('lib/safeDownload.js') + read('lib/gdrive.js') + read('lib/githubDownload.js')));
    }

    console.log(`\n${pass - fail}/${pass} drive/github checks passed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
    console.error('❌ smoke-gdrive-github crashed:', err);
    process.exit(1);
});
