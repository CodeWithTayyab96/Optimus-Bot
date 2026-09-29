/**
 * Tests for the RapidAPI fallback's pure helpers.
 *
 * The API call itself needs a key and costs quota (100/month on the free tier),
 * so these cover the parsing and picking logic against a fixture shaped exactly
 * like a real response — captured from a live call, trimmed to the fields used.
 */
const rapidApi = require('../lib/rapidApi');

const FIXTURE = {
    errorId: null,
    id: 'WPdzzqQBGA8',
    title: 'A Test Video',
    videos: {
        items: [
            { quality: '360p', mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', hasAudio: true, url: 'https://x/muxed360' },
            { quality: '1440p', mimeType: 'video/webm; codecs="vp9"', hasAudio: false, url: 'https://x/v1440' },
            { quality: '1080p', mimeType: 'video/mp4; codecs="avc1.640028"', hasAudio: false, url: 'https://x/v1080' },
        ],
    },
    audios: {
        items: [
            { mimeType: 'audio/webm; codecs="opus"', extension: 'webm', size: 409908, url: 'https://x/a-webm' },
            { mimeType: 'audio/mp4; codecs="mp4a.40.2"', extension: 'm4a', size: 1041817, url: 'https://x/a-m4a' },
        ],
    },
};

describe('rapidApi.videoIdFrom', () => {
    test('handles every URL form YouTube uses', () => {
        expect(rapidApi.videoIdFrom('https://www.youtube.com/watch?v=WPdzzqQBGA8')).toBe('WPdzzqQBGA8');
        expect(rapidApi.videoIdFrom('https://youtu.be/WPdzzqQBGA8')).toBe('WPdzzqQBGA8');
        expect(rapidApi.videoIdFrom('https://youtube.com/shorts/WPdzzqQBGA8?si=abc')).toBe('WPdzzqQBGA8');
        expect(rapidApi.videoIdFrom('https://www.youtube.com/embed/WPdzzqQBGA8')).toBe('WPdzzqQBGA8');
        expect(rapidApi.videoIdFrom('https://www.youtube.com/live/WPdzzqQBGA8')).toBe('WPdzzqQBGA8');
    });

    test('accepts a bare id', () => {
        expect(rapidApi.videoIdFrom('WPdzzqQBGA8')).toBe('WPdzzqQBGA8');
    });

    test('returns null for anything else, so callers can skip cleanly', () => {
        expect(rapidApi.videoIdFrom('https://example.com/x')).toBeNull();
        expect(rapidApi.videoIdFrom('')).toBeNull();
        expect(rapidApi.videoIdFrom(null)).toBeNull();
    });
});

describe('rapidApi.pickMuxedVideo', () => {
    test('picks an mp4 that already has audio', () => {
        // WhatsApp cannot play a video-only stream, and this path has no ffmpeg
        // merge step — so a muxed file is the only usable one.
        const v = rapidApi.pickMuxedVideo(FIXTURE);
        expect(v).toBeTruthy();
        expect(v.hasAudio).toBe(true);
        expect(v.mimeType).toMatch(/mp4/i);
        expect(v.url).toBe('https://x/muxed360');
    });

    test('never returns a video-only track, even at higher quality', () => {
        const v = rapidApi.pickMuxedVideo(FIXTURE);
        expect(v.quality).not.toBe('1440p');
        expect(v.quality).not.toBe('1080p');
    });

    test('returns null when nothing is muxed', () => {
        expect(rapidApi.pickMuxedVideo({ videos: { items: [{ quality: '1080p', mimeType: 'video/mp4', hasAudio: false, url: 'x' }] } })).toBeNull();
        expect(rapidApi.pickMuxedVideo({})).toBeNull();
        expect(rapidApi.pickMuxedVideo(null)).toBeNull();
    });
});

describe('rapidApi.pickAudio', () => {
    test('prefers an m4a track for a clean mp3 transcode', () => {
        const a = rapidApi.pickAudio(FIXTURE);
        expect(a.mimeType).toMatch(/audio\/mp4|m4a/i);
        expect(a.url).toBe('https://x/a-m4a');
    });

    test('falls back to any audio when no m4a exists', () => {
        const a = rapidApi.pickAudio({ audios: { items: [{ mimeType: 'audio/webm; codecs="opus"', size: 1, url: 'https://x/webm' }] } });
        expect(a.url).toBe('https://x/webm');
    });

    test('returns null when there is no audio', () => {
        expect(rapidApi.pickAudio({ audios: { items: [] } })).toBeNull();
        expect(rapidApi.pickAudio({})).toBeNull();
    });
});

describe('rapidApi.isConfigured', () => {
    test('is false without a key, so the fallback is skipped cheaply', () => {
        const saved = process.env.RAPIDAPI_KEY;
        delete process.env.RAPIDAPI_KEY;
        try {
            expect(rapidApi.isConfigured()).toBe(false);
        } finally {
            if (saved !== undefined) process.env.RAPIDAPI_KEY = saved;
        }
    });
});
