/**
 * ffmpegPath — resolve the ffmpeg binary once.
 *
 * Order of preference:
 *   1. process.env.FFMPEG_PATH (explicit override)
 *   2. the bundled `ffmpeg-static` binary (ships with the bot)
 *   3. bare `ffmpeg` (hope it's on PATH)
 *
 * Commands that build an ffmpeg command STRING for child_process.exec run it
 * through a shell, so the binary path must be quoted when it contains spaces
 * (common on Windows / panel installs). Use `ffmpegBin()` for those strings and
 * `resolveFfmpeg()` when spawning with an args array (no shell).
 */
const fs = require('fs');

let cached = null;

function resolveFfmpeg() {
    if (cached) return cached;
    const candidates = [process.env.FFMPEG_PATH];
    try { candidates.push(require('ffmpeg-static')); } catch { /* not installed */ }
    for (const c of candidates) {
        if (typeof c === 'string' && c && fs.existsSync(c)) { cached = c; return cached; }
    }
    cached = 'ffmpeg'; // last resort: rely on PATH
    return cached;
}

/** ffmpeg path safe to embed in a shell command string (quoted if it has spaces). */
function ffmpegBin() {
    const p = resolveFfmpeg();
    return /\s/.test(p) ? `"${p}"` : p;
}

module.exports = { resolveFfmpeg, ffmpegBin };
