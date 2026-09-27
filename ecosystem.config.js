/**
 * pm2 process configuration.
 *
 * The bot supervises the PO token provider itself (lib/potSupervisor.js), so the
 * `bgutil-pot` app below is OPTIONAL — use it only if you prefer pm2 to own the
 * provider. If both run, the bot's supervisor detects the already-open port and
 * stands by, so there's no port fight.
 *
 *   pm2 start ecosystem.config.js
 *   pm2 save && pm2 startup
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROVIDER_DIR = process.env.POT_PROVIDER_DIR
    || path.join(os.homedir(), 'bgutil-ytdlp-pot-provider', 'server');
const PROVIDER_PORT = process.env.POT_PROVIDER_PORT || '4416';

// Only add the provider app when its compiled entry actually exists. Otherwise
// pm2 crash-loops it on any host where the provider lives elsewhere — and on
// those hosts the bot's built-in supervisor starts it instead.
const providerEntry = path.join(PROVIDER_DIR, 'build', 'main.js');
const providerApp = fs.existsSync(providerEntry)
    ? [{
        name: 'bgutil-pot',
        script: 'build/main.js',
        cwd: PROVIDER_DIR,
        args: `--port ${PROVIDER_PORT}`,
        autorestart: true,
        max_restarts: 50,
        restart_delay: 2000,
        // the restrictive NODE_OPTIONS shim breaks the provider's JS runtime
        env: { NODE_OPTIONS: '' },
    }]
    : [];
if (!providerApp.length) {
    console.warn(`[ecosystem] provider not found at ${providerEntry} — skipping the bgutil-pot app; the bot's internal supervisor will start it instead.`);
}

module.exports = {
    apps: [
        {
            name: 'optimus-bot',
            script: 'index.js',
            cwd: __dirname,
            autorestart: true,
            max_restarts: 50,
            restart_delay: 5000,
            env: { NODE_ENV: 'production' },
        },
        ...providerApp,
    ],
};
