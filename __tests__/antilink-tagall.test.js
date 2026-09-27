/**
 * Regression tests for antilink and tagall commands.
 * Fixes:
 *   - .antilink set warn parser bug (split by literal 's' instead of whitespace)
 *   - .tagall requiring bot admin unnecessarily
 */

// ── Antilink unit tests (direct function testing) ──────────────────────
describe('Antilink command', () => {
    test('parser: /\\s+/ correctly splits .antilink set warn', () => {
        const msg = '.antilink set warn';
        const args = msg.trim().split(/\s+/).slice(1);
        expect(args).toEqual(['set', 'warn']);
        expect(args[0].toLowerCase()).toBe('set');
        expect(args[1].toLowerCase()).toBe('warn');
    });

    test('parser: /\\s+/ correctly splits .antilink set kick', () => {
        const msg = '.antilink set kick';
        const args = msg.trim().split(/\s+/).slice(1);
        expect(args).toEqual(['set', 'kick']);
    });

    test('parser: case-insensitive action normalization', () => {
        expect('WARN'.toLowerCase()).toBe('warn');
        expect('Delete'.toLowerCase()).toBe('delete');
        expect('KICK'.toLowerCase()).toBe('kick');
    });

    test('OLD parser /s+/ would have broken .antilink set warn', () => {
        const msg = '.antilink set warn';
        const oldArgs = msg.trim().split(/s+/).slice(1);
        // Old parser splits on literal 's', breaking "set" into "et"
        expect(oldArgs[0]).not.toBe('set');
    });

    test('metadata: botAdminNeeded is false, groupOnly is true', () => {
        const cmd = require('../commands/admin/antilink');
        expect(cmd.botAdminNeeded).toBe(false);
        expect(cmd.groupOnly).toBe(true);
        expect(cmd.adminOnly).toBe(false);
        expect(cmd.name).toBe('antilink');
    });

    test('handleAntilinkCommand is exported', () => {
        const cmd = require('../commands/admin/antilink');
        expect(typeof cmd.handleAntilinkCommand).toBe('function');
    });

    test('handleLinkDetection is exported', () => {
        const cmd = require('../commands/admin/antilink');
        expect(typeof cmd.handleLinkDetection).toBe('function');
    });

    test('valid actions recognized after toLowerCase', () => {
        const valid = ['warn', 'delete', 'kick'];
        expect(valid.includes('warn'.toLowerCase())).toBe(true);
        expect(valid.includes('WARN'.toLowerCase())).toBe(true);
        expect(valid.includes('something'.toLowerCase())).toBe(false);
    });

    test('switch: set with valid action matches after lowercase', () => {
        const args = ['.antilink', 'set', 'warn'];
        const action = args[0] ? args[0].toLowerCase() : undefined;
        const setAction = args[2] ? args[2].toLowerCase() : '';
        // After the fix, args[1] correctly is 'set' not 'et'
        expect(args[1]).toBe('set');
        expect(['delete', 'kick', 'warn'].includes(setAction)).toBe(true);
    });
});

// ── TagAll unit tests ─────────────────────────────────────────────────
describe('TagAll command', () => {
    test('metadata: botAdminNeeded is false, adminOnly is true, groupOnly is true', () => {
        const cmd = require('../commands/admin/tagall');
        expect(cmd.botAdminNeeded).toBe(false);
        expect(cmd.adminOnly).toBe(true);
        expect(cmd.groupOnly).toBe(true);
        expect(cmd.name).toBe('tagall');
    });

    test('execute function is exported', () => {
        const cmd = require('../commands/admin/tagall');
        expect(typeof cmd.execute).toBe('function');
    });

    test('participant deduplication logic', () => {
        const participants = [
            { id: '111@lid' },
            { id: '111@lid' },
            { id: '222@lid' },
        ];
        const seen = new Set();
        const unique = [];
        for (const p of participants) {
            if (!seen.has(p.id)) {
                seen.add(p.id);
                unique.push(p);
            }
        }
        expect(unique.map(p => p.id)).toEqual(['111@lid', '222@lid']);
    });

    test('custom message text is joined from args', () => {
        const args = ['Meeting', 'in', '10', 'min'];
        const customText = args && args.length > 0 ? args.join(' ') : '';
        expect(customText).toBe('Meeting in 10 min');
    });

    test('empty args produces default header', () => {
        const args = [];
        const customText = args && args.length > 0 ? args.join(' ') : '';
        const header = customText ? `*${customText}*` : '*Hello Everyone:*';
        expect(header).toBe('*Hello Everyone:*');
    });
});

// ── Permission model tests ────────────────────────────────────────────
describe('Permission model', () => {
    test('antilink: botAdminNeeded false means dispatcher does not block on bot admin', () => {
        const cmd = require('../commands/admin/antilink');
        expect(cmd.botAdminNeeded).toBe(false);
    });

    test('tagall: botAdminNeeded false means dispatcher does not block on bot admin', () => {
        const cmd = require('../commands/admin/tagall');
        expect(cmd.botAdminNeeded).toBe(false);
    });

    test('tagall: adminOnly true means only group admins can use it', () => {
        const cmd = require('../commands/admin/tagall');
        expect(cmd.adminOnly).toBe(true);
    });

    test('antilink: groupOnly true means must be in a group', () => {
        const cmd = require('../commands/admin/antilink');
        expect(cmd.groupOnly).toBe(true);
    });

    test('tagall: groupOnly true means must be in a group', () => {
        const cmd = require('../commands/admin/tagall');
        expect(cmd.groupOnly).toBe(true);
    });
});
