const axios = require('axios');

let triviaGames = {};

async function startTrivia(sock, chatId) {
    if (triviaGames[chatId]) {
        sock.sendMessage(chatId, { text: '⚠️ A trivia game is already in progress!' });
        return;
    }

    try {
        const response = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple');
        const questionData = response.data.results[0];

        triviaGames[chatId] = {
            question: questionData.question,
            correctAnswer: questionData.correct_answer,
            options: [...questionData.incorrect_answers, questionData.correct_answer].sort(),
        };

        sock.sendMessage(chatId, {
            text: `🎮 TRIVIA\n\nQuestion: ${triviaGames[chatId].question}\n\nOptions:\n${triviaGames[chatId].options.join('\n')}`
        });
    } catch (error) {
        console.error('Error in trivia command:', error);
        sock.sendMessage(chatId, { text: '❌ Failed to fetch a trivia question. Please try again later.' });
    }
}

function answerTrivia(sock, chatId, answer) {
    if (!triviaGames[chatId]) {
        sock.sendMessage(chatId, { text: '⚠️ No trivia game is in progress. Start one with .trivia' });
        return;
    }

    const game = triviaGames[chatId];

    if (answer.toLowerCase() === game.correctAnswer.toLowerCase()) {
        sock.sendMessage(chatId, { text: `✅ Correct! The answer is ${game.correctAnswer}` });
    } else {
        sock.sendMessage(chatId, { text: `❌ Wrong! The correct answer was ${game.correctAnswer}` });
    }

    delete triviaGames[chatId];
}

module.exports = {
    name: 'trivia',
    aliases: ['answer'],
    category: 'fun',
    description: 'Play a trivia quiz',
    usage: '.trivia | .answer <answer>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        if (extra.commandName === 'answer') {
            const answer = extra.userMessage.split(/\s+/).slice(1).join(' ');
            if (answer) {
                await answerTrivia(sock, extra.chatId, answer);
            } else {
                await sock.sendMessage(extra.chatId, { text: '⚠️ Please provide an answer. Usage: .answer <answer>', ...extra.channelInfo }, { quoted: message });
            }
        } else {
            await startTrivia(sock, extra.chatId);
        }
    },
    startTrivia,
    answerTrivia,
};
