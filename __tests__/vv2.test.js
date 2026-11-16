/**
 * Tests for the .vv2 (View-Once to DM) command.
 *
 * Covers: envelope unwrapping, DM delivery, reupload recovery,
 * proactive media cache, missing-key error path, and branding.
 */

jest.mock('@whiskeysockets/baileys', () => ({
    downloadContentFromMessage: jest.fn().mockResolvedValue({
        [Symbol.asyncIterator]: async function* () { yield Buffer.from('fake-media'); }
    }),
    downloadMediaMessage: jest.fn().mockResolvedValue(Buffer.from('fake-reup-media')),
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
    loadCachedMedia: jest.fn().mockReturnValue(null),
    _mediaCache: new Map(),
}));

function getMocks() {
    const baileys = require('@whiskeysockets/baileys');
    return {
        downloadContentFromMessage: baileys.downloadContentFromMessage,
        downloadMediaMessage: baileys.downloadMediaMessage,
        toBuffer: baileys.toBuffer,
    };
}

function makeSock(sendFn) {
    return {
        sendMessage: sendFn || jest.fn().mockResolvedValue({}),
        user: { id: '923701609799@s.whatsapp.net' },
        updateMediaMessage: jest.fn(),
    };
}

function makeChatId() { return '12036312345678901@g.us'; }
function makeSenderId() { return '5511999999999@s.whatsapp.net'; }

// ---- Message factories ----

function makeQuotedViewOnceImage() {
    return {
        key: { remoteJid: makeChatId(), participant: makeSenderId(), fromMe: false },
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_VV2_001',
                    participant: makeSenderId(),
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

function makeQuotedViewOnceV2ExtensionImage() {
    return {
        key: { remoteJid: makeChatId(), participant: makeSenderId(), fromMe: false },
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_VV2_V2E',
                    participant: makeSenderId(),
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

function makeQuotedVideo() {
    return {
        key: { remoteJid: makeChatId(), participant: makeSenderId(), fromMe: false },
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_VV2_VID',
                    participant: makeSenderId(),
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
        key: { remoteJid: makeChatId(), participant: makeSenderId(), fromMe: false },
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_VV2_AUD',
                    participant: makeSenderId(),
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

function makeQuotedKeylessImage() {
    return {
        key: { remoteJid: makeChatId(), participant: makeSenderId(), fromMe: false },
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_VV2_KEYLESS',
                    participant: makeSenderId(),
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

function makeQuotedStrippedViewOnceImage() {
    return {
        key: { remoteJid: makeChatId(), participant: makeSenderId(), fromMe: false },
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_VV2_STRIPPED',
                    participant: makeSenderId(),
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

function makeNotViewOnce() {
    return {
        key: { remoteJid: makeChatId(), participant: makeSenderId(), fromMe: false },
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_VV2_NOTVO',
                    participant: makeSenderId(),
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

function makeNoQuoted() {
    return {
        key: { remoteJid: makeChatId(), participant: makeSenderId(), fromMe: false },
        message: { conversation: '.vv2' },
    };
}

const extra = { chatId: makeChatId(), senderId: makeSenderId() };

// ---- Tests ----

describe('.vv2 command', () => {
    let vv2;
    beforeAll(() => { vv2 = require('../commands/general/vv2.js'); });
    beforeEach(() => { jest.clearAllMocks(); });

    // Metadata
    describe('metadata', () => {
        test('name is "vv2"', () => expect(vv2.name).toBe('vv2'));
        test('category is general', () => expect(vv2.category).toBe('general'));
        test('execute is a function', () => expect(typeof vv2.execute).toBe('function'));
    });

    // View-once image sent to the DM
    describe('viewOnceMessageV2 image', () => {
        test('downloads and sends the image to the sender DM', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(2);
            const [dmJid, dmPayload] = sendFn.mock.calls[0];
            expect(dmJid).toBe(makeSenderId());
            expect(dmPayload.image).toBeInstanceOf(Buffer);
            expect(dmPayload.viewOnce).toBeUndefined();
            expect(dmPayload.caption).toBe('v2 caption');
        });

        test('confirms in the chat that it was sent to the DM', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceImage(), [], extra);
            const [chatJid, chatPayload] = sendFn.mock.calls[1];
            expect(chatJid).toBe(makeChatId());
            expect(chatPayload.text).toContain('Sent to your DM');
        });

        test('calls downloadContentFromMessage with raw media node', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const { downloadContentFromMessage } = getMocks();
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceImage(), [], extra);
            expect(downloadContentFromMessage).toHaveBeenCalledTimes(1);
            const [media, type] = downloadContentFromMessage.mock.calls[0];
            expect(type).toBe('image');
            expect(media.mimetype).toBe('image/jpeg');
            expect(media.directPath).toBe('/v2');
        });
    });

    // V2Extension envelope
    describe('viewOnceMessageV2Extension image', () => {
        test('unwraps v2extension envelope and sends to DM', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceV2ExtensionImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(2);
            const [dmJid, dmPayload] = sendFn.mock.calls[0];
            expect(dmJid).toBe(makeSenderId());
            expect(dmPayload.image).toBeInstanceOf(Buffer);
            expect(dmPayload.caption).toBe('v2e caption');
        });
    });

    // Video
    describe('video', () => {
        test('sends video to the DM', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedVideo(), [], extra);
            const [dmJid, dmPayload] = sendFn.mock.calls[0];
            expect(dmJid).toBe(makeSenderId());
            expect(dmPayload.video).toBeInstanceOf(Buffer);
            expect(dmPayload.viewOnce).toBeUndefined();
            expect(dmPayload.caption).toBe('video caption');
        });
    });

    // Audio
    describe('audio', () => {
        test('sends as PTT voice note to the DM', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedAudio(), [], extra);
            const [dmJid, dmPayload] = sendFn.mock.calls[0];
            expect(dmJid).toBe(makeSenderId());
            expect(dmPayload.audio).toBeInstanceOf(Buffer);
            expect(dmPayload.ptt).toBe(true);
            expect(dmPayload.mimetype).toBe('audio/ogg; codecs=opus');
        });
    });

    // No quoted message
    describe('no quoted message', () => {
        test('asks to reply to a view-once message', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeNoQuoted(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toContain('Reply to a view-once message');
        });

        test('does not call downloadContentFromMessage', async () => {
            const { downloadContentFromMessage } = getMocks();
            await vv2.execute(makeSock(jest.fn().mockResolvedValue({})), makeNoQuoted(), [], extra);
            expect(downloadContentFromMessage).not.toHaveBeenCalled();
        });
    });

    // Not a view-once message
    describe('not a view-once message', () => {
        test('says it is not a view-once message', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeNotViewOnce(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toContain('not a view-once message');
        });

        test('does not call downloadContentFromMessage', async () => {
            const { downloadContentFromMessage } = getMocks();
            await vv2.execute(makeSock(jest.fn().mockResolvedValue({})), makeNotViewOnce(), [], extra);
            expect(downloadContentFromMessage).not.toHaveBeenCalled();
        });
    });

    // Download failure
    describe('download failure', () => {
        test('shows friendly error, not stack trace', async () => {
            const { downloadContentFromMessage } = getMocks();
            downloadContentFromMessage.mockRejectedValueOnce(new Error('ENOTFOUND'));
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toContain('Failed to download');
            expect(payload.text).not.toContain('ENOTFOUND');
        });
    });

    // Missing media key
    describe('missing media key', () => {
        test('attempts the download, then explains it cannot be recovered when it fails', async () => {
            const { downloadContentFromMessage } = getMocks();
            downloadContentFromMessage.mockRejectedValueOnce(new Error('No valid media URL or directPath present in message'));
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedKeylessImage(), [], extra);
            expect(downloadContentFromMessage).toHaveBeenCalledTimes(1);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toContain('Failed to download media');
        });
    });

    // DM is the same chat (private chat): no separate confirmation.
    describe('DM is the chat itself', () => {
        test('sends once and does not repeat a confirmation', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const privateExtra = { chatId: makeSenderId(), senderId: makeSenderId() };
            const msg = makeQuotedViewOnceImage();
            msg.key.remoteJid = makeSenderId();
            await vv2.execute(makeSock(sendFn), msg, [], privateExtra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [jid, payload] = sendFn.mock.calls[0];
            expect(jid).toBe(makeSenderId());
            expect(payload.image).toBeInstanceOf(Buffer);
        });
    });

    // Branding
    describe('branding', () => {
        test('sends include channelInfo', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceImage(), [], extra);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.contextInfo).toBeDefined();
            expect(payload.contextInfo.forwardedNewsletterMessageInfo.newsletterName).toBe('Optimus Bot');
        });
    });

    // No secrets
    describe('no secrets', () => {
        test('no API keys in payloads', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceImage(), [], extra);
            for (const call of sendFn.mock.calls) {
                const p = JSON.stringify(call[1]);
                expect(p).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
                expect(p).not.toMatch(/bearer/i);
                expect(p).not.toMatch(/ghp_|gho_/);
            }
        });
    });

    // Stripped credentials — reupload recovery (regression test for 2026-11-16).
    describe('stripped credentials (reupload recovery)', () => {
        test('uses downloadMediaMessage+reuploadRequest when quoted node is stripped', async () => {
            const storeModule = require('../lib/lightweight_store');
            storeModule.loadMessage.mockResolvedValueOnce(null);
            storeModule.loadCachedMedia.mockReturnValueOnce(null);

            const { downloadMediaMessage } = getMocks();
            downloadMediaMessage.mockResolvedValueOnce(Buffer.from('reup-media'));

            const sendFn = jest.fn().mockResolvedValue({});
            const sock = makeSock(sendFn);
            await vv2.execute(sock, makeQuotedStrippedViewOnceImage(), [], extra);

            expect(downloadMediaMessage).toHaveBeenCalledTimes(1);
            const [synMsg, bufType, , opts] = downloadMediaMessage.mock.calls[0];
            expect(synMsg.key.id).toBe('STANZA_VV2_STRIPPED');
            expect(synMsg.key.remoteJid).toBe(makeChatId());
            expect(bufType).toBe('buffer');
            expect(opts.reuploadRequest).toBe(sock.updateMediaMessage);
            expect(sendFn).toHaveBeenCalledTimes(2);
            const [dmJid, dmPayload] = sendFn.mock.calls[0];
            expect(dmJid).toBe(makeSenderId());
            expect(dmPayload.image).toBeInstanceOf(Buffer);
        });

        test('serves from proactive media cache when available', async () => {
            const storeModule = require('../lib/lightweight_store');
            storeModule.loadMessage.mockResolvedValueOnce(null);
            storeModule.loadCachedMedia.mockReturnValueOnce({
                type: 'image',
                buffer: Buffer.from('cached-bytes'),
                caption: 'cached caption',
                timestamp: Date.now(),
            });

            const { downloadMediaMessage, downloadContentFromMessage } = getMocks();
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedStrippedViewOnceImage(), [], extra);

            expect(downloadMediaMessage).not.toHaveBeenCalled();
            expect(downloadContentFromMessage).not.toHaveBeenCalled();
            expect(sendFn).toHaveBeenCalledTimes(2);
            const [dmJid, dmPayload] = sendFn.mock.calls[0];
            expect(dmJid).toBe(makeSenderId());
            expect(dmPayload.image).toEqual(Buffer.from('cached-bytes'));
            expect(dmPayload.caption).toBe('cached caption');
        });

        test('falls back to downloadContentFromMessage when reupload also fails', async () => {
            const storeModule = require('../lib/lightweight_store');
            storeModule.loadMessage.mockResolvedValueOnce(null);
            storeModule.loadCachedMedia.mockReturnValueOnce(null);

            const { downloadMediaMessage, downloadContentFromMessage } = getMocks();
            downloadMediaMessage.mockRejectedValueOnce(new Error('reupload failed'));
            downloadContentFromMessage.mockRejectedValueOnce(new Error('No valid media URL or directPath present in message'));

            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedStrippedViewOnceImage(), [], extra);

            expect(downloadMediaMessage).toHaveBeenCalledTimes(1);
            expect(downloadContentFromMessage).toHaveBeenCalledTimes(1);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toContain('Failed to download media');
        });

        test('recovers media from the store when quotedMessage has no url/directPath', async () => {
            const storeModule = require('../lib/lightweight_store');
            storeModule.loadCachedMedia.mockReturnValueOnce(null);
            storeModule.loadMessage.mockResolvedValueOnce({
                key: { id: 'STANZA_VV2_STRIPPED', remoteJid: makeChatId() },
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

            const { downloadMediaMessage } = getMocks();
            downloadMediaMessage.mockRejectedValueOnce(new Error('reupload failed'));

            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedStrippedViewOnceImage(), [], extra);
            expect(storeModule.loadMessage).toHaveBeenCalledWith(makeChatId(), 'STANZA_VV2_STRIPPED');
            expect(sendFn).toHaveBeenCalledTimes(2);
            const [dmJid, dmPayload] = sendFn.mock.calls[0];
            expect(dmJid).toBe(makeSenderId());
            expect(dmPayload.image).toBeInstanceOf(Buffer);
            expect(dmPayload.caption).toBe('original caption');
        });
    });
});
