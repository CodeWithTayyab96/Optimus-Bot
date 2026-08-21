/**
 * Smoke tests for the .vv (View-Once) command.
 *
 * These tests verify command metadata, permission flags, media routing,
 * error handling, branding, and cleanup — without requiring a live
 * WhatsApp connection.
 */

// ---------------------------------------------------------------------------
// Mocks — use jest.fn() inside factory so no out-of-scope references
// ---------------------------------------------------------------------------

jest.mock('@whiskeysockets/baileys', () => ({
    downloadMediaMessage: jest.fn().mockResolvedValue(Buffer.from('fake-media')),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMocks() {
    const baileys = require('@whiskeysockets/baileys');
    return {
        downloadMediaMessage: baileys.downloadMediaMessage,
    };
}

function makeSock(sendFn) {
    return {
        sendMessage: sendFn || jest.fn().mockResolvedValue({}),
        updateMediaMessage: jest.fn().mockResolvedValue({}),
        user: { id: '12345:67@s.whatsapp.net' },
    };
}

function makeChatId() {
    return '12036312345678901@g.us';
}

function makeQuotedViewOnceImage(overrides = {}) {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_001',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        viewOnceMessageV2: {
                            message: {
                                imageMessage: {
                                    mimetype: 'image/jpeg',
                                    caption: 'test caption',
                                    mediaKey: Buffer.from('key'),
                                    directPath: '/abc',
                                    url: 'https://example.com/img',
                                    ...overrides,
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

function makeQuotedViewOnceVideo() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_002',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        viewOnceMessageV2: {
                            message: {
                                videoMessage: {
                                    mimetype: 'video/mp4',
                                    caption: 'video caption',
                                    mediaKey: Buffer.from('key'),
                                    directPath: '/def',
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

function makeQuotedViewOnceAudio() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_003',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        viewOnceMessageV2: {
                            message: {
                                audioMessage: {
                                    mimetype: 'audio/ogg; codecs=opus',
                                    mediaKey: Buffer.from('key'),
                                    directPath: '/ghi',
                                    url: 'https://example.com/aud',
                                    ptt: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

function makeQuotedPlainImage() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_004',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        imageMessage: {
                            mimetype: 'image/png',
                            caption: 'plain image',
                            mediaKey: Buffer.from('key'),
                            directPath: '/jkl',
                            url: 'https://example.com/plain',
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
                    stanzaId: 'STANZA_005',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        viewOnceMessage: {
                            message: {
                                imageMessage: {
                                    mimetype: 'image/jpeg',
                                    caption: 'v1 view once',
                                    mediaKey: Buffer.from('key'),
                                    directPath: '/mno',
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

function makeQuotedV2ExtensionAudio() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_006',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        viewOnceMessageV2Extension: {
                            message: {
                                audioMessage: {
                                    mimetype: 'audio/mpeg',
                                    mediaKey: Buffer.from('key'),
                                    directPath: '/pqr',
                                    url: 'https://example.com/v2ext',
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
    return {
        message: {
            conversation: '.vv',
        },
    };
}

function makeDirectImage() {
    return {
        message: {
            imageMessage: {
                mimetype: 'image/jpeg',
                caption: '.vv',
                mediaKey: Buffer.from('key'),
                directPath: '/stu',
                url: 'https://example.com/direct',
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
                directPath: '/vwx',
                url: 'https://example.com/direct-aud',
                ptt: true,
            },
        },
    };
}

function makeUnsupportedMedia() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_BAD',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        stickerMessage: {
                            mimetype: 'image/webp',
                            mediaKey: Buffer.from('key'),
                            directPath: '/bad',
                            url: 'https://example.com/sticker',
                        },
                    },
                },
            },
        },
    };
}

const extra = {
    chatId: makeChatId(),
    senderId: '5511999999999@s.whatsapp.net',
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
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('.vv command', () => {
    let vv;

    beforeAll(() => {
        vv = require('../commands/general/viewonce.js');
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // -----------------------------------------------------------------------
    // 1. Command metadata / registration
    // -----------------------------------------------------------------------
    describe('1. Command metadata/registration', () => {
        test('has name "vv"', () => {
            expect(vv.name).toBe('vv');
        });

        test('has empty aliases', () => {
            expect(vv.aliases).toEqual([]);
        });

        test('category is general', () => {
            expect(vv.category).toBe('general');
        });

        test('has a description', () => {
            expect(typeof vv.description).toBe('string');
            expect(vv.description.length).toBeGreaterThan(0);
        });

        test('has a usage string', () => {
            expect(typeof vv.usage).toBe('string');
            expect(vv.usage.length).toBeGreaterThan(0);
        });

        test('execute is a function', () => {
            expect(typeof vv.execute).toBe('function');
        });
    });

    // -----------------------------------------------------------------------
    // 2. Permission behavior
    // -----------------------------------------------------------------------
    describe('2. Permission behavior', () => {
        test('ownerOnly is false', () => { expect(vv.ownerOnly).toBe(false); });
        test('modOnly is false', () => { expect(vv.modOnly).toBe(false); });
        test('groupOnly is false', () => { expect(vv.groupOnly).toBe(false); });
        test('privateOnly is false', () => { expect(vv.privateOnly).toBe(false); });
        test('adminOnly is false', () => { expect(vv.adminOnly).toBe(false); });
        test('botAdminNeeded is false', () => { expect(vv.botAdminNeeded).toBe(false); });
    });

    // -----------------------------------------------------------------------
    // 3. Image input -> correct View-Once payload
    // -----------------------------------------------------------------------
    describe('3. Image input reaches correct View-Once payload', () => {
        test('quoted view-once image sends with viewOnce: true', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceImage();

            await vv.execute(sock, msg, [], extra);

            expect(sendFn).toHaveBeenCalledTimes(1);
            const [chatId, payload] = sendFn.mock.calls[0];
            expect(chatId).toBe(extra.chatId);
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.viewOnce).toBe(true);
            expect(payload.caption).toBe('test caption');
        });

        test('quoted plain image also sends with viewOnce: true', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedPlainImage();

            await vv.execute(sock, msg, [], extra);

            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.viewOnce).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // 4. Video input -> correct View-Once payload
    // -----------------------------------------------------------------------
    describe('4. Video input reaches correct View-Once payload', () => {
        test('quoted view-once video sends with viewOnce: true', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceVideo();

            await vv.execute(sock, msg, [], extra);

            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.video).toBeInstanceOf(Buffer);
            expect(payload.viewOnce).toBe(true);
            expect(payload.caption).toBe('video caption');
        });
    });

    // -----------------------------------------------------------------------
    // 5. Audio input -> correct audio/voice payload
    // -----------------------------------------------------------------------
    describe('5. Audio input reaches correct audio/voice payload', () => {
        test('quoted view-once audio sends as PTT with correct mimetype', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceAudio();

            await vv.execute(sock, msg, [], extra);

            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.audio).toBeInstanceOf(Buffer);
            expect(payload.ptt).toBe(true);
            expect(payload.mimetype).toBe('audio/ogg; codecs=opus');
            expect(payload.image).toBeUndefined();
            expect(payload.video).toBeUndefined();
            expect(payload.viewOnce).toBeUndefined();
        });

        test('quoted viewOnceMessageV2Extension audio works', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedV2ExtensionAudio();

            await vv.execute(sock, msg, [], extra);

            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.audio).toBeInstanceOf(Buffer);
            expect(payload.ptt).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // 6. Missing media -> usage card
    // -----------------------------------------------------------------------
    describe('6. Missing media produces usage/error card', () => {
        test('no media shows usage message', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeNoMedia();

            await vv.execute(sock, msg, [], extra);

            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toContain('No supported media found');
            expect(payload.text).toContain('Usage');
            expect(payload.text).toContain('Image');
            expect(payload.text).toContain('Video');
            expect(payload.text).toContain('Audio');
        });

        test('no media does not call downloadMediaMessage', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeNoMedia();
            const { downloadMediaMessage } = getMocks();

            await vv.execute(sock, msg, [], extra);

            expect(downloadMediaMessage).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // 7. Unsupported media -> friendly error
    // -----------------------------------------------------------------------
    describe('7. Unsupported media produces friendly error', () => {
        test('sticker quoted shows unsupported type error', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeUnsupportedMedia();

            await vv.execute(sock, msg, [], extra);

            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toContain('Unsupported media type');
        });
    });

    // -----------------------------------------------------------------------
    // 8. Quoted media works
    // -----------------------------------------------------------------------
    describe('8. Quoted media works', () => {
        test('quoted viewOnceMessageV2 image downloads and sends', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceImage();
            const { downloadMediaMessage } = getMocks();

            await vv.execute(sock, msg, [], extra);

            expect(downloadMediaMessage).toHaveBeenCalledTimes(1);
            const [targetMsg] = downloadMediaMessage.mock.calls[0];
            expect(targetMsg.key.id).toBe('STANZA_001');
            expect(targetMsg.key.remoteJid).toBe(extra.chatId);
            expect(targetMsg.message.viewOnceMessageV2).toBeDefined();
        });

        test('quoted viewOnceMessage (v1) image downloads and sends', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceV1Image();
            const { downloadMediaMessage } = getMocks();

            await vv.execute(sock, msg, [], extra);

            expect(downloadMediaMessage).toHaveBeenCalledTimes(1);
            const [targetMsg] = downloadMediaMessage.mock.calls[0];
            expect(targetMsg.key.id).toBe('STANZA_005');
        });
    });

    // -----------------------------------------------------------------------
    // 9. Direct media works
    // -----------------------------------------------------------------------
    describe('9. Direct media works', () => {
        test('direct image with .vv caption sends as view-once', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeDirectImage();

            await vv.execute(sock, msg, [], extra);

            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.viewOnce).toBe(true);
        });

        test('direct audio with .vv caption sends as PTT', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeDirectAudio();

            await vv.execute(sock, msg, [], extra);

            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.audio).toBeInstanceOf(Buffer);
            expect(payload.ptt).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // 10. No raw technical errors exposed to users
    // -----------------------------------------------------------------------
    describe('10. No raw technical errors exposed to users', () => {
        test('download failure shows friendly message, not error.message', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceImage();
            const { downloadMediaMessage } = getMocks();
            downloadMediaMessage.mockRejectedValueOnce(new Error('ENOTFOUND some-server.whatsapp.net'));

            await vv.execute(sock, msg, [], extra);

            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toContain('Failed to download');
            expect(payload.text).not.toContain('ENOTFOUND');
            expect(payload.text).not.toContain('some-server');
        });

        test('send failure shows friendly message', async () => {
            const sendFn = jest.fn()
                .mockRejectedValueOnce(new Error('send error'));  // first send attempt fails
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceImage();

            await vv.execute(sock, msg, [], extra);

            // The command catches the error and sends a friendly message
            const lastCall = sendFn.mock.calls[sendFn.mock.calls.length - 1];
            expect(lastCall[1].text).toContain('Failed to send');
        });
    });

    // -----------------------------------------------------------------------
    // 11. Temporary files/buffers cleaned up
    // -----------------------------------------------------------------------
    describe('11. No temp files leaked', () => {
        test('command does not write temp files (uses buffer path)', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceImage();
            const { downloadMediaMessage } = getMocks();

            await vv.execute(sock, msg, [], extra);

            expect(downloadMediaMessage).toHaveBeenCalledTimes(1);
            const [, type] = downloadMediaMessage.mock.calls[0];
            expect(type).toBe('buffer');
        });
    });

    // -----------------------------------------------------------------------
    // 12. Branding / contextInfo behavior
    // -----------------------------------------------------------------------
    describe('12. Branding/contextInfo behavior', () => {
        test('media sends include channelInfo contextInfo', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceImage();

            await vv.execute(sock, msg, [], extra);

            const [, payload] = sendFn.mock.calls[0];
            expect(payload.contextInfo).toBeDefined();
            expect(payload.contextInfo.forwardedNewsletterMessageInfo.newsletterName).toBe('Optimus Bot');
        });

        test('usage card includes channelInfo', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeNoMedia();

            await vv.execute(sock, msg, [], extra);

            const [, payload] = sendFn.mock.calls[0];
            expect(payload.contextInfo).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // 13. Caption behavior
    // -----------------------------------------------------------------------
    describe('13. Caption behavior', () => {
        test('image caption is preserved', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceImage({ caption: 'My custom caption' });

            await vv.execute(sock, msg, [], extra);

            const [, payload] = sendFn.mock.calls[0];
            expect(payload.caption).toBe('My custom caption');
        });

        test('video caption is preserved', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceVideo();
            msg.message.extendedTextMessage.contextInfo.quotedMessage.viewOnceMessageV2.message.videoMessage.caption = 'Video caption here';

            await vv.execute(sock, msg, [], extra);

            const [, payload] = sendFn.mock.calls[0];
            expect(payload.caption).toBe('Video caption here');
        });

        test('audio has no caption (not applicable)', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceAudio();

            await vv.execute(sock, msg, [], extra);

            const [, payload] = sendFn.mock.calls[0];
            expect(payload.caption).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------------
    // Additional: viewOnceMessage v1 envelope unwrapping
    // -----------------------------------------------------------------------
    describe('Additional: envelope unwrapping', () => {
        test('viewOnceMessage v1 is unwrapped correctly', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceV1Image();

            await vv.execute(sock, msg, [], extra);

            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.viewOnce).toBe(true);
        });

        test('viewOnceMessageV2 envelope is unwrapped correctly', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceImage();

            await vv.execute(sock, msg, [], extra);

            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.viewOnce).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Additional: quoted message reconstruction
    // -----------------------------------------------------------------------
    describe('Additional: quoted message reconstruction', () => {
        test('target message key matches quoted stanzaId', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceImage();
            const { downloadMediaMessage } = getMocks();

            await vv.execute(sock, msg, [], extra);

            const [targetMsg] = downloadMediaMessage.mock.calls[0];
            expect(targetMsg.key.id).toBe('STANZA_001');
            expect(targetMsg.key.participant).toBe('5511999999999@s.whatsapp.net');
            expect(targetMsg.key.remoteJid).toBe(extra.chatId);
        });

        test('target message contains the original quotedMessage', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            const msg = makeQuotedViewOnceImage();
            const { downloadMediaMessage } = getMocks();

            await vv.execute(sock, msg, [], extra);

            const [targetMsg] = downloadMediaMessage.mock.calls[0];
            expect(targetMsg.message.viewOnceMessageV2).toBeDefined();
        });
    });
});
