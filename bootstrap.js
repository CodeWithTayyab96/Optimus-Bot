#!/usr/bin/env node
/**
 * bootstrap.js — make sure the bot's dependencies exist, then start the bot.
 *
 * Why: on a fresh clone (or after pulling a change to package.json), `node
 * index.js` fails with "Cannot find module …". This wrapper installs what is
 * missing first, so a plain `node bootstrap.js` is always enough to get the bot
 * running on a clean host.
 *
 * Usage
 *   node bootstrap.js                install if needed, then start the bot
 *   node bootstrap.js --deps-only    install if needed, then exit (used by `prestart`)
 *   node bootstrap.js --check        report what would happen, change nothing
 *   node bootstrap.js --force-install  install even if the stamp says up to date
 *   node bootstrap.js --no-provider  skip installing the PO token provider
 *   node bootstrap.js --no-python    skip installing yt-dlp + its plugin
 *   node bootstrap.js --qr           extra flags are passed through to index.js
 *
 * Running it with no flags installs everything the bot needs and then starts it.
 * It is deliberately dependency-free: it must run before node_modules exists.
 */
'use strict'

const { spawn, spawnSync, execFile } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = __dirname
const NODE_MODULES = path.join(ROOT, 'node_modules')
const LOCKFILE = path.join(ROOT, 'package-lock.json')
const PKG_JSON = path.join(ROOT, 'package.json')
const STAMP = path.join(NODE_MODULES, '.optimus-deps.json')

const argv = process.argv.slice(2)
const DEPS_ONLY = argv.includes('--deps-only')
const CHECK_ONLY = argv.includes('--check')
const FORCE = argv.includes('--force-install')
const NO_PROVIDER = argv.includes('--no-provider')
// Python/yt-dlp is installed automatically when it is missing; --no-python opts
// out. --with-python is still accepted as a no-op so older docs keep working.
const NO_PYTHON = argv.includes('--no-python')
const passthrough = argv.filter(
    (a) =>
        ![
            '--deps-only',
            '--check',
            '--force-install',
            '--no-provider',
            '--no-python',
            '--with-python',
        ].includes(a)
)

// npm is a .cmd shim on Windows; spawning it without a shell throws EINVAL.
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const USE_SHELL = process.platform === 'win32'

const say = (msg) => console.log(`[bootstrap] ${msg}`)
const warn = (msg) => console.warn(`[bootstrap] ⚠️  ${msg}`)

/** sha256 of a file's contents, or null when it is unreadable. */
function hashFile(file) {
    try {
        return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    } catch {
        return null
    }
}

function readStamp() {
    try {
        return JSON.parse(fs.readFileSync(STAMP, 'utf8'))
    } catch {
        return null
    }
}

function writeStamp(lockHash, pkgHash) {
    try {
        fs.mkdirSync(NODE_MODULES, { recursive: true })
        fs.writeFileSync(
            STAMP,
            JSON.stringify(
                { lockHash, pkgHash, installedAt: new Date().toISOString(), node: process.version },
                null,
                2
            )
        )
    } catch (err) {
        warn(`could not write the dependency stamp: ${err.message}`)
    }
}

/** Every declared dependency that is not present on disk. */
function missingDeps() {
    let declared
    try {
        const pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'))
        declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    } catch (err) {
        warn(`could not read package.json: ${err.message}`)
        return []
    }

    const installed = new Set()
    try {
        for (const name of fs.readdirSync(NODE_MODULES)) {
            if (name.startsWith('@')) {
                for (const sub of fs.readdirSync(path.join(NODE_MODULES, name))) {
                    installed.add(`${name}/${sub}`)
                }
            } else if (!name.startsWith('.')) {
                installed.add(name)
            }
        }
    } catch {
        return declared
    }

    return declared.filter((name) => !installed.has(name))
}

/**
 * Decide whether an install is required, and which command to use.
 *
 * Hashing package.json + package-lock.json (not mtime) means a genuine
 * dependency change is detected, while a trivial re-save is not. The stamp is
 * only a fast path — `missingDeps()` is the correctness net, so a half-deleted
 * node_modules is still repaired.
 */
function plan() {
    const lockHash = hashFile(LOCKFILE)
    const pkgHash = hashFile(PKG_JSON)
    const stamp = readStamp()

    const hasModules = fs.existsSync(NODE_MODULES) && fs.readdirSync(NODE_MODULES).length > 0
    const lockMatches = Boolean(stamp && stamp.lockHash === lockHash)
    const pkgMatches = Boolean(stamp && stamp.pkgHash === pkgHash)

    if (FORCE) {
        return { needed: true, reason: 'forced with --force-install', cmd: 'install', lockHash, pkgHash }
    }
    if (!hasModules) {
        // Nothing installed yet: prefer a clean, lockfile-exact install.
        return {
            needed: true,
            reason: 'node_modules is missing or empty',
            cmd: lockHash ? 'ci' : 'install',
            lockHash,
            pkgHash,
        }
    }

    const missing = missingDeps()
    if (missing.length > 0) {
        const shown = missing.slice(0, 5).join(', ')
        const more = missing.length > 5 ? ` (+${missing.length - 5} more)` : ''
        return {
            needed: true,
            reason: `${missing.length} declared package(s) not installed: ${shown}${more}`,
            cmd: 'install',
            lockHash,
            pkgHash,
        }
    }

    if (!stamp) {
        return {
            needed: false,
            reason: 'existing node_modules verified against package.json',
            lockHash,
            pkgHash,
        }
    }
    if (!lockMatches) {
        return {
            needed: true,
            reason: 'package-lock.json changed since the last install',
            cmd: 'install',
            lockHash,
            pkgHash,
        }
    }
    if (!pkgMatches) {
        return {
            needed: true,
            reason: 'package.json changed since the last install',
            cmd: 'install',
            lockHash,
            pkgHash,
        }
    }
    return { needed: false, reason: 'dependencies are up to date', lockHash, pkgHash }
}

function runNpm(cmd) {
    const args = cmd === 'ci' ? ['ci', '--no-audit', '--no-fund'] : ['install', '--no-audit', '--no-fund']
    say(`running: npm ${args.join(' ')}`)
    const res = spawnSync(NPM, args, { cwd: ROOT, stdio: 'inherit', shell: USE_SHELL })

    if (res.error) {
        warn(`could not run npm: ${res.error.message}`)
        return false
    }
    if (res.status !== 0) {
        warn(`npm ${args[0]} exited with code ${res.status}`)
        return false
    }
    return true
}

/**
 * The PO token provider is NOT an npm dependency — it is a separate repository
 * that has to be cloned and compiled. Without it, .song/.video fall back to a
 * much slower path. `lib/potSupervisor.js` only *runs* it; nothing installed it,
 * which is why a fresh host logged "provider entry not found".
 */
const PROVIDER_REPO = 'https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git'
// The upstream default branch is `master`, not `main` — a `main` clone 404s.
const PROVIDER_BRANCH = 'master'
const YTDLP_MIN = '2025.05.22'

function providerServerDir() {
    return process.env.POT_PROVIDER_DIR || path.join(os.homedir(), 'bgutil-ytdlp-pot-provider', 'server')
}

function providerEntry() {
    return path.join(providerServerDir(), 'build', 'main.js')
}

function hasCommand(cmd) {
    const probe = process.platform === 'win32' ? 'where' : 'which'
    try {
        return spawnSync(probe, [cmd], { stdio: 'ignore', shell: USE_SHELL }).status === 0
    } catch {
        return false
    }
}

/** Clone + build the provider if it is not already usable. Never fatal. */
function ensureProvider() {
    const entry = providerEntry()

    if (fs.existsSync(entry)) {
        say(`PO token provider present (${entry})`)
        return
    }

    if (NO_PROVIDER) {
        warn('PO token provider missing and --no-provider was given — .song/.video will be slow.')
        return
    }

    if (!hasCommand('git')) {
        warn(
            'PO token provider is missing and git is not available to install it.\n' +
                `            expected: ${entry}\n` +
                '            install git, or set POT_PROVIDER_DIR to an existing provider.'
        )
        return
    }

    const serverDir = providerServerDir()
    const repoDir = path.dirname(serverDir) // <clone>/server
    say('PO token provider not found — installing it (one-time, this can take a few minutes)…')

    if (!fs.existsSync(repoDir)) {
        const clone = spawnSync(
            'git',
            ['clone', '--depth', '1', '--branch', PROVIDER_BRANCH, PROVIDER_REPO, repoDir],
            { stdio: 'inherit', shell: USE_SHELL }
        )
        if (clone.status !== 0) {
            warn(`could not clone the provider into ${repoDir} — .song/.video will be slow.`)
            return
        }
    }

    if (!fs.existsSync(path.join(serverDir, 'node_modules'))) {
        const ci = spawnSync(NPM, ['ci', '--no-audit', '--no-fund'], {
            cwd: serverDir,
            stdio: 'inherit',
            shell: USE_SHELL,
        })
        if (ci.status !== 0) {
            warn(`"npm ci" failed in ${serverDir} — the provider will not be available.`)
            return
        }
    }

    // Upstream has no "build" script; compiling with tsc is the documented step
    // and produces build/main.js. Run typescript's own entry point through node
    // rather than the .bin shim: the shim is a .cmd on Windows (needs a shell)
    // and shell spawning mangles paths containing spaces.
    const tscJs = path.join(serverDir, 'node_modules', 'typescript', 'bin', 'tsc')
    const build = fs.existsSync(tscJs)
        ? spawnSync(process.execPath, [tscJs], { cwd: serverDir, stdio: 'inherit' })
        : spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc'], {
              cwd: serverDir,
              stdio: 'inherit',
              shell: USE_SHELL,
          })

    if (build.status !== 0 || !fs.existsSync(entry)) {
        warn('could not build the provider — .song/.video will fall back to the slow path.')
        return
    }

    say(`PO token provider installed ✅ (${entry})`)
}

// ── yt-dlp ────────────────────────────────────────────────────
// yt-dlp is a *python* program, so npm cannot install it (putting it in the
// panel's NODE_PACKAGES field produces EUNKNOWNCONFIG). Most hosts have
// python + pip and the normal path works. Some containers — Pterodactyl node
// eggs especially — have neither, so fall back to yt-dlp's standalone binary,
// which bundles its own interpreter.
const STANDALONE_DIR = path.join(ROOT, '.tools')

// yt-dlp publishes a separate build per CPU architecture AND per libc. Picking
// the wrong one downloads a binary that downloads fine but cannot execute —
// which is indistinguishable from "yt-dlp is not installed" at the call site.
// Alpine-based containers are musl; nearly everything else is glibc.
function isMusl() {
    if (process.platform !== 'linux') return false
    try {
        if (fs.existsSync('/etc/alpine-release')) return true
        return fs.readdirSync('/lib').some((f) => f.startsWith('ld-musl-'))
    } catch {
        return false
    }
}

/** Candidate asset names for this host, best guess first. */
function standaloneAssetNames() {
    if (process.platform === 'win32') {
        return process.arch === 'arm64' ? ['yt-dlp_arm64.exe'] : ['yt-dlp.exe']
    }
    if (process.platform !== 'linux') return []
    // armv7l is published only as a .zip, so it cannot be used directly.
    if (process.arch === 'arm') return []

    const suffix = process.arch === 'arm64' ? '_aarch64' : ''
    const glibc = `yt-dlp_linux${suffix}`
    const musl = `yt-dlp_musllinux${suffix}`
    return isMusl() ? [musl, glibc] : [glibc, musl]
}

function standaloneUrl(asset) {
    return `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`
}

// Set when we fall back to the standalone binary, so the spawned bot inherits it.
let ytdlpOverride = null

function standalonePath() {
    return path.join(STANDALONE_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
}

/** Synchronous sleep — used between retries of an external probe. */
function sleepSync(ms) {
    try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
    } catch {
        const end = Date.now() + ms
        while (Date.now() < end) {
            /* busy wait fallback */
        }
    }
}

/**
 * Environment for spawning yt-dlp. PyInstaller onefile builds unpack themselves
 * into the temp dir on every run, so a noexec / read-only / tiny /tmp breaks the
 * binary while everything else works. Point TMPDIR at a writable dir inside the
 * project; keep the system default if that fails.
 */
const TMP_DIR = process.env.OPTIMUS_TMP_DIR || path.join(STANDALONE_DIR, 'tmp')

function tempEnv() {
    const env = { ...process.env }
    try {
        fs.mkdirSync(TMP_DIR, { recursive: true })
        fs.accessSync(TMP_DIR, fs.constants.W_OK)
        env.TMPDIR = TMP_DIR
        env.TEMP = TMP_DIR
        env.TMP = TMP_DIR
    } catch {
        /* fall back to the system temp dir */
    }
    return env
}

/** Run a command and capture its output. Async on purpose: `spawnSync` is
 *  blocked outright in some sandboxed environments (EBUSY), and blocking the
 *  event loop for a 90s probe buys nothing here. */
function runCapture(cmd, args, timeout) {
    return new Promise((resolve) => {
        const done = (err, stdout, stderr) =>
            resolve({
                failed: Boolean(err),
                code: err ? err.code : 0,
                stdout: stdout || '',
                stderr: stderr || '',
                message: err ? err.message : '',
            })

        // execFile can THROW synchronously rather than calling back (e.g. EINVAL
        // when the target is not a valid executable). Without this guard that
        // becomes an unhandled rejection and takes bootstrap down.
        try {
            execFile(cmd, args, { timeout, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, env: tempEnv() }, done)
        } catch (err) {
            resolve({ failed: true, code: err.code, stdout: '', stderr: '', message: err.message })
        }
    })
}

/**
 * Actually RUN a candidate. A successful download proves nothing: the wrong-arch
 * or wrong-libc build downloads perfectly and then fails to execute, which is
 * what made a present binary look missing. Returns the version on success, or a
 * human-readable reason on failure.
 *
 * Retries a couple of times — a freshly written binary can be briefly
 * un-spawnable while antivirus or the disk catches up.
 */
async function verifyYtdlp(bin, attempts = 3) {
    let last = { ok: false, why: 'never attempted' }
    for (let i = 1; i <= attempts; i++) {
        const res = await runCapture(bin, ['--version'], 90000)
        const out = String(res.stdout || '').trim()
        if (!res.failed && /^\d{4}\.\d{2}\.\d{2}/.test(out)) return { ok: true, version: out }
        const stderr = String(res.stderr || '').trim().split('\n').filter(Boolean).pop()
        last = { ok: false, why: stderr || res.message || `exit code ${res.code}` }
        if (i < attempts) sleepSync(2000)
    }
    return last
}

/** Every way of invoking pip we can think of, in preference order. */
function pipInvocations() {
    const out = []
    if (hasCommand('pip')) out.push(['pip'])
    if (hasCommand('pip3')) out.push(['pip3'])
    if (hasCommand('python3')) out.push(['python3', '-m', 'pip'])
    if (hasCommand('python')) out.push(['python', '-m', 'pip'])
    return out
}

/**
 * Print everything needed to explain why a yt-dlp binary will not run.
 *
 * Without this the console only said "version unreadable", which is
 * indistinguishable between: file missing, file not executable, wrong
 * architecture/libc, and an unwritable temp dir.
 */
function describeYtdlpFailure(bin, check) {
    const lines = [`path      : ${bin}`]
    try {
        const st = fs.statSync(bin)
        lines.push(`exists    : yes (${(st.size / 1048576).toFixed(1)} MB)`)
        const execBit = process.platform === 'win32' || Boolean(st.mode & 0o111)
        lines.push(`executable: ${execBit ? 'yes' : 'NO — the execute bit is not set'}`)
    } catch (err) {
        lines.push(`exists    : NO (${err.code || err.message})`)
    }
    const libc = process.platform === 'linux' ? ` (${isMusl() ? 'musl' : 'glibc'})` : ''
    lines.push(`platform  : ${process.platform}/${process.arch}${libc}`)
    lines.push(`TMPDIR    : ${tempEnv().TMPDIR || '(system default)'}`)
    if (check && check.why) lines.push(`error     : ${check.why}`)

    warn('yt-dlp could not be run — diagnosis:')
    for (const line of lines) say(`  ${line}`)
}

async function reportYtdlp() {
    const bin = ytdlpOverride || 'yt-dlp'
    const check = await verifyYtdlp(bin)
    // Say WHY it failed rather than a bare "version unreadable" — a wrong-libc
    // build is the common cause and the loader message names it.
    if (check.ok) {
        say(`yt-dlp ${check.version} (needs >= ${YTDLP_MIN})`)
    } else {
        describeYtdlpFailure(bin, check)
    }
}

async function downloadStandaloneYtdlp() {
    const dest = standalonePath()
    if (fs.existsSync(dest)) {
        say(`standalone yt-dlp already present (${dest})`)
        return dest
    }
    try {
        fs.mkdirSync(STANDALONE_DIR, { recursive: true })
    } catch {
        /* the download below will report the real failure */
    }

    const MIN_BYTES = 1024 * 1024 // the real binary is 17-38 MB; anything less is an error page
    const assets = standaloneAssetNames()

    if (assets.length === 0) {
        warn(`no standalone yt-dlp build for ${process.platform}/${process.arch} — .song/.video need python here.`)
        return null
    }

    for (const asset of assets) {
        say(`downloading ${asset} → ${dest}`)

        if (!(await fetchToFile(standaloneUrl(asset), dest, MIN_BYTES))) {
            warn(`could not download ${asset}`)
            continue
        }
        try {
            fs.chmodSync(dest, 0o755)
        } catch {
            /* no chmod on this platform */
        }

        // A successful download proves nothing — the wrong-arch or wrong-libc
        // build downloads perfectly and then fails to execute. Run it.
        const check = await verifyYtdlp(dest)
        if (check.ok) {
            const mb = (fs.statSync(dest).size / 1048576).toFixed(1)
            say(`standalone yt-dlp ${check.version} ready ✅ (${asset}, ${mb} MB)`)
            return dest
        }

        describeYtdlpFailure(dest, check)
        try {
            fs.rmSync(dest, { force: true })
        } catch {
            /* try the next candidate regardless */
        }
    }

    warn('no usable standalone yt-dlp build for this host — .song/.video will not work.')
    return null
}

/**
 * Download a URL to a file. Tries curl, then wget, then node's own fetch.
 *
 * NOTE: curl/wget run WITHOUT a shell on purpose. With `shell: true` the
 * argument array is flattened into a command line and never quoted, so a
 * destination path containing spaces gets split into several arguments and curl
 * fetches a fragment of the path instead of the file.
 */
async function fetchToFile(url, dest, minBytes) {
    const usable = () => {
        try {
            return fs.existsSync(dest) && fs.statSync(dest).size >= minBytes
        } catch {
            return false
        }
    }

    const downloaders = [
        {
            label: 'curl',
            cmd: process.platform === 'win32' ? 'curl.exe' : 'curl',
            args: ['-L', '--fail', '--silent', '--show-error', '--max-time', '600', '-o', dest, url],
        },
        { label: 'wget', cmd: 'wget', args: ['-q', '--timeout=600', '-O', dest, url] },
    ]

    for (const { label, cmd, args } of downloaders) {
        if (!hasCommand(label)) continue
        say(`trying ${label}…`)
        spawnSync(cmd, args, { stdio: 'inherit' })
        if (usable()) return true
    }

    try {
        say('trying node fetch…')
        const res = await fetch(url, { redirect: 'follow' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < minBytes) throw new Error(`suspiciously small (${buf.length} bytes)`)
        fs.writeFileSync(dest, buf)
        return usable()
    } catch (err) {
        warn(`fetch failed: ${err.message}`)
        return false
    }
}

/**
 * Locate a usable yt-dlp executable.
 * `pip install --user` drops the script in ~/.local/bin, which is usually NOT on
 * the container's PATH — so a successful install can still look like a failure
 * if you only test `hasCommand('yt-dlp')`.
 */
function findYtdlpBinary() {
    if (hasCommand('yt-dlp')) return 'yt-dlp'
    const exe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    const candidate = path.join(os.homedir(), '.local', 'bin', exe)
    try {
        if (fs.existsSync(candidate)) return candidate
    } catch {
        /* fall through */
    }
    return null
}

/**
 * Debian and Ubuntu build python without pip AND disable `ensurepip`, so the
 * only way to get pip is the official bootstrap script.
 */
async function bootstrapPipWithScript(pythonCmd) {
    const script = path.join(os.tmpdir(), 'optimus-get-pip.py')
    try {
        const res = await fetch('https://bootstrap.pypa.io/get-pip.py', { redirect: 'follow' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < 1024) throw new Error(`suspiciously small (${buf.length} bytes)`)
        fs.writeFileSync(script, buf)
    } catch (err) {
        warn(`could not download get-pip.py: ${err.message}`)
        return false
    }

    const res = spawnSync(pythonCmd, [script, '--user'], { stdio: 'inherit', shell: USE_SHELL })
    try {
        fs.rmSync(script, { force: true })
    } catch {
        /* leave it if it cannot be removed */
    }
    return res.status === 0
}

/** yt-dlp + its plugin live in python, outside npm's reach. Install if missing. */
async function ensurePythonDeps() {
    if (hasCommand('yt-dlp')) {
        // A PATH yt-dlp (pip-installed) can load the bgutil PO-token plugin, so
        // prefer it and drop any standalone binary downloaded on an earlier run.
        // Otherwise both exist and lib/ytdlp.js would pick the lesser one.
        const stale = standalonePath()
        if (fs.existsSync(stale)) {
            try {
                fs.rmSync(stale, { force: true })
                say('a full yt-dlp install is available — removed the standalone binary.')
            } catch {
                /* not fatal */
            }
        }
        await reportYtdlp()
        return
    }

    // A standalone binary from an earlier run counts as installed — but only if
    // it actually RUNS. A wrong-libc or wrong-arch build must be replaced, not
    // trusted, or a host that once downloaded the wrong one stays broken
    // forever (this is exactly how the panel got stuck on "version unreadable").
    const standalone = standalonePath()
    if (fs.existsSync(standalone)) {
        const check = await verifyYtdlp(standalone)
        if (check.ok) {
            ytdlpOverride = standalone
            await reportYtdlp()
            return
        }
        describeYtdlpFailure(standalone, check)
        say('replacing it with a fresh download…')
        try {
            fs.rmSync(standalone, { force: true })
        } catch {
            /* the download below overwrites it anyway */
        }
    }

    if (NO_PYTHON) {
        warn('yt-dlp is missing and --no-python was given — .song/.video will not work.')
        return
    }

    // Building an invocation is not the same as it working: Debian/Ubuntu often
    // ship `python3` with NO pip module at all, and `python3 -m pip` then exits
    // with "No module named pip". Probe before trusting a candidate — the old
    // check only tested whether the command existed, so ensurepip never ran.
    const pipWorks = (inv) => {
        const [cmd, ...pre] = inv
        return spawnSync(cmd, [...pre, '--version'], { stdio: 'ignore', shell: USE_SHELL }).status === 0
    }

    const pythonCmd = hasCommand('python3') ? 'python3' : hasCommand('python') ? 'python' : null
    let pips = pipInvocations().filter(pipWorks)

    // No *working* pip, but python is present → try to create one.
    if (pips.length === 0 && pythonCmd) {
        say('python found but pip is unavailable — trying `ensurepip`…')
        spawnSync(pythonCmd, ['-m', 'ensurepip', '--upgrade'], { stdio: 'inherit', shell: USE_SHELL })
        pips = pipInvocations().filter(pipWorks)
    }

    // Debian/Ubuntu disable ensurepip in their python builds, so fall back to
    // the official get-pip bootstrap script.
    if (pips.length === 0 && pythonCmd) {
        say('`ensurepip` did not work — trying the official get-pip.py bootstrap…')
        if (await bootstrapPipWithScript(pythonCmd)) pips = pipInvocations().filter(pipWorks)
    }

    if (pips.length > 0) {
        const base = ['install', '-U', 'yt-dlp', 'bgutil-ytdlp-pot-provider']
        for (const inv of pips) {
            const [cmd, ...pre] = inv
            say(`installing yt-dlp + its plugin via ${inv.join(' ')}…`)
            let res = spawnSync(cmd, [...pre, ...base], { stdio: 'inherit', shell: USE_SHELL })

            // Externally-managed or permission-restricted pythons (PEP 668,
            // system python) reject a global install — retry into the user site.
            if (res.status !== 0) {
                say('global install refused — retrying with --user…')
                res = spawnSync(cmd, [...pre, ...base, '--user'], { stdio: 'inherit', shell: USE_SHELL })
            }

            // A --user install lands in ~/.local/bin, which is usually NOT on
            // PATH — so `hasCommand` alone would wrongly report failure.
            const found = findYtdlpBinary()
            if (found) {
                if (found !== 'yt-dlp') ytdlpOverride = found
                say(`yt-dlp installed ✅ with the PO-token plugin (${found})`)
                return
            }
        }
    }

    // No usable python at all → standalone binary (bundles its own interpreter).
    warn('no usable python/pip on this host — falling back to the standalone yt-dlp binary.')
    const got = await downloadStandaloneYtdlp()
    if (got) {
        ytdlpOverride = got
        warn(
            'using the standalone binary. NOTE: the bgutil PO-token plugin is a PYTHON\n' +
                '            plugin, so without python some YouTube videos may still fail.'
        )
    } else {
        warn('yt-dlp is unavailable — .song/.video will not work on this host.')
    }
}

/** Non-fatal checks for things npm cannot provide. */
async function preflight() {
    const major = Number(process.versions.node.split('.')[0])
    if (major < 22) {
        warn(`Node ${process.version} detected — this bot expects Node >= 22.`)
    }

    ensureProvider()
    await ensurePythonDeps()

    try {
        require.resolve('ffmpeg-static', { paths: [ROOT] })
    } catch {
        warn('ffmpeg-static is not installed — audio/video conversion will fail.')
    }
}

function startBot() {
    const entry = path.join(ROOT, 'index.js')
    if (!fs.existsSync(entry)) {
        console.error(`[bootstrap] index.js not found at ${entry}`)
        process.exit(1)
    }

    // Hand the bot the yt-dlp we actually resolved. lib/ytdlp.js reads
    // YTDLP_BIN at module load, so the standalone fallback only works if the
    // child inherits it.
    const env = { ...process.env }
    if (ytdlpOverride) env.YTDLP_BIN = ytdlpOverride

    const child = spawn(process.execPath, [entry, ...passthrough], {
        cwd: ROOT,
        stdio: 'inherit',
        windowsHide: false,
        env,
    })

    child.on('error', (err) => {
        console.error(`[bootstrap] failed to start the bot: ${err.message}`)
        process.exit(1)
    })
    child.on('exit', (code, signal) => {
        if (signal) {
            console.log(`[bootstrap] bot stopped by ${signal}`)
            process.exit(1)
        }
        process.exit(code ?? 0)
    })

    // Forward Ctrl-C / termination to the bot so it can close the socket cleanly.
    for (const sig of ['SIGINT', 'SIGTERM']) {
        process.on(sig, () => {
            try {
                child.kill(sig)
            } catch {
                /* already gone */
            }
        })
    }
}

async function main() {
    const p = plan()

    if (CHECK_ONLY) {
        say(`node_modules: ${fs.existsSync(NODE_MODULES) ? 'present' : 'missing'}`)
        say(`decision: ${p.needed ? `WOULD INSTALL (${p.reason})` : 'no install needed'}`)
        if (p.needed) say(`command:  npm ${p.cmd === 'ci' ? 'ci' : 'install'} --no-audit --no-fund`)
        return
    }

    if (p.needed) {
        say(`installing dependencies — ${p.reason}`)
        const ok = runNpm(p.cmd)

        // `npm ci` refuses to run when the lockfile and package.json disagree.
        // Fall back to a resolving install rather than leaving the host broken.
        const okFinal = ok || (p.cmd === 'ci' && runNpm('install'))

        if (!okFinal) {
            console.error('[bootstrap] dependency installation failed — cannot start the bot.')
            process.exit(1)
        }
        writeStamp(p.lockHash, p.pkgHash)
        say('dependencies installed ✅')
    } else {
        say(p.reason)
        // Record the verified state so later runs can skip the deep check.
        if (p.lockHash) writeStamp(p.lockHash, p.pkgHash)
    }

    await preflight()

    if (DEPS_ONLY) return

    say('starting Optimus Bot…')
    startBot()
}

main().catch((err) => {
    console.error(`[bootstrap] unexpected failure: ${err && err.stack ? err.stack : err}`)
    process.exit(1)
})
