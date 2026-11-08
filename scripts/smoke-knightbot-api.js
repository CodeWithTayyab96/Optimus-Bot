#!/usr/bin/env node
/**
 * Smoke test: the OPTIONAL KnightBot API last-resort audio fallback.
 *
 * Entirely offline — axios.get is stubbed, so no request ever leaves the box.
 * It pins the safety properties that matter when a third-party downloader is
 * added to a WhatsApp bot:
 *   - off by default, demo/placeholder keys refused, https-only base URL;
 *   - the key goes in the X-API-Key HEADER, never into a GET query string;
 *   - success:false is an error, one bounded retry on 429/5xx/network only;
 *   - file URLs must be same-origin https, and files are buffered immediately;
 *   - job-style responses are polled with a bounded deadline;
 *   - the fallback is wired AFTER RapidAPI in lib/ytAudio.js and the health
 *     probe only exists when the fallback is enabled.
 *
 * Usage: node scripts/smoke-knightbot-api.js
 */
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const settings = require(path.join(ROOT, 'settings'));
const api = require(path.join(ROOT, 'lib', 'knightbotApi'));

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

// ------------------------------------------------------------- axios stub ---
const realGet = axios.get;
let calls = [];
let responses = [];
function queue(list) {
    calls = [];
    responses = list.slice();
}
axios.get = async (url, config) => {
    calls.push({ url, config: config || {} });
    if (!responses.length) throw new Error('unexpected axios.get (empty response queue)');
    const next = responses.shift();
    if (next && next.networkError) {
        const e = new Error(next.networkError);
        e.response = undefined;
        throw e;
    }
    return { status: next.status, data: next.data };
};

const KEY = 'private-test-key';
const BASE = 'https://knightbotapi.stream';
const okJson = (result) => ({ status: 200, data: { status: 200, success: true, result } });
const fileResponse = (text) => ({ status: 200, data: Buffer.from(text) });
const fast = { retryDelayMs: 0, pollIntervalMs: 0, attempts: 2, timeoutMs: 1000 };

function configure({ enabled = true, key = KEY, base = BASE } = {}) {
    settings.knightbotApiEnabled = enabled;
    settings.knightbotApiKey = key;
    settings.knightbotApiBaseUrl = base;
}

(async () => {
    console.log('\n=== opt-in gate: off by default, unsafe keys refused ===');
    {
        configure({ enabled: false });
        check('disabled when KNIGHTBOT_API_ENABLED is off', api.isConfigured() === false);
        check('reason names the flag', /KNIGHTBOT_API_ENABLED/.test(api.configurationError()));
        check('status reports disabled', api.status().configured === false && api.status().enabled === false);

        configure({ key: 'knight' });
        check('shared demo key is refused', api.isConfigured() === false);
        check('reason mentions the demo key', /demo key/.test(api.configurationError()));

        configure({ key: 'YOUR_KNIGHTBOT_API_KEY' });
        check('placeholder key is refused', api.isConfigured() === false);

        configure({ key: '', enabled: true });
        check('empty key is refused', api.isConfigured() === false);

        configure({ base: 'http://knightbotapi.stream' });
        check('plain-http base URL is refused', api.isConfigured() === false);
        check('reason mentions https', /https/.test(api.configurationError()));

        configure();
        check('enabled with a private key and https base', api.isConfigured() === true);
        check('status reports the configured origin', api.status().baseUrl === BASE);
    }

    console.log('\n=== URL construction and header auth ===');
    {
        const url = api.buildUrl('/api/tools/calc', { expr: '1+1' });
        check('path is appended to the base', url.startsWith(`${BASE}/api/tools/calc`), url);
        check('params are encoded', url.includes('expr=1%2B1'), url);
        check('no apikey query parameter', !/apikey=/i.test(url), url);

        queue([okJson({ result: 2 })]);
        const result = await api.request('/api/tools/calc', { expr: '1+1' }, fast);
        check('returns data.result', result && result.result === 2);
        check('key is sent in the X-API-Key header',
            calls[0].config.headers['X-API-Key'] === KEY);
        check('key appears nowhere in the URL',
            !String(calls[0].url).includes(KEY));
        check('key is not in a params object',
            !JSON.stringify(calls[0].config.params || {}).includes(KEY));
        check('request disables redirects', calls[0].config.maxRedirects === 0);
        check('request has a timeout', Number(calls[0].config.timeout) > 0);
        check('request has an abort signal', Boolean(calls[0].config.signal));
    }

    console.log('\n=== response validation and bounded retry ===');
    {
        queue([{ status: 200, data: { success: false, result: { error: 'bad url' } } }]);
        let threw = false;
        try { await api.request('/api/tools/calc', {}, { ...fast, attempts: 2 }); } catch { threw = true; }
        check('success:false is an error', threw);
        check('success:false is NOT retried', calls.length === 1, `calls=${calls.length}`);

        queue([
            { status: 429, data: {} },
            okJson({ result: 2 }),
        ]);
        const retried = await api.request('/api/tools/calc', {}, fast);
        check('429 is retried once and then succeeds', retried.result === 2);
        check('exactly two attempts', calls.length === 2, `calls=${calls.length}`);

        queue([
            { status: 429, data: {} },
            { status: 429, data: {} },
            okJson({ result: 2 }),
        ]);
        threw = false;
        try { await api.request('/api/tools/calc', {}, fast); } catch { threw = true; }
        check('two 429s stop the loop', threw);
        check('no third attempt', calls.length === 2, `calls=${calls.length}`);

        queue([{ status: 401, data: {} }, okJson({ result: 2 })]);
        threw = false;
        try { await api.request('/api/tools/calc', {}, fast); } catch (e) { threw = /key rejected/.test(e.message); }
        check('401 is reported as a bad key and not retried', threw && calls.length === 1);

        queue([{ networkError: 'socket hang up' }, okJson({ result: 2 })]);
        const recovered = await api.request('/api/tools/calc', {}, fast);
        check('a network error gets one retry', recovered.result === 2 && calls.length === 2);

        queue([{ networkError: 'socket hang up' }, { networkError: 'socket hang up' }]);
        threw = false;
        try { await api.request('/api/tools/calc', {}, fast); } catch { threw = true; }
        check('repeated network errors stop after two attempts', threw && calls.length === 2);
    }

    console.log('\n=== file URL guard (SSRF) ===');
    {
        check('relative /files/ path resolves to the configured origin',
            api.resolveFileUrl('/files/a1b2.mp3') === `${BASE}/files/a1b2.mp3`);
        check('same-origin absolute URL is allowed',
            api.resolveFileUrl(`${BASE}/files/x.mp3`) === `${BASE}/files/x.mp3`);
        for (const bad of ['https://evil.example/x.mp3', 'http://knightbotapi.stream/x.mp3', '']) {
            let threw = false;
            try { api.resolveFileUrl(bad); } catch { threw = true; }
            check(`refuses ${JSON.stringify(bad)}`, threw);
        }
    }

    console.log('\n=== audio fallback: buffer immediately, never a URL ===');
    {
        configure();
        queue([
            okJson({ download: '/files/audio.mp3', title: 'Track' }),
            fileResponse('AUDIO-BYTES'),
        ]);
        const audio = await api.fetchAudio('https://youtu.be/DTbfw8_SMmI', fast);
        check('returns a Buffer', Buffer.isBuffer(audio.buffer));
        check('buffer holds the file bytes', audio.buffer.toString() === 'AUDIO-BYTES');
        check('source is labelled', audio.source === 'knightbot-api');
        check('title comes from the response', audio.title === 'Track');
        check('the audio endpoint is used',
            calls[0].url.startsWith(`${BASE}/api/download/ytaudio`));
        check('the YouTube URL and format are sent',
            calls[0].url.includes('url=https%3A%2F%2Fyoutu.be') && calls[0].url.includes('format=128kbps'));
        check('a progressId is supplied', calls[0].url.includes('progressId='));
        check('the file is fetched from the same origin',
            calls[1].url === `${BASE}/files/audio.mp3`);
        check('the private key is NOT sent to the /files/ fetch',
            !JSON.stringify(calls[1].config.headers || {}).includes(KEY));
        check('the file fetch disables redirects', calls[1].config.maxRedirects === 0);
        check('the file fetch is size-capped',
            calls[1].config.maxContentLength === api.constants.MAX_FILE_BYTES);

        queue([okJson({ download: '/files/empty.mp3' }), fileResponse('')]);
        let threw = false;
        try { await api.fetchAudio('https://youtu.be/x', fast); } catch (e) { threw = /empty audio file/.test(e.message); }
        check('an empty file is rejected', threw);

        configure({ enabled: false });
        threw = false;
        try { await api.fetchAudio('https://youtu.be/x', fast); } catch { threw = true; }
        check('fetchAudio refuses to run when disabled', threw && calls.length === 2);
        configure();
    }

    console.log('\n=== job-style responses are polled with a deadline ===');
    {
        queue([
            okJson({ stage: 'queued' }),
            okJson({ stage: 'working' }),
            okJson({ download: '/files/late.mp3' }),
            fileResponse('LATE-AUDIO'),
        ]);
        const audio = await api.fetchAudio('https://youtu.be/x', { ...fast, maxPolls: 3 });
        check('a polled download link is used', audio.buffer.toString() === 'LATE-AUDIO');
        check('progress endpoint was polled',
            calls.some((c) => c.url.includes('/api/progress/')));

        queue([
            okJson({ stage: 'queued' }),
            okJson({ stage: 'working' }),
        ]);
        let threw = false;
        try { await api.fetchAudio('https://youtu.be/x', { ...fast, maxPolls: 1 }); } catch (e) {
            threw = /deadline/.test(e.message);
        }
        check('polling stops at the deadline', threw);

        queue([
            okJson({ stage: 'queued' }),
            { networkError: 'progress endpoint timed out' },
            okJson({ download: '/files/recovered.mp3' }),
            fileResponse('RECOVERED-AUDIO'),
        ]);
        const recovered = await api.fetchAudio('https://youtu.be/x', { ...fast, maxPolls: 3 });
        check('a transient progress error does not abandon the job',
            recovered.buffer.toString() === 'RECOVERED-AUDIO');

        queue([
            okJson({ stage: 'queued' }),
            okJson({ stage: 'error', message: 'upstream failed' }),
        ]);
        threw = false;
        try { await api.fetchAudio('https://youtu.be/x', { ...fast, maxPolls: 2 }); } catch (e) {
            threw = /job failed/.test(e.message);
        }
        check('a failed job is reported', threw);
    }

    console.log('\n=== health probe ===');
    {
        queue([
            okJson({ result: 2 }),
            { status: 200, data: { success: true, usage: { hour: 148 }, limits: { hour: 200 } } },
        ]);
        const detail = await api.healthProbe({ timeoutMs: 1000 });
        check('probe succeeds', /^ok/.test(detail));
        check('quota is surfaced', /148\/200 this hour/.test(detail), detail);
        check('usage endpoint is called without a key in the URL',
            !/apikey=/i.test(calls[1].url));

        queue([okJson({ result: 3 })]);
        let threw = false;
        try { await api.healthProbe({ timeoutMs: 1000 }); } catch { threw = true; }
        check('an unexpected probe response is a failure', threw);
    }

    console.log('\n=== wiring: last resort only ===');
    {
        const yt = read('lib/ytAudio.js');
        check('ytAudio requires the client', /require\('\.\/knightbotApi'\)/.test(yt));
        check('fallback is gated by isConfigured()', /knightbotApi\.isConfigured\(\)/.test(yt));
        check('fallback is labelled step 4', /\/\/ 4\) KnightBot API/.test(yt));
        check('fallback comes AFTER the RapidAPI step',
            yt.indexOf('// 3) RapidAPI') !== -1 &&
            yt.indexOf('// 4) KnightBot API') > yt.indexOf('// 3) RapidAPI'));
        check('the source is reported honestly', /source: 'knightbot-api'/.test(yt));

        const health = read('lib/dlHealth.js');
        check('dlHealth requires the client', /require\('\.\/knightbotApi'\)/.test(health));
        check('health probe is conditional on configuration',
            /if \(knightbotApi\.isConfigured\(\)\)/.test(health) &&
            /PROBES\.push/.test(health));

        const env = read('.env.example');
        check('.env.example documents the opt-in flag', /KNIGHTBOT_API_ENABLED/.test(env));
        check('.env.example documents the key', /KNIGHTBOT_API_KEY/.test(env));
        check('.env.example warns against the demo key', /demo key/.test(env));

        const cfg = read('settings.js');
        check('settings.js has the three config entries',
            /knightbotApiEnabled/.test(cfg) && /knightbotApiKey/.test(cfg) && /knightbotApiBaseUrl/.test(cfg));

        const src = read('lib/knightbotApi.js');
        check('client never builds an apikey query parameter',
            !/searchParams\.set\(\s*['"]apikey/i.test(src) && !/apikey=\$\{/.test(src));
        check('client uses the X-API-Key header', /'X-API-Key'/.test(src));
    }

    axios.get = realGet;
    console.log(`\n${pass - fail}/${pass} knightbot-api checks passed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
    axios.get = realGet;
    console.error('❌ smoke-knightbot-api crashed:', err);
    process.exit(1);
});
