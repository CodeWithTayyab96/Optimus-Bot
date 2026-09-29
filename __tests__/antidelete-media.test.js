/**
 * Tests for the antidelete media-node diagnostics.
 *
 * describeMediaNode() exists because a bare "Cannot derive from empty media
 * key" could not distinguish two very different situations:
 *   - the wrong node was passed (a wrapper, so mediaKey sits one level deeper)
 *   - the message genuinely arrived without a key (WhatsApp sends stubs)
 *
 * Pure functions: no network, no WhatsApp, no files written.
 */
const { _test } = require('../commands/owner/antidelete');

describe('antidelete.describeMediaNode', () => {
    test('flags a keyless node and lists what it does have', () => {
        expect(_test.describeMediaNode({ url: 'https://mmg.whatsapp.net/x', mimetype: 'image/jpeg' })).toBe(
            'mediaKey=MISSING url=present fields=[url, mimetype]'
        );
    });

    test('reports a healthy node', () => {
        const node = {
            mediaKey: Buffer.from('k'),
            url: 'https://mmg.whatsapp.net/x',
            mimetype: 'video/mp4',
        };
        expect(_test.describeMediaNode(node)).toBe(
            'mediaKey=present url=present fields=[mediaKey, url, mimetype]'
        );
    });

    test('treats directPath as a usable URL', () => {
        expect(_test.describeMediaNode({ mediaKey: Buffer.from('k'), directPath: '/v/x' })).toBe(
            'mediaKey=present url=present fields=[mediaKey, directPath]'
        );
    });

    test('exposes the wrapper shape that caused the sticker failures', () => {
        // lottieStickerMessage is a FutureProofMessage: { message: { stickerMessage } }.
        // Passing the wrapper leaves mediaKey one level too deep — the shape that
        // produced "Cannot derive from empty media key".
        expect(_test.describeMediaNode({ stickerMessage: { mediaKey: Buffer.from('k') } })).toBe(
            'mediaKey=MISSING url=MISSING fields=[stickerMessage]'
        );
    });

    test('handles non-objects without throwing', () => {
        expect(_test.describeMediaNode(null)).toBe('node is null');
        expect(_test.describeMediaNode(undefined)).toBe('node is undefined');
        expect(_test.describeMediaNode('nope')).toBe('node is string');
    });
});

describe('antidelete.safeDownload', () => {
    test('returns an empty string for a keyless node instead of throwing', async () => {
        // A keyless message is not retryable, so it must degrade quietly and let
        // the rest of the message (caption/text) still be stored. No network call
        // happens on this path.
        const result = await _test.safeDownload(
            { url: 'https://example.invalid/x' },
            'image',
            '/tmp/never-written.jpg'
        );
        expect(result).toBe('');
    });
});
