/**
 * ffmpeg — small wrapper used to guarantee videos sent to WhatsApp use a
 * codec the app can actually decode.
 *
 * Why this exists: third-party TikTok mirrors (e.g. tikwm, used by the
 * ruhend-scraper `ttdl` fallback) frequently serve HEVC/H.265. WhatsApp does
 * NOT reliably decode HEVC, so the recipient sees a black/blank video track
 * while the audio plays fine. We re-encode to H.264 (keeping the audio) only
 * when the source isn't already H.264, then add faststart for streaming.
 *
 * ffmpeg is already a hard dependency of the bot (yt-dlp needs it to mux
 * bv+ba for video downloads), so relying on it here is safe. Detection is done
 * via `ffmpeg -i` (not ffprobe) so we don't add a ffprobe requirement.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BIN = require('./ffmpegPath').resolveFfmpeg();
let _available = null;

/**
 * True when the ffmpeg binary is callable. Cached after the first check.
 */
function isAvailable() {
    if (_available !== null) return _available;
    try {
        execFileSync(BIN, ['-hide_banner', '-version'], { windowsHide: true, timeout: 10000, stdio: 'ignore' });
        _available = true;
    } catch {
        _available = false;
    }
    return _available;
}

/** Extract the first video codec token from `ffmpeg -i` output. */
function detectVideoCodec(file) {
    try {
        execFileSync(BIN, ['-hide_banner', '-i', file], {
            windowsHide: true, timeout: 30000,
            stdio: ['ignore', 'ignore', 'pipe']
        });
        return null; // shouldn't happen (no output file) but treat as unknown
    } catch (e) {
        const s = String((e.stderr || '') + (e.stdout || ''));
        const m = s.match(/Video:\s*([a-z0-9]+)/i);
        return m ? m[1].toLowerCase() : null;
    }
}

/**
 * Re-encode the video track to H.264, copy the audio, add faststart.
 * Reads `inFile`, writes `outFile`. Throws on failure.
 */
function transcodeH264(inFile, outFile) {
    execFileSync(BIN, [
        '-y', '-i', inFile,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        outFile
    ], { windowsHide: true, timeout: 300000, stdio: 'ignore' });
}

/**
 * Ensure a video buffer uses an H.264 video track (WhatsApp-compatible).
 * Returns the original buffer if ffmpeg is missing, the codec is already
 * H.264, or anything goes wrong — we never fail delivery just for a codec we
 * couldn't normalise.
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
function ensureH264(buffer) {
    if (!isAvailable() || !buffer || !buffer.length) return buffer;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opt-fm-'));
    const inF = path.join(dir, 'in.mp4');
    const outF = path.join(dir, 'out.mp4');
    try {
        fs.writeFileSync(inF, buffer);
        const codec = detectVideoCodec(inF);
        if (codec === 'h264' || codec === 'avc' || codec === 'avc1') {
            return buffer; // already compatible — send as-is
        }
        transcodeH264(inF, outF);
        if (!fs.existsSync(outF) || !fs.statSync(outF).size) return buffer;
        return fs.readFileSync(outF);
    } catch (e) {
        console.error('[ffmpeg] ensureH264 failed, sending original:', e.message);
        return buffer;
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
}

module.exports = { isAvailable, ensureH264, BIN };
