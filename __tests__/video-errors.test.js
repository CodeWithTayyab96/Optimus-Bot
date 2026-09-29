/**
 * Tests for the yt-dlp error explainer.
 *
 * It exists because the bot-check message ("Sign in to confirm you're not a bot")
 * was being reported to users as "it may be private, age-restricted, or
 * region-locked" — three things it is not. It means YouTube distrusts THIS
 * SERVER'S IP, which is normal on a datacenter host and has a known fix.
 */
const { _test } = require('../commands/media/video');

describe('video.explainYtdlpFailure', () => {
    test('names the bot-check for what it is', () => {
        // The real message, with the typographic apostrophe YouTube actually sends.
        const raw =
            'ERROR: [youtube] WPdzzqQBGA8: Sign in to confirm you\u2019re not a bot. ' +
            'Use --cookies-from-browser or --cookies for the authentication.';
        const out = _test.explainYtdlpFailure(raw);
        // Assert on MEANING, not phrasing: an earlier version of this test looked
        // for the literal "not a bot" while the message says "isn't a bot", so it
        // failed against correct code.
        expect(out).toMatch(/IP address/i);
        expect(out).toMatch(/PO-token/i);
        // Must NOT be mistaken for a private/region problem.
        expect(out).not.toMatch(/private, age-restricted, or region-locked/);
    });

    test('also matches the ASCII apostrophe variant', () => {
        expect(_test.explainYtdlpFailure("Sign in to confirm you're not a bot")).toMatch(/IP address/i);
    });

    test('maps a missing format to a format message', () => {
        expect(_test.explainYtdlpFailure('ERROR: Requested format is not available')).toMatch(/no usable format/i);
    });

    test('maps an unavailable video', () => {
        expect(_test.explainYtdlpFailure('ERROR: This video is unavailable')).toMatch(/unavailable/i);
    });

    test('maps a private video', () => {
        expect(_test.explainYtdlpFailure('ERROR: Private video. Sign in if you have been granted access')).toBe(
            'This video is private.'
        );
    });

    test('maps a missing yt-dlp', () => {
        expect(_test.explainYtdlpFailure('yt-dlp is not installed on this host')).toMatch(/not installed/i);
    });

    test('falls back to the generic wording for an unknown error', () => {
        expect(_test.explainYtdlpFailure('ERROR: something nobody has seen before')).toMatch(
            /private, age-restricted, or region-locked/
        );
    });

    test('never throws on empty or missing input', () => {
        expect(typeof _test.explainYtdlpFailure('')).toBe('string');
        expect(typeof _test.explainYtdlpFailure(undefined)).toBe('string');
        expect(typeof _test.explainYtdlpFailure(null)).toBe('string');
    });
});
