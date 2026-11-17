const store = require('../lib/lightweight_store');

function vo(id, node) {
    return { key: { id, remoteJid: 'g@g.us' }, message: { viewOnceMessageV2: { message: { imageMessage: node } } } };
}

describe('store view-once diagnostics', () => {
    test('stub arrival is reported as missing key/url', () => {
        store._recordViewOnceArrival(vo('STUB1', { caption: 'x' }));
        const d = store.diagnose('g@g.us', 'STUB1');
        expect(d).toMatch(/mediaKey MISSING, url MISSING/);
        expect(d).toMatch(/stub/);
    });
    test('full arrival is reported as present', () => {
        store._recordViewOnceArrival(vo('FULL1', { mediaKey: Buffer.from('k'), url: 'u' }));
        expect(store.diagnose('g@g.us', 'FULL1')).toMatch(/mediaKey present, url present/);
    });
    test('unknown id says the bot never saw it', () => {
        expect(store.diagnose('g@g.us', 'NOPE')).toMatch(/never saw this message arrive/);
    });
});

describe('store persistence round-trip', () => {
    test('mediaKey survives JSON save/load as a Buffer', () => {
        // JSON.stringify(Buffer) in protobuf messages yields a base64 string
        const restored = { a: [{ message: { imageMessage: { mediaKey: Buffer.from('secret-key').toString('base64'), url: 'u' } } }] };
        expect(typeof restored.a[0].message.imageMessage.mediaKey).toBe('string');
        store._reviveBuffers(restored);
        expect(Buffer.isBuffer(restored.a[0].message.imageMessage.mediaKey)).toBe(true);
        expect(restored.a[0].message.imageMessage.mediaKey.toString()).toBe('secret-key');
    });
    test('mediaKey survives a REAL JSON round-trip (Buffer -> {"type":"Buffer","data":[...]})', () => {
        // This is what the store's plain JSON.stringify actually writes for a
        // Baileys-decoded mediaKey (verified with Baileys' own proto decode):
        // a {"type":"Buffer","data":[...]} object, not a base64 string.
        const restored = JSON.parse(JSON.stringify({ a: [{ message: { imageMessage: { mediaKey: Buffer.from('secret-key'), url: 'u' } } }] }));
        expect(restored.a[0].message.imageMessage.mediaKey).toEqual({ type: 'Buffer', data: [115, 101, 99, 114, 101, 116, 45, 107, 101, 121] });
        store._reviveBuffers(restored);
        expect(Buffer.isBuffer(restored.a[0].message.imageMessage.mediaKey)).toBe(true);
        expect(restored.a[0].message.imageMessage.mediaKey.toString()).toBe('secret-key');
    });
    test('mediaKey survives a Uint8Array JSON round-trip (numeric-key object)', () => {
        const restored = JSON.parse(JSON.stringify({ a: [{ message: { imageMessage: { mediaKey: new Uint8Array(Buffer.from('secret-key')), url: 'u' } } }] }));
        store._reviveBuffers(restored);
        expect(Buffer.isBuffer(restored.a[0].message.imageMessage.mediaKey)).toBe(true);
        expect(restored.a[0].message.imageMessage.mediaKey.toString()).toBe('secret-key');
    });
});
