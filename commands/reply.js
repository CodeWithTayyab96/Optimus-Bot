const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

const MODES = {
    normal: 'Write a natural reply.',
    polite: 'Write a polite and respectful reply.',
    funny: 'Write a witty and funny reply.',
    savage: 'Write a savage but readable reply.',
    flirty: 'Write a playful, flirty reply.',
    professional: 'Write a professional and composed reply.',
    short: 'Write a short reply in one or two lines.'
};

function extractRawText(message) {
    return message.message?.conversation?.trim()
        || message.message?.extendedTextMessage?.text?.trim()
        || '';
}

function extractQuotedText(message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    return quoted?.conversation?.trim()
        || quoted?.extendedTextMessage?.text?.trim()
        || quoted?.imageMessage?.caption?.trim()
        || quoted?.videoMessage?.caption?.trim()
        || '';
}

async function replyCommand(sock, chatId, message) {
    try {
        const quotedText = extractQuotedText(message);
        const rawText = extractRawText(message);
        const args = rawText.replace(/^\.\w+\s*/, '').trim();
        const parts = args ? args.split(/\s+/) : [];

        let mode = 'normal';
        if (parts[0] && MODES[parts[0].toLowerCase()]) {
            mode = parts.shift().toLowerCase();
        }

        const extraInstruction = parts.join(' ').trim();

        if (!quotedText) {
            return await sock.sendMessage(chatId, {
                text: '💬 Reply to a message with `.reply <mode>`\n\nModes: normal, polite, funny, savage, flirty, professional, short',
                ...channelInfo
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            react: { text: '💬', key: message.key }
        });

        const prompt = [
            'You generate WhatsApp replies.',
            MODES[mode],
            'Keep it natural and ready to send.',
            'Respond in Roman Urdu or English — match the original tone naturally.',
            'Output only the reply text.',
            extraInstruction ? `Extra instruction: ${extraInstruction}` : ''
        ].filter(Boolean).join(' ');

        const response = await chat(prompt, quotedText, { maxTokens: 256, temperature: 0.9 });

        await sock.sendMessage(chatId, {
            text: response || '❌ Could not generate a reply.',
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        console.error('Reply command error:', error.message);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to generate reply. Please try again later.',
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = replyCommand;
