/**
 * Tests for the .vv (View-Once) command.
 *
 * Covers: direct quoted image/video with viewOnce flag, rejection of
 * non-view-once and missing quoted messages, payload shape, and captions.
 */

jest.mock('@whiskeysockets/baileys', () => ({
    downloadContentFromMessage: jest.fn().mockResolvedValue({
        [Symbol.asyncIterator]: async function* () { yield Buffer.from('fake-media'); }
    }),
}));

function getMocks() {
    const baileys = require('@whiskeysockets/baileys');
    return { downloadContentFromMessage: baileys.downloadContentFromMessage };
}

function makeSock(sendFn) {
    return { sendMessage: sendFn || jest.fn().mockResolvedValue({}) };
}

function makeChatId() { return '12036312345678901@g.us'; }

// ---- Message factories ----

function makeQuotedViewOnceImage(caption = 'test caption') {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_001',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        imageMessage: {
                            viewOnce: true,
                            mimetype: 'image/jpeg',
                            caption,
                            mediaKey: Buffer.from('key'),
                            directPath: '/abc',
                            url: 'https://example.com/img',
                        },
                    },
                },
            },
        },
    };
}

function makeQuotedViewOnceVideo(caption = 'video caption') {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_002',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        videoMessage: {
                            viewOnce: true,
                            mimetype: 'video/mp4',
                            caption,
                            mediaKey: Buffer.from('key'),
                            directPath: '/vid',
                            url: 'https://example.com/vid',
                        },
                    },
                },
            },
        },
    };
}

function makeQuotedImageNoViewOnce() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_003',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        imageMessage: {
                            mimetype: 'image/jpeg',
                            caption: 'normal image',
                            mediaKey: Buffer.from('key'),
                            directPath: '/norm',
                            url: 'https://example.com/norm',
                        },
                    },
                },
            },
        },
    };
}

function makeNoMedia() {
    return { message: { conversation: '.vv' } };
}

const extra = { chatId: makeChatId(), senderId: '5511999999999@s.whatsapp.net' };

// ---- Tests ----

describe('.vv command', () => {
    let vv;
    beforeAll(() => { vv = require('../commands/general/viewonce.js'); });
    beforeEach(() => { jest.clearAllMocks(); });

    describe('metadata', () => {
        test('name is "vv"', () => expect(vv.name).toBe('vv'));
        test('category is general', () => expect(vv.category).toBe('general'));
        test('execute is a function', () => expect(typeof vv.execute).toBe('function'));
    });

    describe('view-once image', () => {
        test('downloads and sends as a normal image with fileName', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedViewOnceImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [chatId, payload, opts] = sendFn.mock.calls[0];
            expect(chatId).toBe(makeChatId());
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.fileName).toBe('media.jpg');
            expect(payload.caption).toBe('test caption');
            expect(payload.viewOnce).toBeUndefined();
            expect(opts.quoted).toBeDefined();
        });

        test('calls downloadContentFromMessage with the image node', async () => {
            const { downloadContentFromMessage } = getMocks();
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedViewOnceImage(), [], extra);
            expect(downloadContentFromMessage).toHaveBeenCalledTimes(1);
            const [media, type] = downloadContentFromMessage.mock.calls[0];
            expect(type).toBe('image');
            expect(media.mimetype).toBe('image/jpeg');
            expect(media.directPath).toBe('/abc');
        });
    });

    describe('view-once video', () => {
        test('downloads and sends as a normal video with fileName', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedViewOnceVideo(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [chatId, payload, opts] = sendFn.mock.calls[0];
            expect(chatId).toBe(makeChatId());
            expect(payload.video).toBeInstanceOf(Buffer);
            expect(payload.fileName).toBe('media.mp4');
            expect(payload.caption).toBe('video caption');
            expect(payload.viewOnce).toBeUndefined();
            expect(opts.quoted).toBeDefined();
        });

        test('calls downloadContentFromMessage with the video node', async () => {
            const { downloadContentFromMessage } = getMocks();
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedViewOnceVideo(), [], extra);
            expect(downloadContentFromMessage).toHaveBeenCalledTimes(1);
            const [media, type] = downloadContentFromMessage.mock.calls[0];
            expect(type).toBe('video');
            expect(media.mimetype).toBe('video/mp4');
        });
    });

    describe('quoted image without viewOnce flag', () => {
        test('sends the error message', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedImageNoViewOnce(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toBe('❌ Please reply to a view-once image or video.');
        });

        test('does not call downloadContentFromMessage', async () => {
            const { downloadContentFromMessage } = getMocks();
            await vv.execute(makeSock(jest.fn().mockResolvedValue({})), makeQuotedImageNoViewOnce(), [], extra);
            expect(downloadContentFromMessage).not.toHaveBeenCalled();
        });
    });

    describe('no quoted message', () => {
        test('sends the error message', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeNoMedia(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toBe('❌ Please reply to a view-once image or video.');
        });

        test('does not call downloadContentFromMessage', async () => {
            const { downloadContentFromMessage } = getMocks();
            await vv.execute(makeSock(jest.fn().mockResolvedValue({})), makeNoMedia(), [], extra);
            expect(downloadContentFromMessage).not.toHaveBeenCalled();
        });
    });

    describe('captions', () => {
        test('missing caption defaults to empty string', async () => {
            const msg = makeQuotedViewOnceImage();
            delete msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage.caption;
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), msg, [], extra);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.caption).toBe('');
        });
    });

    describe('download failure', () => {
        test('error propagates to the caller (no try/catch in the command)', async () => {
            const { downloadContentFromMessage } = getMocks();
            downloadContentFromMessage.mockRejectedValueOnce(new Error('ENOTFOUND'));
            await expect(
                vv.execute(makeSock(jest.fn().mockResolvedValue({})), makeQuotedViewOnceImage(), [], extra)
            ).rejects.toThrow('ENOTFOUND');
        });
    });

    describe('no secrets', () => {
        test('no API keys in payloads', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedViewOnceImage(), [], extra);
            for (const call of sendFn.mock.calls) {
                const p = JSON.stringify(call[1]);
                expect(p).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
                expect(p).not.toMatch(/bearer/i);
                expect(p).not.toMatch(/ghp_|gho_/);
            }
        });
    });
});
