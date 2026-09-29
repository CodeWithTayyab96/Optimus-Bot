/**
 * Tests for the .update URL derivation.
 *
 * ZIP mode used to require settings.updateZipUrl / UPDATE_ZIP_URL to be set by
 * hand, so a panel that is not a git checkout could fail with "No ZIP URL
 * configured" even though the repo URL was already known. defaultZipUrl()
 * derives it from the same config git mode uses.
 *
 * Every test sets UPDATE_REPO_URL explicitly: env beats settings, so this stays
 * deterministic regardless of what settings.js contains.
 */
const update = require('../commands/owner/update');

describe('update.defaultZipUrl', () => {
    const KEYS = ['UPDATE_REPO_URL', 'UPDATE_BRANCH'];
    const saved = {};

    beforeAll(() => {
        for (const k of KEYS) saved[k] = process.env[k];
    });

    afterEach(() => {
        for (const k of KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    });

    test('strips a trailing .git', () => {
        process.env.UPDATE_REPO_URL = 'https://github.com/owner/repo.git';
        delete process.env.UPDATE_BRANCH;
        expect(update.defaultZipUrl()).toBe('https://github.com/owner/repo/archive/refs/heads/main.zip');
    });

    test('works without the .git suffix', () => {
        process.env.UPDATE_REPO_URL = 'https://github.com/owner/repo';
        delete process.env.UPDATE_BRANCH;
        expect(update.defaultZipUrl()).toBe('https://github.com/owner/repo/archive/refs/heads/main.zip');
    });

    test('tolerates a trailing slash', () => {
        process.env.UPDATE_REPO_URL = 'https://github.com/owner/repo/';
        delete process.env.UPDATE_BRANCH;
        expect(update.defaultZipUrl()).toBe('https://github.com/owner/repo/archive/refs/heads/main.zip');
    });

    test('honours a branch override', () => {
        process.env.UPDATE_REPO_URL = 'https://github.com/owner/repo.git';
        process.env.UPDATE_BRANCH = 'dev';
        expect(update.defaultZipUrl()).toBe('https://github.com/owner/repo/archive/refs/heads/dev.zip');
    });

    test('produces the expected URL for this project default', () => {
        process.env.UPDATE_REPO_URL = 'https://github.com/CodeWithTayyab96/Optimus-Bot.git';
        delete process.env.UPDATE_BRANCH;
        expect(update.defaultZipUrl()).toBe(
            'https://github.com/CodeWithTayyab96/Optimus-Bot/archive/refs/heads/main.zip'
        );
    });
});

describe('update.repoConfig', () => {
    test('env overrides the built-in default', () => {
        const savedUrl = process.env.UPDATE_REPO_URL;
        const savedBranch = process.env.UPDATE_BRANCH;
        try {
            process.env.UPDATE_REPO_URL = 'https://github.com/owner/other.git';
            process.env.UPDATE_BRANCH = 'release';
            expect(update.repoConfig()).toEqual({
                url: 'https://github.com/owner/other.git',
                branch: 'release',
            });
        } finally {
            if (savedUrl === undefined) delete process.env.UPDATE_REPO_URL;
            else process.env.UPDATE_REPO_URL = savedUrl;
            if (savedBranch === undefined) delete process.env.UPDATE_BRANCH;
            else process.env.UPDATE_BRANCH = savedBranch;
        }
    });
});

describe('update.RUNTIME_BACKUP_PATHS', () => {
    test('covers the runtime state an update must not clobber', () => {
        // git reset --hard + git clean -fd would otherwise revert or delete these.
        expect(update.RUNTIME_BACKUP_PATHS).toEqual(
            expect.arrayContaining(['data', 'baileys_store.json', 'settings.js'])
        );
    });
});
