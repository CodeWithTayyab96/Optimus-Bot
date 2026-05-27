const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { speechToText } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

async function sttCommand(sock, chatId, message) {
    try {
        // Get the quoted message (user must reply to a voice/audio message)
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        // Check if replying to an audio or voice message
        const audioMsg = quoted?.audioMessage
            || message.message?.audioMessage;

        if (!audioMsg) {
            return await sock.sendMessage(chatId, {
                text: '🎙️ Please reply to a *voice message* or *audio* to transcribe it.\nExample: Reply to a voice note with `.totext`',
                ...channelInfo
            }, { quoted: message });
        }

        // React to show processing
        await sock.sendMessage(chatId, {
            react: { text: '🎙️', key: message.key }
        });

        // Build a proper message object for downloadMediaMessage
        const msgToDownload = quoted?.audioMessage
            ? { message: { audioMessage: quoted.audioMessage } }
            : message;

        // Download the audio
        const audioBuffer = await downloadMediaMessage(
            msgToDownload,
            'buffer',
            {},
            {}
        );

        if (!audioBuffer || audioBuffer.length === 0) {
            return await sock.sendMessage(chatId, {
                text: '❌ Failed to download the audio. Please try again.',
                ...channelInfo
            }, { quoted: message });
        }

        // Determine content type
        const mimetype = audioMsg.mimetype || 'audio/ogg';
        const ext = mimetype.includes('ogg') ? 'ogg'
            : mimetype.includes('mp4') ? 'm4a'
            : mimetype.includes('mpeg') ? 'mp3'
            : 'ogg';

        // Transcribe using Groq Whisper
        const transcription = await speechToText(audioBuffer, {
            filename: `voice.${ext}`,
            contentType: mimetype,
        });

        if (!transcription) {
            return await sock.sendMessage(chatId, {
                text: '❌ Could not transcribe the audio. The voice note may be too short or unclear.',
                ...channelInfo
            }, { quoted: message });
        }

        // Send the transcription
        await sock.sendMessage(chatId, {
            text: `🎙️ *Transcription:*\n\n${transcription}`,
            ...channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('Error in STT command:', error.message);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to transcribe audio. Please try again later.',
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = sttCommand;
