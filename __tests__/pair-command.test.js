/**
 * Tests for the .pair command's pure helpers.
 *
 * The command used to call an external pairing service (settings.pairCodeService,
 * modelled on Knightbot-MD). That is gone: the code is now minted locally on a
 * separate unregistered socket. These tests cover the parts that need no network
 * and no WhatsApp — the number parsing, the status text and the cancel guard.
 */
const { _test } = require('../commands/owner/pair');

describe('pair.digitsOnly', () => {
    test('strips +, spaces and dashes', () => {
        expect(_test.digitsOnly('+92 370 160-9799')).toBe('923701609799');
    });

    test('returns empty for non-numeric input', () => {
        expect(_test.digitsOnly('abc')).toBe('');
        expect(_test.digitsOnly(null)).toBe('');
        expect(_test.digitsOnly(undefined)).toBe('');
    });
});

describe('pair.statusText', () => {
    test('reports nothing in progress when idle', () => {
        // No pairing has been started in this process.
        expect(_test.statusText()).toBe('No pairing in progress.');
    });
});

describe('pair.cancelPairing', () => {
    test('is a no-op returning false when nothing is active', () => {
        expect(_test.cancelPairing()).toBe(false);
    });
});

describe('pair configuration', () => {
    test('writes to its own directory, never ./session', () => {
        // A pairing produces a session for a DIFFERENT account, so it must never
        // be allowed to land on top of the live one.
        expect(_test.PAIR_DIR.endsWith('session-pair')).toBe(true);
        expect(_test.PAIR_DIR.includes('session-pair')).toBe(true);
    });

    test('codes are treated as short-lived', () => {
        expect(_test.CODE_TTL_MS).toBe(5 * 60 * 1000);
    });
});
