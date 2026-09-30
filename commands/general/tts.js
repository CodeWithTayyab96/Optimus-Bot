const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { channelInfo } = require('../../lib/messageConfig');
const { textToSpeech } = require('../../lib/ai');
const { BIN: FFMPEG, isAvailable: ffmpegAvailable } = require('../../lib/ffmpeg');

/**
 * Text-to-Speech.
 *
 * PROVIDERS, in order:
 *   1. Gemini  (gemini-3.8-flash-tts) — a real AI voice, and it handles mixed
 *      Roman Urdu / English far better than the old path. Returns audio/wav.
 *   2. gtts — the offline-ish Google Translate voice that was the ONLY provider
 *      before. Kept as the fallback because Groq cannot do this job: it has no
 *      text-to-speech model at all (`playai-tts` was decommissioned), so there
 *      is nothing on Groq to fall back to.
 *
 * WHY ffmpeg IS INVOLVED
 *   Gemini returns WAV. WhatsApp voice notes want OGG/Opus, so a `.tovoice`
 *   request is transcoded. If that conversion fails for any reason the message
 *   is still sent — as a normal audio clip rather than a voice-note bubble —
 *   because losing the bubble is far better than losing the speech.
 */

const LANGUAGES = {
    en: 'English / Roman Urdu', ur: 'Urdu (Arabic script)', ar: 'Arabic',
    es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
    ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
    tr: 'Turkish', it: 'Italian', bn: 'Bengali', pa: 'Punjabi',
};

const TEMP_DIR = path.join(__dirname, '..', '..', 'assets');

/** gtts writes to a file, so wrap it as a promise returning a buffer. */
function synthesizeWithGtts(text, language) {
    return new Promise((resolve) => {
        const file = path.join(TEMP_DIR, `tts-gtts-${Date.now()}.mp3`);
        try {
            const gtts = new gTTS(text, language);
            gtts.save(file, (err) => {
                if (err) {
                    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch { /* ignore */ }
                    return resolve(null);
                }
                try {
                    const buf = fs.readFileSync(file);
                    fs.unlinkSync(file);
                    resolve(buf.length ? buf : null);
                } catch {
                    resolve(null);
                }
            });
        } catch {
            resolve(null);
        }
    });
}

/** Best available speech for this text. Returns { buffer, mimetype, source }. */
async function synthesize(text, language) {
    try {
        const gemini = await textToSpeech(text);
        if (gemini?.buffer?.length) {
            return { buffer: gemini.buffer, mimetype: gemini.mimetype || 'audio/wav', source: 'gemini' };
        }
    } catch (e) {
        console.error('[tts] Gemini failed:', e.message);
    }

    const mp3 = await synthesizeWithGtts(text, language);
    if (mp3) return { buffer: mp3, mimetype: 'audio/mpeg', source: 'gtts' };

    return null;
}

/** Transcode to OGG/Opus for a voice note. Resolves null on any failure. */
function toOpus(buffer, inputExt) {
    return new Promise((resolve) => {
        if (!ffmpegAvailable()) return resolve(null);

        const stamp = Date.now();
        const inPath = path.join(TEMP_DIR, `tts-in-${stamp}.${inputExt}`);
        const outPath = path.join(TEMP_DIR, `tts-out-${stamp}.ogg`);

        const cleanup = () => {
            for (const p of [inPath, outPath]) {
                try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
            }
        };

        try {
            fs.writeFileSync(inPath, buffer);
        } catch {
            return resolve(null);
        }

        execFile(FFMPEG, [
            '-y', '-i', inPath,
            '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1',
            outPath,
        ], { timeout: 30000 }, (err) => {
            if (err || !fs.existsSync(outPath)) {
                cleanup();
                return resolve(null);
            }
            try {
                const out = fs.readFileSync(outPath);
                cleanup();
                resolve(out.length ? out : null);
            } catch {
                cleanup();
                resolve(null);
            }
        });
    });
}

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

    await sock.sendMessage(chatId, { react: { text: '🔊', key: message.key } });

    try {
        const speech = await synthesize(text.trim(), language);

        if (!speech) {
            return await sock.sendMessage(chatId, {
                text: '❌ Speech generate nahi ho saki. Dobara try karo. (Failed to generate speech. Please try again.)',
                ...channelInfo
            }, { quoted: message });
        }

        const payload = {
            audio: speech.buffer,
            mimetype: speech.mimetype,
            ptt: false,
            ...channelInfo,
        };

        if (options.asVoice) {
            const ext = /wav/i.test(speech.mimetype) ? 'wav' : 'mp3';
            const opus = await toOpus(speech.buffer, ext);
            if (opus) {
                payload.audio = opus;
                payload.mimetype = 'audio/ogg; codecs=opus';
                payload.ptt = true;
            } else {
                // Transcode failed — send the clip anyway rather than nothing.
                console.warn('[tts] opus conversion failed; sending as a normal audio message');
            }
        }

        await sock.sendMessage(chatId, payload, { quoted: message });
    } catch (err) {
        console.error('TTS error:', err.message);
        await sock.sendMessage(chatId, {
            text: '❌ Speech generate nahi ho saki. Dobara try karo. (Failed to generate speech. Please try again.)',
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'tts',
    aliases: ['tovoice'],
    category: 'general',
    description: 'Convert text to speech (Gemini voice, gtts fallback)',
    usage: '.tts <text>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const text = extra.userMessage.split(/\s+/).slice(1).join(' ');
        if (extra.commandName === 'tovoice') {
            await ttsCommand(sock, extra.chatId, text, message, { asVoice: true });
        } else {
            await ttsCommand(sock, extra.chatId, text, message);
        }
    },
    // exported for tests
    _test: { synthesize, toOpus, LANGUAGES },
};
