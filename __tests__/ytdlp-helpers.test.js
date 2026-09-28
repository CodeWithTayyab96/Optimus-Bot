/**
 * Unit tests for the pure/deterministic helpers in lib/ytdlp.
 *
 * Deliberately avoid spawning yt-dlp and avoid the network: these must pass on
 * any machine, including CI with no binaries installed.
 *
 * IMPORTANT: resolveBin()/potPluginPossible() read process.env at CALL time, so
 * the assertion has to run while the test env is still in place — restoring it
 * inside the loader silently makes these pass/fail for the wrong reason.
 */
const path = require('path');

const ENV_KEYS = [
    'YTDLP_BIN',
    'YTDLP_FORCE_MWEB',
    'YTDLP_NO_POT_PLUGIN',
    'OPTIMUS_TMP_DIR',
    'YTDLP_COOKIES',
];

/**
 * Set the given env, re-require lib/ytdlp with a clean registry, run `fn`, then
 * restore the environment. `fn` receives the freshly loaded module.
 */
function withEnv(env, fn) {
    const saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];

    for (const k of ENV_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(env)) process.env[k] = v;

    jest.resetModules();
    try {
        return fn(require('../lib/ytdlp'));
    } finally {
        for (const k of ENV_KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
        jest.resetModules();
    }
}

/** A path that looks like bootstrap.js's standalone download location. */
function standalonePath() {
    return ['', 'home', 'container', '.tools', 'yt-dlp'].join(path.sep);
}

/** A path that looks like a pip --user install (plugin possible). */
function localBinPath() {
    return ['', 'home', 'container', '.local', 'bin', 'yt-dlp'].join(path.sep);
}

describe('ytdlp.resolveBin', () => {
    test('an explicit YTDLP_BIN wins', () => {
        const bin = path.join(path.sep, 'opt', 'custom', 'yt-dlp');
        withEnv({ YTDLP_BIN: bin }, (ytdlp) => expect(ytdlp.resolveBin()).toBe(bin));
    });
});

describe('ytdlp.potPluginPossible', () => {
    test('a standalone build under .tools/ is plugin-less', () => {
        // The standalone binary ships no python, so it cannot load the bgutil
        // PO-token plugin — pinning player_client=mweb there breaks YouTube
        // entirely (measured: mweb fails, yt-dlp defaults succeed).
        withEnv({ YTDLP_BIN: standalonePath() }, (ytdlp) =>
            expect(ytdlp.potPluginPossible()).toBe(false)
        );
    });

    test('a Windows-style .tools path is detected too', () => {
        // Separators must be normalised, or the marker silently misses.
        withEnv({ YTDLP_BIN: 'D:\\bot\\.tools\\yt-dlp.exe' }, (ytdlp) =>
            expect(ytdlp.potPluginPossible()).toBe(false)
        );
    });

    test('a non-.tools binary may have the plugin', () => {
        withEnv({ YTDLP_BIN: localBinPath() }, (ytdlp) => expect(ytdlp.potPluginPossible()).toBe(true));
    });

    test('YTDLP_FORCE_MWEB overrides the standalone detection', () => {
        withEnv({ YTDLP_BIN: standalonePath(), YTDLP_FORCE_MWEB: '1' }, (ytdlp) =>
            expect(ytdlp.potPluginPossible()).toBe(true)
        );
    });

    test('YTDLP_NO_POT_PLUGIN overrides everything', () => {
        withEnv({ YTDLP_BIN: localBinPath(), YTDLP_NO_POT_PLUGIN: '1' }, (ytdlp) =>
            expect(ytdlp.potPluginPossible()).toBe(false)
        );
    });
});

describe('ytdlp.libcName', () => {
    test('reports a known value for this platform', () => {
        withEnv({}, (ytdlp) =>
            expect(['musl', 'glibc', 'unknown', 'n/a']).toContain(ytdlp.libcName())
        );
    });
});

describe('ytdlp.tempDirOverride', () => {
    test('prefers a writable project-local dir so PyInstaller can unpack', () => {
        withEnv({}, (ytdlp) => {
            const dir = ytdlp.tempDirOverride();
            // Either a real project-local dir, or null when it cannot be created.
            if (dir !== null) {
                expect(typeof dir).toBe('string');
                expect(dir).toContain('.tools');
            }
        });
    });

    test('honours OPTIMUS_TMP_DIR', () => {
        const custom = path.join(path.sep, 'tmp', 'optimus-test-tmp');
        withEnv({ OPTIMUS_TMP_DIR: custom }, (ytdlp) => {
            const dir = ytdlp.tempDirOverride();
            if (dir !== null) expect(dir).toBe(custom);
        });
    });
});

describe('ytdlp.cookieArgs', () => {
    const fs = require('fs');
    const os = require('os');

    test('is empty when no cookie file is configured', () => {
        // A single cookie VALUE is not enough — yt-dlp needs a whole jar, so
        // nothing is passed unless a real file exists.
        withEnv({ YTDLP_COOKIES: path.join(os.tmpdir(), 'optimus-no-such-cookies.txt') }, (ytdlp) =>
            expect(ytdlp.cookieArgs()).toEqual([])
        );
    });

    test('passes --cookies when the file exists', () => {
        const file = path.join(os.tmpdir(), `optimus-cookies-${process.pid}.txt`);
        fs.writeFileSync(file, '# Netscape HTTP Cookie File\n');
        try {
            withEnv({ YTDLP_COOKIES: file }, (ytdlp) =>
                expect(ytdlp.cookieArgs()).toEqual(['--cookies', file])
            );
        } finally {
            fs.rmSync(file, { force: true });
        }
    });
});

describe('ytdlp.diagnose', () => {
    test('reports a missing binary without spawning anything', async () => {
        const bin = path.join(path.sep, 'nonexistent', 'definitely-not-here', 'yt-dlp');
        const report = await withEnv({ YTDLP_BIN: bin }, (ytdlp) => ytdlp.diagnose());

        expect(report.exists).toBe(false);
        expect(report.ok).toBe(false);
        expect(report.bin).toBe(bin);
        expect(typeof report.error).toBe('string');
        expect(report.error.length).toBeGreaterThan(0);
        // These fields are what make a failure explainable rather than
        // a bare "yt-dlp is not installed".
        expect(report).toHaveProperty('platform');
        expect(report).toHaveProperty('libc');
        expect(report).toHaveProperty('tmpdir');
        expect(report).toHaveProperty('executable');
    });
});
