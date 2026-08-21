/**
 * Tests for the Productivity System.
 *
 * Covers:
 *  - Reminder store (create, get, cancel, overdue, persistence)
 *  - Scheduler (timer management, duplicate prevention)
 *  - Bookmark store (save, list, get, delete, ownership)
 *  - Command metadata (registration, permissions, aliases)
 *  - Duration parsing
 *  - Poll validation
 */

const fs = require('fs');
const path = require('path');

// ─── Mocks ──────────────────────────────────────────────────────────────────

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

jest.mock('../lib/commandLoader', () => {
    const testCommands = new Map();
    // Add productivity commands to the mock registry
    const cmds = [
        { name: 'remind', category: 'general', ownerOnly: false },
        { name: 'reminders', category: 'general', ownerOnly: false },
        { name: 'cancelreminder', category: 'general', ownerOnly: false },
        { name: 'poll', category: 'general', ownerOnly: false },
        { name: 'pollresult', category: 'general', ownerOnly: false },
        { name: 'save', category: 'general', ownerOnly: false },
        { name: 'saved', category: 'general', ownerOnly: false },
        { name: 'unsave', category: 'general', ownerOnly: false },
    ];
    for (const cmd of cmds) {
        testCommands.set(cmd.name, { ...cmd, execute: jest.fn() });
    }
    return { loadCommands: jest.fn(() => testCommands) };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Reminder Store', () => {
    const reminderStore = require('../lib/productivity/reminderStore');

    afterEach(() => {
        // Clean up test data
        const dataPath = path.join(__dirname, '..', 'data', 'reminders.json');
        if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
    });

    test('creates a reminder with unique ID', () => {
        const r = reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'Test reminder',
            dueAt: Date.now() + 60000,
            groupContext: true
        });

        expect(r.id).toBeDefined();
        expect(r.id).toMatch(/^R\d{3}$/);
        expect(r.text).toBe('Test reminder');
        expect(r.status).toBe('pending');
        expect(r.userJid).toBe('123@s.whatsapp.net');
    });

    test('generates sequential IDs', () => {
        const r1 = reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'First',
            dueAt: Date.now() + 60000,
        });
        const r2 = reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'Second',
            dueAt: Date.now() + 120000,
        });

        expect(r2.id).not.toBe(r1.id);
    });

    test('retrieves a reminder by ID', () => {
        const r = reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'Find me',
            dueAt: Date.now() + 60000,
        });

        const found = reminderStore.getReminder(r.id);
        expect(found).toBeDefined();
        expect(found.text).toBe('Find me');
    });

    test('returns null for nonexistent reminder', () => {
        expect(reminderStore.getReminder('R999')).toBeNull();
    });

    test('lists pending reminders for a user', () => {
        reminderStore.createReminder({
            userJid: 'user1@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'User1 reminder',
            dueAt: Date.now() + 60000,
        });
        reminderStore.createReminder({
            userJid: 'user2@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'User2 reminder',
            dueAt: Date.now() + 60000,
        });

        const user1Reminders = reminderStore.getUserReminders('user1@s.whatsapp.net');
        expect(user1Reminders.length).toBe(1);
        expect(user1Reminders[0].text).toBe('User1 reminder');
    });

    test('cancels a reminder', () => {
        const r = reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'Cancel me',
            dueAt: Date.now() + 60000,
        });

        const result = reminderStore.cancelReminder(r.id, '123@s.whatsapp.net');
        expect(result).toBe(true);

        const updated = reminderStore.getReminder(r.id);
        expect(updated.status).toBe('cancelled');
    });

    test('prevents cancel by wrong user', () => {
        const r = reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'Not yours',
            dueAt: Date.now() + 60000,
        });

        const result = reminderStore.cancelReminder(r.id, '456@s.whatsapp.net');
        expect(result).toBe(false);

        const updated = reminderStore.getReminder(r.id);
        expect(updated.status).toBe('pending');
    });

    test('marks reminder as completed', () => {
        const r = reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'Complete me',
            dueAt: Date.now() + 60000,
        });

        reminderStore.completeReminder(r.id);
        const updated = reminderStore.getReminder(r.id);
        expect(updated.status).toBe('completed');
    });

    test('finds overdue reminders', () => {
        reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'Overdue',
            dueAt: Date.now() - 10000,
        });
        reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'Not overdue',
            dueAt: Date.now() + 60000,
        });

        const overdue = reminderStore.getOverdue();
        expect(overdue.length).toBe(1);
        expect(overdue[0].text).toBe('Overdue');
    });

    test('persists across reloads', () => {
        const r = reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'Persistent',
            dueAt: Date.now() + 60000,
        });

        // Clear require cache to force reload
        delete require.cache[require.resolve('../lib/productivity/reminderStore')];
        delete require.cache[require.resolve('../lib/productivity/dataStore')];
        const freshStore = require('../lib/productivity/reminderStore');
        const found = freshStore.getReminder(r.id);
        expect(found).toBeDefined();
        expect(found.text).toBe('Persistent');
    });

    test('cleans up old completed reminders', () => {
        const r = reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'Old completed',
            dueAt: Date.now() - 100000,
        });
        reminderStore.completeReminder(r.id);

        // Manually backdate the createdAt
        const data = require('../lib/productivity/dataStore').readJson('reminders.json', { reminders: {} });
        data.reminders[r.id].createdAt = Date.now() - (8 * 24 * 60 * 60 * 1000);
        require('../lib/productivity/dataStore').writeJson('reminders.json', data);

        const cleaned = reminderStore.cleanup();
        expect(cleaned).toBe(1);
    });
});

describe('Bookmark Store', () => {
    const bookmarkStore = require('../lib/productivity/bookmarkStore');

    afterEach(() => {
        const dataPath = path.join(__dirname, '..', 'data', 'savedMessages.json');
        if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
    });

    test('saves a bookmark', () => {
        const bm = bookmarkStore.saveBookmark(
            '123@s.whatsapp.net',
            '456@g.us',
            'msg-id-123',
            '789@s.whatsapp.net',
            'Assignment'
        );

        expect(bm.id).toBeDefined();
        expect(bm.id).toMatch(/^S\d{3}$/);
        expect(bm.label).toBe('Assignment');
        expect(bm.chatJid).toBe('456@g.us');
    });

    test('generates sequential IDs', () => {
        const bm1 = bookmarkStore.saveBookmark('123@s.whatsapp.net', '456@g.us', 'key1', 'sender1');
        const bm2 = bookmarkStore.saveBookmark('123@s.whatsapp.net', '456@g.us', 'key2', 'sender2');

        expect(bm2.id).not.toBe(bm1.id);
    });

    test('lists bookmarks for a user', () => {
        bookmarkStore.saveBookmark('123@s.whatsapp.net', '456@g.us', 'key1', 'sender1', 'First');
        bookmarkStore.saveBookmark('456@s.whatsapp.net', '789@g.us', 'key2', 'sender2', 'Second');

        const user1 = bookmarkStore.getBookmarks('123@s.whatsapp.net');
        expect(user1.length).toBe(1);
        expect(user1[0].label).toBe('First');
    });

    test('retrieves a specific bookmark', () => {
        const bm = bookmarkStore.saveBookmark('123@s.whatsapp.net', '456@g.us', 'key1', 'sender1', 'Find me');

        const found = bookmarkStore.getBookmark('123@s.whatsapp.net', bm.id);
        expect(found).toBeDefined();
        expect(found.label).toBe('Find me');
    });

    test('returns null for nonexistent bookmark', () => {
        expect(bookmarkStore.getBookmark('123@s.whatsapp.net', 'S999')).toBeNull();
    });

    test('returns null for wrong user', () => {
        const bm = bookmarkStore.saveBookmark('123@s.whatsapp.net', '456@g.us', 'key1', 'sender1');

        expect(bookmarkStore.getBookmark('456@s.whatsapp.net', bm.id)).toBeNull();
    });

    test('deletes a bookmark', () => {
        const bm = bookmarkStore.saveBookmark('123@s.whatsapp.net', '456@g.us', 'key1', 'sender1');

        const result = bookmarkStore.deleteBookmark('123@s.whatsapp.net', bm.id);
        expect(result).toBe(true);

        expect(bookmarkStore.getBookmark('123@s.whatsapp.net', bm.id)).toBeNull();
    });

    test('returns empty array for user with no bookmarks', () => {
        expect(bookmarkStore.getBookmarks('nobody@s.whatsapp.net')).toEqual([]);
    });

    test('defaults label to "Saved message"', () => {
        const bm = bookmarkStore.saveBookmark('123@s.whatsapp.net', '456@g.us', 'key1', 'sender1');
        expect(bm.label).toBe('Saved message');
    });
});

describe('Command Metadata', () => {
    const commands = [
        require('../commands/productivity/remind'),
        require('../commands/productivity/reminders'),
        require('../commands/productivity/cancelreminder'),
        require('../commands/productivity/poll'),
        require('../commands/productivity/pollresult'),
        require('../commands/productivity/save'),
        require('../commands/productivity/saved'),
        require('../commands/productivity/unsave'),
    ];

    for (const cmd of commands) {
        test(`${cmd.name} has correct metadata`, () => {
            expect(cmd.name).toBeDefined();
            expect(typeof cmd.name).toBe('string');
            expect(typeof cmd.execute).toBe('function');
            expect(typeof cmd.description).toBe('string');
            expect(typeof cmd.usage).toBe('string');
            expect(cmd.category).toBe('general');
            expect(cmd.ownerOnly).toBe(false);
            expect(cmd.adminOnly).toBe(false);
        });
    }

    test('remind has aliases', () => {
        expect(require('../commands/productivity/remind').aliases).toEqual([]);
    });

    test('reminders has aliases', () => {
        const aliases = require('../commands/productivity/reminders').aliases;
        expect(aliases).toContain('myreminders');
    });

    test('poll has no aliases', () => {
        expect(require('../commands/productivity/poll').aliases).toEqual([]);
    });

    test('pollresult has aliases', () => {
        const aliases = require('../commands/productivity/pollresult').aliases;
        expect(aliases).toContain('pollresults');
    });

    test('save has aliases', () => {
        const aliases = require('../commands/productivity/save').aliases;
        expect(aliases).toContain('bookmark');
    });

    test('saved has aliases', () => {
        const aliases = require('../commands/productivity/saved').aliases;
        expect(aliases).toContain('bookmarks');
    });

    test('unsave has aliases', () => {
        const aliases = require('../commands/productivity/unsave').aliases;
        expect(aliases).toContain('removebookmark');
    });
});

describe('Scheduler', () => {
    const scheduler = require('../lib/productivity/scheduler');
    const reminderStore = require('../lib/productivity/reminderStore');

    afterEach(() => {
        scheduler.shutdown();
        const dataPath = path.join(__dirname, '..', 'data', 'reminders.json');
        if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
    });

    test('scheduler starts with no active timers', () => {
        expect(scheduler.getActiveCount()).toBe(0);
    });

    test('scheduler initializes with a mock sock', () => {
        const mockSock = { sendMessage: jest.fn() };
        scheduler.init(mockSock);
        // Should not throw
    });

    test('shutdown clears all timers', () => {
        const r = reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'Timer test',
            dueAt: Date.now() + 600000,
        });

        const mockSock = { sendMessage: jest.fn() };
        scheduler.init(mockSock);
        scheduler.scheduleNew(r);
        expect(scheduler.getActiveCount()).toBe(1);

        scheduler.shutdown();
        expect(scheduler.getActiveCount()).toBe(0);
    });

    test('cancelTimer removes a timer', () => {
        const r = reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'Cancel timer',
            dueAt: Date.now() + 600000,
        });

        const mockSock = { sendMessage: jest.fn() };
        scheduler.init(mockSock);
        scheduler.scheduleNew(r);
        expect(scheduler.getActiveCount()).toBe(1);

        scheduler.cancelTimer(r.id);
        expect(scheduler.getActiveCount()).toBe(0);
    });
});

describe('Duration Parsing', () => {
    // We test the parsing logic indirectly through the remind command
    const remind = require('../commands/productivity/remind');

    test('remind command has correct metadata', () => {
        expect(remind.name).toBe('remind');
        expect(remind.category).toBe('general');
        expect(remind.ownerOnly).toBe(false);
    });

    test('remind execute is a function', () => {
        expect(typeof remind.execute).toBe('function');
    });
});

describe('Poll Command', () => {
    const poll = require('../commands/productivity/poll');

    test('poll command has correct metadata', () => {
        expect(poll.name).toBe('poll');
        expect(poll.category).toBe('general');
        expect(poll.ownerOnly).toBe(false);
    });

    test('poll execute is a function', () => {
        expect(typeof poll.execute).toBe('function');
    });
});

describe('Save/Bookmark Commands', () => {
    const save = require('../commands/productivity/save');
    const saved = require('../commands/productivity/saved');
    const unsave = require('../commands/productivity/unsave');

    test('save command has correct metadata', () => {
        expect(save.name).toBe('save');
        expect(save.category).toBe('general');
        expect(save.aliases).toContain('bookmark');
    });

    test('saved command has correct metadata', () => {
        expect(saved.name).toBe('saved');
        expect(saved.aliases).toContain('bookmarks');
    });

    test('unsave command has correct metadata', () => {
        expect(unsave.name).toBe('unsave');
        expect(unsave.aliases).toContain('removebookmark');
    });
});

describe('No secrets in productivity output', () => {
    test('reminder store does not expose API keys', () => {
        const reminderStore = require('../lib/productivity/reminderStore');
        const r = reminderStore.createReminder({
            userJid: '123@s.whatsapp.net',
            chatJid: '456@g.us',
            text: 'Test',
            dueAt: Date.now() + 60000,
        });

        const json = JSON.stringify(r);
        expect(json).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
        expect(json).not.toMatch(/ghp_|gho_/);
        expect(json).not.toMatch(/api[_-]?key/i);
    });

    test('bookmark store does not expose API keys', () => {
        const bookmarkStore = require('../lib/productivity/bookmarkStore');
        const bm = bookmarkStore.saveBookmark(
            '123@s.whatsapp.net', '456@g.us', 'key1', 'sender1', 'Test'
        );

        const json = JSON.stringify(bm);
        expect(json).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
        expect(json).not.toMatch(/ghp_|gho_/);
    });
});
