/**
 * Tests for .ytdiag's configuration.
 *
 * The command probes each YouTube player client from THIS host, because
 * "Sign in to confirm you're not a bot" is an IP problem and which clients are
 * tolerated varies by IP. The probe itself needs the network; these assertions
 * cover the configuration that decides what gets probed.
 */
const { _test } = require('../commands/owner/ytdiag');

describe('ytdiag.CLIENTS', () => {
    test('includes the default (no override) plus the usual suspects', () => {
        // '' means "let yt-dlp choose" — the control case.
        expect(_test.CLIENTS).toContain('');
        expect(_test.CLIENTS).toContain('mweb');
        expect(_test.CLIENTS.length).toBeGreaterThanOrEqual(4);
    });

    test('has no duplicates', () => {
        expect(new Set(_test.CLIENTS).size).toBe(_test.CLIENTS.length);
    });
});

describe('ytdiag.JS_ARGS', () => {
    test('enables a JS runtime — without it the challenge cannot be solved at all', () => {
        const joined = _test.JS_ARGS.join(' ');
        expect(joined).toContain('--js-runtimes');
        expect(joined).toContain('node');
    });
});

describe('ytdiag.DEFAULT_PROBE', () => {
    test('is a YouTube URL, so the probe works with no arguments', () => {
        expect(_test.DEFAULT_PROBE).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
    });
});

describe('ytdiag.PER_CLIENT_TIMEOUT_MS', () => {
    test('is long enough for mweb, which is far slower than the default client', () => {
        // Measured locally: default ~7s, mweb ~34s (it round-trips to the
        // PO-token provider). A tight ceiling here would report false failures.
        expect(_test.PER_CLIENT_TIMEOUT_MS).toBeGreaterThanOrEqual(40000);
    });
});
