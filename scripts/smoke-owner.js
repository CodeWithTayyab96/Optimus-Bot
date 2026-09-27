// Verifies lib/isOwner.js uses exact normalized identity comparison:
// real owner, sudo, normal user, and the regression case where a number
// merely CONTAINS the owner's digits (must NOT count as owner).
// Usage: node scripts/smoke-owner.js
const fs = require('fs');
const path = require('path');

const settings = require('../settings');
const isOwnerOrSudo = require('../lib/isOwner');
const { addSudo, removeSudo } = require('../lib/index');

const userGroupDataPath = path.join(process.cwd(), 'data', 'userGroupData.json');

let failures = 0;
function check(label, ok) {
    console.log(`${ok ? '✅' : '❌'} ${label}`);
    if (!ok) failures++;
}

(async () => {
    const backup = fs.existsSync(userGroupDataPath) ? fs.readFileSync(userGroupDataPath, 'utf8') : null;
    const sudoUser = '100000000099@s.whatsapp.net';
    const normalUser = '100000000098@s.whatsapp.net';

    try {
        // Ensure the sudo test starts clean
        await removeSudo(sudoUser);

        const ownerNumberClean = settings.ownerNumber.split(':')[0].split('@')[0];

        // --- Real owner (plain JID, device-suffixed JID, LID format) ---
        check('owner plain JID is owner', await isOwnerOrSudo(`${ownerNumberClean}@s.whatsapp.net`));
        check('owner device-suffixed JID is owner', await isOwnerOrSudo(`${ownerNumberClean}:1@s.whatsapp.net`));
        check('owner lid-format number is owner', await isOwnerOrSudo(`${ownerNumberClean}@lid`));

        // --- Substring regression: a different number containing the owner's digits ---
        const withLeadingDigit = '1' + ownerNumberClean; // e.g. 1923701609799 vs 923701609799
        check('number containing owner digits (leading 1) is NOT owner',
            (await isOwnerOrSudo(`${withLeadingDigit}@s.whatsapp.net`)) === false);
        const withTrailingDigit = ownerNumberClean + '0';
        check('number containing owner digits (trailing 0) is NOT owner',
            (await isOwnerOrSudo(`${withTrailingDigit}@s.whatsapp.net`)) === false);

        // --- Normal user is not owner ---
        check('normal user is not owner', (await isOwnerOrSudo(normalUser)) === false);

        // --- Sudo user is treated as owner/sudo ---
        await addSudo(sudoUser);
        check('sudo user is owner-or-sudo', await isOwnerOrSudo(sudoUser));
        await removeSudo(sudoUser);
        check('removed sudo user is no longer owner-or-sudo', (await isOwnerOrSudo(sudoUser)) === false);
    } finally {
        await removeSudo(sudoUser);
        if (backup !== null) fs.writeFileSync(userGroupDataPath, backup);
        else fs.rmSync(userGroupDataPath, { force: true });
    }

    console.log(failures === 0 ? '\n✅ All owner-identification checks passed' : `\n❌ ${failures} owner check(s) failed`);
    process.exit(failures === 0 ? 0 : 1);
})();
