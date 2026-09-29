/**
 * Tests for the TikTok short-link expiry detection.
 *
 * TikTok short links (vt./vm.) expire, and an expired one 302s to the homepage.
 * yt-dlp then fails with "Unexpected response from webpage request", which says
 * nothing useful — so the command resolves the link itself and reports the real
 * reason.
 *
 * Only the pure predicates are tested here; resolveShortLink() makes a network
 * request and is exercised by hand.
 */
const { _test } = require('../commands/media/tiktok');

describe('tiktok.SHORT_LINK_RE', () => {
    test('matches vt. and vm. short links', () => {
        expect(_test.SHORT_LINK_RE.test('https://vt.tiktok.com/zsbhbtdxk/')).toBe(true);
        expect(_test.SHORT_LINK_RE.test('https://vm.tiktok.com/ABC123/')).toBe(true);
        expect(_test.SHORT_LINK_RE.test('http://vt.tiktok.com/x')).toBe(true);
    });

    test('does not match full video URLs', () => {
        expect(_test.SHORT_LINK_RE.test('https://www.tiktok.com/@user/video/7689376621794479381')).toBe(false);
        expect(_test.SHORT_LINK_RE.test('https://tiktok.com/@user/video/1')).toBe(false);
    });
});

describe('tiktok.VIDEO_PATH_RE', () => {
    test('matches a real video path', () => {
        expect(_test.VIDEO_PATH_RE.test('https://www.tiktok.com/@user/video/7689376621794479381')).toBe(true);
    });

    test('does not match the homepage — which is what an expired link resolves to', () => {
        expect(_test.VIDEO_PATH_RE.test('https://www.tiktok.com/?_r=1')).toBe(false);
        expect(_test.VIDEO_PATH_RE.test('https://www.tiktok.com/')).toBe(false);
    });
});

describe('tiktok.resolveShortLink', () => {
    test('leaves a non-short URL untouched and makes no request', async () => {
        const full = 'https://www.tiktok.com/@user/video/7689376621794479381';
        await expect(_test.resolveShortLink(full)).resolves.toEqual({ url: full, expired: false });
    });

    test('leaves an unrelated URL untouched', async () => {
        const other = 'https://example.com/x';
        await expect(_test.resolveShortLink(other)).resolves.toEqual({ url: other, expired: false });
    });
});
