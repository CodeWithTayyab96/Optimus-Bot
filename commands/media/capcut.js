/**
 * .capcut — currently UNAVAILABLE (kept so it can be revived).
 *
 * Verified 2026-09-27: CapCut's template pages don't embed the template video
 * (only a landing promo), the old NexOracle route is gone (404), and the
 * public "capdownloader"-style services return the same landing video for every
 * template id. The GitHub CapCutAPI projects are video *editing* APIs, not
 * template downloaders.
 *
 * Rather than fail silently or with a raw error, the command returns a clear,
 * user-facing message. If a working method ever surfaces, restore the fetch
 * logic here.
 */
const style = require('../../lib/messageStyle');

const UNAVAILABLE =
    '*CapCut template downloads aren\'t available right now.*\n\n' +
    'No working free source exists at the moment — CapCut doesn\'t expose the template video in its ' +
    'page, and the public downloader services return the wrong video. The command stays in place so ' +
    'it can be re-enabled if a working method appears.';

module.exports = {
    name: 'capcut',
    aliases: ['capcutdl'],
    category: 'media',
    description: 'Download a CapCut template video (currently unavailable)',
    usage: '.capcut <capcut link>',
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
