const { exec } = require('child_process');
const style = require('../../lib/messageStyle');

module.exports = {
    name: 'restart',
    aliases: ['reboot'],
    category: 'owner',
    description: 'Restart the bot',
    usage: '.restart',
    ownerOnly: true,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        try {
            await extra.reply(style.processing('Restarting the bot'));

            const run = (cmd) =>
                new Promise((resolve, reject) => {
                    exec(cmd, (error, stdout, stderr) => {
                        if (error) reject(error);
                        else resolve(stdout || stderr);
                    });
                });

            try {
                // If running under PM2, this restarts the process
                await run('pm2 restart all');
                return;
            } catch (e) {
                console.log('PM2 not available, falling back to process.exit');
            }

            // Panels & nodemon usually restart the process on exit
            setTimeout(() => {
                process.exit(0);
            }, 500);
        } catch (error) {
            console.error('Restart error:', error);
            await extra.reply(style.error('Failed to restart the bot. Check the logs.'));
        }
    }
};
