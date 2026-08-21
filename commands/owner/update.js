/**
 * update.js - Katabump-compatible ZIP/Release updater
 * Replaces git-dependent update with a self-contained ZIP system.
 * Inspired by KnightBot-Mini, adapted for Optimus.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const settings = require('../../settings');
const isOwnerOrSudo = require('../../lib/isOwner');
const style = require('../../lib/messageStyle');
const { channelInfo } = require('../../lib/messageConfig');

const GITHUB_REPO = settings.githubRepo || 'https://github.com/CodeWithTayyab96/Optimus-Bot';
const GITHUB_API = 'https://api.github.com';
const MAX_REDIRECTS = 5;
const DOWNLOAD_TIMEOUT_MS = 120000;

const PROTECTED_PATHS = ['session', 'data', 'baileys_store.json', 'settings.js', 'version.json', 'tmp', 'temp', '.env', 'node_modules', '.git', '__tests__'];
const SKIP_DIRS = ['node_modules', '.git', 'session', 'tmp', 'temp', '__tests__', 'data'];

function run(cmd, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        exec(cmd, { windowsHide: true, timeout: timeoutMs }, (err, stdout, stderr) => {
            if (err) return reject(new Error((stderr || stdout || err.message || '').toString()));
            resolve((stdout || '').toString());
        });
    });
}

function downloadFile(url, dest, visited = new Set()) {
    return new Promise((resolve, reject) => {
        if (visited.has(url) || visited.size > MAX_REDIRECTS) return reject(new Error('Too many redirects'));
        visited.add(url);
        const client = url.startsWith('https') ? https : http;
        const timer = setTimeout(() => { req.destroy(); reject(new Error('Download timed out')); }, DOWNLOAD_TIMEOUT_MS);
        const req = client.get(url, { headers: { 'User-Agent': 'OptimusBot-Updater/1.0', 'Accept': '*/*' } }, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                clearTimeout(timer);
                const loc = res.headers.location;
                if (!loc) return reject(new Error('HTTP ' + res.statusCode + ' without Location'));
                res.resume();
                return downloadFile(new URL(loc, url).toString(), dest, visited).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) { clearTimeout(timer); res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { clearTimeout(timer); file.close(resolve); });
            file.on('error', err => { clearTimeout(timer); try { file.close(() => {}); } catch {} fs.unlink(dest, () => reject(err)); });
        });
        req.on('error', err => { clearTimeout(timer); fs.unlink(dest, () => reject(err)); });
    });
}

async function extractZip(zipPath, outDir) {
    if (process.platform === 'win32') {
        await run('powershell -NoProfile -Command "Expand-Archive -Path \'' + zipPath + '\' -DestinationPath \'' + outDir.replace(/\\/g, '/') + '\' -Force"', 60000);
        return;
    }
    try { await run('command -v unzip'); await run('unzip -o \'' + zipPath + '\' -d \'' + outDir + '\'', 60000); return; } catch {}
    try { await run('command -v 7z'); await run('7z x -y \'' + zipPath + '\' -o\'' + outDir + '\'', 60000); return; } catch {}
    try { await run('busybox unzip -h'); await run('busybox unzip -o \'' + zipPath + '\' -d \'' + outDir + '\'', 60000); return; } catch {}
    throw new Error('No unzip tool available (unzip/7z/busybox).');
}

function copyRecursive(src, dest, ignore = [], relative = '', outList = []) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
        if (ignore.some(p => p.includes('*') ? new RegExp('^' + p.replace(/\*/g, '.*') + '$').test(entry) : entry === p)) continue;
        const s = path.join(src, entry);
        const d = path.join(dest, entry);
        if (!path.resolve(d).startsWith(path.resolve(dest))) { console.warn('[update] SKIPPED (path traversal): ' + d); continue; }
        if (fs.lstatSync(s).isDirectory()) { copyRecursive(s, d, ignore, path.join(relative, entry), outList); }
        else { fs.copyFileSync(s, d); if (outList) outList.push(path.join(relative, entry).replace(/\\/g, '/')); }
    }
}

function backupRuntimeState() {
    const backupDir = path.join(process.cwd(), 'tmp', 'update-backup-' + Date.now());
    for (const rel of ['data', 'baileys_store.json', 'settings.js', 'version.json']) {
        const src = path.join(process.cwd(), rel);
        if (!fs.existsSync(src)) continue;
        const dest = path.join(backupDir, rel);
        if (fs.statSync(src).isDirectory()) copyRecursive(src, dest);
        else { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }
    }
    return backupDir;
}

function restoreRuntimeState(backupDir) {
    for (const rel of ['data', 'baileys_store.json', 'settings.js', 'version.json']) {
        const src = path.join(backupDir, rel);
        if (!fs.existsSync(src)) continue;
        const dest = path.join(process.cwd(), rel);
        fs.rmSync(dest, { recursive: true, force: true });
        if (fs.statSync(src).isDirectory()) copyRecursive(src, dest);
        else { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }
    }
}

function getInstalledVersion() {
    try { return require('../../version.json').version || '0.0.0'; } catch { return settings.version || '0.0.0'; }
}

function writeVersion(version) {
    try { fs.writeFileSync(path.join(process.cwd(), 'version.json'), JSON.stringify({ version, name: 'Optimus Bot', repository: GITHUB_REPO }, null, 2)); } catch (e) { console.error('[update] Failed to write version.json:', e.message); }
}

function packageJsonChanged(oldDir, newDir) {
    try { return fs.readFileSync(path.join(oldDir, 'package.json'), 'utf8') !== fs.readFileSync(path.join(newDir, 'package.json'), 'utf8'); } catch { return false; }
}

async function getLatestRelease() {
    const url = GITHUB_API + '/repos/CodeWithTayyab96/Optimus-Bot/releases/latest';
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'OptimusBot-Updater/1.0', 'Accept': 'application/vnd.github.v3+json' } }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 404) return resolve(null);
                if (res.statusCode !== 200) return reject(new Error('GitHub API: HTTP ' + res.statusCode));
                try { const r = JSON.parse(data); const z = (r.assets || []).find(a => a.name.endsWith('.zip')); resolve({ tag: r.tag_name, name: r.name || r.tag_name, body: r.body || '', zipUrl: z ? z.browser_download_url : null }); } catch (e) { reject(new Error('Failed to parse GitHub API: ' + e.message)); }
            });
        }).on('error', reject);
    });
}

function getTagZipUrl(tag) { return GITHUB_REPO + '/archive/refs/tags/' + tag + '.zip'; }
function getMainBranchZipUrl() { return settings.updateZipUrl || GITHUB_REPO + '/archive/refs/heads/main.zip'; }

async function performUpdate(sock, chatId, message, manualZipUrl) {
    const reply = async (text) => { await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message }); };
    const currentVersion = getInstalledVersion();
    console.log('[update] Current version: ' + currentVersion);

    let zipUrl = manualZipUrl;
    let latestVersion = null;

    if (!zipUrl) {
        await reply(style.processing('Checking for updates'));
        try {
            const release = await getLatestRelease();
            if (release) { latestVersion = release.tag; zipUrl = release.zipUrl || getTagZipUrl(release.tag); console.log('[update] Latest release: ' + latestVersion); }
            else { zipUrl = getMainBranchZipUrl(); latestVersion = currentVersion; console.log('[update] No releases found, using main branch ZIP'); }
        } catch (e) { console.error('[update] Failed to check releases:', e.message); zipUrl = getMainBranchZipUrl(); latestVersion = currentVersion; }
    }

    if (latestVersion && latestVersion === currentVersion && !manualZipUrl) {
        await reply('\u256d\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n\u2502\n\u2502 Current version: v' + currentVersion + '\n\u2502 Latest version:  v' + latestVersion + '\n\u2502\n\u2502 \u2705 Bot is already up to date.\n\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256f');
        return;
    }

    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, 'update.zip');
    const extractTo = path.join(tmpDir, 'update_extract');

    try {
        const vi = latestVersion ? 'v' + latestVersion : 'latest';
        await reply('\u256d\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n\u2502\n\u2502 Current: v' + currentVersion + '\n\u2502 Latest:  ' + vi + '\n\u2502\n\u2502 \u23f3 Downloading update...');
        console.log('[update] Downloading from: ' + zipUrl);
        await downloadFile(zipUrl, zipPath);
        console.log('[update] Downloaded: ' + (fs.statSync(zipPath).size / 1024).toFixed(1) + ' KB');

        await reply('\u2502 \u23f3 Extracting update...');
        if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
        await extractZip(zipPath, extractTo);

        const entries = fs.readdirSync(extractTo);
        const rootCandidate = entries.length === 1 ? path.join(extractTo, entries[0]) : extractTo;
        const srcRoot = fs.existsSync(rootCandidate) && fs.lstatSync(rootCandidate).isDirectory() ? rootCandidate : extractTo;

        for (const file of ['package.json', 'main.js', 'index.js']) {
            if (!fs.existsSync(path.join(srcRoot, file))) throw new Error('Invalid update: missing ' + file);
        }

        await reply('\u2502 \u23f3 Installing update...');
        const backupDir = backupRuntimeState();

        const copiedFiles = [];
        copyRecursive(srcRoot, process.cwd(), SKIP_DIRS, '', copiedFiles);
        console.log('[update] Replaced ' + copiedFiles.length + ' files');

        restoreRuntimeState(backupDir);

        if (latestVersion) writeVersion(latestVersion.replace(/^v/, ''));

        let depsChanged = false;
        try { depsChanged = packageJsonChanged(backupDir, process.cwd()); } catch {}
        if (!fs.existsSync(path.join(process.cwd(), 'node_modules'))) depsChanged = true;
        if (depsChanged) {
            await reply('\u2502 \u23f3 Installing dependencies...');
            console.log('[update] Running npm install...');
            try { await run('npm install --no-audit --no-fund --omit=dev', 180000); console.log('[update] npm install completed'); } catch (e) { console.error('[update] npm install failed:', e.message); }
        }

        try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
        try { fs.rmSync(zipPath, { force: true }); } catch {}
        try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch {}

        const nv = latestVersion || 'unknown';
        await reply('\u256d\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n\u2502\n\u2502 Updated: v' + currentVersion + ' \u2192 ' + nv + '\n\u2502 Files changed: ' + copiedFiles.length + '\n' + (depsChanged ? '\u2502 Dependencies: updated\n' : '\u2502 Dependencies: unchanged\n') + '\u2502\n\u2502 Restarting bot...\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256f');
        await restartProcess();
    } catch (err) {
        console.error('[update] Update failed:', err.message);
        try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
        try { fs.rmSync(zipPath, { force: true }); } catch {}
        await reply('\u256d\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n\u2502\n\u2502 \u274c Update could not be installed.\n\u2502\n\u2502 Your current installation\n\u2502 has NOT been modified.\n\u2502\n\u2502 Reason:\n\u2502 ' + err.message.substring(0, 200) + '\n\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256f');
    }
}

async function restartProcess() {
    try { await run('pm2 restart all', 10000); return; } catch {}
    setTimeout(() => { process.exit(0); }, 1000);
}

module.exports = {
    backupRuntimeState,
    restoreRuntimeState,
    PROTECTED_PATHS,
    name: 'update',
    aliases: ['upgrade'],
    category: 'owner',
    description: 'Update the bot from GitHub Releases (ZIP-based, no git required)',
    usage: '.update [zip_url]',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const senderId = message.key.participant || message.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, message.key.remoteJid);
        if (!message.key.fromMe && !isOwner) {
            await sock.sendMessage(extra.chatId, { text: style.permissionDenied('ownerOrSudo', { box: false }), ...channelInfo }, { quoted: message });
            return;
        }
        const zipArg = args[0] && args[0].startsWith('http') ? args[0] : '';
        await performUpdate(sock, extra.chatId, message, zipArg);
    },
};
