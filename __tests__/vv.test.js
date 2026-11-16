/**
 * Smoke tests for the .vv (View-Once) command.
 *
 * Primary download method: downloadContentFromMessage (known-working Baileys pattern).
 */

jest.mock('@whiskeysockets/baileys', () => ({
    downloadContentFromMessage: jest.fn().mockResolvedValue({
        [Symbol.asyncIterator]: async function* () { yield Buffer.from('fake-media'); }
    }),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-media')),
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

jest.mock('../lib/lightweight_store', () => ({
    messages: {},
    loadMessage: jest.fn().mockResolvedValue(null),
}));

function getMocks() {
    const baileys = require('@whiskeysockets/baileys');
    return {
        downloadContentFromMessage: baileys.downloadContentFromMessage,
        toBuffer: baileys.toBuffer,
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

function makeQuotedKeylessImage() {
    // Matches the real stub WhatsApp delivers for the sender's own copy of
    // a view-once message: url present, but no mediaKey and no directPath.
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_KEYLESS',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        viewOnceMessageV2: {
                            message: {
                                imageMessage: {
                                    mimetype: 'image/jpeg',
                                    caption: 'keyless',
                                    url: 'https://example.com/keyless',
                                    fileSha256: Buffer.from('sha'),
                                    fileLength: 1234,
                                },
                            },
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

function makeTriplyNestedVideo() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_TRI',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        ephemeralMessage: {
                            message: {
                                viewOnceMessageV2: {
                                    message: {
                                        viewOnceMessage: {
                                            message: {
                                                videoMessage: {
                                                    mimetype: 'video/mp4',
                                                    caption: 'triply nested',
                                                    mediaKey: Buffer.from('key'),
                                                    directPath: '/tri',
                                                    url: 'https://example.com/tri',
                                                },
                                            },
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

function makeQuotedViewOnceV2ExtensionImage() {
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_V2E',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        viewOnceMessageV2Extension: {
                            message: {
                                imageMessage: {
                                    mimetype: 'image/jpeg',
                                    caption: 'v2e caption',
                                    mediaKey: Buffer.from('key'),
                                    directPath: '/v2e',
                                    url: 'https://example.com/v2e',
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

function makeQuotedViaImageContext() {
    // .vv sent as an image caption, so the quoted message lives on the
    // imageMessage contextInfo, not extendedTextMessage (the reference
    // vv2 checks several message types for contextInfo).
    return {
        message: {
            imageMessage: {
                mimetype: 'image/jpeg',
                caption: '.vv',
                contextInfo: {
                    stanzaId: 'STANZA_IMGCTX',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        viewOnceMessageV2: {
                            message: {
                                imageMessage: {
                                    mimetype: 'image/jpeg',
                                    caption: 'via image ctx',
                                    mediaKey: Buffer.from('key'),
                                    directPath: '/imgctx',
                                    url: 'https://example.com/imgctx',
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

function makeQuotedStrippedViewOnceImage() {
    // WhatsApp strips download credentials (url, directPath, mediaKey)
    // from view-once messages in quotedMessage. This is the exact shape
    // that produces the "No valid media URL or directPath" failure.
    return {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_STRIPPED',
                    participant: '5511999999999@s.whatsapp.net',
                    quotedMessage: {
                        viewOnceMessageV2: {
                            message: {
                                imageMessage: {
                                    mimetype: 'image/jpeg',
                                    caption: 'stripped',
                                    fileSha256: Buffer.from('sha'),
                                    fileLength: 1234,
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

    // Direct quoted image (simplest path — matches known-working bot)
    describe('direct quoted image', () => {
        test('downloads and sends as a normal message', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.viewOnce).toBeUndefined();
            expect(payload.caption).toBe('test caption');
        });

        test('calls downloadContentFromMessage with raw media node', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const { downloadContentFromMessage } = getMocks();
            await vv.execute(makeSock(sendFn), makeQuotedImage(), [], extra);
            expect(downloadContentFromMessage).toHaveBeenCalledTimes(1);
            const [media, type] = downloadContentFromMessage.mock.calls[0];
            expect(type).toBe('image');
            expect(media.mimetype).toBe('image/jpeg');
            expect(media.directPath).toBe('/abc');
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
            expect(payload.viewOnce).toBeUndefined();
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
            expect(payload.viewOnce).toBeUndefined();
        });
    });

    // viewOnceMessageV2Extension envelope (checked first, like the reference vv2)
    describe('viewOnceMessageV2Extension image', () => {
        test('unwraps v2extension envelope', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedViewOnceV2ExtensionImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.viewOnce).toBeUndefined();
            expect(payload.caption).toBe('v2e caption');
        });
    });

    // Quoted message found via a non-extendedTextMessage contextInfo
    describe('quoted message via image contextInfo', () => {
        test('finds the quoted view-once when .vv is an image caption', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedViaImageContext(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.viewOnce).toBeUndefined();
            expect(payload.caption).toBe('via image ctx');
        });
    });

    // Video
    describe('video', () => {
        test('sends video as a normal message', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedVideo(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.video).toBeInstanceOf(Buffer);
            expect(payload.viewOnce).toBeUndefined();
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
            expect(payload.viewOnce).toBeUndefined();
            expect(payload.caption).toBe('nested');
        });

        test('triply nested video', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeTriplyNestedVideo(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.video).toBeInstanceOf(Buffer);
            expect(payload.viewOnce).toBeUndefined();
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

        test('does not call downloadContentFromMessage', async () => {
            const { downloadContentFromMessage } = getMocks();
            await vv.execute(makeSock(jest.fn().mockResolvedValue({})), makeNoMedia(), [], extra);
            expect(downloadContentFromMessage).not.toHaveBeenCalled();
        });
    });

    // Download failure
    describe('download failure', () => {
        test('shows friendly error, not stack trace', async () => {
            const { downloadContentFromMessage } = getMocks();
            downloadContentFromMessage.mockRejectedValueOnce(new Error('ENOTFOUND'));
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toContain('Failed to download');
            expect(payload.text).not.toContain('ENOTFOUND');
        });
    });

    // Missing media key (sender's own copy of a view-once message, or one
    // already opened: WhatsApp delivers a stub with no key to decrypt).
    // The reference approach is to attempt the download first and only
    // explain afterwards, so the download IS attempted here. A real
    // download without a mediaKey fails (Baileys cannot decrypt), and
    // the failure is then explained plainly instead of blamed on expiry.
    describe('missing media key', () => {
        test('attempts the download, then explains it cannot be recovered when it fails', async () => {
            const { downloadContentFromMessage } = getMocks();
            downloadContentFromMessage.mockRejectedValueOnce(new Error('No valid media URL or directPath present in message'));
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedKeylessImage(), [], extra);
            expect(downloadContentFromMessage).toHaveBeenCalledTimes(1);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toContain('did not include the download key');
        });
    });

    // Direct media
    describe('direct media', () => {
        test('direct image sends as a normal message', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeDirectImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.viewOnce).toBeUndefined();
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

    // Caption preservation
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

    // Stripped credentials — store lookup recovery (regression test for
    // the 2026-11-16 bug: a fresh view-once message whose quotedMessage
    // had its download credentials stripped by WhatsApp).
    describe('stripped credentials (store lookup)', () => {
        test('recovers media from the store when quotedMessage has no url/directPath', async () => {
            const storeModule = require('../lib/lightweight_store');
            storeModule.loadMessage.mockResolvedValueOnce({
                key: { id: 'STANZA_STRIPPED', remoteJid: makeChatId() },
                message: {
                    viewOnceMessageV2: {
                        message: {
                            imageMessage: {
                                mimetype: 'image/jpeg',
                                caption: 'original caption',
                                mediaKey: Buffer.from('key'),
                                directPath: '/original',
                                url: 'https://example.com/original',
                            },
                        },
                    },
                },
            });
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedStrippedViewOnceImage(), [], extra);
            expect(storeModule.loadMessage).toHaveBeenCalledWith(makeChatId(), 'STANZA_STRIPPED');
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.image).toBeInstanceOf(Buffer);
            expect(payload.caption).toBe('original caption');
        });

        test('falls back to download attempt when the store has no match', async () => {
            const storeModule = require('../lib/lightweight_store');
            storeModule.loadMessage.mockResolvedValueOnce(null);
            const { downloadContentFromMessage } = getMocks();
            downloadContentFromMessage.mockRejectedValueOnce(new Error('No valid media URL or directPath present in message'));
            const sendFn = jest.fn().mockResolvedValue({});
            await vv.execute(makeSock(sendFn), makeQuotedStrippedViewOnceImage(), [], extra);
            expect(storeModule.loadMessage).toHaveBeenCalled();
            expect(downloadContentFromMessage).toHaveBeenCalledTimes(1);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toContain('did not include the download key');
        });
    });
});
