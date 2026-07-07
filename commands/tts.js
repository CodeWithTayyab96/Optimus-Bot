const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');
const { channelInfo } = require('../lib/messageConfig');

/**
 * Text-to-Speech command with language support
 * Usage: .tts <text>          — English / Roman Urdu TTS
 *        .tts ur <text>       — Urdu script TTS (Arabic script only)
 *        .tovoice <text>      — Alias (sends as voice note)
 */

// Supported language codes
const LANGUAGES = {
    en: 'English / Roman Urdu', ur: 'Urdu (Arabic script)', ar: 'Arabic',
    es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
    ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
    tr: 'Turkish', it: 'Italian', bn: 'Bengali', pa: 'Punjabi',
};

async function ttsCommand(sock, chatId, text, message, options = {}) {
    if (!text) {
        const langList = Object.entries(LANGUAGES)
            .map(([code, name]) => `  *${code}* — ${name}`)
            .join('\n');
        return await sock.sendMessage(chatId, {
            text: `🔊 *Text-to-Speech*\n\nUsage: .tts <text>\nLanguage ke saath: .tts <lang> <text>\n\n*Supported Languages:*\n${langList}\n\nExamples:\n• .tts Hello, how are you?\n• .tts ap kaise hain? (Roman Urdu — no lang code needed)\n• .tts ur آپ کیسے ہیں (Urdu Arabic script)\n\n💡 *Tip:* Roman Urdu likhna ho to sirf .tts likho, koi lang code mat dalo. Urdu script (آپ) ke liye *ur* use karo.`,
            ...channelInfo
        }, { quoted: message });
    }

    // Check if first word is a language code
    let language = 'en';
    const words = text.split(/\s+/);
    if (words.length > 1 && LANGUAGES[words[0].toLowerCase()]) {
        language = words[0].toLowerCase();
        text = words.slice(1).join(' ');
    }

    if (!text.trim()) {
        return await sock.sendMessage(chatId, {
            text: '🔊 Language code ke baad text bhi likho. (Please provide text after the language code.)',
            ...channelInfo
        }, { quoted: message });
    }

    // React to show processing
    await sock.sendMessage(chatId, {
        react: { text: '🔊', key: message.key }
    });

    const fileName = `tts-${Date.now()}.mp3`;
    const filePath = path.join(__dirname, '..', 'assets', fileName);

    try {
        const gtts = new gTTS(text, language);

        await new Promise((resolve, reject) => {
            gtts.save(filePath, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Send as voice note (ptt) or regular audio
        const sendAsVoice = options.asVoice || false;

        await sock.sendMessage(chatId, {
            audio: { url: filePath },
            mimetype: 'audio/mpeg',
            ptt: sendAsVoice,
            ...channelInfo
        }, { quoted: message });

    } catch (err) {
        console.error('TTS error:', err.message);
        await sock.sendMessage(chatId, {
            text: '❌ Speech generate nahi ho saki. Dobara try karo. (Failed to generate speech. Please try again.)',
            ...channelInfo
        }, { quoted: message });
    } finally {
        // Clean up temp file
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
    }
}

module.exports = ttsCommand;
