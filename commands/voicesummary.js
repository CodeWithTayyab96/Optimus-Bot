const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { speechToText, chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

function extractAudioMessage(message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const audioMsg = quoted?.audioMessage || message.message?.audioMessage;
    const msgToDownload = quoted?.audioMessage
        ? { message: { audioMessage: quoted.audioMessage } }
        : message;

    return { audioMsg, msgToDownload };
}

async function voicesummaryCommand(sock, chatId, message) {
    try {
        const { audioMsg, msgToDownload } = extractAudioMessage(message);

        if (!audioMsg) {
            return await sock.sendMessage(chatId, {
                text: '🎙️ Reply to a voice note or audio with `.voicesummary` to get transcription + summary.',
                ...channelInfo
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            react: { text: '🧠', key: message.key }
        });

        const audioBuffer = await downloadMediaMessage(msgToDownload, 'buffer', {}, {});
        if (!audioBuffer || !audioBuffer.length) {
            return await sock.sendMessage(chatId, {
                text: '❌ Failed to download audio. Please try again.',
                ...channelInfo
            }, { quoted: message });
        }

        const mimetype = audioMsg.mimetype || 'audio/ogg';
        const ext = mimetype.includes('ogg') ? 'ogg'
            : mimetype.includes('mp4') ? 'm4a'
            : mimetype.includes('mpeg') ? 'mp3'
            : 'ogg';

        const transcription = await speechToText(audioBuffer, {
            filename: `voicesummary.${ext}`,
            contentType: mimetype,
        });

        if (!transcription) {
            return await sock.sendMessage(chatId, {
                text: '❌ Could not transcribe this voice note. Try a clearer or slightly longer audio.',
                ...channelInfo
            }, { quoted: message });
        }

        const summary = await chat(
            'You summarize voice-note transcriptions. Give a short clean summary in 3-5 bullet points if needed, and then list any action items separately if present. Respond in Roman Urdu or English — match the speaker tone naturally.',
            transcription,
            { maxTokens: 400, temperature: 0.5 }
        );

        await sock.sendMessage(chatId, {
            text: `🎙️ *Transcription*\n\n${transcription}\n\n🧠 *Summary*\n\n${summary || 'No summary available.'}`,
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        console.error('Voice summary command error:', error.message);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to summarize voice note. Please try again later.',
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = voicesummaryCommand;
