const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { speechToText, chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');

// Returns true if text contains Arabic or Devanagari script characters
function isNonLatinScript(text) {
    return /[؀-ۿऀ-ॿ]/.test(text);
}

async function toRomanUrdu(text) {
    const result = await chat(
        'You are a transliterator. Convert the given Urdu or Hindi text into Roman Urdu (Latin script). Output ONLY the Roman Urdu transliteration — no explanations, no original text, nothing else.',
        text
    );
    return result || text;
}

async function sttCommand(sock, chatId, message) {
    try {
        // Get the quoted message (user must reply to a voice/audio message)
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        // Check if replying to an audio or voice message
        const audioMsg = quoted?.audioMessage
            || message.message?.audioMessage;

        if (!audioMsg) {
            return await sock.sendMessage(chatId, {
                text: '🎙️ Kisi *voice message* ya *audio* ko reply karo transcribe karne ke liye.\nExample: Voice note ko reply karo *.totext* ke saath\n\n💡 Urdu, Hindi, aur English — sab languages support hain!',
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
                text: '❌ Audio download nahi hui. Dobara try karo. (Failed to download the audio. Please try again.)',
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
                text: '❌ Audio transcribe nahi ho saki. Voice note thodi lambi rakho ya saaf bol ke record karo. (Could not transcribe. The voice note may be too short or unclear.)',
                ...channelInfo
            }, { quoted: message });
        }

        // If Whisper returned Arabic/Devanagari script, convert to Roman Urdu
        let finalText = transcription;
        if (isNonLatinScript(transcription)) {
            finalText = await toRomanUrdu(transcription);
        }

        await sock.sendMessage(chatId, {
            text: `🎙️ *Transcription:*\n\n${finalText}`,
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
