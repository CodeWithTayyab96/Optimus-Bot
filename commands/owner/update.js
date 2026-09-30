const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const settings = require('../../settings');
const isOwnerOrSudo = require('../../lib/isOwner');
const style = require('../../lib/messageStyle');

const DEFAULT_REPO_URL = 'https://github.com/CodeWithTayyab96/Optimus-Bot.git';
const DEFAULT_BRANCH = 'main';

function run(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
            if (err) return reject(new Error((stderr || stdout || err.message || '').toString()));
            resolve((stdout || '').toString());
        });
    });
}

/** Repo URL + branch, overridable via settings.updateRepoUrl / UPDATE_REPO_URL. */
function repoConfig() {
    let url = DEFAULT_REPO_URL;
    let branch = DEFAULT_BRANCH;
    try {
        if (settings.updateRepoUrl) url = String(settings.updateRepoUrl);
        if (settings.updateBranch) branch = String(settings.updateBranch);
    } catch { /* ignore */ }
    if (process.env.UPDATE_REPO_URL) url = process.env.UPDATE_REPO_URL;
    if (process.env.UPDATE_BRANCH) branch = process.env.UPDATE_BRANCH;
    return { url, branch };
}

async function hasGitRepo() {
    const gitDir = path.join(process.cwd(), '.git');
    if (!fs.existsSync(gitDir)) return false;
    try {
        await run('git --version');
        return true;
    } catch {
        return false;
    }
}

// Runtime state that must survive an update. `data/` is fully runtime state
// (mode, warnings, bans, stats, AFK...) even though some files are committed
// as defaults; `git reset --hard` + `git clean -fd` would otherwise revert or
// delete them. settings.js is user configuration. baileys_store.json is the
// lightweight message store.
// `.env` MUST be protected. The repo ships a tracked placeholder `.env`, so
// `git reset --hard` checks that out over the panel's real `.env` and silently
// wipes every credential in it — including WARP=1, which is exactly how a
// working tunnel disappeared between two boots. Backing it up is what keeps
// config alive across updates.
const RUNTIME_BACKUP_PATHS = ['data', 'baileys_store.json', 'settings.js', '.env'];

function backupRuntimeState() {
    const backupDir = path.join(process.cwd(), 'tmp', `update-backup-${Date.now()}`);
    for (const rel of RUNTIME_BACKUP_PATHS) {
        const src = path.join(process.cwd(), rel);
        if (!fs.existsSync(src)) continue;
        const dest = path.join(backupDir, rel);
        if (fs.statSync(src).isDirectory()) {
            copyRecursive(src, dest, [], '', []);
        } else {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(src, dest);
        }
    }
    return backupDir;
}

function restoreRuntimeState(backupDir) {
    for (const rel of RUNTIME_BACKUP_PATHS) {
        const src = path.join(backupDir, rel);
        if (!fs.existsSync(src)) continue;
        const dest = path.join(process.cwd(), rel);
        fs.rmSync(dest, { recursive: true, force: true });
        if (fs.statSync(src).isDirectory()) {
            copyRecursive(src, dest, [], '', []);
        } else {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(src, dest);
        }
    }
}

/** Fetch upstream and compute the changelog WITHOUT touching the working tree. */
async function fetchUpstream() {
    const { url, branch } = repoConfig();
    const oldRev = (await run('git rev-parse HEAD').catch(() => 'unknown')).trim();
    await run(`git fetch ${url} ${branch}`);
    const newRev = (await run('git rev-parse FETCH_HEAD')).trim();
    const alreadyUpToDate = oldRev === newRev;

    let commits = '';
    let files = '';
    if (!alreadyUpToDate && oldRev !== 'unknown') {
        commits = await run(`git log --pretty=format:"%h %s (%an)" ${oldRev}..${newRev}`).catch(() => '');
        files = await run(`git diff --name-status ${oldRev} ${newRev}`).catch(() => '');
    }
    return { oldRev, newRev, alreadyUpToDate, commits, files };
}

/**
 * Update via git. `apply=false` is a dry run (fetch + compare only).
 */
async function updateViaGit(apply = true) {
    const info = await fetchUpstream();
    if (!apply) return info;

    const backupDir = backupRuntimeState();
    try {
        await run(`git reset --hard ${info.newRev}`);
        await run('git clean -fd');
        restoreRuntimeState(backupDir);
        return info;
    } finally {
        try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch { }
    }
}

/** Turn the git commit/file output into human-readable lines. */
function summarizeChanges(commits, files, maxCommits = 8) {
    const commitLines = String(commits || '').split('\n').map(l => l.trim()).filter(Boolean);
    const fileLines = String(files || '').split('\n').map(l => l.trim()).filter(Boolean);
    const lines = [];
    if (commitLines.length) {
        lines.push(`📦 ${commitLines.length} new commit(s):`);
        for (const c of commitLines.slice(0, maxCommits)) lines.push(`• ${c}`);
        if (commitLines.length > maxCommits) lines.push(`… and ${commitLines.length - maxCommits} more`);
    }
    if (fileLines.length) {
        lines.push('', `📝 ${fileLines.length} file(s) changed`);
    }
    return lines;
}

function downloadFile(url, dest, visited = new Set()) {
    return new Promise((resolve, reject) => {
        try {
            // Avoid infinite redirect loops
            if (visited.has(url) || visited.size > 5) {
                return reject(new Error('Too many redirects'));
            }
            visited.add(url);

            const useHttps = url.startsWith('https://');
            const client = useHttps ? require('https') : require('http');
            const req = client.get(url, {
                headers: {
                    'User-Agent': 'OptimusBot-Updater/1.0',
                    'Accept': '*/*'
                }
            }, res => {
                // Handle redirects
                if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                    const location = res.headers.location;
                    if (!location) return reject(new Error(`HTTP ${res.statusCode} without Location`));
                    const nextUrl = new URL(location, url).toString();
                    res.resume();
                    return downloadFile(nextUrl, dest, visited).then(resolve).catch(reject);
                }

                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode}`));
                }

                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
                file.on('error', err => {
                    try { file.close(() => {}); } catch {}
                    fs.unlink(dest, () => reject(err));
                });
            });
            req.on('error', err => {
                fs.unlink(dest, () => reject(err));
            });
        } catch (e) {
            reject(e);
        }
    });
}

async function extractZip(zipPath, outDir) {
    // Try to use platform tools; no extra npm modules required
    if (process.platform === 'win32') {
        const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir.replace(/\\/g, '/')}' -Force"`;
        await run(cmd);
        return;
    }
    // Linux/mac: try unzip, else 7z, else busybox unzip
    try {
        await run('command -v unzip');
        await run(`unzip -o '${zipPath}' -d '${outDir}'`);
        return;
    } catch {}
    try {
        await run('command -v 7z');
        await run(`7z x -y '${zipPath}' -o'${outDir}'`);
        return;
    } catch {}
    try {
        await run('busybox unzip -h');
        await run(`busybox unzip -o '${zipPath}' -d '${outDir}'`);
        return;
    } catch {}
    throw new Error("No system unzip tool found (unzip/7z/busybox). Git mode is recommended on this panel.");
}

function copyRecursive(src, dest, ignore = [], relative = '', outList = []) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
        if (ignore.includes(entry)) continue;
        const s = path.join(src, entry);
        const d = path.join(dest, entry);
        const stat = fs.lstatSync(s);
        if (stat.isDirectory()) {
            copyRecursive(s, d, ignore, path.join(relative, entry), outList);
        } else {
            fs.copyFileSync(s, d);
            if (outList) outList.push(path.join(relative, entry).replace(/\\/g, '/'));
        }
    }
}

/**
 * The archive URL for the configured repo+branch.
 *
 * ZIP mode previously required settings.updateZipUrl / UPDATE_ZIP_URL to be set
 * by hand, so on a panel that is not a git checkout `.update` simply failed with
 * "No ZIP URL configured" — even though the repo URL was already known. Deriving
 * it means ZIP mode works with no configuration, exactly like git mode does.
 */
function defaultZipUrl() {
    const { url, branch } = repoConfig();
    const base = String(url).replace(/\.git$/, '').replace(/\/+$/, '');
    return `${base}/archive/refs/heads/${branch}.zip`;
}

async function updateViaZip(sock, chatId, message, zipOverride) {
    const zipUrl = (zipOverride || settings.updateZipUrl || process.env.UPDATE_ZIP_URL || defaultZipUrl()).trim();
    if (!zipUrl) {
        throw new Error('No ZIP URL configured. Set settings.updateZipUrl or UPDATE_ZIP_URL env.');
    }
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, 'update.zip');
    await downloadFile(zipUrl, zipPath);
    const extractTo = path.join(tmpDir, 'update_extract');
    if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
    await extractZip(zipPath, extractTo);

    // Find the top-level extracted folder (GitHub zips create REPO-branch folder)
    const [root] = fs.readdirSync(extractTo).map(n => path.join(extractTo, n));
    const srcRoot = fs.existsSync(root) && fs.lstatSync(root).isDirectory() ? root : extractTo;

    // Copy over while preserving runtime dirs/files
    const ignore = ['node_modules', '.git', 'session', 'tmp', 'tmp/', 'temp', 'data', 'baileys_store.json'];
    const copied = [];
    // Preserve ownerNumber from existing settings.js if present
    let preservedOwner = null;
    let preservedBotOwner = null;
    try {
        const currentSettings = require('../../settings');
        preservedOwner = currentSettings && currentSettings.ownerNumber ? String(currentSettings.ownerNumber) : null;
        preservedBotOwner = currentSettings && currentSettings.botOwner ? String(currentSettings.botOwner) : null;
    } catch {}
    copyRecursive(srcRoot, process.cwd(), ignore, '', copied);
    if (preservedOwner) {
        try {
            const settingsPath = path.join(process.cwd(), 'settings.js');
            if (fs.existsSync(settingsPath)) {
                let text = fs.readFileSync(settingsPath, 'utf8');
                text = text.replace(/ownerNumber:\s*'[^']*'/, `ownerNumber: '${preservedOwner}'`);
                if (preservedBotOwner) {
                    text = text.replace(/botOwner:\s*'[^']*'/, `botOwner: '${preservedBotOwner}'`);
                }
                fs.writeFileSync(settingsPath, text);
            }
        } catch {}
    }
    // Cleanup extracted directory
    try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(zipPath, { force: true }); } catch {}
    return { copiedFiles: copied };
}

async function restartProcess() {
    try {
        // Preferred: PM2
        await run('pm2 restart all');
        return;
    } catch {}
    // Panels usually auto-restart when the process exits.
    // Exit after a short delay to allow the message to flush.
    setTimeout(() => {
        process.exit(0);
    }, 800);
}

async function updateCommand(sock, chatId, message, zipOverride, mode = 'update') {
    const senderId = message.key.participant || message.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

    if (!message.key.fromMe && !isOwner) {
        await sock.sendMessage(chatId, { text: style.permissionDenied('ownerOrSudo', { box: false }) }, { quoted: message });
        return;
    }

    // --- Dry run: .update check ---
    if (mode === 'check') {
        try {
            if (!(await hasGitRepo())) {
                return sock.sendMessage(chatId, { text: style.warning('Not a git checkout — "check" only works in git mode.') }, { quoted: message });
            }
            await sock.sendMessage(chatId, { text: style.processing('Checking for updates') }, { quoted: message });
            const info = await updateViaGit(false);
            const lines = info.alreadyUpToDate
                ? ['✅ Already up to date.', `🔖 ${info.newRev}`]
                : [`🆕 Update available!`, `🔖 ${info.oldRev} → ${info.newRev}`, '', ...summarizeChanges(info.commits, info.files)];
            await sock.sendMessage(chatId, { text: style.box('🔎 UPDATE CHECK', lines) }, { quoted: message });
        } catch (err) {
            console.error('Update check failed:', err.message || err);
            await sock.sendMessage(chatId, { text: style.error('Update check failed. Check the bot logs.') }, { quoted: message });
        }
        return;
    }

    // --- Apply the update ---
    try {
        await sock.sendMessage(chatId, { text: style.processing('Updating the bot') }, { quoted: message });

        let info = null;
        if (await hasGitRepo()) {
            info = await updateViaGit(true);
            await run('npm install --no-audit --no-fund');
        } else {
            await updateViaZip(sock, chatId, message, zipOverride);
        }

        const lines = [info && info.alreadyUpToDate ? '✅ Already up to date.' : '✅ Update applied.'];
        if (info) {
            lines.push(`🔖 ${info.newRev}`);
            if (!info.alreadyUpToDate) lines.push('', ...summarizeChanges(info.commits, info.files));
        }
        lines.push('', '♻️ Restarting…');

        await sock.sendMessage(chatId, { text: style.box('🚀 UPDATE', lines) }, { quoted: message });
        await restartProcess();
    } catch (err) {
        console.error('Update failed:', err);
        await sock.sendMessage(chatId, { text: style.error('Update failed. Check the bot logs for details.') }, { quoted: message });
    }
}

module.exports = {
    name: 'update',
    aliases: [],
    category: 'owner',
    description: 'Update the bot from the repository (.update check to preview first)',
    usage: '.update · .update check · .update <zip url>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        const first = (args[0] || '').toLowerCase();
        const mode = first === 'check' ? 'check' : 'update';
        const zipArg = args[0] && args[0].startsWith('http') ? args[0] : '';
        await updateCommand(sock, extra.chatId, message, zipArg, mode);
    },
    // Exported for testing.
    backupRuntimeState,
    restoreRuntimeState,
    RUNTIME_BACKUP_PATHS,
    summarizeChanges,
    repoConfig,
    defaultZipUrl,
    updateCommand,
};
