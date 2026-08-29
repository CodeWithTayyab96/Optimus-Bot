/**
 * Jest tests for media conversion commands:
 *   .toaudio — convert audio/video to MP3
 *   .toptt   — convert audio to voice note
 *   .tovideo — convert audio/sticker/video to MP4
 */

/* ─── Mock baileys — must be first, fully self-contained ────────── */

jest.mock('@whiskeysockets/baileys', () => ({
    downloadContentFromMessage: jest.fn(async (_node, type) => {
        const ext = type === 'audio' ? 'mp3' : type === 'video' ? 'mp4' : 'webp';
        const chunks = [Buffer.from('fake-' + type + '-data-' + ext)];
        let i = 0;
        return {
            [Symbol.asyncIterator]() {
                return {
                    next() {
                        return i < chunks.length
                            ? Promise.resolve({ value: chunks[i++], done: false })
                            : Promise.resolve({ done: true });
                    },
                    return() { return Promise.resolve({ done: true }); }
                };
            }
        };
    }),
}));

jest.mock('../lib/converter', () => ({
    toAudio: jest.fn(async () => Buffer.from('converted-audio-mp3')),
    toPTT: jest.fn(async () => Buffer.from('converted-audio-opus')),
    toVideo: jest.fn(async () => Buffer.from('converted-video-mp4')),
    ffmpeg: jest.fn(),
}));

jest.mock('../lib/messageStyle', () => ({
    success: (msg) => '✅ ' + msg,
    error: (msg) => '❌ ' + msg,
    warning: (msg) => '⚠️ ' + msg,
    info: (msg) => 'ℹ️ ' + msg,
    processing: (msg) => '⏳ ' + msg + '...',
    invalidInput: (what, usage) => '❌ ' + what + '\nUsage: ' + usage,
    permissionDenied: () => '🔒 Access denied',
    box: (label, lines) => lines.join('\n'),
    ICONS: { success: '✅', error: '❌' },
}));

/* ─── Load after mocks ──────────────────────────────────────────── */

const toaudio = require('../commands/media/toaudio');
const toptt   = require('../commands/media/toptt');
const tovideo = require('../commands/media/tovideo');
const { toAudio, toPTT, toVideo } = require('../lib/converter');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

/* ─── Shared helpers (outside jest.mock scope) ──────────────────── */

function mockMessage(extra = {}) {
    return {
        key: { id: 'test123', remoteJid: '1234@s.whatsapp.net' },
        message: {
            extendedTextMessage: {
                text: extra.text || '',
                contextInfo: { quotedMessage: extra.quotedMessage || undefined }
            }
        }
    };
}

function mockSock() {
    const calls = [];
    return {
        _calls: calls,
        sendMessage: jest.fn(async (jid, content, opts) => { calls.push({ jid, content, opts }); })
    };
}

/* ═══════════════════════════════════════════════════════════════════
   .toaudio
   ═══════════════════════════════════════════════════════════════════ */

describe('.toaudio', () => {
    beforeEach(() => jest.clearAllMocks());

    test('command loads with correct metadata', () => {
        expect(toaudio.name).toBe('toaudio');
        expect(toaudio.aliases).toContain('tomp3');
        expect(toaudio.category).toBe('media');
        expect(typeof toaudio.execute).toBe('function');
        expect(toaudio.ownerOnly).toBe(false);
        expect(toaudio.groupOnly).toBe(false);
    });

    test('missing quoted message returns usage hint', async () => {
        const sock = mockSock();
        await toaudio.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock.sendMessage).toHaveBeenCalledTimes(1);
        expect(sock._calls[0].content.text).toMatch(/reply to/i);
    });

    test('non-audio/video quoted message returns error', async () => {
        const sock = mockSock();
        const msg = mockMessage({ quotedMessage: { textMessage: { text: 'hi' } } });
        await toaudio.execute(sock, msg, [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/unsupported|error/i);
    });

    test('audio message invokes toAudio and sends MP3', async () => {
        const sock = mockSock();
        const msg = mockMessage({
            quotedMessage: { audioMessage: { mimetype: 'audio/ogg', url: 'https://example.com/a.ogg' } }
        });
        await toaudio.execute(sock, msg, [], { chatId: '1234@g.us' });
        expect(toAudio).toHaveBeenCalled();
        expect(sock._calls[0].content.audio).toBeDefined();
        expect(sock._calls[0].content.mimetype).toBe('audio/mpeg');
        expect(sock._calls[0].content.ptt).toBe(false);
    });

    test('video message invokes toAudio and sends MP3', async () => {
        const sock = mockSock();
        const msg = mockMessage({
            quotedMessage: { videoMessage: { mimetype: 'video/mp4', url: 'https://example.com/v.mp4' } }
        });
        await toaudio.execute(sock, msg, [], { chatId: '1234@g.us' });
        expect(toAudio).toHaveBeenCalled();
        expect(sock._calls[0].content.audio).toBeDefined();
        expect(sock._calls[0].content.mimetype).toBe('audio/mpeg');
    });

    test('conversion failure returns friendly error', async () => {
        toAudio.mockRejectedValueOnce(new Error('ffmpeg failed'));
        const sock = mockSock();
        const msg = mockMessage({
            quotedMessage: { audioMessage: { mimetype: 'audio/ogg', url: 'https://example.com/o.ogg' } }
        });
        await toaudio.execute(sock, msg, [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/error|conversion/i);
    });
});

/* ═══════════════════════════════════════════════════════════════════
   .toptt
   ═══════════════════════════════════════════════════════════════════ */

describe('.toptt', () => {
    beforeEach(() => jest.clearAllMocks());

    test('command loads with correct metadata', () => {
        expect(toptt.name).toBe('toptt');
        expect(toptt.aliases).toContain('voice');
        expect(toptt.aliases).toContain('tovn');
        expect(toptt.category).toBe('media');
        expect(typeof toptt.execute).toBe('function');
    });

    test('missing quoted message returns usage hint', async () => {
        const sock = mockSock();
        await toptt.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/reply to/i);
    });

    test('non-audio quoted message returns error', async () => {
        const sock = mockSock();
        const msg = mockMessage({
            quotedMessage: { videoMessage: { mimetype: 'video/mp4', url: 'https://example.com/v.mp4' } }
        });
        await toptt.execute(sock, msg, [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/unsupported|error/i);
    });

    test('audio message invokes toPTT and sends PTT', async () => {
        const sock = mockSock();
        const msg = mockMessage({
            quotedMessage: { audioMessage: { mimetype: 'audio/mpeg', url: 'https://example.com/a.mp3' } }
        });
        await toptt.execute(sock, msg, [], { chatId: '1234@g.us' });
        expect(toPTT).toHaveBeenCalled();
        expect(sock._calls[0].content.ptt).toBe(true);
        expect(sock._calls[0].content.mimetype).toBe('audio/ogg; codecs=opus');
    });

    test('ogg/opus audio sent directly as PTT without conversion', async () => {
        const sock = mockSock();
        const msg = mockMessage({
            quotedMessage: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', url: 'https://example.com/o.ogg' } }
        });
        await toptt.execute(sock, msg, [], { chatId: '1234@g.us' });
        expect(toPTT).not.toHaveBeenCalled();
        expect(sock._calls[0].content.ptt).toBe(true);
    });

    test('conversion failure returns friendly error', async () => {
        toPTT.mockRejectedValueOnce(new Error('ffmpeg failed'));
        const sock = mockSock();
        const msg = mockMessage({
            quotedMessage: { audioMessage: { mimetype: 'audio/mpeg', url: 'https://example.com/a.mp3' } }
        });
        await toptt.execute(sock, msg, [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/error|conversion/i);
    });
});

/* ═══════════════════════════════════════════════════════════════════
   .tovideo
   ═══════════════════════════════════════════════════════════════════ */

describe('.tovideo', () => {
    beforeEach(() => jest.clearAllMocks());

    test('command loads with correct metadata', () => {
        expect(tovideo.name).toBe('tovideo');
        expect(tovideo.aliases).toContain('tomp4');
        expect(tovideo.category).toBe('media');
        expect(typeof tovideo.execute).toBe('function');
    });

    test('missing quoted message returns usage hint', async () => {
        const sock = mockSock();
        await tovideo.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/reply to/i);
    });

    test('non-media quoted message returns error', async () => {
        const sock = mockSock();
        const msg = mockMessage({ quotedMessage: { textMessage: { text: 'hi' } } });
        await tovideo.execute(sock, msg, [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/unsupported|error/i);
    });

    test('audio message invokes toVideo and sends MP4', async () => {
        const sock = mockSock();
        const msg = mockMessage({
            quotedMessage: { audioMessage: { mimetype: 'audio/mpeg', url: 'https://example.com/a.mp3' } }
        });
        await tovideo.execute(sock, msg, [], { chatId: '1234@g.us' });
        expect(toVideo).toHaveBeenCalled();
        expect(sock._calls[0].content.document).toBeDefined();
        expect(sock._calls[0].content.mimetype).toBe('video/mp4');
        expect(sock._calls[0].content.fileName).toBe('converted.mp4');
    });

    test('sticker message invokes toVideo and sends MP4', async () => {
        const sock = mockSock();
        const msg = mockMessage({
            quotedMessage: { stickerMessage: { mimetype: 'image/webp', url: 'https://example.com/s.webp' } }
        });
        await tovideo.execute(sock, msg, [], { chatId: '1234@g.us' });
        expect(toVideo).toHaveBeenCalled();
        expect(sock._calls[0].content.document).toBeDefined();
        expect(sock._calls[0].content.mimetype).toBe('video/mp4');
    });

    test('conversion failure returns friendly error', async () => {
        toVideo.mockRejectedValueOnce(new Error('ffmpeg failed'));
        const sock = mockSock();
        const msg = mockMessage({
            quotedMessage: { audioMessage: { mimetype: 'audio/mpeg', url: 'https://example.com/a.mp3' } }
        });
        await tovideo.execute(sock, msg, [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/error|conversion/i);
    });
});
