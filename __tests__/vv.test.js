/**
 * Smoke tests for the .vv (View-Once) command.
 *
 * Uses downloadMediaMessage (same pattern as the sticker command) with
 * a synthetic message object, plus downloadContentFromMessage as fallback.
 */

jest.mock('@whiskeysockets/baileys', () => ({
    downloadMediaMessage: jest.fn().mockResolvedValue(Buffer.from('fake-media')),
    downloadContentFromMessage: jest.fn().mockResolvedValue({
        [Symbol.asyncIterator]: async function* () { yield Buffer.from('fallback-media'); }
    }),
}));

jest.mock('../lib/messageConfig', () => ({
    channelInfo: {
        contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363000000000000@newsletter',
                newsletterName: 'Optimus Bot',
                serverMessageId: -1,
            },
        },
    },
}));

function getMocks() {
    const baileys = require('@whiskeysockets/baileys');
    return {
        downloadMediaMessage: baileys.downloadMediaMessage,
        downloadContentFromMessage: baileys.downloadContentFromMessage,
    };
}

function makeSock(sendFn) {
    return { sendMessage: sendFn || jest.fn().mockResolvedValue({}) };
}

function makeChatId() { return '12036312345678901@g.us'; }

// ---- Message factories ----

function makeQuotedImage() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_001',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        imageMessage: {
                            mimetype: 'image/jpeg',
                            caption: 'test caption',
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

function makeQuotedViewOnceImage() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_002',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        viewOnceMessageV2: {
                            message: {
                                imageMessage: {
                                    mimetype: 'image/jpeg',
                                    caption: 'v2 caption',
                                    mediaKey: Buffer.from('key'),
                                    directPath: '/v2',
                                    url: 'https://example.com/v2',
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

function makeQuotedViewOnceV1Image() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_003',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        viewOnceMessage: {
                            message: {
                                imageMessage: {
                                    mimetype: 'image/jpeg',
                                    caption: 'v1 caption',
                                    mediaKey: Buffer.from('key'),
                                    directPath: '/v1',
                                    url: 'https://example.com/v1',
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

function makeQuotedVideo() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_004',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        viewOnceMessageV2: {
                            message: {
                                videoMessage: {
                                    mimetype: 'video/mp4',
                                    caption: 'video caption',
                                    mediaKey: Buffer.from('key'),
                                    directPath: '/vid',
                                    url: 'https://example.com/vid',
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

function makeQuotedAudio() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_005',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        viewOnceMessageV2: {
                            message: {
                                audioMessage: {
                                    mimetype: 'audio/ogg; codecs=opus',
                                    mediaKey: Buffer.from('key'),
                                    directPath: '/aud',
                                    url: 'https://example.com/aud',
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

function makeNestedEphemeralViewOnceImage() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_NEST',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        ephemeralMessage: {
                            message: {
                                viewOnceMessageV2: {
                                    message: {
                                        imageMessage: {
                                            mimetype: 'image/jpeg',
                                            caption: 'nested',
                                            mediaKey: Buffer.from('key'),
                                            directPath: '/nest',
                                            url: 'https://example.com/nest',
                                        },
                                    },
                                },
                            },
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

function makeDirectImage() {
    return {
        message: {
            imageMessage: {
                mimetype: 'image/jpeg',
                caption: '.vv',
                mediaKey: Buffer.from('key'),
                directPath: '/dir',
                url: 'https://example.com/dir',
            },
        },
    };
}

function makeDirectAudio() {
    return {
        message: {
            audioMessage: {
                mimetype: 'audio/ogg; codecs=opus',
                mediaKey: Buffer.from('key'),
                directPath: '/da',
                url: 'https://example.com/da',
            },
        },
    };
}

const extra = { chatId: makeChatId(), senderId: '5511999999999@s.whatsapp.net' };

// ---- Tests ----

describe('.vv command', () => {
    let vv;
    beforeAll(() => { vv = require('../commands/general/viewonce.js'); });
    beforeEach(() => { jest.clearAllMocks(); });

    // Metadata
    describe('metadata', () => {
        test('name is "vv"', () => expect(vv.name).toBe('vv'));
        test('category is general', () => expect(vv.category).toBe('general'));
        test('execute is a function', () => expect(typeof vv.execute).toBe('function'));
    });

    // Direct quoted image
    describe('direct quoted image', () => {
        test('downloads and sends with viewOnce: true', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.caption).toBe('test caption');
        });

        test('calls downloadMediaMessage with synthetic message', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const { downloadMediaMessage } = getMocks();
            await vv.execute(makeSock(sendFn), makeQuotedImage(), [], extra);
            expect(downloadMediaMessage).toHaveBeenCalledTimes(1);
            const [targetMsg] = downloadMediaMessage.mock.calls[0];
            expect(targetMsg.key.id).toBe('STANZA_001');
            expect(targetMsg.message.imageMessage).toBeDefined();
        });
    });

    // viewOnceMessageV2 envelope
    describe('viewOnceMessageV2 image', () => {
        test('unwraps envelope and sends', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedViewOnceImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.caption).toBe('v2 caption');
        });
    });

    // viewOnceMessage v1
    describe('viewOnceMessage v1 image', () => {
        test('unwraps v1 envelope', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedViewOnceV1Image(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
        });
    });

    // Video
    describe('video', () => {
        test('sends video with viewOnce: true', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedVideo(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.video).toBeInstanceOf(Buffer);
            expect(payload.caption).toBe('video caption');
        });
    });

    // Audio
    describe('audio', () => {
        test('sends as PTT voice note', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedAudio(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.audio).toBeInstanceOf(Buffer);
            expect(payload.ptt).toBe(true);
            expect(payload.mimetype).toBe('audio/ogg; codecs=opus');
        });
    });

    // Nested envelopes
    describe('nested envelope unwrapping', () => {
        test('ephemeralMessage → viewOnceMessageV2 → imageMessage', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeNestedEphemeralViewOnceImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.caption).toBe('nested');
        });
    });

    // No media
    describe('no media', () => {
        test('shows usage message', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeNoMedia(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toContain('Please reply');
        });

        test('does not call downloadMediaMessage', async () => {
            const { downloadMediaMessage } = getMocks();
            await vv.execute(makeSock(jest.fn().mockResolvedValue({})), makeNoMedia(), [], extra);
            expect(downloadMediaMessage).not.toHaveBeenCalled();
        });
    });

    // Download failure with fallback
    describe('download failure with fallback', () => {
        test('falls back to downloadContentFromMessage', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const { downloadMediaMessage, downloadContentFromMessage } = getMocks();
            downloadMediaMessage.mockRejectedValueOnce(new Error('primary failed'));
            await vv.execute(makeSock(sendFn), makeQuotedImage(), [], extra);
            // Should still succeed via fallback
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
        });

        test('both fail shows friendly error', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const { downloadMediaMessage, downloadContentFromMessage } = getMocks();
            downloadMediaMessage.mockRejectedValueOnce(new Error('primary failed'));
            downloadContentFromMessage.mockRejectedValueOnce(new Error('fallback failed'));
            await vv.execute(makeSock(sendFn), makeQuotedImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toContain('Failed to recover');
            expect(payload.text).not.toContain('primary failed');
            expect(payload.text).not.toContain('fallback failed');
        });
    });

    // Direct media
    describe('direct media', () => {
        test('direct image sends as view-once', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeDirectImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
        });

        test('direct audio sends as PTT', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeDirectAudio(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.audio).toBeInstanceOf(Buffer);
            expect(payload.ptt).toBe(true);
        });
    });

    // Branding
    describe('branding', () => {
        test('sends include channelInfo', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedImage(), [], extra);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.contextInfo).toBeDefined();
            expect(payload.contextInfo.forwardedNewsletterMessageInfo.newsletterName).toBe('Optimus Bot');
        });
    });

    // No secrets
    describe('no secrets', () => {
        test('no API keys in payloads', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedImage(), [], extra);
            for (const call of sendFn.mock.calls) {
                const p = JSON.stringify(call[1]);
                expect(p).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
                expect(p).not.toMatch(/bearer/i);
                expect(p).not.toMatch(/ghp_|gho_/);
            }
        });
    });

    // Captions
    describe('captions', () => {
        test('image caption preserved', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedImage(), [], extra);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.caption).toBe('test caption');
        });

        test('video caption preserved', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedVideo(), [], extra);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.caption).toBe('video caption');
        });
    });
});
