/**
 * Tests for lib/sessionInfo.
 *
 * The module exists because "it HAS creds.json but still asks for a phone
 * number" is the most confusing thing about linking: a creds.json FILE is not a
 * LINKED session. Baileys writes one with fresh keys as soon as the socket
 * connects, so the file can exist while `registered` is false.
 *
 * Uses synthetic fixtures only — never the real session.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describeSession, sessionSummary, needsPairing } = require('../lib/sessionInfo');

function writeTmp(name, obj) {
    const p = path.join(os.tmpdir(), name);
    fs.writeFileSync(p, JSON.stringify(obj));
    return p;
}

function readBack(p) {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

describe('sessionInfo.describeSession', () => {
    test('reports a missing creds.json', () => {
        const info = describeSession(null, path.join(os.tmpdir(), 'optimus-no-such-creds.json'));
        expect(info.exists).toBe(false);
        expect(info.sizeBytes).toBeNull();
        expect(info.registered).toBe(false);
        expect(needsPairing(info)).toBe(true);
    });

    test('an existing but UNREGISTERED creds still needs pairing', () => {
        const p = writeTmp(`optimus-unreg-${process.pid}.json`, { registered: false, noiseKey: {} });
        try {
            const info = describeSession(readBack(p), p);
            // Present on disk…
            expect(info.exists).toBe(true);
            expect(info.sizeBytes).toBeGreaterThan(0);
            // …but not linked, so the bot will still ask for a number.
            expect(info.registered).toBe(false);
            expect(needsPairing(info)).toBe(true);
            expect(info.linkedJid).toBe('');
        } finally {
            fs.rmSync(p, { force: true });
        }
    });

    test('a registered creds reports the linked account', () => {
        const p = writeTmp(`optimus-reg-${process.pid}.json`, {
            registered: true,
            me: { id: '15551234567:9@s.whatsapp.net' },
        });
        try {
            const info = describeSession(readBack(p), p);
            expect(info.registered).toBe(true);
            expect(info.linkedJid).toBe('15551234567');
            expect(needsPairing(info)).toBe(false);
        } finally {
            fs.rmSync(p, { force: true });
        }
    });
});

describe('sessionInfo.sessionSummary', () => {
    test('never leaks key material — only size, state and number', () => {
        const p = writeTmp(`optimus-sum-${process.pid}.json`, {
            registered: true,
            me: { id: '15551234567:9@s.whatsapp.net' },
            advSecretKey: 'SUPER-SECRET-VALUE',
            noiseKey: { private: 'PRIVATE-KEY-MATERIAL' },
        });
        try {
            const line = sessionSummary(describeSession(readBack(p), p));
            expect(line).toContain('registered: true');
            expect(line).toContain('15551234567');
            expect(line).not.toContain('SUPER-SECRET-VALUE');
            expect(line).not.toContain('PRIVATE-KEY-MATERIAL');
        } finally {
            fs.rmSync(p, { force: true });
        }
    });

    test('says MISSING when there is no file', () => {
        const info = describeSession(null, path.join(os.tmpdir(), 'optimus-no-such-creds.json'));
        expect(sessionSummary(info)).toContain('MISSING');
    });
});
