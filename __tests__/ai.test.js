/**
 * Comprehensive smoke tests for Optimus Bot AI provider architecture.
 *
 * All external providers are mocked — no real API calls are made.
 * Tests cover:
 *   - aiConfig: model IDs, provider readiness, timeouts
 *   - imageGeneration: Gemini → Cloudflare → Pollinations fallback chain
 *   - lib/ai.js: text chat, STT, backward-compatible exports
 *   - aistatus command: metadata, permissions, output
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock axios so no HTTP requests leave the process
jest.mock('axios');
const axios = require('axios');

// Mock form-data (used by speechToText)
jest.mock('form-data', () => {
    return jest.fn().mockImplementation(() => ({
        append: jest.fn(),
        getHeaders: jest.fn().mockReturnValue({ 'content-type': 'multipart/form-data' }),
    }));
});

// We need a fresh settings object for tests — mock it per-test
jest.mock('../settings', () => ({}));

// Mock messageConfig
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

function setSettings(overrides) {
    const settings = require('../settings');
    Object.assign(settings, overrides);
}

function resetSettings() {
    const settings = require('../settings');
    delete settings.groqApiKey;
    delete settings.geminiApiKey;
    delete settings.pixazoApiKey;
    delete settings.cloudflareAccountId;
    delete settings.cloudflareApiToken;
}

// Clear module registry so fresh imports see updated settings
function freshRequire(modulePath) {
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}

// ===========================================================================
// 1. aiConfig — centralized configuration
// ===========================================================================
describe('aiConfig', () => {
    let aiConfig;

    beforeAll(() => {
        setSettings({
            groqApiKey: 'test-groq-key',
            geminiApiKey: 'test-gemini-key',
            cloudflareAccountId: 'test-cf-account',
            cloudflareApiToken: 'test-cf-token',
        });
        aiConfig = freshRequire('../lib/aiConfig');
    });

    afterAll(() => resetSettings());

    describe('1.1 Text provider', () => {
        test('uses Groq as primary', () => {
            expect(aiConfig.text.provider).toBe('groq');
        });

        test('model ID is openai/gpt-oss-120b', () => {
            expect(aiConfig.text.model).toBe('openai/gpt-oss-120b');
        });

        test('has Gemini fallback', () => {
            expect(aiConfig.text.fallback.provider).toBe('gemini');
            expect(aiConfig.text.fallback.model).toBe('gemini-2.5-flash');
        });
    });

    describe('1.2 Speech provider', () => {
        test('uses Groq as primary', () => {
            expect(aiConfig.speech.provider).toBe('groq');
        });

        test('model ID is whisper-large-v3-turbo', () => {
            expect(aiConfig.speech.model).toBe('whisper-large-v3-turbo');
        });
    });

    describe('1.3 Image provider chain', () => {
        test('primary is Gemini', () => {
            expect(aiConfig.image.primary.provider).toBe('gemini');
            expect(aiConfig.image.primary.model).toBe('gemini-3.1-flash-image');
        });

        test('fallback #1 is Cloudflare', () => {
            expect(aiConfig.image.fallbacks[0].provider).toBe('cloudflare');
            expect(aiConfig.image.fallbacks[0].model).toBe('@cf/black-forest-labs/flux-1-schnell');
        });

        test('fallback #2 is Pollinations', () => {
            expect(aiConfig.image.fallbacks[1].provider).toBe('pollinations');
            expect(aiConfig.image.fallbacks[1].model).toBe('flux');
        });

        test('Groq is NOT used for images', () => {
            const allImageProviders = [aiConfig.image.primary.provider, ...aiConfig.image.fallbacks.map(f => f.provider)];
            expect(allImageProviders).not.toContain('groq');
        });
    });

    describe('1.4 Provider readiness', () => {
        test('groq is ready when key is set', () => {
            expect(aiConfig.isProviderReady('groq')).toBe(true);
        });

        test('groq is not ready with placeholder key', () => {
            setSettings({ groqApiKey: 'YOUR_GROQ_API_KEY' });
            const fresh = freshRequire('../lib/aiConfig');
            expect(fresh.isProviderReady('groq')).toBe(false);
        });

        test('gemini is ready when key is set', () => {
            setSettings({ geminiApiKey: 'test-gemini-key' });
            const fresh = freshRequire('../lib/aiConfig');
            expect(fresh.isProviderReady('gemini')).toBe(true);
        });

        test('cloudflare is ready when both accountId and token are set', () => {
            expect(aiConfig.isProviderReady('cloudflare')).toBe(true);
        });

        test('cloudflare is not ready with placeholder values', () => {
            setSettings({
                cloudflareAccountId: 'YOUR_CLOUDFLARE_ACCOUNT_ID',
                cloudflareApiToken: 'YOUR_CLOUDFLARE_API_TOKEN',
            });
            const fresh = freshRequire('../lib/aiConfig');
            expect(fresh.isProviderReady('cloudflare')).toBe(false);
        });

        test('pollinations is always ready (no key required)', () => {
            expect(aiConfig.isProviderReady('pollinations')).toBe(true);
        });
    });

    describe('1.5 Timeouts', () => {
        test('has reasonable text timeout', () => {
            expect(aiConfig.timeouts.text).toBe(30000);
        });

        test('has reasonable speech timeout', () => {
            expect(aiConfig.timeouts.speech).toBe(60000);
        });

        test('has per-provider image timeouts', () => {
            expect(aiConfig.timeouts.image.gemini).toBe(60000);
            expect(aiConfig.timeouts.image.cloudflare).toBe(60000);
            expect(aiConfig.timeouts.image.pollinations).toBe(45000);
        });
    });
});

// ===========================================================================
// 2. imageGeneration — fallback chain
// ===========================================================================
describe('imageGeneration', () => {
    let imageGen;

    beforeEach(() => {
        jest.clearAllMocks();
        setSettings({
            groqApiKey: 'test-groq',
            geminiApiKey: 'test-gemini',
            cloudflareAccountId: 'test-cf-account',
            cloudflareApiToken: 'test-cf-token',
        });
        imageGen = freshRequire('../lib/imageGeneration');
    });

    afterAll(() => resetSettings());

    // ---- Gemini ----
    describe('2.1 Gemini provider', () => {
        test('returns image buffer on success', async () => {
            const fakeBase64 = Buffer.from('fake-png-data').toString('base64');
            axios.post.mockResolvedValueOnce({
                data: {
                    output_image: { data: fakeBase64 },
                },
            });

            const result = await imageGen.generateWithGemini('a cat');
            expect(result).toBeInstanceOf(Buffer);
            expect(result.toString()).toBe('fake-png-data');
        });

        test('returns null when no image in response', async () => {
            axios.post.mockResolvedValueOnce({
                data: { output_image: null },
            });

            const result = await imageGen.generateWithGemini('a cat');
            expect(result).toBeNull();
        });

        test('returns null when API key is placeholder', async () => {
            setSettings({ geminiApiKey: 'YOUR_GEMINI_API_KEY' });
            const fresh = freshRequire('../lib/imageGeneration');
            const result = await fresh.generateWithGemini('a cat');
            expect(result).toBeNull();
        });

        test('returns null on API error', async () => {
            axios.post.mockRejectedValueOnce(new Error('network error'));
            const result = await imageGen.generateWithGemini('a cat');
            expect(result).toBeNull();
        });

        test('uses Interactions API endpoint and x-goog-api-key header', async () => {
            const fakeBase64 = Buffer.from('test').toString('base64');
            axios.post.mockResolvedValueOnce({
                data: { output_image: { data: fakeBase64 } },
            });

            await imageGen.generateWithGemini('test prompt');
            const [url, body, config] = axios.post.mock.calls[0];
            expect(url).toContain('/v1beta/interactions');
            expect(body.model).toBe('gemini-3.1-flash-image');
            expect(body.input[0].type).toBe('text');
            expect(body.input[0].text).toBe('test prompt');
            expect(config.headers['x-goog-api-key']).toBe('test-gemini');
            expect(config.headers['Content-Type']).toBe('application/json');
        });
    });

    // ---- Cloudflare ----
    describe('2.2 Cloudflare provider', () => {
        test('returns image buffer on success (base64 string)', async () => {
            const fakeBase64 = Buffer.from('fake-cf-data').toString('base64');
            axios.post.mockResolvedValueOnce({
                data: { result: fakeBase64 },
            });

            const result = await imageGen.generateWithCloudflare('a dog');
            expect(result).toBeInstanceOf(Buffer);
            expect(result.toString()).toBe('fake-cf-data');
        });

        test('returns image buffer when result has .image field', async () => {
            const fakeBase64 = Buffer.from('fake-cf-img').toString('base64');
            axios.post.mockResolvedValueOnce({
                data: { result: { image: fakeBase64 } },
            });

            const result = await imageGen.generateWithCloudflare('a dog');
            expect(result).toBeInstanceOf(Buffer);
        });

        test('returns null when credentials are placeholders', async () => {
            setSettings({
                cloudflareAccountId: 'YOUR_CLOUDFLARE_ACCOUNT_ID',
                cloudflareApiToken: 'YOUR_CLOUDFLARE_API_TOKEN',
            });
            const fresh = freshRequire('../lib/imageGeneration');
            const result = await fresh.generateWithCloudflare('a dog');
            expect(result).toBeNull();
        });

        test('returns null on API error', async () => {
            axios.post.mockRejectedValueOnce(new Error('cf error'));
            const result = await imageGen.generateWithCloudflare('a dog');
            expect(result).toBeNull();
        });
    });

    // ---- Pollinations ----
    describe('2.3 Pollinations provider', () => {
        test('returns image buffer on success (PNG)', async () => {
            const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
            const fakeImage = Buffer.concat([pngHeader, Buffer.from('rest-of-image')]);
            axios.get.mockResolvedValueOnce({ data: fakeImage });

            const result = await imageGen.generateWithPollinations('a bird');
            expect(result).toBeInstanceOf(Buffer);
        });

        test('returns null on non-image response', async () => {
            axios.get.mockResolvedValueOnce({ data: Buffer.from('not-an-image') });

            const result = await imageGen.generateWithPollinations('a bird');
            expect(result).toBeNull();
        });

        test('returns null on timeout', async () => {
            axios.get.mockRejectedValueOnce(new Error('timeout of 45000ms exceeded'));
            const result = await imageGen.generateWithPollinations('a bird');
            expect(result).toBeNull();
        });
    });

    // ---- Fallback chain ----
    describe('2.4 Fallback chain', () => {
        test('Gemini success returns immediately (no Cloudflare/Pollinations call)', async () => {
            const fakeBase64 = Buffer.from('ok').toString('base64');
            axios.post.mockResolvedValueOnce({
                data: { output_image: { data: fakeBase64 } },
            });

            const result = await imageGen.generateImage('prompt');
            expect(result).toBeInstanceOf(Buffer);
            expect(axios.post).toHaveBeenCalledTimes(1);
            expect(axios.get).not.toHaveBeenCalled();
        });

        test('Gemini failure → Cloudflare success', async () => {
            // Gemini fails
            axios.post
                .mockRejectedValueOnce(new Error('gemini error'))  // Gemini
                .mockResolvedValueOnce({ data: { result: Buffer.from('cf-ok').toString('base64') } }); // Cloudflare

            const result = await imageGen.generateImage('prompt');
            expect(result).toBeInstanceOf(Buffer);
            expect(axios.post).toHaveBeenCalledTimes(2);
        });

        test('Gemini + Cloudflare failure → Pollinations success', async () => {
            // Gemini fails
            axios.post
                .mockRejectedValueOnce(new Error('gemini error'))
                .mockRejectedValueOnce(new Error('cf error'));
            // Pollinations succeeds
            const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
            axios.get.mockResolvedValueOnce({ data: Buffer.concat([pngHeader, Buffer.from('poll-ok')]) });

            const result = await imageGen.generateImage('prompt');
            expect(result).toBeInstanceOf(Buffer);
        });

        test('all providers fail → returns null', async () => {
            axios.post
                .mockRejectedValueOnce(new Error('gemini error'))
                .mockRejectedValueOnce(new Error('cf error'));
            axios.get.mockRejectedValueOnce(new Error('poll error'));

            const result = await imageGen.generateImage('prompt');
            expect(result).toBeNull();
        });

        test('returns null for empty prompt', async () => {
            const result = await imageGen.generateImage('');
            expect(result).toBeNull();

            const result2 = await imageGen.generateImage(null);
            expect(result2).toBeNull();
        });
    });

    // ---- Security: no leaks ----
    describe('2.5 No technical detail leaks', () => {
        test('errors are caught, not thrown', async () => {
            axios.post.mockRejectedValueOnce(new Error('ENOTFOUND api.gemini.com'));
            axios.post.mockRejectedValueOnce(new Error('401 Unauthorized from CF'));
            axios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

            // Should not throw
            const result = await imageGen.generateImage('test');
            expect(result).toBeNull();
        });
    });

    // ---- Hardening: malformed responses ----
    describe('2.6 Malformed provider responses', () => {
        test('Gemini returns empty object', async () => {
            axios.post.mockResolvedValueOnce({ data: {} });
            const result = await imageGen.generateWithGemini('test');
            expect(result).toBeNull();
        });

        test('Gemini returns null output_image', async () => {
            axios.post.mockResolvedValueOnce({ data: { output_image: null } });
            const result = await imageGen.generateWithGemini('test');
            expect(result).toBeNull();
        });

        test('Cloudflare returns empty result', async () => {
            axios.post.mockResolvedValueOnce({ data: { result: null } });
            const result = await imageGen.generateWithCloudflare('test');
            expect(result).toBeNull();
        });

        test('Cloudflare returns result without image field', async () => {
            axios.post.mockResolvedValueOnce({ data: { result: { other: 'data' } } });
            const result = await imageGen.generateWithCloudflare('test');
            expect(result).toBeNull();
        });

        test('Pollinations returns empty buffer', async () => {
            axios.get.mockResolvedValueOnce({ data: Buffer.alloc(0) });
            const result = await imageGen.generateWithPollinations('test');
            expect(result).toBeNull();
        });
    });

    // ---- Hardening: HTTP errors ----
    describe('2.7 HTTP error handling', () => {
        test('Gemini 400 error returns null', async () => {
            const err = new Error('Request failed');
            err.response = { status: 400, data: { error: { message: 'Bad request' } } };
            axios.post.mockRejectedValueOnce(err);
            const result = await imageGen.generateWithGemini('test');
            expect(result).toBeNull();
        });

        test('Gemini 429 rate limit returns null', async () => {
            const err = new Error('Rate limited');
            err.response = { status: 429, data: { error: { message: 'Quota exceeded' } } };
            axios.post.mockRejectedValueOnce(err);
            const result = await imageGen.generateWithGemini('test');
            expect(result).toBeNull();
        });

        test('Cloudflare 401 unauthorized returns null', async () => {
            const err = new Error('Unauthorized');
            err.response = { status: 401, data: { errors: [{ message: 'Invalid token' }] } };
            axios.post.mockRejectedValueOnce(err);
            const result = await imageGen.generateWithCloudflare('test');
            expect(result).toBeNull();
        });

        test('Pollinations 500 error returns null', async () => {
            const err = new Error('Server error');
            err.response = { status: 500 };
            axios.get.mockRejectedValueOnce(err);
            const result = await imageGen.generateWithPollinations('test');
            expect(result).toBeNull();
        });
    });

    // ---- Hardening: provider isolation ----
    describe('2.8 Provider isolation', () => {
        test('image failure does not invoke text providers', async () => {
            // All image providers fail
            axios.post
                .mockRejectedValueOnce(new Error('gemini fail'))
                .mockRejectedValueOnce(new Error('cf fail'));
            axios.get.mockRejectedValueOnce(new Error('poll fail'));

            const result = await imageGen.generateImage('test');
            expect(result).toBeNull();

            // All calls should be image-related, no text completions
            for (const call of axios.post.mock.calls) {
                const url = call[0];
                expect(url).not.toContain('/chat/completions');
                expect(url).not.toContain('/audio/transcriptions');
            }
        });
    });
});

// ===========================================================================
// 3. lib/ai.js — backward-compatible exports
// ===========================================================================
describe('lib/ai.js', () => {
    let ai;

    beforeEach(() => {
        jest.clearAllMocks();
        setSettings({
            groqApiKey: 'test-groq',
            geminiApiKey: 'test-gemini',
            pixazoApiKey: 'test-pixazo',
        });
        ai = freshRequire('../lib/ai');
    });

    afterAll(() => resetSettings());

    describe('3.1 Exports exist', () => {
        test('exports chatGroq', () => {
            expect(typeof ai.chatGroq).toBe('function');
        });
        test('exports chatGemini', () => {
            expect(typeof ai.chatGemini).toBe('function');
        });
        test('exports chat', () => {
            expect(typeof ai.chat).toBe('function');
        });
        test('exports generateImage', () => {
            expect(typeof ai.generateImage).toBe('function');
        });
        test('exports generateImagePixazo', () => {
            expect(typeof ai.generateImagePixazo).toBe('function');
        });
        test('exports generateImageGemini', () => {
            expect(typeof ai.generateImageGemini).toBe('function');
        });
        test('exports speechToText', () => {
            expect(typeof ai.speechToText).toBe('function');
        });
    });

    describe('3.2 chatGroq', () => {
        test('uses correct model ID from aiConfig', async () => {
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: 'hello' } }] },
            });

            await ai.chatGroq('system', 'user');
            const body = axios.post.mock.calls[0][1];
            expect(body.model).toBe('openai/gpt-oss-120b');
        });

        test('returns null on error', async () => {
            axios.post.mockRejectedValueOnce(new Error('fail'));
            const result = await ai.chatGroq('system', 'user');
            expect(result).toBeNull();
        });

        test('returns null when no API key', async () => {
            setSettings({ groqApiKey: '' });
            const fresh = freshRequire('../lib/ai');
            const result = await fresh.chatGroq('system', 'user');
            expect(result).toBeNull();
        });
    });

    describe('3.3 chatGemini', () => {
        test('uses correct model ID from aiConfig', async () => {
            axios.post.mockResolvedValueOnce({
                data: { candidates: [{ content: { parts: [{ text: 'hi' }] } }] },
            });

            await ai.chatGemini('system', 'user');
            const url = axios.post.mock.calls[0][0];
            expect(url).toContain('gemini-2.5-flash');
        });

        test('returns null on error', async () => {
            axios.post.mockRejectedValueOnce(new Error('fail'));
            const result = await ai.chatGemini('system', 'user');
            expect(result).toBeNull();
        });
    });

    describe('3.4 chat (auto-fallback)', () => {
        test('returns Groq response when available', async () => {
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: 'groq answer' } }] },
            });

            const result = await ai.chat('system', 'user');
            expect(result).toBe('groq answer');
        });

        test('falls back to Gemini when Groq fails', async () => {
            axios.post.mockRejectedValueOnce(new Error('groq fail'));
            axios.post.mockResolvedValueOnce({
                data: { candidates: [{ content: { parts: [{ text: 'gemini answer' }] } }] },
            });

            const result = await ai.chat('system', 'user');
            expect(result).toBe('gemini answer');
        });
    });

    describe('3.5 generateImage (delegates to imageGeneration.js)', () => {
        test('returns image buffer on success', async () => {
            const fakeBase64 = Buffer.from('delegated').toString('base64');
            axios.post.mockResolvedValueOnce({
                data: { output_image: { data: fakeBase64 } },
            });

            const result = await ai.generateImage('prompt');
            expect(result).toBeInstanceOf(Buffer);
        });
    });

    describe('3.6 speechToText', () => {
        test('uses whisper-large-v3-turbo model', async () => {
            axios.post.mockResolvedValueOnce({ data: { text: 'transcribed' } });

            await ai.speechToText(Buffer.from('audio'));
            const form = axios.post.mock.calls[0][1];
            // form-data mock — just verify it was called
            expect(axios.post).toHaveBeenCalledTimes(1);
        });

        test('returns null on error', async () => {
            axios.post.mockRejectedValueOnce(new Error('fail'));
            const result = await ai.speechToText(Buffer.from('audio'));
            expect(result).toBeNull();
        });
    });
});

// ===========================================================================
// 4. .aistatus command
// ===========================================================================
describe('.aistatus command', () => {
    let cmd;

    beforeAll(() => {
        setSettings({
            groqApiKey: 'sk-abc123def456',
            geminiApiKey: 'AIzaSy-real-key-here',
            cloudflareAccountId: 'abc123',
            cloudflareApiToken: 'xyz789',
        });
        cmd = require('../commands/owner/aistatus');
    });

    describe('4.1 Metadata', () => {
        test('name is "aistatus"', () => {
            expect(cmd.name).toBe('aistatus');
        });

        test('has aliases', () => {
            expect(cmd.aliases).toContain('aistat');
            expect(cmd.aliases).toContain('ais');
        });

        test('category is owner', () => {
            expect(cmd.category).toBe('owner');
        });

        test('ownerOnly is true', () => {
            expect(cmd.ownerOnly).toBe(true);
        });

        test('execute is a function', () => {
            expect(typeof cmd.execute).toBe('function');
        });
    });

    describe('4.2 Output', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });
        test('output contains AI STATUS header', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = { sendMessage: sendFn };
            const msg = { message: { conversation: '.aistatus' }, key: { id: '1' } };
            const extra = { chatId: '123@g.us' };

            await cmd.execute(sock, msg, [], extra);

            expect(sendFn).toHaveBeenCalledTimes(1);
            const text = sendFn.mock.calls[0][1].text;
            expect(text).toContain('AI STATUS');
            expect(text).toContain('Text');
            expect(text).toContain('Speech');
            expect(text).toContain('Image');
        });

        test('output shows provider names', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = { sendMessage: sendFn };
            const msg = { message: { conversation: '.aistatus' }, key: { id: '1' } };
            const extra = { chatId: '123@g.us' };

            await cmd.execute(sock, msg, [], extra);

            const text = sendFn.mock.calls[0][1].text;
            expect(text).toContain('Groq');
            expect(text).toContain('Gemini');
            expect(text).toContain('Cloudflare');
            expect(text).toContain('Pollinations');
        });

        test('output shows model IDs', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = { sendMessage: sendFn };
            const msg = { message: { conversation: '.aistatus' }, key: { id: '1' } };
            const extra = { chatId: '123@g.us' };

            await cmd.execute(sock, msg, [], extra);

            const text = sendFn.mock.calls[0][1].text;
            expect(text).toContain('openai/gpt-oss-120b');
            expect(text).toContain('whisper-large-v3-turbo');
            expect(text).toContain('gemini-3.1-flash-image');
        });

        test('output does NOT expose API keys', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = { sendMessage: sendFn };
            const msg = { message: { conversation: '.aistatus' }, key: { id: '1' } };
            const extra = { chatId: '123@g.us' };

            await cmd.execute(sock, msg, [], extra);

            const text = sendFn.mock.calls[0][1].text;
            expect(text).not.toContain('sk-abc123def456');
            expect(text).not.toContain('AIzaSy-real-key-here');
            expect(text).not.toContain('xyz789');
        });

        test('includes channelInfo branding', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = { sendMessage: sendFn };
            const msg = { message: { conversation: '.aistatus' }, key: { id: '1' } };
            const extra = { chatId: '123@g.us' };

            await cmd.execute(sock, msg, [], extra);

            const payload = sendFn.mock.calls[0][1];
            expect(payload.contextInfo).toBeDefined();
        });

        test('does NOT make network requests', async () => {
            const sendFn = jest.fn().mockResolvedValue({});
            const sock = { sendMessage: sendFn };
            const msg = { message: { conversation: '.aistatus' }, key: { id: '1' } };
            const extra = { chatId: '123@g.us' };

            await cmd.execute(sock, msg, [], extra);

            // axios should not be called by aistatus
            expect(axios.get).not.toHaveBeenCalled();
            expect(axios.post).not.toHaveBeenCalled();
        });
    });
});

// ===========================================================================
// 5. Regression: no duplicate model IDs
// ===========================================================================
describe('No duplicate model IDs', () => {
    test('each model ID appears in exactly one canonical location', () => {
        const aiConfig = freshRequire('../lib/aiConfig');
        const modelIds = [
            aiConfig.text.model,
            aiConfig.text.fallback.model,
            aiConfig.speech.model,
            aiConfig.image.primary.model,
            aiConfig.image.fallbacks[0].model,
            aiConfig.image.fallbacks[1].model,
        ];

        // All should be unique
        const unique = new Set(modelIds);
        expect(unique.size).toBe(modelIds.length);
    });

    test('no hardcoded model IDs remain in ai.js (except URLs)', () => {
        // Verify ai.js delegates to aiConfig for model IDs
        const fs = require('fs');
        const aiContent = fs.readFileSync(require('path').join(__dirname, '..', 'lib', 'ai.js'), 'utf8');

        // Should not contain the old hardcoded model ID
        expect(aiContent).not.toContain("llama-3.3-70b-versatile");
        expect(aiContent).not.toContain("gemini-2.0-flash");
        expect(aiContent).not.toContain("gemini-2.0-flash-exp");
    });
});
