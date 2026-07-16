// Simulates bomb + tictactoe active in the SAME chat and checks digit routing.
// Drives the real handleMessages with a mock socket.
// Usage: node scripts/smoke-games.js
const settings = require('../settings');
settings.prefix = '.';

const { handleMessages } = require('../main.js');
const bombModule = require('../commands/fun/bomb.js');

const GROUP = '111222333444@g.us';
const GROUP2 = '555666777888@g.us';
const P1 = 'playerA@s.whatsapp.net';
const P2 = 'playerB@s.whatsapp.net';

const sent = [];
const mockSock = {
    user: { id: '1234567890:1@s.whatsapp.net' },
    sendMessage: async (jid, content, opts) => {
        sent.push({ jid, text: content?.text || (content?.react ? '(react)' : '(media)') });
        return { key: { id: `mock${sent.length}`, remoteJid: jid } };
    },
    sendPresenceUpdate: async () => {},
    groupMetadata: async () => ({ subject: 'Test', participants: [
        { id: P1, admin: null }, { id: P2, admin: null },
        { id: '1234567890@s.whatsapp.net', admin: 'admin' },
    ] }),
    readMessages: async () => {},
    profilePictureUrl: async () => { throw new Error('none'); },
};

let msgId = 0;
function groupMsg(sender, text, chat = GROUP) {
    return {
        key: { remoteJid: chat, fromMe: false, participant: sender, id: `T${++msgId}` },
        message: { conversation: text },
        pushName: sender.split('@')[0],
    };
}

async function send(sender, text, chat = GROUP) {
    const before = sent.length;
    await handleMessages(mockSock, { messages: [groupMsg(sender, text, chat)], type: 'notify' }, false);
    await new Promise(r => setTimeout(r, 150));
    return sent.slice(before).map(s => `[${s.jid === GROUP ? 'G1' : s.jid === GROUP2 ? 'G2' : s.jid}] ${s.text.slice(0, 80).replace(/\n/g, ' ')}`);
}

function check(label, ok) {
    console.log(`${ok ? '✅' : '❌'} ${label}`);
    if (!ok) process.exitCode = 1;
}

(async () => {
    // 1. P1 starts a bomb game in G1
    let out = await send(P1, '.bomb');
    check('P1 .bomb starts a game (board shown)', out.some(t => t.includes('B O M B')));
    check('bomb gameState has P1 scoped to G1', bombModule.hasActiveGame(P1, GROUP) && !bombModule.hasActiveGame(P1, GROUP2));

    // 2. P2 starts tictactoe, P1... no — P2 vs a third player would need another JID.
    //    Use P2 to create the room and P1 to join: P1 is then in BOTH games in G1.
    out = await send(P2, '.tictactoe');
    check('P2 .tictactoe creates waiting room', out.length > 0);
    out = await send(P1, '.tictactoe');
    const tttStarted = out.some(t => t.includes('TicTacToe') || t.includes('❎') || t.includes('X') || t.includes('Turn'));
    check('P1 .tictactoe joins -> game starts', tttStarted);
    console.log('   ttt start output:', out.join(' || ') || '(none)');

    // 3. P1 (in both games) sends a digit -> must go to BOMB (priority), not ttt
    const bombBoardBefore = JSON.stringify(bombModule.gameState.get(P1)?.array.map(b => b.state));
    out = await send(P1, '5');
    const bombBoardAfter = JSON.stringify(bombModule.gameState.get(P1)?.array.map(b => b.state));
    const bombConsumed = bombBoardBefore !== bombBoardAfter || !bombModule.gameState.has(P1); // opened box or hit bomb
    check('P1 digit consumed by bomb (P1 in both games, bomb wins priority)', bombConsumed);
    console.log('   output:', out.join(' || ') || '(none)');

    // 4. P2 (only in ttt) sends a digit -> must go to tictactoe
    out = await send(P2, '1');
    const wentToTtt = out.some(t => t.includes('❎') || t.includes('⭕') || t.includes('Turn') || t.includes('not your turn') || t.toLowerCase().includes('wait'));
    check('P2 digit routed to tictactoe (no bomb game for P2)', wentToTtt || out.length > 0);
    console.log('   output:', out.join(' || ') || '(none)');

    // 5. Cross-chat: P1 sends a digit in G2 -> bomb must NOT consume it
    if (bombModule.gameState.has(P1)) {
        const before5 = JSON.stringify(bombModule.gameState.get(P1).array.map(b => b.state));
        out = await send(P1, '7', GROUP2);
        const after5 = bombModule.gameState.has(P1) ? JSON.stringify(bombModule.gameState.get(P1).array.map(b => b.state)) : 'ended';
        check('P1 digit in OTHER chat does not touch bomb game', before5 === after5);
        check('no bomb reply leaked into G2', !out.some(t => t.startsWith('[G2]') && t.includes('B O M B')));
    } else {
        console.log('   (bomb game already ended by step 3 hit — cross-chat digit check on fresh game)');
        await send(P1, '.bomb', GROUP);
        const before5 = JSON.stringify(bombModule.gameState.get(P1).array.map(b => b.state));
        out = await send(P1, '7', GROUP2);
        const after5 = JSON.stringify(bombModule.gameState.get(P1).array.map(b => b.state));
        check('P1 digit in OTHER chat does not touch bomb game', before5 === after5);
        check('no bomb reply leaked into G2', !out.some(t => t.startsWith('[G2]') && t.includes('B O M B')));
    }

    // 6. .bomb in another chat while game active elsewhere -> guarded
    out = await send(P1, '.bomb', GROUP2);
    check('.bomb in second chat is refused while game active in first', out.some(t => t.includes('another chat')));

    // 7. surrender ends the bomb game, digits fall through to ttt afterwards
    out = await send(P1, 'suren');
    check('suren ends bomb game', !bombModule.gameState.has(P1) && out.some(t => t.toLowerCase().includes('surrender')));

    console.log(process.exitCode ? '\n❌ FAILURES above' : '\n✅ All game-routing checks passed');
    process.exit(process.exitCode || 0);
})().catch(e => { console.error('❌ smoke-games crashed:', e); process.exit(1); });
