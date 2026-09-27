/**
 * Optimus Bot — .savecontact / .vcf
 * Export group participants as a VCF contact file.
 *
 * Uses Baileys groupMetadata to retrieve participants.
 * Generates a single vCard 3.0 file containing all contacts.
 */
const style = require('../../lib/messageStyle');

/** Escape special characters for vCard text fields. */
function vcardEscape(str) {
    if (!str) return '';
    return str
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

/** Extract a display-friendly phone number from a JID. */
function jidToPhone(jid) {
    if (!jid) return '';
    // Remove any :session suffix (e.g. 12345:4@s.whatsapp.net → 12345)
    const num = jid.split('@')[0].split(':')[0];
    return num;
}

/** Generate a vCard string for one participant. */
function makeVcard(name, phone) {
    return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${vcardEscape(name)}`,
        `TEL;TYPE=CELL:${phone}`,
        'END:VCARD'
    ].join('\r\n');
}

async function savecontactCommand(sock, chatId, message) {
    let metadata;
    try {
        metadata = await sock.groupMetadata(chatId);
    } catch (error) {
        console.error('[savecontact] Metadata error:', error);
        return sock.sendMessage(chatId, {
            text: style.error('Failed to fetch group metadata. Please try again.')
        }, { quoted: message });
    }

    const participants = metadata.participants || [];
    if (participants.length === 0) {
        return sock.sendMessage(chatId, {
            text: style.warning('No participants found in this group.')
        }, { quoted: message });
    }

    const groupName = metadata.subject || 'Group';
    const vcards = [];

    participants.forEach((p, i) => {
        const jid = p.id || p.jid || '';
        const phone = jidToPhone(jid);
        if (!phone) return;

        // Use notify/name if available, otherwise generate a label
        const displayName = (p.notify || p.name || '').trim();
        const name = displayName || `${groupName} Member ${i + 1}`;

        vcards.push(makeVcard(name, phone));
    });

    if (vcards.length === 0) {
        return sock.sendMessage(chatId, {
            text: style.warning('Could not extract phone numbers from group participants.')
        }, { quoted: message });
    }

    const vcfContent = vcards.join('\r\n');
    const buffer = Buffer.from(vcfContent, 'utf-8');
    const fileName = `${groupName.replace(/[^a-zA-Z0-9]/g, '_')}_contacts.vcf`;

    await sock.sendMessage(chatId, {
        document: buffer,
        mimetype: 'text/vcard',
        fileName: fileName
    }, { quoted: message });

    await sock.sendMessage(chatId, {
        text: style.success(`Exported ${vcards.length} contact(s) as ${fileName}`)
    }, { quoted: message });
}

module.exports = {
    name: 'savecontact',
    aliases: ['vcf', 'exportcontact', 'exportcontacts'],
    category: 'group',
    description: 'Export group participants as a VCF contact file',
    usage: '.savecontact',
    ownerOnly: false,
    modOnly: false,
    groupOnly: true,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await savecontactCommand(sock, extra.chatId, message);
    },
};
