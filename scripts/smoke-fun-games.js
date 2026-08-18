// Fun + Games UI migration smoke test.
// Verifies, without any network access or live users:
//   1. All 33 fun/games command files load with intact metadata
//      (names/aliases/category/permission flags).
//   2. Missing-input paths use the shared styled system
//      (boxed INVALID INPUT with usage, or compact warnings for simple cases).
//   3. No raw error.message / provider errors leak into user-visible text.
//   4. AI-backed fun commands still call lib/ai (provider behavior preserved)
//      and use lightweight playful headers, not AI-style boxes.
//   5. Games: start/challenge/board/win/draw/surrender presentation updated,
//      mentions preserved, game state/timers/cleanup untouched.
// Usage: node scripts/smoke-fun-games.js

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('✅ ' + name); }
    else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const ROOT = path.join(__dirname, '..');
const FUN_DIR = path.join(ROOT, 'commands', 'fun');
const funFiles = [
    'advice', 'bomb', 'character', 'compliment', 'dare', 'eightball', 'fact', 'flirt',
    'gayrate', 'gif', 'goodnight', 'hangman', 'insult', 'joke', 'meme', 'memesearch',
    'misc', 'motivate', 'pies', 'quote', 'riddle', 'roast', 'roseday', 'shayari',
    'ship', 'simp', 'stupid', 'tictactoe', 'topmembers', 'trivia', 'truth', 'wasted'
];

const cmds = {};
const src = {};
for (const f of funFiles) {
    cmds[f] = require(path.join(FUN_DIR, f + '.js'));
    src[f] = fs.readFileSync(path.join(FUN_DIR, f + '.js'), 'utf8');
    check(`${f}.js loads with execute()`, !!cmds[f] && typeof cmds[f].execute === 'function');
    check(`${f}.js category=fun`, cmds[f].category === 'fun', cmds[f].category);
    check(`${f}.js permission flags intact`,
        typeof cmds[f].ownerOnly === 'boolean' && typeof cmds[f].modOnly === 'boolean' &&
        typeof cmds[f].groupOnly === 'boolean' && typeof cmds[f].adminOnly === 'boolean');
}

// --- Mocked socket runner (pre-network paths only) ---
function makeSock() {
    const sent = [];
    const sock = {
        sendMessage: async (chatId, content, opts) => { sent.push({ chatId, content, opts }); return { key: { id: 'm' + sent.length, remoteJid: chatId } }; },
        react: async () => {},
        groupMetadata: async () => ({ participants: [] }),
        profilePictureUrl: async () => { throw new Error('no pic'); }
    };
    return { sock, sent };
}

function hasText(sent, substr) {
    return sent.some(s => typeof s.content?.text === 'string' && s.content.text.includes(substr));
}

async function runWith(cmdName, msg, args, extra) {
    const { sock, sent } = makeSock();
    const fullExtra = { chatId: '123@g.us', prefix: '.', commandName: cmdName, senderId: '111@s.whatsapp.net', channelInfo: {}, reply: async (t) => { sent.push({ chatId: '123@g.us', content: { text: t }, opts: undefined }); }, ...(extra || {}) };
    const msgWithId = { key: { id: cmdName + '_' + Date.now() + '_' + Math.random(), remoteJid: '123@g.us' }, ...(msg || {}) };
    await cmds[cmdName].execute(sock, msgWithId, args || [], fullExtra);
    return sent;
}

(async () => {
    // --- 1) Metadata: names & aliases unchanged ---
    const expected = {
        advice: ['advice', []], bomb: ['bomb', ['bom']], character: ['character', []],
        compliment: ['compliment', []], dare: ['dare', []], eightball: ['8ball', []],
        fact: ['fact', []], flirt: ['flirt', []], gayrate: ['gayrate', []], gif: ['gif', []],
        goodnight: ['goodnight', ['lovenight', 'gn']], hangman: ['hangman', ['guess']],
        insult: ['insult', []], joke: ['joke', []], meme: ['meme', []],
        memesearch: ['memesearch', ['memes', 'sm', 'smeme', 'gifsearch']],
        misc: ['heart', ['horny', 'circle', 'lgbt', 'lolice', 'simpcard', 'tonikawa', 'its-so-stupid', 'namecard', 'oogway', 'oogway2', 'tweet', 'ytcomment', 'comrade', 'gay', 'glass', 'jail', 'passed', 'triggered']],
        motivate: ['motivate', ['motivation']],
        pies: ['pies', ['china', 'indonesia', 'japan', 'korea', 'india', 'malaysia', 'thailand']],
        quote: ['quote', []], riddle: ['riddle', []], roast: ['roast', []], roseday: ['roseday', []],
        shayari: ['shayari', ['shayri']], ship: ['ship', []], simp: ['simp', []],
        stupid: ['stupid', ['itssostupid', 'iss']], tictactoe: ['ttt', ['tictactoe', 'move', 'surrender']],
        topmembers: ['topmembers', []], trivia: ['trivia', ['answer']], truth: ['truth', []],
        wasted: ['wasted', ['waste']]
    };
    for (const [f, [name, aliases]] of Object.entries(expected)) {
        check(`${f}: name "${name}" unchanged`, cmds[f].name === name, cmds[f].name);
        check(`${f}: aliases unchanged`, JSON.stringify(cmds[f].aliases) === JSON.stringify(aliases), JSON.stringify(cmds[f].aliases));
    }

    // --- 2) Invalid input styled (boxed INVALID INPUT with usage) ---
    const boxedCases = [
        ['eightball', { message: { conversation: '.8ball' } }, [], '.8ball <question>', { userMessage: '.8ball' }],
        ['gif', { message: { conversation: '.gif' } }, [], '.gif <search term>'],
        ['memesearch', { message: { conversation: '.memesearch' } }, [], '.memesearch <query>'],
    ];
    for (const [cmdName, msg, args, usage, extra] of boxedCases) {
        const sent = await runWith(cmdName, msg, args, extra);
        check(`${cmdName}: invalid input boxed with usage`, hasText(sent, 'INVALID INPUT') && hasText(sent, 'Usage:') && hasText(sent, usage), JSON.stringify(sent.map(s => s.content?.text)));
    }

    // pies: no country + unsupported country (needs quoted msg shape)
    {
        const { sock, sent } = makeSock();
        await cmds.pies.piesCommand(sock, '123@g.us', { key: { id: 'p1' } }, []);
        check('pies: no country boxed invalid input', hasText(sent, 'INVALID INPUT') && hasText(sent, '.pies <country>'), JSON.stringify(sent.map(s => s.content?.text)));
        sent.length = 0;
        await cmds.pies.piesCommand(sock, '123@g.us', { key: { id: 'p2' } }, ['mars']);
        check('pies: unsupported country boxed invalid input', hasText(sent, 'INVALID INPUT') && hasText(sent, 'Unsupported country: mars'), JSON.stringify(sent.map(s => s.content?.text)));
    }

    // misc sub-command usage
    {
        const { sock, sent } = makeSock();
        await cmds.misc.miscCommand(sock, '123@g.us', { key: { id: 'm1' } }, ['its-so-stupid']);
        check('misc its-so-stupid: boxed usage', hasText(sent, 'INVALID INPUT') && hasText(sent, '.misc its-so-stupid <text>'), JSON.stringify(sent.map(s => s.content?.text)));
        sent.length = 0;
        await cmds.misc.miscCommand(sock, '123@g.us', { key: { id: 'm2' } }, ['oogway']);
        check('misc oogway: boxed usage', hasText(sent, 'INVALID INPUT') && hasText(sent, '.misc oogway <quote>'), JSON.stringify(sent.map(s => s.content?.text)));
        sent.length = 0;
        await cmds.misc.miscCommand(sock, '123@g.us', { key: { id: 'm3' } }, ['bogus']);
        check('misc default: image-effects usage card', hasText(sent, 'IMAGE EFFECTS') && hasText(sent, 'Usage:'), JSON.stringify(sent.map(s => s.content?.text)));
    }

    // Compact warnings for simple missing-input cases
    const compactCases = [
        ['compliment', { message: {} }, [], 'Please mention someone'],
        ['insult', { message: {} }, [], 'Please mention someone'],
        ['character', { message: {} }, [], 'Please mention someone'],
        ['wasted', { message: {} }, [], 'Please mention someone'],
        ['hangman', { message: { conversation: '.guess' } }, [], '.guess <letter>'],
        ['trivia', { message: { conversation: '.answer' } }, [], '.answer <answer>'],
    ];
    for (const [cmdName, msg, args, needle] of compactCases) {
        let sent;
        if (cmdName === 'hangman') sent = await runWith(cmdName, msg, args, { commandName: 'guess', userMessage: '.guess' });
        else if (cmdName === 'trivia') sent = await runWith(cmdName, msg, args, { commandName: 'answer', userMessage: '.answer' });
        else sent = await runWith(cmdName, msg, args);
        check(`${cmdName}: missing input styled compact`, hasText(sent, '⚠️') && hasText(sent, needle), JSON.stringify(sent.map(s => s.content?.text)));
    }

    // ttt .move without a position
    {
        const sent = await runWith('tictactoe', { message: {} }, ['x'], { commandName: 'move', userMessage: '.move x' });
        check('ttt: .move missing position styled', hasText(sent, '⚠️') && hasText(sent, '.move <number>'), JSON.stringify(sent.map(s => s.content?.text)));
    }

    // --- 3) No raw provider/API errors leaked into user-visible text ---
    for (const f of funFiles) {
        check(`${f}: no raw error.message interpolation in replies`,
            !/\$\{(error|err|e)\.message\}/.test(src[f]),
            'found ${error.message} template leak');
    }
    check('bomb: friendly final catch', src.bomb.includes('❌ Something went wrong. Please try again.'));
    check('memesearch: friendly fetch error, no error.message', src.memesearch.includes("'❌ Failed to fetch the meme. Please try again later.'"));
    check('trivia: friendly fetch error', src.trivia.includes('❌ Failed to fetch a trivia question. Please try again later.'));
    check('no secret-key interpolation into reply text', funFiles.every(f => !/\$\{settings\.[^}]*[Kk]ey[^}]*\}/.test(src[f]) && !src[f].includes('at process.')), 'leaked internal detail');

    // --- 4) AI-backed fun commands: provider calls preserved + playful headers ---
    const aiBacked = ['advice', 'compliment', 'dare', 'eightball', 'fact', 'flirt', 'insult', 'joke', 'motivate', 'quote', 'riddle', 'roast', 'shayari', 'truth'];
    check('all AI-backed fun files require lib/ai and call chat()', aiBacked.every(f => src[f].includes("require('../../lib/ai')") && /await chat\(/.test(src[f])), 'an AI call was lost');
    const headers = {
        advice: '💡 ADVICE', compliment: '💖 COMPLIMENT', dare: '🎯 DARE', fact: '🧠 FACT',
        flirt: '💘 FLIRT', insult: '😈 INSULT', joke: '😂 JOKE', motivate: '🔥 MOTIVATION',
        quote: '💭 QUOTE', riddle: '🧩 RIDDLE', roast: '🔥 ROAST', shayari: '📜 SHAYARI',
        truth: '🤔 TRUTH'
    };
    for (const [f, header] of Object.entries(headers)) {
        check(`${f}: playful "${header}" header used`, src[f].includes(header), 'header missing');
    }
    check('8ball keeps its magic-8-ball identity', src.eightball.includes('🎱 *Magic 8-Ball*'), 'identity lost');

    // AI outputs stay unboxed/readable (no card frame around generated content)
    check('joke: content unboxed (no box frame)', !src.joke.includes("style.box('😂 JOKE'"));

    // --- 5) Games: presentation + state safety ---
    // Bomb: start board + digit + surrender through real execute()
    {
        const { sock, sent } = makeSock();
        const P1 = '111@s.whatsapp.net';
        const GROUP = '123@g.us';
        const extras = { senderId: P1, chatId: GROUP, reply: async (t) => { sent.push({ chatId: GROUP, content: { text: t } }); } };
        await cmds.bomb.execute(sock, { key: { id: 'b1' }, message: { conversation: '.bomb' } }, [], extras);
        check('bomb: start board sent with B O M B title', hasText(sent, '💣  *B O M B*'), JSON.stringify(sent.map(s => s.content?.text)));
        check('bomb: gameState created', !!cmds.bomb.gameState && cmds.bomb.gameState.has(P1));
        // Pick digits until a SAFE box opens (the bomb sits at a random position;
        // hitting it would legitimately end the game, so keep trying).
        let openedOut = null;
        for (let d = 1; d <= 9 && !openedOut; d++) {
            sent.length = 0;
            await cmds.bomb.execute(sock, { key: { id: 'b2' + d }, message: { conversation: String(d) } }, [], extras);
            const game = cmds.bomb.gameState.get(P1);
            if (game && game.array.some(b => b.state)) openedOut = sent.map(s => s.content?.text || '').join(' ');
        }
        check('bomb: digit opens a box / advances game', !!openedOut, 'state not advanced');
        check('bomb: board re-render after move', !!openedOut && openedOut.includes('B O M B'), 'missing board title');
        sent.length = 0;
        await cmds.bomb.execute(sock, { key: { id: 'b3' }, message: { conversation: 'suren' } }, [], extras);
        check('bomb: suren surrender ends game + cleanup', !cmds.bomb.gameState.has(P1) && hasText(sent, 'surrender'), JSON.stringify(sent.map(s => s.content?.text)));
        check('bomb: clearTimeout + cleanup untouched', src.bomb.includes('clearTimeout(game.timeoutId)') && src.bomb.includes('gameState.delete(sender)'));
        check('bomb: exports intact', typeof cmds.bomb.hasActiveGame === 'function' && !!cmds.bomb.gameState);
    }

    // TicTacToe: create -> join (challenge mentions) -> moves -> surrender, all state preserved
    {
        const { sock, sent } = makeSock();
        const P1 = '111@s.whatsapp.net';
        const P2 = '222@s.whatsapp.net';
        const GROUP = '123@g.us';
        await cmds.tictactoe.tictactoeCommand(sock, GROUP, P1, 'smokeroom');
        check('ttt: waiting message sent', hasText(sent, 'Waiting for opponent'), JSON.stringify(sent.map(s => s.content?.text)));
        sent.length = 0;
        await cmds.tictactoe.tictactoeCommand(sock, GROUP, P2, 'smokeroom');
        const joinMsg = sent.find(s => typeof s.content?.text === 'string' && s.content.text.includes('TIC-TAC-TOE'));
        check('ttt: joined game uses TIC-TAC-TOE board card', !!joinMsg, JSON.stringify(sent.map(s => s.content?.text)));
        check('ttt: challenge board mentions both players', !!joinMsg && JSON.stringify(joinMsg.content.mentions).includes(P1) && JSON.stringify(joinMsg.content.mentions).includes(P2), JSON.stringify(joinMsg?.content?.mentions));
        check('ttt: board symbols preserved (❎/⭕)', !!joinMsg && joinMsg.content.text.includes('❎') && joinMsg.content.text.includes('⭕'), 'symbols changed');

        sent.length = 0;
        await cmds.tictactoe.handleTicTacToeMove(sock, GROUP, P1, '1');
        check('ttt: valid move renders board', hasText(sent, 'TIC-TAC-TOE') && hasText(sent, 'Turn:'), JSON.stringify(sent.map(s => s.content?.text)));

        sent.length = 0;
        await cmds.tictactoe.handleTicTacToeMove(sock, GROUP, P1, '2');
        check('ttt: wrong-player move styled compact', hasText(sent, '⚠️ It\'s not your turn.'), JSON.stringify(sent.map(s => s.content?.text)));

        sent.length = 0;
        await cmds.tictactoe.handleTicTacToeMove(sock, GROUP, P2, '1');
        check('ttt: taken position styled compact', hasText(sent, '⚠️ That position is already taken.'), JSON.stringify(sent.map(s => s.content?.text)));

        sent.length = 0;
        await cmds.tictactoe.handleTicTacToeMove(sock, GROUP, P2, 'surrender');
        check('ttt: surrender ends game + cleanup', hasText(sent, 'surrendered') && hasText(sent, 'wins'), JSON.stringify(sent.map(s => s.content?.text)));
        // A second surrender/move after cleanup must not produce a board (game deleted)
        sent.length = 0;
        await cmds.tictactoe.handleTicTacToeMove(sock, GROUP, P2, 'surrender');
        check('ttt: game removed after end (no further board)', !hasText(sent, 'TIC-TAC-TOE'), JSON.stringify(sent.map(s => s.content?.text)));
        check('ttt: win/draw statuses styled', src.tictactoe.includes('🏆 @${winner') && src.tictactoe.includes('🤝 Game ended in a draw!'));
        check('ttt: delete games[room.id] cleanup untouched', (src.tictactoe.match(/delete games\[room\.id\]/g) || []).length === 2, 'cleanup count changed');
        check('ttt: game.turn() logic untouched', src.tictactoe.includes('room.game.turn('));
    }

    // Hangman: start + guess paths
    {
        const { sock, sent } = makeSock();
        await cmds.hangman.startHangman(sock, '123@g.us');
        check('hangman: start styled with 🎮 HANGMAN', hasText(sent, '🎮 HANGMAN'), JSON.stringify(sent.map(s => s.content?.text)));
        sent.length = 0;
        await cmds.hangman.guessLetter(sock, '123@g.us', 'z');
        check('hangman: wrong guess styled compact', hasText(sent, '⚠️ Wrong guess!') && hasText(sent, 'tries left'), JSON.stringify(sent.map(s => s.content?.text)));
    }

    // Trivia: start (mocked API) + answer paths, state untouched
    {
        const axios = require('axios');
        const origGet = axios.get;
        axios.get = async () => ({ data: { results: [{ question: 'What is 2+2?', correct_answer: '4', incorrect_answers: ['3', '5', '6'] }] } });
        try {
            const { sock, sent } = makeSock();
            await cmds.trivia.startTrivia(sock, '123@g.us');
            check('trivia: start styled with 🎮 TRIVIA + question', hasText(sent, '🎮 TRIVIA') && hasText(sent, 'What is 2+2?'), JSON.stringify(sent.map(s => s.content?.text)));
            sent.length = 0;
            await cmds.trivia.answerTrivia(sock, '123@g.us', '4');
            check('trivia: correct answer styled', hasText(sent, '✅ Correct!'), JSON.stringify(sent.map(s => s.content?.text)));
            sent.length = 0;
            await cmds.trivia.answerTrivia(sock, '123@g.us', '4');
            check('trivia: game state cleaned after answer', hasText(sent, 'No trivia game is in progress'), JSON.stringify(sent.map(s => s.content?.text)));
        } finally {
            axios.get = origGet;
        }
    }

    // --- 6) Mentions + media payloads + quoted replies preserved ---
    const mentionChecks = [
        ['roast', 'mentions: [target]'], ['compliment', 'mentions: [userToCompliment]'],
        ['insult', 'mentions: [userToInsult]'], ['wasted', 'mentions: [userToWaste]'],
        ['gayrate', 'mentions: [targetId]'], ['ship', 'mentions: [firstUser, secondUser]'],
        ['stupid', 'mentions: [who]'], ['topmembers', 'mentions: sortedMembers.map(([userId]) => userId)'],
        ['tictactoe', 'mentions: mentions'],
    ];
    for (const [f, needle] of mentionChecks) {
        check(`${f}: mentions payload preserved`, src[f].includes(needle), 'mentions payload missing');
    }
    const payloadChecks = [
        ['meme', 'buttons: buttons'], ['meme', 'image: imageBuffer'],
        ['memesearch', 'video: mp4Buffer'], ['memesearch', 'gifPlayback: true'],
        ['gif', 'video: { url: gifUrl }'], ['gif', 'gifPlayback: true'],
        ['pies', 'image: imageBuffer'], ['simp', 'image: imageBuffer'],
        ['stupid', 'image: imageBuffer'], ['wasted', 'image: Buffer.from(wastedResponse.data)'],
        ['character', 'image: { url: profilePic }'], ['misc', 'image: Buffer.from(response.data)'],
    ];
    for (const [f, needle] of payloadChecks) {
        check(`${f}: payload "${needle}" intact`, src[f].includes(needle), 'missing from source');
    }
    const quotedFiles = ['quote', 'advice', 'dare', 'fact', 'flirt', 'motivate', 'roast', 'shayari', 'truth', 'riddle', 'goodnight', 'roseday', 'wasted', 'memesearch', 'pies', 'misc', 'meme'];
    check('quoted replies preserved in fun sends', quotedFiles.every(f => /quoted: message/.test(src[f])), 'some fun file lost its quoted reply');
    const channelFiles = ['joke', 'quote', 'advice', 'compliment', 'dare', 'fact', 'flirt', 'insult', 'motivate', 'roast', 'shayari', 'truth', 'riddle', 'eightball', 'character', 'wasted', 'simp'];
    check('channelInfo spread preserved', channelFiles.every(f => src[f].includes('...channelInfo')), 'missing channelInfo spread');

    console.log(`\n${pass - fail}/${pass} fun/games checks passed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
    console.error('❌ smoke-fun-games crashed:', err);
    process.exit(1);
});
