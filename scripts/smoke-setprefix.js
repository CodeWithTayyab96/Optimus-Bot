// End-to-end setprefix test through the real dispatcher:
// 1. '.setprefix #' → settings.js updated, in-memory prefix live
// 2. '#ping' works, '.ping' no longer dispatches
// 3. '#setprefix .' restores the original prefix
const fs = require('fs');
const settings = require('../settings');
const { handleMessages } = require('../main.js');

const sent = [];
const mockSock = {
    user: { id: '1234567890:1@s.whatsapp.net' },
    sendMessage: async (jid, content) => { sent.push(content?.text || ''); return { key: { id: 'mock' } }; },
    sendPresenceUpdate: async () => {},
    groupMetadata: async () => ({ participants: [] }),
    readMessages: async () => {},
};

function fakeMsg(text) {
    return {
        key: { remoteJid: '9999999999@s.whatsapp.net', fromMe: true, id: 'T' + Math.random() },
        message: { conversation: text }
    };
}

async function send(text) {
    sent.length = 0;
    await handleMessages(mockSock, { messages: [fakeMsg(text)], type: 'notify' }, false);
    await new Promise(r => setTimeout(r, 300));
    return sent.join(' | ');
}

(async () => {
    let pass = true;
    const check = (label, cond) => { console.log(`${cond ? '✅' : '❌'} ${label}`); if (!cond) pass = false; };

    check('starting prefix is "."', settings.prefix === '.');

    const r1 = await send('.setprefix #');
    check('.setprefix # replied success', r1.includes('Prefix changed'));
    check('in-memory prefix updated to #', settings.prefix === '#');
    check('settings.js persisted new prefix', fs.readFileSync('./settings.js', 'utf8').includes("prefix: '#'"));

    const r2 = await send('#ping');
    check('#ping responds with new prefix', r2.includes('Pong!'));

    const r3 = await send('.ping');
    check('.ping is ignored under new prefix', !r3.includes('Pong!'));

    const r4 = await send('#setprefix .');
    check('#setprefix . restored prefix', r4.includes('Prefix changed') && settings.prefix === '.');
    check('settings.js restored', fs.readFileSync('./settings.js', 'utf8').includes("prefix: '.'"));

    const r5 = await send('.ping');
    check('.ping works again', r5.includes('Pong!'));

    process.exit(pass ? 0 : 1);
})().catch(e => { console.error('❌ crashed:', e); process.exit(1); });
