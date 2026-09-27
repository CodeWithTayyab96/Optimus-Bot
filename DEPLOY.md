# Deployment Guide

Everything a fresh host needs to run Optimus Bot — including the YouTube
download stack, which depends on a few external pieces.

---

## 1. Processes

The bot runs **two** processes:

| Process | What | Supervised by |
|---|---|---|
| **Bot** | `node index.js` | your host (pm2 / systemd / etc.) |
| **PO token provider** (bgutil) | Node HTTP server on `127.0.0.1:4416` | **the bot itself** (`lib/potSupervisor.js`) |

The bot spawns and auto-restarts the provider on boot — you do **not** start it
manually. If it crashes, the supervisor restarts it within ~2 s (the provider
then needs ~15–25 s to warm up before it serves tokens).

> If you prefer external supervision for both, see §6.

---

## 2. Host requirements

| Requirement | Why | Notes |
|---|---|---|
| **Node.js ≥ 22** | bot + PO token provider | provider `package.json` requires `node >= 22` |
| **Python ≥ 3.8 + pip** | yt-dlp + the PO token plugin | |
| **yt-dlp ≥ 2025.05.22** | YouTube downloads | the PO token plugin requires this minimum |
| **bgutil-ytdlp-pot-provider** (pip) | mints PO tokens for yt-dlp | `pip install -U bgutil-ytdlp-pot-provider` |
| **ffmpeg** | audio/video conversion | **bundled** via `ffmpeg-static`; see §5 |
| **git** | cloning the provider | one-time |

---

## 3. Setup

```bash
# 1. bot dependencies
npm install

# 2. yt-dlp + the PO token plugin (into the SAME python that runs yt-dlp)
pip install -U yt-dlp bgutil-ytdlp-pot-provider
yt-dlp --version            # must be >= 2025.05.22

# 3. the PO token provider (the bot will start this automatically)
git clone https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git \
  ~/bgutil-ytdlp-pot-provider
cd ~/bgutil-ytdlp-pot-provider/server
npm ci
npx tsc                     # produces build/main.js

# 4. configure (see §4), then run
cd /path/to/Optimus-Bot-main
node index.js
```

If you cloned the provider somewhere else, point the bot at it with
`POT_PROVIDER_DIR` (§4).

---

## 4. Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PROXIES` | *(empty = direct)* | comma-separated proxy URLs, e.g. `http://user:pass@1.2.3.4:8080,socks5://5.6.7.8:1080` |
| `POT_PROVIDER_DIR` | `~/bgutil-ytdlp-pot-provider/server` | where the provider was cloned |
| `POT_PROVIDER_PORT` | `4416` | provider listen port |
| `DL_HEALTH_INTERVAL_MS` | `1200000` (20 min) | health-check interval |
| `YTDLP_BIN` | `yt-dlp` | yt-dlp binary name/path |
| `FFMPEG_PATH` | *(auto)* | override ffmpeg (else `ffmpeg-static`, else PATH) |
| `NEXORACLE_API` / `NEXORACLE_KEY` | built-in | NexOracle endpoints (`.apk`) |
| `NASA_API_KEY` | `DEMO_KEY` | `.apod` |
| `TMDB_API_KEY` | placeholder | `.tmdb` |

Standard bot settings (owner number, prefix, etc.) live in `settings.js`.

---

## 5. ffmpeg

`ffmpeg-static` is a project dependency, so a working ffmpeg ships with the bot
and `lib/converter.js` uses it automatically. Resolution order:

1. `FFMPEG_PATH` (if set)
2. the bundled `ffmpeg-static` binary
3. `ffmpeg` on `PATH`

If you prefer a system ffmpeg, install it and set `FFMPEG_PATH` to its path.

---

## 6. Process supervision

The bot already supervises the PO token provider internally. To keep **the bot
itself** alive across crashes/reboots, use your host's supervisor.

### pm2 (recommended, cross-platform)

An `ecosystem.config.js` is provided. The provider is optional there — the bot
starts it itself — but running it as a second pm2 app is more explicit:

```bash
npm i -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup            # follow the printed command to enable boot start
```

### systemd (Linux)

```ini
[Unit]
Description=Optimus Bot
After=network.target

[Service]
WorkingDirectory=/path/to/Optimus-Bot-main
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

---

## 7. ⚠️ The `NODE_OPTIONS` gotcha

**Symptom** (yt-dlp fails to solve YouTube's challenges):

```
WARNING: [youtube] Signature solving failed / n challenge solving failed
Error running node process (returncode: 1): node:fs:440
Error: Access to this API has been restricted. Use --allow-fs-read to manage permissions.
```

**Cause:** some environments (sandboxes, managed hosts) inject a restrictive
`NODE_OPTIONS` — e.g. `--require=…/node-language-shim.cjs` — which locks down
node's filesystem API. yt-dlp spawns `node` to run its challenge-solver script,
and that child inherits `NODE_OPTIONS` and dies.

**Fix:** clear/override `NODE_OPTIONS` for the yt-dlp (and provider) processes.
The bot already does this automatically — `lib/ytdlp.js` and
`lib/potSupervisor.js` both strip `NODE_OPTIONS` from the environment they pass
to child processes. If you run yt-dlp by hand, do the same:

```bash
NODE_OPTIONS= yt-dlp --js-runtimes node --remote-components ejs:github …
```

---

## 8. Outbound network requirements

| Destination | Why |
|---|---|
| `github.com` | first-run download of the EJS challenge-solver script (cached after) |
| `youtube.com` / `googlevideo.com` | video/audio media |
| `127.0.0.1:4416` | the PO token provider (must **not** be routed through a proxy) |
| MediaFire / Instagram / NexOracle / yt-search hosts | the other download commands |

The bot sets `NO_PROXY` to include `127.0.0.1`/`localhost` so the local provider
is never proxied.

---

## 9. Health monitoring & alerting

- **`.dlstatus`** (owner-only) — runs every probe on demand and prints source
  status, the provider supervisor state, and the proxy pool.
- **Background monitor** — started automatically at boot; re-runs the same
  probes every `DL_HEALTH_INTERVAL_MS` and messages the **owner**
  (`settings.ownerNumber`) only when a source **changes state**
  (healthy → dead, or back). A source that stays broken does **not** re-alert.

Last-known state is kept in `data/dlHealthState.json`.

---

## 10. Troubleshooting

| Symptom | Check |
|---|---|
| `.song`/`.video` intermittent 403 | is the provider up? `.dlstatus` → "PO token provider (bgutil)" |
| `Requested format is not available` | transient; retry — the fallback chain absorbs it |
| `spawn ffmpeg ENOENT` | ffmpeg missing — `npm install` (ffmpeg-static) or set `FFMPEG_PATH` |
| `.threads` / `.capcut` say "not available" | expected — no working free source exists (see the command comments) |
| Slow downloads | a configured proxy is slow — check `.dlstatus` proxy lines |

---

## 11. Verifying reboot survival (do this on the real host)

A green `pm2 list` is **not** proof. `pm2 startup` + `pm2 save` fail silently if
they were run as a different user, or with a different `PM2_HOME`, than the
startup script uses. Verify for real:

```bash
pm2 start ecosystem.config.js
pm2 save                    # snapshot the process list
pm2 startup                 # prints a sudo command — RUN ITS EXACT OUTPUT
sudo reboot                 # a REAL reboot, not `pm2 kill` + `pm2 resurrect`
```

After it comes back, **without touching anything manually**:

```bash
pm2 list                    # optimus-bot (and bgutil-pot) should be "online"
```

then send the bot `.dlstatus` from WhatsApp and confirm the PO token provider
line is ✅ — a process that is "online" but can't reach WhatsApp is not a pass.

**If it does not come back**, diagnose in this order:

1. **Was the generated `pm2 startup` command actually executed?** It only prints
   a `sudo env PATH=…` line; nothing is enabled until you paste and run it.
2. **`PM2_HOME` mismatch** — `pm2 save` writes to `$PM2_HOME` (default
   `~/.pm2`). If you saved as root/sudo but the startup script runs as your user
   (or vice versa), the snapshot lives in the other home. Compare
   `pm2 report | grep PM2_HOME` with the `--hp` path in the startup command.
3. **Node not on the service's PATH** — that's why the generated command is
   prefixed with `env PATH=$PATH:…`. Verify `which node` as the service user.
4. **Init system** — `pm2 startup` should report `systemd`. On Windows it uses
   `pm2-windows-startup` instead; the systemd steps do not apply there.

> These steps were **not** executed in the development environment: that host is
> Windows 10 (no systemd), pm2 is not installed there, and the bot is not
> running there. Run them on the actual production host.
