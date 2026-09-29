/**
 * ytAudio — shared YouTube-audio fetch with a robust fallback chain.
 *
 * Primary source: the local yt-dlp binary (PO-token backed, see lib/ytdlp.js).
 * Fallback: yt-dlp's direct stream URL. There are no third-party HTTP downloader
 * APIs any more — the ones that used to be here all went dead.
 *
 * Both `.song` and `.music` use this so neither command depends on a single
 * brittle third-party host (e.g. the old play.js relied solely on
 * apis-keith.vercel.app, which started returning HTTP 500 for every video).
 */
const axios = require('axios');
const ytdlp = require('./ytdlp');
const rapidApi = require('./rapidApi');
const { toAudio } = require('./converter');

// NOTE: the former HTTP fallback APIs (EliteProTech, Yupra, Okatsu) were removed
// — all three are dead (verified 2026-09-27: 404, DNS no longer resolves, and
// 402 payment-required respectively). yt-dlp remains primary; RapidAPI is a
// last-resort fallback for hosts whose IP YouTube blocks (see lib/rapidApi.js).

/** Fetch a URL into a Buffer, with an arraybuffer-first + stream fallback. */
async function fetchBuffer(audioUrl) {
    const opts = {
        timeout: 90000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        decompress: true,
        validateStatus: s => s >= 200 && s < 400,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'identity'
        }
    };
    try {
        const res = await axios.get(audioUrl, { ...opts, responseType: 'arraybuffer' });
        const buf = Buffer.from(res.data);
        if (buf && buf.length) return buf;
    } catch (e) {
        if (e.response?.status === 451) throw e; // hard regional block — don't retry other modes
    }
    // Stream-mode fallback
    const sres = await axios.get(audioUrl, { ...opts, responseType: 'stream' });
    const chunks = [];
    await new Promise((resolve, reject) => {
        sres.data.on('data', c => chunks.push(c));
        sres.data.on('end', resolve);
        sres.data.on('error', reject);
    });
    const buf = Buffer.concat(chunks);
    if (!buf || !buf.length) throw new Error('empty audio buffer');
    return buf;
}

/**
 * Download YouTube audio to a Buffer, trying sources in order until one works.
 * @param {string} youtubeUrl
 * @param {{tempDir?:string, title?:string}} opts
 * @returns {Promise<{buffer:Buffer, title:string, thumbnail?:string, source:string}>}
 */
async function downloadYouTubeAudio(youtubeUrl, opts = {}) {
    const tempDir = opts.tempDir;
    const fallbackTitle = opts.title || '';
    const ytAvailable = await ytdlp.isAvailable();

    // 1) yt-dlp downloads the file itself (most reliable on non-flagged IPs).
    if (ytAvailable && tempDir) {
        try {
            const dl = await ytdlp.downloadAudio(youtubeUrl, tempDir);
            if (dl.buffer && dl.buffer.length) {
                return { buffer: dl.buffer, title: fallbackTitle, source: 'yt-dlp' };
            }
        } catch (e) {
            console.error('[ytAudio] yt-dlp download failed:', e.message);
        }
    }

    // 2) yt-dlp direct stream URL -> fetch buffer.
    if (ytAvailable) {
        try {
            const url = await ytdlp.getAudioUrl(youtubeUrl);
            const buf = await fetchBuffer(url);
            if (buf && buf.length) {
                return { buffer: buf, title: fallbackTitle, source: 'yt-dlp (url)' };
            }
        } catch (e) {
            console.error('[ytAudio] yt-dlp url failed:', e.message);
        }
    }

    // 3) RapidAPI — fetches from ITS OWN IPs, so it works where this host is
    // blocked. Only reached when yt-dlp has already failed, because the free
    // tier is 100 calls/month.
    if (rapidApi.isConfigured()) {
        try {
            const id = rapidApi.videoIdFrom(youtubeUrl);
            const track = id ? rapidApi.pickAudio(await rapidApi.getDetails(id)) : null;
            if (track) {
                const buf = await fetchBuffer(track.url);
                if (buf && buf.length) {
                    console.log('[ytAudio] recovered via rapidapi');
                    return { buffer: buf, title: fallbackTitle, source: 'rapidapi' };
                }
            }
        } catch (e) {
            console.error('[ytAudio] rapidapi failed:', e.message);
        }
    }

    // No source left — report the real cause.
    if (!ytAvailable && !rapidApi.isConfigured()) {
        throw new Error(
            'yt-dlp is not installed on this host, and it is now the only download source. ' +
                'Install it with: pip install -U yt-dlp bgutil-ytdlp-pot-provider'
        );
    }
    if (!ytAvailable) {
        throw new Error('yt-dlp is not installed, and the RapidAPI fallback could not fetch this audio.');
    }
    throw new Error(
        'yt-dlp could not fetch this audio — it may be private, age-restricted, or region-locked.' +
            (rapidApi.isConfigured() ? ' (The RapidAPI fallback failed too.)' : '')
    );
}

/**
 * Detect the real audio format from the buffer signature and, if it isn't MP3,
 * transcode it to MP3 (WhatsApp-friendly). Returns the (possibly converted)
 * buffer and its mimetype.
 * @param {Buffer} audioBuffer
 * @returns {Promise<{buffer:Buffer, mimetype:string, extension:string}>}
 */
async function toMp3Buffer(audioBuffer) {
    if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error('empty audio buffer');
    }

    const firstBytes = audioBuffer.slice(0, 12);
    const hexSignature = firstBytes.toString('hex');
    const asciiSignature = firstBytes.toString('ascii', 4, 8);

    let fileExtension = 'mp3';

    // WebM (EBML header — YouTube's usual Opus-in-WebM audio track).
    if (audioBuffer[0] === 0x1A && audioBuffer[1] === 0x45 && audioBuffer[2] === 0xDF && audioBuffer[3] === 0xA3) {
        fileExtension = 'webm';
    }
    // MP4/M4A (ftyp box)
    else if (asciiSignature === 'ftyp' || hexSignature.startsWith('000000')) {
        const ftypBox = audioBuffer.slice(4, 8).toString('ascii');
        if (ftypBox === 'ftyp') fileExtension = 'm4a';
    }
    // MP3 (ID3 tag or MPEG frame sync)
    else if (audioBuffer.toString('ascii', 0, 3) === 'ID3' ||
        (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0)) {
        fileExtension = 'mp3';
    }
    // OGG/Opus
    else if (audioBuffer.toString('ascii', 0, 4) === 'OggS') {
        fileExtension = 'ogg';
    }
    // WAV
    else if (audioBuffer.toString('ascii', 0, 4) === 'RIFF') {
        fileExtension = 'wav';
    }
    // Default to M4A (what the signature often suggests for YouTube Opus-in-mp4)
    else {
        fileExtension = 'm4a';
    }

    if (fileExtension === 'mp3') {
        return { buffer: audioBuffer, mimetype: 'audio/mpeg', extension: 'mp3' };
    }

    const finalBuffer = await toAudio(audioBuffer, fileExtension);
    if (!finalBuffer || finalBuffer.length === 0) {
        throw new Error('conversion returned empty buffer');
    }
    return { buffer: finalBuffer, mimetype: 'audio/mpeg', extension: 'mp3' };
}

module.exports = {
    downloadYouTubeAudio,
    toMp3Buffer,
    fetchBuffer,
};
