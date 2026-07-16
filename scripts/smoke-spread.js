// Final sanity spread: dispatches a set of old + newly-ported commands
// through the real handleMessages with a mock socket and checks each replies sanely.
// Usage: node scripts/smoke-spread.js
const settings = require('../settings');
settings.prefix = '.';

const { handleMessages } = require('../main.js');

const BOT_JID = '1234567890@s.whatsapp.net';
const DM = '999888777@s.whatsapp.net';
const GROUP = '121212121212@g.us';
const OTHER = '555444333@s.whatsapp.net';

const sent = [];
const mockSock = {
    user: { id: '1234567890:1@s.whatsapp.net' },
    sendMessage: async (jid, content) => {
        sent.push({ jid, content });
        return { key: { id: `m${sent.length}`, remoteJid: jid } };
    },
    sendPresenceUpdate: async () => {},
    groupMetadata: async () => ({ subject: 'Test Group', participants: [
        { id: BOT_JID, admin: 'admin' },
        { id: OTHER, admin: null },
    ] }),
    groupFetchAllParticipating: async () => ({
        [GROUP]: { id: GROUP, subject: 'Test Group' },
    }),
    readMessages: async () => {},
    profilePictureUrl: async () => { throw new Error('none'); },
};

let n = 0;
async function dispatch(text, { chat = DM, fromMe = true, sender } = {}) {
    const before = sent.length;
    const msg = {
        key: {
            remoteJid: chat,
            fromMe,
            participant: chat.endsWith('@g.us') ? (sender || BOT_JID) : undefined,
            id: `S${++n}`,
        },
        message: { conversation: text },
        pushName: 'tester',
    };
    await handleMessages(mockSock, { messages: [msg], type: 'notify' }, false);
    await new Promise(r => setTimeout(r, 300));
    return sent.slice(before);
}

function summarize(out) {
    if (!out.length) return '(no reply)';
    return out.map(o => {
        const c = o.content;
        if (c.text) return `text:"${c.text.replace(/\n/g, ' ').slice(0, 60)}"`;
        if (c.image) return 'image';
        if (c.video) return 'video';
        if (c.react) return 'react';
        return Object.keys(c).join(',');
    }).join(' | ');
}

const results = [];
function record(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(`${ok ? '✅' : '❌'} ${name}: ${detail}`);
}

(async () => {
    let out;

    out = await dispatch('.ping');
    record('.ping', out.some(o => (o.content.text || '').includes('Pong')), summarize(out));

    out = await dispatch('.help');
    record('.help', out.some(o => o.content.image || (o.content.text || '').includes('GENERAL')), summarize(out).slice(0, 90));

    // admin command in a group, sender is bot owner (fromMe), bot is admin
    out = await dispatch('.tagall', { chat: GROUP });
    record('.tagall (admin, group)', out.length > 0, summarize(out).slice(0, 90));

    out = await dispatch('.afk on brb testing');
    record('.afk on', out.some(o => /afk/i.test(o.content.text || '')), summarize(out));
    out = await dispatch('.afk off');
    record('.afk off', out.some(o => /afk/i.test(o.content.text || '')), summarize(out));

    out = await dispatch('.broadcast smoke-test hello');
    const bcast = out.filter(o => (o.content.text || '').includes('smoke-test hello'));
    record('.broadcast', bcast.length >= 1, `delivered to ${bcast.length} chat(s); ${summarize(out).slice(0, 70)}`);

    out = await dispatch('.bomb');
    record('.bomb', out.some(o => (o.content.text || '').includes('B O M B')), summarize(out).slice(0, 70));
    out = await dispatch('suren');
    record('bomb suren', out.some(o => /surrender/i.test(o.content.text || '')), summarize(out).slice(0, 70));

    // Newly ported network commands: verify wiring via their no-args usage path
    out = await dispatch('.twitter');
    record('.twitter (usage path)', out.some(o => /twitter/i.test(o.content.text || '')), summarize(out).slice(0, 80));

    out = await dispatch('.pinterest');
    record('.pinterest (usage path)', out.some(o => /pinterest/i.test(o.content.text || '')), summarize(out).slice(0, 80));

    out = await dispatch('.gptimage');
    record('.gptimage (usage path)', out.some(o => /reply to an/i.test(o.content.text || '')), summarize(out).slice(0, 80));

    out = await dispatch('.magicstudio');
    record('.magicstudio (usage path)', out.some(o => /magicstudio/i.test(o.content.text || '')), summarize(out).slice(0, 80));

    out = await dispatch('.sticker2');
    record('.sticker2 (no media path)', out.some(o => /reply to an image/i.test(o.content.text || '')), summarize(out).slice(0, 80));

    const fails = results.filter(r => !r.ok);
    console.log(fails.length ? `\n❌ ${fails.length} FAILURES: ${fails.map(f => f.name).join(', ')}` : '\n✅ All spread checks passed');
    process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('❌ smoke-spread crashed:', e); process.exit(1); });
