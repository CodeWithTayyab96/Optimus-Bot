/**
 * Jest tests for group management commands:
 *   .approveall — approve all pending join requests
 *   .rejectall  — reject all pending join requests
 *   .savecontact / .vcf — export group contacts as VCF
 */

/* ─── Mock messageStyle ────────────────────────────────────────── */
jest.mock('../lib/messageStyle', () => ({
    success: (msg) => '✅ ' + msg,
    error: (msg) => '❌ ' + msg,
    warning: (msg) => '⚠️ ' + msg,
    info: (msg) => 'ℹ️ ' + msg,
    processing: (msg) => '⏳ ' + msg + '...',
    invalidInput: (what, usage) => '❌ ' + what + '\nUsage: ' + usage,
    permissionDenied: () => '🔒 Access denied',
    box: (label, lines) => lines.join('\n'),
    ICONS: { success: '✅', error: '❌' },
}));

/* ─── Load commands after mocks ────────────────────────────────── */
const approveall = require('../commands/admin/approveall');
const rejectall = require('../commands/admin/rejectall');
const savecontact = require('../commands/group/savecontact');

/* ─── Shared helpers ───────────────────────────────────────────── */
function mockSock(overrides = {}) {
    const calls = [];
    return {
        _calls: calls,
        sendMessage: jest.fn(async (jid, content, opts) => { calls.push({ jid, content, opts }); }),
        groupRequestParticipantsList: overrides.groupRequestParticipantsList || jest.fn(),
        groupRequestParticipantsUpdate: overrides.groupRequestParticipantsUpdate || jest.fn(),
        groupMetadata: overrides.groupMetadata || jest.fn(),
    };
}

function mockMessage() {
    return {
        key: { id: 'test123', remoteJid: '1234@g.us' },
        message: { conversation: 'test' }
    };
}

/* ═══════════════════════════════════════════════════════════════════
   .approveall
   ═══════════════════════════════════════════════════════════════════ */
describe('.approveall', () => {
    beforeEach(() => jest.clearAllMocks());

    test('command loads with correct metadata', () => {
        expect(approveall.name).toBe('approveall');
        expect(approveall.category).toBe('admin');
        expect(approveall.groupOnly).toBe(true);
        expect(approveall.adminOnly).toBe(true);
        expect(approveall.botAdminNeeded).toBe(true);
        expect(typeof approveall.execute).toBe('function');
    });

    test('no pending requests returns success message', async () => {
        const sock = mockSock({ groupRequestParticipantsList: jest.fn(async () => []) });
        await approveall.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock.sendMessage).toHaveBeenCalledTimes(1);
        expect(sock._calls[0].content.text).toMatch(/No pending|No.*requests/i);
    });

    test('approves multiple pending requests', async () => {
        const list = [
            { jid: '1111111111@s.whatsapp.net', pn: '1111111111' },
            { jid: '2222222222@s.whatsapp.net', pn: '2222222222' },
        ];
        const sock = mockSock({
            groupRequestParticipantsList: jest.fn(async () => list),
            groupRequestParticipantsUpdate: jest.fn(async () => list),
        });
        await approveall.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock.groupRequestParticipantsUpdate).toHaveBeenCalledWith(
            '1234@g.us',
            expect.arrayContaining([
                '1111111111@s.whatsapp.net',
                '2222222222@s.whatsapp.net',
            ]),
            'approve'
        );
        expect(sock._calls[0].content.text).toMatch(/Approved 2/);
    });

    test('handles single pending request', async () => {
        const list = [{ jid: '1111111111@s.whatsapp.net' }];
        const sock = mockSock({
            groupRequestParticipantsList: jest.fn(async () => list),
            groupRequestParticipantsUpdate: jest.fn(async () => list),
        });
        await approveall.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock.groupRequestParticipantsUpdate).toHaveBeenCalledWith(
            '1234@g.us',
            ['1111111111@s.whatsapp.net'],
            'approve'
        );
    });

    test('handles list fetch failure', async () => {
        const sock = mockSock({
            groupRequestParticipantsList: jest.fn(async () => { throw new Error('network'); }),
        });
        await approveall.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/Failed|error/i);
    });

    test('handles 403 forbidden', async () => {
        const sock = mockSock({
            groupRequestParticipantsList: jest.fn(async () => { throw new Error('403 forbidden'); }),
        });
        await approveall.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/permission|forbidden/i);
    });

    test('handles update API failure', async () => {
        const sock = mockSock({
            groupRequestParticipantsList: jest.fn(async () => [
                { jid: '1111111111@s.whatsapp.net' }
            ]),
            groupRequestParticipantsUpdate: jest.fn(async () => { throw new Error('fail'); }),
        });
        await approveall.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/Failed|error/i);
    });

    test('handles malformed list (null entries)', async () => {
        const list = [{ jid: null }, { pn: null }];
        const sock = mockSock({
            groupRequestParticipantsList: jest.fn(async () => list),
            groupRequestParticipantsUpdate: jest.fn(async () => []),
        });
        await approveall.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        // Should not crash; may warn about no valid IDs
        expect(sock.sendMessage).toHaveBeenCalled();
    });

    test('uses pn when jid is not available', async () => {
        const list = [{ pn: '5555555555' }];
        const sock = mockSock({
            groupRequestParticipantsList: jest.fn(async () => list),
            groupRequestParticipantsUpdate: jest.fn(async () => list),
        });
        await approveall.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock.groupRequestParticipantsUpdate).toHaveBeenCalledWith(
            '1234@g.us',
            ['5555555555@s.whatsapp.net'],
            'approve'
        );
    });
});

/* ═══════════════════════════════════════════════════════════════════
   .rejectall
   ═══════════════════════════════════════════════════════════════════ */
describe('.rejectall', () => {
    beforeEach(() => jest.clearAllMocks());

    test('command loads with correct metadata', () => {
        expect(rejectall.name).toBe('rejectall');
        expect(rejectall.category).toBe('admin');
        expect(rejectall.groupOnly).toBe(true);
        expect(rejectall.adminOnly).toBe(true);
        expect(rejectall.botAdminNeeded).toBe(true);
        expect(typeof rejectall.execute).toBe('function');
    });

    test('no pending requests returns success message', async () => {
        const sock = mockSock({ groupRequestParticipantsList: jest.fn(async () => []) });
        await rejectall.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/No pending|No.*requests/i);
    });

    test('rejects multiple pending requests', async () => {
        const list = [
            { jid: '1111111111@s.whatsapp.net' },
            { jid: '2222222222@s.whatsapp.net' },
            { jid: '3333333333@s.whatsapp.net' },
        ];
        const sock = mockSock({
            groupRequestParticipantsList: jest.fn(async () => list),
            groupRequestParticipantsUpdate: jest.fn(async () => list),
        });
        await rejectall.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock.groupRequestParticipantsUpdate).toHaveBeenCalledWith(
            '1234@g.us',
            expect.arrayContaining([
                '1111111111@s.whatsapp.net',
                '2222222222@s.whatsapp.net',
                '3333333333@s.whatsapp.net',
            ]),
            'reject'
        );
        expect(sock._calls[0].content.text).toMatch(/Rejected 3/);
    });

    test('handles list fetch failure', async () => {
        const sock = mockSock({
            groupRequestParticipantsList: jest.fn(async () => { throw new Error('network'); }),
        });
        await rejectall.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/Failed|error/i);
    });

    test('handles 403 forbidden', async () => {
        const sock = mockSock({
            groupRequestParticipantsList: jest.fn(async () => { throw new Error('403 forbidden'); }),
        });
        await rejectall.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/permission|forbidden/i);
    });

    test('handles update API failure', async () => {
        const sock = mockSock({
            groupRequestParticipantsList: jest.fn(async () => [
                { jid: '1111111111@s.whatsapp.net' }
            ]),
            groupRequestParticipantsUpdate: jest.fn(async () => { throw new Error('fail'); }),
        });
        await rejectall.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        const texts = sock._calls.map(c => c.content.text).join(' ');
        expect(texts).toMatch(/Failed|error/i);
    });
});

/* ═══════════════════════════════════════════════════════════════════
   .savecontact / .vcf
   ═══════════════════════════════════════════════════════════════════ */
describe('.savecontact', () => {
    beforeEach(() => jest.clearAllMocks());

    test('command loads with correct metadata', () => {
        expect(savecontact.name).toBe('savecontact');
        expect(savecontact.aliases).toContain('vcf');
        expect(savecontact.category).toBe('group');
        expect(savecontact.groupOnly).toBe(true);
        expect(savecontact.adminOnly).toBe(false);
        expect(typeof savecontact.execute).toBe('function');
    });

    test('generates valid VCF for multiple participants', async () => {
        const sock = mockSock({
            groupMetadata: jest.fn(async () => ({
                subject: 'Test Group',
                participants: [
                    { id: '1111111111@s.whatsapp.net', notify: 'Alice' },
                    { id: '2222222222@s.whatsapp.net', notify: 'Bob' },
                ]
            })),
        });
        await savecontact.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });

        // First message should be the VCF document
        const docMsg = sock._calls[0].content;
        expect(docMsg.document).toBeDefined();
        expect(docMsg.mimetype).toBe('text/vcard');
        expect(docMsg.fileName).toMatch(/\.vcf$/);

        // Verify VCF content
        const vcf = docMsg.document.toString('utf-8');
        expect(vcf).toContain('BEGIN:VCARD');
        expect(vcf).toContain('END:VCARD');
        expect(vcf).toContain('VERSION:3.0');
        expect(vcf).toContain('Alice');
        expect(vcf).toContain('Bob');
        expect(vcf).toContain('1111111111');
        expect(vcf).toContain('2222222222');

        // Verify count message
        expect(sock._calls[1].content.text).toMatch(/2 contact/);
    });

    test('handles empty participant list', async () => {
        const sock = mockSock({
            groupMetadata: jest.fn(async () => ({
                subject: 'Empty Group',
                participants: []
            })),
        });
        await savecontact.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/No participants/i);
    });

    test('handles metadata fetch failure', async () => {
        const sock = mockSock({
            groupMetadata: jest.fn(async () => { throw new Error('network'); }),
        });
        await savecontact.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.text).toMatch(/Failed|error/i);
    });

    test('JID is not exposed as visible contact name', async () => {
        const sock = mockSock({
            groupMetadata: jest.fn(async () => ({
                subject: 'Test Group',
                participants: [
                    { id: '1111111111@s.whatsapp.net' },
                ]
            })),
        });
        await savecontact.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        const vcf = sock._calls[0].content.document.toString('utf-8');
        // Should not contain the raw JID as a display name
        expect(vcf).not.toContain('1111111111@s.whatsapp.net');
        // Should use generated name instead
        expect(vcf).toContain('Test Group Member');
    });

    test('group name is used in filename', async () => {
        const sock = mockSock({
            groupMetadata: jest.fn(async () => ({
                subject: 'My Cool Group',
                participants: [
                    { id: '1111111111@s.whatsapp.net', notify: 'User1' },
                ]
            })),
        });
        await savecontact.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        expect(sock._calls[0].content.fileName).toMatch(/My_Cool_Group_contacts\.vcf/);
    });

    test('all participants included in single VCF', async () => {
        const participants = [];
        for (let i = 0; i < 20; i++) {
            participants.push({
                id: `${1000000000 + i}@s.whatsapp.net`,
                notify: `User${i}`
            });
        }
        const sock = mockSock({
            groupMetadata: jest.fn(async () => ({
                subject: 'Big Group',
                participants
            })),
        });
        await savecontact.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        // Only one document message (single VCF)
        const docCalls = sock._calls.filter(c => c.content.document);
        expect(docCalls).toHaveLength(1);
        const vcf = docCalls[0].content.document.toString('utf-8');
        // Count BEGIN:VCARD occurrences
        const count = (vcf.match(/BEGIN:VCARD/g) || []).length;
        expect(count).toBe(20);
    });

    test('handles participants without notify/name', async () => {
        const sock = mockSock({
            groupMetadata: jest.fn(async () => ({
                subject: 'Test Group',
                participants: [
                    { id: '1111111111@s.whatsapp.net' },
                ]
            })),
        });
        await savecontact.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        const vcf = sock._calls[0].content.document.toString('utf-8');
        expect(vcf).toContain('Test Group Member 1');
    });

    test('handles participants with :session suffix', async () => {
        const sock = mockSock({
            groupMetadata: jest.fn(async () => ({
                subject: 'Test Group',
                participants: [
                    { id: '1111111111:4@s.whatsapp.net', notify: 'Alice' },
                ]
            })),
        });
        await savecontact.execute(sock, mockMessage(), [], { chatId: '1234@g.us' });
        const vcf = sock._calls[0].content.document.toString('utf-8');
        // Phone should be just the number, no :4 suffix
        expect(vcf).toContain('TEL;TYPE=CELL:1111111111');
        expect(vcf).not.toContain('1111111111:4');
    });
});
