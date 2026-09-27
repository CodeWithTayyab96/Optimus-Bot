/**
 * .threads — currently UNAVAILABLE (kept so it can be revived).
 *
 * Verified 2026-09-27: Threads serves posts from a client-rendered React app
 * whose initial HTML contains no post JSON (only bootloader/config), and there
 * is no free public API — Meta's Threads Graph API requires OAuth and the
 * third-party readers are paid. The old NexOracle route is gone (404).
 *
 * Rather than fail silently or with a raw error, the command returns a clear,
 * user-facing message. If a working method ever surfaces, restore the fetch
 * logic here.
 */
const style = require('../../lib/messageStyle');

const UNAVAILABLE =
    '*Threads downloads aren\'t available right now.*\n\n' +
    'There\'s no working free source at the moment — Threads renders posts in a client-side app ' +
    'and offers no free public API. The command stays in place so it can be re-enabled if a ' +
    'working method appears.';

module.exports = {
    name: 'threads',
    aliases: ['threadsdl'],
    category: 'media',
    description: 'Download a video from Threads (currently unavailable)',
    usage: '.threads <threads link>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await sock.sendMessage(extra.chatId, { text: style.error(UNAVAILABLE) }, { quoted: message });
    },
};
