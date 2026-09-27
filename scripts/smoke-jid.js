// Smoke test for the owner-only .jid identifier resolver.
// Uses a fake socket so no live WhatsApp connection is needed — verifies
// classification, URL code extraction, quoted/mention collection, resolution
// of numbers / JIDs / group links / channel links through the Baileys v7
// methods (onWhatsApp, groupGetInviteInfo, newsletterMetadata, groupMetadata,
// fetchStatus), rendering, and the owner gate.
// Usage: node scripts/smoke-jid.js
const settings = require('../settings');
const cmd = require('../commands/owner/jid');

let failures = 0;
function check(label, ok, extra = '') {
    console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : extra}`);
    if (!ok) failures++;
}

const ownerNumberClean = settings.ownerNumber.split(':')[0].split('@')[0];
const OWNER = `${ownerNumberClean}@s.whatsapp.net`;

// --- Fake socket recording which Baileys methods were called ---
function makeFakeSock(overrides = {}) {
    const calls = { onWhatsApp: [], groupGetInviteInfo: [], newsletterMetadata: [], groupMetadata: [], fetchStatus: [] };
    const sock = {
        user: { id: `${ownerNumberClean}:0@s.whatsapp.net` },
        calls,
        onWhatsApp: async (...nums) => {
            calls.onWhatsApp.push(nums);
            return nums.map(n => ({ jid: n + '@s.whatsapp.net', exists: { notify: 'Alice', name: 'Alice' } }));
        },
        fetchStatus: async (jid) => { calls.fetchStatus.push(jid); return { status: 'Busy' }; },
        groupGetInviteInfo: async (code) => {
            calls.groupGetInviteInfo.push(code);
            return { id: '120363000000000000@g.us', subject: 'Test Group', desc: 'Group desc', owner: OWNER };
        },
        groupMetadata: async (jid) => {
            calls.groupMetadata.push(jid);
            return { id: jid, subject: 'Test Group', desc: 'Group desc' };
        },
        newsletterMetadata: async (type, key) => {
            calls.newsletterMetadata.push([type, key]);
            return { id: '120363000000000001@newsletter', name: 'Test Channel', description: 'Channel desc', subscribers: 42 };
        },
        sendMessage: async () => {},
        ...overrides
    };
    return sock;
}

const sent = [];
function captureSock(overrides = {}) {
    return makeFakeSock({ sendMessage: async (chatId, content) => sent.push(content), ...overrides });
}

function baseMessage(chatId, senderJid) {
    return {
        key: { remoteJid: chatId, participant: senderJid, fromMe: false, id: 'test-id' },
        message: { extendedTextMessage: { text: '.jid', contextInfo: {} } }
    };
}

(async () => {
    // ---------------- Pure classification ----------------
    check('classify phone number', cmd.classify('923701609799').type === 'number');
    check('classify formatted number', cmd.classify('+92 370-1609799').type === 'number'
        && cmd.classify('+92 370-1609799').value === '923701609799');
    check('classify short number is unknown', cmd.classify('123456').type === 'unknown');
    check('classify group link', cmd.classify('https://chat.whatsapp.com/AbCdEf123').type === 'groupLink');
    check('classify channel link', cmd.classify('https://whatsapp.com/channel/0029VaAbCd').type === 'channelLink');
    check('classify jid', cmd.classify('120363000000000000@g.us').type === 'jid');
    check('classify empty', cmd.classify('').type === 'empty');
    check('classify garbage is unknown', cmd.classify('hello world').type === 'unknown');

    // ---------------- URL code extraction ----------------
    check('group link code extraction', cmd.extractCodeFromUrl('https://chat.whatsapp.com/AbCdEf123?app_absent=0') === 'AbCdEf123');
    check('channel link code extraction', cmd.extractCodeFromUrl('https://www.whatsapp.com/channel/0029VaAbCd/') === '0029VaAbCd');

    // ---------------- Quoted / mention collection ----------------
    const quotedMsg = {
        key: { remoteJid: '120363000000000000@g.us', participant: OWNER, fromMe: false, id: 'q1' },
        message: {
            extendedTextMessage: {
                text: '.jid',
                contextInfo: {
                    participant: '100000000002@s.whatsapp.net',
                    mentionedJid: ['100000000003@s.whatsapp.net'],
                    quotedMessage: {
                        extendedTextMessage: {
                            text: 'see https://chat.whatsapp.com/CodeXYZ'
                        }
                    }
                }
            }
        }
    };
    const q = cmd.extractQuoted(quotedMsg);
    check('quoted sender extracted', q && q.senderJid === '100000000002@s.whatsapp.net' && q.text.includes('CodeXYZ'));
    const mentions = cmd.extractMentions(quotedMsg);
    check('mention extracted', mentions.length === 1 && mentions[0] === '100000000003@s.whatsapp.net');
    const collected = cmd.collectIdentifiers(quotedMsg, ['923701609799']);
    check('collectIdentifiers merges args + quoted link', collected.tokens.includes('923701609799')
        && collected.tokens.some(t => t.includes('CodeXYZ'))
        && collected.quotedJid === '100000000002@s.whatsapp.net');

    // ---------------- Resolution via fake Baileys APIs ----------------
    const sock = makeFakeSock();

    const reg = await cmd.resolveOne(sock, '923701609799');
    check('registered number resolves', reg.length === 1 && reg[0].kind === 'user' && reg[0].name === 'Alice'
        && reg[0].jid === '923701609799@s.whatsapp.net');
    check('onWhatsApp called with normalized digits', sock.calls.onWhatsApp[0][0] === '923701609799');

    const unregSock = makeFakeSock({ onWhatsApp: async () => [] });
    const unreg = await cmd.resolveOne(unregSock, '100000000099');
    check('unregistered number reported', unreg.length === 1 && /Not registered/i.test(unreg[0].note));

    const dev = await cmd.resolveOne(sock, '923701609799:5@s.whatsapp.net');
    check('device-suffixed user JID normalized', dev.length === 1 && dev[0].jid === '923701609799@s.whatsapp.net');

    const grp = await cmd.resolveOne(sock, '120363000000000000@g.us');
    check('group JID resolves via groupMetadata', grp.length === 1 && grp[0].kind === 'group'
        && grp[0].name === 'Test Group' && grp[0].jid === '120363000000000000@g.us');

    const chan = await cmd.resolveOne(sock, '120363000000000001@newsletter');
    check('newsletter JID resolves via newsletterMetadata(jid)', chan.length === 1 && chan[0].kind === 'channel'
        && chan[0].name === 'Test Channel' && chan[0].jid === '120363000000000001@newsletter');
    check('newsletterMetadata called with jid type', sock.calls.newsletterMetadata.some(([t]) => t === 'jid'));

    const lid = await cmd.resolveOne(sock, '1400000000000000@lid');
    check('LID jid recognized', lid.length === 1 && lid[0].kind === 'user' && /LID/i.test(lid[0].note));

    const grpLink = await cmd.resolveOne(sock, 'https://chat.whatsapp.com/GroupInvite1');
    check('group link resolves via groupGetInviteInfo', grpLink.length === 1 && grpLink[0].kind === 'group'
        && grpLink[0].jid === '120363000000000000@g.us'
        && sock.calls.groupGetInviteInfo[0] === 'GroupInvite1');

    const chanLink = await cmd.resolveOne(sock, 'https://whatsapp.com/channel/0029VaChannel');
    check('channel link resolves via newsletterMetadata(invite)', chanLink.length === 1 && chanLink[0].kind === 'channel'
        && chanLink[0].jid === '120363000000000001@newsletter'
        && sock.calls.newsletterMetadata.some(([t, k]) => t === 'invite' && k === '0029VaChannel'));

    const bad = await cmd.resolveOne(sock, 'not an identifier');
    check('invalid input gives error', bad.length === 1 && bad[0].kind === 'error');

    const expiredSock = makeFakeSock({ groupGetInviteInfo: async () => ({}) });
    const expired = await cmd.resolveOne(expiredSock, 'https://chat.whatsapp.com/DeadCode');
    check('expired invite code handled', expired.length === 1 && expired[0].kind === 'error');

    // ---------------- Rendering ----------------
    const rendered = cmd.buildResponse([{ kind: 'user', name: 'Alice', jid: '923701609799@s.whatsapp.net', note: 'About: Busy' }]);
    check('rendered output contains name and JID', rendered.includes('Alice') && rendered.includes('923701609799@s.whatsapp.net'));

    // ---------------- Owner gate + end-to-end execute ----------------
    const normalUser = '100000000098@s.whatsapp.net';
    const chatId = '120363000000000000@g.us';

    sent.length = 0;
    let sock2 = captureSock();
    await cmd.execute(sock2, baseMessage(chatId, normalUser), ['923701609799'], { chatId });
    check('non-owner is rejected', sent.length === 1 && /Only the bot owner/.test(sent[0].text));

    sent.length = 0;
    sock2 = captureSock();
    await cmd.execute(sock2, baseMessage(chatId, OWNER), ['923701609799'], { chatId });
    check('owner resolves a number end-to-end', sent.length === 1
        && sent[0].text.includes('Alice') && sent[0].text.includes('923701609799@s.whatsapp.net'));

    sent.length = 0;
    sock2 = captureSock();
    await cmd.execute(sock2, baseMessage(chatId, OWNER), [], { chatId });
    check('no-args in group shows group JID', sent.length === 1
        && sent[0].text.includes('120363000000000000@g.us') && sent[0].text.includes('Test Group'));

    sent.length = 0;
    sock2 = captureSock();
    await cmd.execute(sock2, quotedMsg, [], { chatId });
    const quotedSent = sent[0]?.text || '';
    check('quoted + mentioned users resolved', quotedSent.includes('100000000002@s.whatsapp.net')
        && quotedSent.includes('100000000003@s.whatsapp.net')
        && quotedSent.includes('120363000000000000@g.us'));

    console.log(failures === 0 ? '\n✅ All .jid smoke checks passed' : `\n❌ ${failures} .jid check(s) failed`);
    process.exit(failures === 0 ? 0 : 1);
})();
