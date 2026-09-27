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

const { spawn, spawnSync } = require('child_process')
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

    // Upstream has no "build" script; compiling with the local tsc is the
    // documented step and produces build/main.js. Resolve the local binary
    // rather than relying on npx being on PATH.
    const localTsc = path.join(serverDir, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc')
    const build = fs.existsSync(localTsc)
        ? spawnSync(localTsc, [], { cwd: serverDir, stdio: 'inherit', shell: USE_SHELL })
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

/** yt-dlp + its plugin live in python, outside npm's reach. Install if missing. */
function ensurePythonDeps() {
    if (hasCommand('yt-dlp')) {
        const res = spawnSync('yt-dlp', ['--version'], { encoding: 'utf8', shell: USE_SHELL })
        const version = (res.stdout || '').trim()
        // The version probe can legitimately fail (sandboxed spawn, wrapper
        // script). Report that it exists rather than printing nothing at all.
        say(version ? `yt-dlp ${version} (needs >= ${YTDLP_MIN})` : 'yt-dlp present (version unreadable)')
        return
    }

    if (NO_PYTHON) {
        warn('yt-dlp is missing and --no-python was given — .song/.video will not work.')
        return
    }

    const pip = hasCommand('pip') ? 'pip' : hasCommand('pip3') ? 'pip3' : null
    if (!pip) {
        warn(
            'yt-dlp is missing and pip was not found to install it.\n' +
                '            install python + pip, then: pip install -U yt-dlp bgutil-ytdlp-pot-provider'
        )
        return
    }

    say('yt-dlp not found — installing it and the PO token plugin via pip…')
    const pipArgs = ['install', '-U', 'yt-dlp', 'bgutil-ytdlp-pot-provider']
    let res = spawnSync(pip, pipArgs, { stdio: 'inherit', shell: USE_SHELL })

    // Externally-managed or permission-restricted pythons (PEP 668, system
    // python) reject a global install — retry into the user site instead.
    if (res.status !== 0) {
        say('global install refused — retrying with --user…')
        res = spawnSync(pip, [...pipArgs, '--user'], { stdio: 'inherit', shell: USE_SHELL })
    }

    if (res.status === 0 && hasCommand('yt-dlp')) {
        say('yt-dlp installed ✅')
    } else {
        warn(
            'could not install yt-dlp automatically — .song/.video will not work.\n' +
                '            try: pip install -U --user yt-dlp bgutil-ytdlp-pot-provider'
        )
    }
}

/** Non-fatal checks for things npm cannot provide. */
function preflight() {
    const major = Number(process.versions.node.split('.')[0])
    if (major < 22) {
        warn(`Node ${process.version} detected — this bot expects Node >= 22.`)
    }

    ensureProvider()
    ensurePythonDeps()

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

    const child = spawn(process.execPath, [entry, ...passthrough], {
        cwd: ROOT,
        stdio: 'inherit',
        windowsHide: false,
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

function main() {
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

    preflight()

    if (DEPS_ONLY) return

    say('starting Optimus Bot…')
    startBot()
}

main()
