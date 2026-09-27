// Simulated dispatch test: drives handleMessages with a mock socket.
// Usage: node scripts/smoke-dispatch.js [prefix]
// Verifies the ping command responds via the new dispatcher using the given prefix.
const path = require('path');

const prefixArg = process.argv[2] || '.';

// Override the prefix in the loaded settings BEFORE main.js reads it
const settings = require('../settings');
settings.prefix = prefixArg;

const { handleMessages } = require('../main.js');

const sent = [];
const mockSock = {
    user: { id: '1234567890:1@s.whatsapp.net' },
    sendMessage: async (jid, content, opts) => {
        sent.push({ jid, content });
        return { key: { id: 'mock' } };
    },
    sendPresenceUpdate: async () => {},
    groupMetadata: async () => ({ participants: [] }),
    readMessages: async () => {},
};

const fakeMessage = {
    key: {
        remoteJid: '9999999999@s.whatsapp.net', // private chat → skips group moderation
        fromMe: true,                            // owner → passes any mode/permission gate
        participant: undefined,
        id: 'TEST1'
    },
    message: { conversation: `${prefixArg}ping` }
};

(async () => {
    await handleMessages(mockSock, { messages: [fakeMessage], type: 'notify' }, false);
    // Give fire-and-forget promises a beat
    await new Promise(r => setTimeout(r, 500));

    const texts = sent.map(s => s.content?.text || '').join(' | ');
    if (texts.includes('Pong!')) {
        console.log(`✅ '${prefixArg}ping' dispatched and replied (${sent.length} messages sent)`);
        process.exit(0);
    } else {
        console.log(`❌ '${prefixArg}ping' did NOT produce a Pong reply. Sent: ${texts || '(nothing)'}`);
        process.exit(1);
    }
})().catch(e => { console.error('❌ smoke test crashed:', e); process.exit(1); });
