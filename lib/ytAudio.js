/**
 * ytAudio — shared YouTube-audio fetch with a robust fallback chain.
 *
 * Primary source: the local yt-dlp binary (PO-token backed, see lib/ytdlp.js).
 * Fallbacks when yt-dlp is unavailable: yt-dlp's direct stream URL, then the
 * HTTP downloader APIs (EliteProTech, Yupra, Okatsu).
 *
 * Both `.song` and `.music` use this so neither command depends on a single
 * brittle third-party host (e.g. the old play.js relied solely on
 * apis-keith.vercel.app, which started returning HTTP 500 for every video).
 */
const axios = require('axios');
const ytdlp = require('./ytdlp');
const { toAudio } = require('./converter');

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
    throw lastError;
}

async function getEliteProTechDownloadByUrl(youtubeUrl) {
    const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.downloadURL) {
        return { download: res.data.downloadURL, title: res.data.title };
    }
    throw new Error('EliteProTech ytdown returned no download');
}

async function getYupraDownloadByUrl(youtubeUrl) {
    const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.data?.download_url) {
        return {
            download: res.data.data.download_url,
            title: res.data.data.title,
            thumbnail: res.data.data.thumbnail
        };
    }
    throw new Error('Yupra returned no download');
}

async function getOkatsuDownloadByUrl(youtubeUrl) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    // Okatsu response shape: { status, creator, title, format, thumb, duration, cached, dl }
    if (res?.data?.dl) {
        return {
            download: res.data.dl,
            title: res.data.title,
            thumbnail: res.data.thumb
        };
    }
    throw new Error('Okatsu ytmp3 returned no download');
}

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

    // 3) HTTP downloader APIs (kept for when yt-dlp is unavailable).
    const apiMethods = [
        { name: 'EliteProTech', method: () => getEliteProTechDownloadByUrl(youtubeUrl) },
        { name: 'Yupra', method: () => getYupraDownloadByUrl(youtubeUrl) },
        { name: 'Okatsu', method: () => getOkatsuDownloadByUrl(youtubeUrl) },
    ];
    for (const apiMethod of apiMethods) {
        try {
            const data = await apiMethod.method();
            const audioUrl = data.download || data.dl || data.url;
            if (!audioUrl) {
                console.log(`[ytAudio] ${apiMethod.name} returned no download URL`);
                continue;
            }
            const buf = await fetchBuffer(audioUrl);
            if (buf && buf.length) {
                return {
                    buffer: buf,
                    title: data.title || fallbackTitle,
                    thumbnail: data.thumbnail,
                    source: apiMethod.name
                };
            }
        } catch (e) {
            console.log(`[ytAudio] ${apiMethod.name} failed:`, e.message);
        }
    }

    throw new Error('All download sources failed. The content may be unavailable or blocked in your region.');
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
    getEliteProTechDownloadByUrl,
    getYupraDownloadByUrl,
    getOkatsuDownloadByUrl,
};
