const { downloadContentFromMessage, downloadMediaMessage } = require('@whiskeysockets/baileys');
const store = require('../../lib/lightweight_store');

const ENVELOPES = ['viewOnceMessageV2', 'viewOnceMessageV2Extension', 'viewOnceMessage', 'ephemeralMessage'];

// Find the media node inside a (possibly wrapped) stored message.
function findMedia(content, depth = 0) {
  if (!content || depth > 10) return null;
  for (const [key, type] of [['imageMessage', 'image'], ['videoMessage', 'video'], ['audioMessage', 'audio']]) {
    if (content[key]) return { mtype: key, type, media: content[key] };
  }
  for (const k of ENVELOPES) {
    if (content[k]?.message) {
      const r = findMedia(content[k].message, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

function dmJid(message, senderId) {
  let jid = senderId || message.key.participant || message.key.remoteJid || '';
  if (String(jid).endsWith('@g.us')) {
    jid = message.key.participant || '';
  }
  return String(jid).replace(/:\d+@/, '@');
}

async function vv2Command(sock, chatId, message, senderId) {
  const fail = (text) => sock.sendMessage(chatId, { text }, { quoted: message });

  try {
    const ctx =
      message.message?.extendedTextMessage?.contextInfo ||
      message.message?.imageMessage?.contextInfo ||
      message.message?.videoMessage?.contextInfo ||
      message.message?.buttonsResponseMessage?.contextInfo ||
      message.message?.listResponseMessage?.contextInfo;

    if (!ctx?.quotedMessage) {
      return fail('🗑️ Reply to a *view-once* message.\nIt will be sent to your DM.');
    }

    const quotedMsg = ctx.quotedMessage;
    const hasViewOnce =
      !!quotedMsg.viewOnceMessageV2 ||
      !!quotedMsg.viewOnceMessageV2Extension ||
      !!quotedMsg.viewOnceMessage ||
      !!quotedMsg.viewOnce ||
      !!quotedMsg?.imageMessage?.viewOnce ||
      !!quotedMsg?.videoMessage?.viewOnce ||
      !!quotedMsg?.audioMessage?.viewOnce;

    if (!hasViewOnce) {
      return fail('❌ This is not a view-once message!');
    }

    let actualMsg = null;
    let mtype = null;

    if (quotedMsg.viewOnceMessageV2Extension?.message) {
      actualMsg = quotedMsg.viewOnceMessageV2Extension.message;
      mtype = Object.keys(actualMsg)[0];
    } else if (quotedMsg.viewOnceMessageV2?.message) {
      actualMsg = quotedMsg.viewOnceMessageV2.message;
      mtype = Object.keys(actualMsg)[0];
    } else if (quotedMsg.viewOnceMessage?.message) {
      actualMsg = quotedMsg.viewOnceMessage.message;
      mtype = Object.keys(actualMsg)[0];
    } else if (quotedMsg.imageMessage?.viewOnce) {
      actualMsg = { imageMessage: quotedMsg.imageMessage };
      mtype = 'imageMessage';
    } else if (quotedMsg.videoMessage?.viewOnce) {
      actualMsg = { videoMessage: quotedMsg.videoMessage };
      mtype = 'videoMessage';
    } else if (quotedMsg.audioMessage?.viewOnce) {
      actualMsg = { audioMessage: quotedMsg.audioMessage };
      mtype = 'audioMessage';
    }

    if (!actualMsg || !mtype) {
      return fail('❌ Unsupported view-once message type.');
    }

    const dest = dmJid(message, senderId);
    if (!dest || dest.endsWith('@g.us') || dest.endsWith('@broadcast')) {
      return fail('❌ Could not find your DM.');
    }

    let media = actualMsg[mtype];
    let downloadType =
      mtype === 'imageMessage' ? 'image' : mtype === 'videoMessage' ? 'video' : 'audio';
    let buffer;

    // WhatsApp often strips url/mediaKey from quoted view-once media: recover it
    // from the proactive cache / message store before trying to download.
    if (!media.url && !media.directPath && ctx.stanzaId) {
      const cached = store.loadCachedMedia && store.loadCachedMedia(ctx.stanzaId);
      if (cached?.buffer) {
        buffer = cached.buffer;
        media = { ...media, caption: cached.caption || media.caption };
      } else {
        const original = store.loadMessage && await store.loadMessage(chatId, ctx.stanzaId);
        const stored = original?.message && findMedia(original.message);
        if (stored) {
          media = stored.media;
          mtype = stored.mtype;
          downloadType = stored.type;
          actualMsg = { [mtype]: media };
        }
      }
    }

    if (!buffer) {
      try {
        const mediaStream = await downloadContentFromMessage(media, downloadType);
        const chunks = [];
        for await (const chunk of mediaStream) chunks.push(chunk);
        buffer = Buffer.concat(chunks);
      } catch (e) {
        // Last resort: ask WhatsApp to re-upload the media.
        if (typeof downloadMediaMessage !== 'function') throw e;
        buffer = await downloadMediaMessage(
          { key: { remoteJid: chatId, id: ctx.stanzaId, participant: ctx.participant }, message: quotedMsg },
          'buffer', {}, { reuploadRequest: sock.updateMediaMessage }
        );
      }
    }

    const caption = media.caption || '';
    const payload = /video/.test(mtype)
      ? { video: buffer, caption, mimetype: 'video/mp4' }
      : /image/.test(mtype)
        ? { image: buffer, caption, mimetype: 'image/jpeg' }
        : { audio: buffer, ptt: true, mimetype: 'audio/ogg; codecs=opus' };

    await sock.sendMessage(dest, payload);

    if (dest !== chatId) {
      await sock.sendMessage(chatId, { text: '✅ Sent to your DM.' }, { quoted: message });
    }
  } catch (error) {
    console.error('[vv2]', error?.message || error);
    await fail('❌ Error processing view-once message: ' + (error.message || 'Unknown error'));
  }
}

module.exports = {
    name: 'vv2',
    aliases: [],
    category: 'general',
    description: 'Recover a view-once message and send it to your DM so it stays private. Use .vv to re-send it in the same chat instead.',
    usage: '.vv2 (reply to a view-once image/video/audio)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await vv2Command(sock, extra.chatId, message, extra.senderId);
    },
};
