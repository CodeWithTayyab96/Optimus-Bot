/**
 * Tests for the .vv2 (View-Once to DM) command.
 *
 * Covers: envelope unwrapping (V2Extension, V2, V1, direct viewOnce),
 * DM delivery and confirmation, error handling, contextInfo from
 * multiple message types, dmJid device-suffix stripping, and payload shape.
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
function makeSenderId() { return '5511999999999@s.whatsapp.net'; }

// ---- Message factories ----

function makeQuotedViewOnceV2Image() {
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

function makeQuotedViewOnceV1Image() {
    return {
        key: { remoteJid: makeChatId(), participant: makeSenderId(), fromMe: false },
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_VV2_V1',
                    participant: makeSenderId(),
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

function makeQuotedDirectViewOnceImage() {
    return {
        key: { remoteJid: makeChatId(), participant: makeSenderId(), fromMe: false },
        message: {
            extendedTextMessage: {
                contextInfo: {
                    stanzaId: 'STANZA_VV2_DIRECT',
                    participant: makeSenderId(),
                    quotedMessage: {
                        imageMessage: {
                            viewOnce: true,
                            mimetype: 'image/jpeg',
                            caption: 'direct viewonce',
                            mediaKey: Buffer.from('key'),
                            directPath: '/direct',
                            url: 'https://example.com/direct',
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

function makeQuotedViaImageContext() {
    return {
        key: { remoteJid: makeChatId(), participant: makeSenderId(), fromMe: false },
        message: {
            imageMessage: {
                mimetype: 'image/jpeg',
                caption: '.vv2',
                contextInfo: {
                    stanzaId: 'STANZA_VV2_IMGCTX',
                    participant: makeSenderId(),
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

function makeUnsupportedViewOnceType() {
    return {
        key: { remoteJid: makeChatId(), participant: makeSenderId(), fromMe: false },
        message: {
            extendedTextMessage: {
                contextInfo: {
                    quotedMessage: {
                        viewOnce: true,
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

function makeNoDmAvailable() {
    return {
        key: { remoteJid: makeChatId(), fromMe: false },
        message: {
            extendedTextMessage: {
                contextInfo: {
                    quotedMessage: {
                        viewOnceMessageV2: {
                            message: {
                                imageMessage: {
                                    mimetype: 'image/jpeg',
                                    caption: 'no dm',
                                    mediaKey: Buffer.from('key'),
                                    directPath: '/nodm',
                                    url: 'https://example.com/nodm',
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

const extra = { chatId: makeChatId(), senderId: makeSenderId() };

// ---- Tests ----

describe('.vv2 command', () => {
    let vv2;
    beforeAll(() => { vv2 = require('../commands/general/vv2.js'); });
    beforeEach(() => { jest.clearAllMocks(); });

    describe('metadata', () => {
        test('name is "vv2"', () => expect(vv2.name).toBe('vv2'));
        test('category is general', () => expect(vv2.category).toBe('general'));
        test('execute is a function', () => expect(typeof vv2.execute).toBe('function'));
    });

    describe('viewOnceMessageV2 image', () => {
        test('downloads and sends image to sender DM', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceV2Image(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(2);
            const [dmJid, dmPayload] = sendFn.mock.calls[0];
            expect(dmJid).toBe(makeSenderId());
            expect(dmPayload.image).toBeInstanceOf(Buffer);
            expect(dmPayload.caption).toBe('v2 caption');
            expect(dmPayload.mimetype).toBe('image/jpeg');
            expect(dmPayload.viewOnce).toBeUndefined();
        });

        test('confirms in the group chat', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceV2Image(), [], extra);
            const [chatJid, chatPayload] = sendFn.mock.calls[1];
            expect(chatJid).toBe(makeChatId());
            expect(chatPayload.text).toBe('✅ Sent to your DM.');
        });

        test('calls downloadContentFromMessage with the image node', async () => {
            const { downloadContentFromMessage } = getMocks();
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceV2Image(), [], extra);
            expect(downloadContentFromMessage).toHaveBeenCalledTimes(1);
            const [media, type] = downloadContentFromMessage.mock.calls[0];
            expect(type).toBe('image');
            expect(media.mimetype).toBe('image/jpeg');
            expect(media.directPath).toBe('/v2');
        });
    });

    describe('viewOnceMessageV2Extension image', () => {
        test('unwraps v2extension and sends to DM', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceV2ExtensionImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(2);
            const [dmJid, dmPayload] = sendFn.mock.calls[0];
            expect(dmJid).toBe(makeSenderId());
            expect(dmPayload.image).toBeInstanceOf(Buffer);
            expect(dmPayload.caption).toBe('v2e caption');
            expect(dmPayload.mimetype).toBe('image/jpeg');
        });
    });

    describe('viewOnceMessage v1 image', () => {
        test('unwraps v1 envelope and sends to DM', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceV1Image(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(2);
            const [dmJid, dmPayload] = sendFn.mock.calls[0];
            expect(dmJid).toBe(makeSenderId());
            expect(dmPayload.image).toBeInstanceOf(Buffer);
            expect(dmPayload.caption).toBe('v1 caption');
        });
    });

    describe('direct viewOnce flag on imageMessage', () => {
        test('sends image to DM when imageMessage.viewOnce is true', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedDirectViewOnceImage(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(2);
            const [dmJid, dmPayload] = sendFn.mock.calls[0];
            expect(dmJid).toBe(makeSenderId());
            expect(dmPayload.image).toBeInstanceOf(Buffer);
            expect(dmPayload.caption).toBe('direct viewonce');
        });
    });

    describe('contextInfo from imageMessage (non-extendedText)', () => {
        test('finds quoted view-once via imageMessage.contextInfo', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViaImageContext(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(2);
            const [dmJid, dmPayload] = sendFn.mock.calls[0];
            expect(dmJid).toBe(makeSenderId());
            expect(dmPayload.image).toBeInstanceOf(Buffer);
            expect(dmPayload.caption).toBe('via image ctx');
        });
    });

    describe('video', () => {
        test('sends video to the DM with correct mimetype', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedVideo(), [], extra);
            const [dmJid, dmPayload] = sendFn.mock.calls[0];
            expect(dmJid).toBe(makeSenderId());
            expect(dmPayload.video).toBeInstanceOf(Buffer);
            expect(dmPayload.caption).toBe('video caption');
            expect(dmPayload.mimetype).toBe('video/mp4');
            expect(dmPayload.viewOnce).toBeUndefined();
        });
    });

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

    describe('no quoted message', () => {
        test('asks to reply to a view-once message', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeNoQuoted(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toBe('🗑️ Reply to a *view-once* message.\nIt will be sent to your DM.');
        });

        test('does not call downloadContentFromMessage', async () => {
            const { downloadContentFromMessage } = getMocks();
            await vv2.execute(makeSock(jest.fn().mockResolvedValue({})), makeNoQuoted(), [], extra);
            expect(downloadContentFromMessage).not.toHaveBeenCalled();
        });
    });

    describe('not a view-once message', () => {
        test('tells the user it is not view-once', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeNotViewOnce(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toBe('❌ This is not a view-once message!');
        });

        test('does not call downloadContentFromMessage', async () => {
            const { downloadContentFromMessage } = getMocks();
            await vv2.execute(makeSock(jest.fn().mockResolvedValue({})), makeNotViewOnce(), [], extra);
            expect(downloadContentFromMessage).not.toHaveBeenCalled();
        });
    });

    describe('unsupported view-once message type', () => {
        test('sends unsupported type error when viewOnce flag is set but no media found', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeUnsupportedViewOnceType(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toBe('❌ Unsupported view-once message type.');
        });
    });

    describe('could not find DM', () => {
        test('sends error when no personal JID can be resolved', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const noDmExtra = { chatId: makeChatId(), senderId: undefined };
            await vv2.execute(makeSock(sendFn), makeNoDmAvailable(), [], noDmExtra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toBe('❌ Could not find your DM.');
        });
    });

    describe('download failure', () => {
        test('sends error message including the error details', async () => {
            const { downloadContentFromMessage } = getMocks();
            downloadContentFromMessage.mockRejectedValueOnce(new Error('ENOTFOUND'));
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceV2Image(), [], extra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [, payload] = sendFn.mock.calls[0];
            expect(payload.text).toBe('❌ Error processing view-once message: ENOTFOUND');
        });
    });

    describe('DM is the chat itself', () => {
        test('sends media once, no separate confirmation', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const privateExtra = { chatId: makeSenderId(), senderId: makeSenderId() };
            const msg = makeQuotedViewOnceV2Image();
            msg.key.remoteJid = makeSenderId();
            await vv2.execute(makeSock(sendFn), msg, [], privateExtra);
            expect(sendFn).toHaveBeenCalledTimes(1);
            const [jid, payload] = sendFn.mock.calls[0];
            expect(jid).toBe(makeSenderId());
            expect(payload.image).toBeInstanceOf(Buffer);
        });
    });

    describe('dmJid helper', () => {
        test('strips :digits@ device suffix from sender ID', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const senderWithDevice = '5511999999999:42@s.whatsapp.net';
            const extraWithDevice = { chatId: makeChatId(), senderId: senderWithDevice };
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceV2Image(), [], extraWithDevice);
            const [dmJid] = sendFn.mock.calls[0];
            expect(dmJid).toBe('5511999999999@s.whatsapp.net');
        });
    });

    describe('no secrets', () => {
        test('no API keys in payloads', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            await vv2.execute(makeSock(sendFn), makeQuotedViewOnceV2Image(), [], extra);
            for (const call of sendFn.mock.calls) {
                const p = JSON.stringify(call[1]);
                expect(p).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
                expect(p).not.toMatch(/bearer/i);
                expect(p).not.toMatch(/ghp_|gho_/);
            }
        });
    });
});
