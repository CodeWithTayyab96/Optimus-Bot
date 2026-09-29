/**
 * Tests for lib/warpProxy.js — the rootless Cloudflare WARP integration.
 *
 * These cover the pure, offline logic: asset selection, ZIP extraction, proxy
 * URL building, the register-retry decision, and waitForPort against a real
 * local TCP socket. The network parts (download, register, the SOCKS tunnel)
 * are exercised on the user's real host, where the WARP API is reachable — this
 * sandbox's egress mangles usque's HTTP/2 POST, which is environmental only.
 */
const net = require('net');
const zlib = require('zlib');
const warp = require('../lib/warpProxy');

/** Build a minimal but valid ZIP entirely in memory (no system unzip needed). */
function makeZip(entries) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const e of entries) {
        const nameBuf = Buffer.from(e.name, 'utf8');
        const comp = e.method === 8 ? zlib.deflateRawSync(e.data) : e.data;
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0);
        lh.writeUInt16LE(20, 4);
        lh.writeUInt16LE(0, 6);
        lh.writeUInt16LE(e.method, 8);
        lh.writeUInt32LE(0, 14); // crc (ignored by the reader)
        lh.writeUInt32LE(comp.length, 18);
        lh.writeUInt32LE(e.data.length, 22);
        lh.writeUInt16LE(nameBuf.length, 26);
        lh.writeUInt16LE(0, 28);
        const local = Buffer.concat([lh, nameBuf, comp]);
        localParts.push(local);

        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0);
        ch.writeUInt16LE(20, 4);
        ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(e.method, 10);
        ch.writeUInt32LE(0, 16); // crc
        ch.writeUInt32LE(comp.length, 20);
        ch.writeUInt32LE(e.data.length, 24);
        ch.writeUInt16LE(nameBuf.length, 28);
        ch.writeUInt16LE(0, 30);
        ch.writeUInt16LE(0, 32);
        ch.writeUInt16LE(0, 34);
        ch.writeUInt16LE(0, 36);
        ch.writeUInt32LE(offset, 42);
        centralParts.push(Buffer.concat([ch, nameBuf]));
        offset += local.length;
    }
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(Buffer.concat(centralParts).length, 12);
    eocd.writeUInt32LE(Buffer.concat(localParts).length, 16);
    return Buffer.concat([...localParts, ...centralParts, eocd]);
}

describe('warpProxy.assetName', () => {
    const saved = { p: process.platform, a: process.arch };
    afterEach(() => {
        Object.defineProperty(process, 'platform', { value: saved.p });
        Object.defineProperty(process, 'arch', { value: saved.a });
    });
    const set = (platform, arch) => {
        Object.defineProperty(process, 'platform', { value: platform });
        Object.defineProperty(process, 'arch', { value: arch });
    };

    test('linux amd64 → linux_amd64 zip', () => {
        set('linux', 'x64');
        expect(warp.assetName()).toBe('usque_4.2.1_linux_amd64.zip');
    });
    test('linux arm64 → linux_arm64 zip', () => {
        set('linux', 'arm64');
        expect(warp.assetName()).toBe('usque_4.2.1_linux_arm64.zip');
    });
    test('win32 amd64 → windows_amd64 zip', () => {
        set('win32', 'x64');
        expect(warp.assetName()).toBe('usque_4.2.1_windows_amd64.zip');
    });
    test('unknown arch → no build', () => {
        set('linux', 'mips');
        expect(warp.assetName()).toBeNull();
    });
});

describe('warpProxy.proxyUrl', () => {
    test('default port 1080', () => {
        expect(warp.proxyUrl()).toBe('socks5://127.0.0.1:1080');
        expect(warp.PORT).toBe(1080);
    });
    test('format is a loopback-only socks5 url', () => {
        expect(warp.proxyUrl()).toMatch(/^socks5:\/\/127\.0\.0\.1:\d+$/);
    });
});

describe('warpProxy.isTransientRegisterError', () => {
    test('flags the sandbox/proxy EOF we actually hit', () => {
        expect(
            warp.isTransientRegisterError(
                'Failed to register: failed to send request: Post "https://api.cloudflareclient.com/v0a4471/reg": unexpected EOF'
            )
        ).toBe(true);
    });
    test('flags other network failures worth a retry', () => {
        expect(warp.isTransientRegisterError('dial tcp: i/o timeout')).toBe(true);
        expect(warp.isTransientRegisterError('connection reset by peer')).toBe(true);
    });
    test('does NOT flag a hard config error as transient', () => {
        expect(warp.isTransientRegisterError('config file already exists')).toBe(false);
        expect(warp.isTransientRegisterError('invalid private key')).toBe(false);
    });
});

describe('warpProxy.extractZipEntry', () => {
    test('extracts a stored (method 0) entry by suffix', () => {
        const zip = makeZip([{ name: 'usque', data: Buffer.from('hello-stored'), method: 0 }]);
        expect(warp.extractZipEntry(zip, 'usque').toString()).toBe('hello-stored');
    });
    test('extracts a deflated (method 8) entry by suffix', () => {
        const payload = Buffer.from('x'.repeat(5000));
        const zip = makeZip([{ name: 'usque.exe', data: payload, method: 8 }]);
        expect(warp.extractZipEntry(zip, '.exe').toString()).toBe(payload.toString());
    });
    test('throws when no entry matches the suffix', () => {
        const zip = makeZip([{ name: 'readme.txt', data: Buffer.from('nope'), method: 0 }]);
        expect(() => warp.extractZipEntry(zip, 'usque')).toThrow(/no entry ending in/);
    });
    test('throws on non-zip input', () => {
        expect(() => warp.extractZipEntry(Buffer.from('not a zip'), 'x')).toThrow(/not a zip/);
    });
});

describe('warpProxy.waitForPort', () => {
    test('resolves once a server is listening', async () => {
        const server = net.createServer();
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        const port = server.address().port;
        await expect(warp.waitForPort(port, 3000)).resolves.toBeUndefined();
        server.close();
    });

    test('rejects (with a clear message) when nothing is listening', async () => {
        // Port 1 is privileged and never open; use a tight timeout.
        await expect(warp.waitForPort(1, 1500)).rejects.toThrow(/did not open port 1/);
    });
});
