/**
 * Optimus Bot — .readqr
 * Decode a QR code from an image.
 *
 * Provider: api.qrserver.com read endpoint (free, no API key).
 * Behaviour ported from Shadow MD (`drenox.js:9992`). The Optimus `.qr`
 * command only *generates* codes; this is the missing half.
 *
 * Usage: reply to an image containing a QR code with `.readqr`,
 * or send the image with `.readqr` as the caption.
 */
const axios = require('axios');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const style = require('../../lib/messageStyle');

const TIMEOUT = 20000;
const API = 'https://api.qrserver.com/v1/read-qr-code/';

/**
 * qrserver replies with either an array of results or a single object, and
 * puts the decoded text in symbol[0].data (with symbol[0].error set when the
 * image contained no readable code).
 * Exported for unit testing without network access.
 */
function parseResponse(data) {
    const first = Array.isArray(data) ? data[0] : data;
    const symbols = first?.symbol;
    if (!Array.isArray(symbols) || symbols.length === 0) return null;
    const hit = symbols.find(s => s && s.data && !s.error) || symbols[0];
    if (!hit || !hit.data) return null;
    return { text: String(hit.data), error: hit.error || null };
}

/** Pulls an image buffer out of the message or its quoted message. */
async function extractImageBuffer(message) {
    const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const node = quoted?.imageMessage || message?.message?.imageMessage;
    if (!node) return null;

    const stream = await downloadContentFromMessage(node, 'image');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    return buffer.length > 0 ? buffer : null;
}

/** Sends the image to the decoder. Returns { text, error } or null. */
async function decodeQr(buffer) {
    const form = new FormData();
    form.append('file', buffer, { filename: 'qr.png', contentType: 'image/png' });

    const res = await axios.post(API, form, {
        headers: form.getHeaders(),
        timeout: TIMEOUT,
        maxContentLength: 5 * 1024 * 1024
    });

    return parseResponse(res.data);
}

async function readqrCommand(sock, chatId, message) {
    try {
        let buffer = null;
        try {
            buffer = await extractImageBuffer(message);
        } catch (e) {
            console.error('[readqr] media download failed:', e.message);
        }

        if (!buffer) {
            return sock.sendMessage(chatId, {
                text: style.box('🔍 READ QR', [
                    'Usage:',
                    '• Reply to an image with .readqr',
                    '• Send an image with .readqr as the caption'
                ])
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, { text: style.processing('Scanning for a QR code') }, { quoted: message });

        const result = await decodeQr(buffer);

        if (!result || !result.text) {
            return sock.sendMessage(chatId, {
                text: style.error(result?.error || 'No QR code found in that image.')
            }, { quoted: message });
        }

        return sock.sendMessage(chatId, {
            text: style.box('🔍 QR CODE', [result.text])
        }, { quoted: message });
    } catch (error) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            return sock.sendMessage(chatId, {
                text: style.error('The QR decoder timed out. Please try again.')
            }, { quoted: message });
        }
        console.error('[readqr] Error:', error.message);
        return sock.sendMessage(chatId, {
            text: style.error('Could not decode that image. Make sure it contains a clear QR code.')
        }, { quoted: message });
    }
}

module.exports = {
    name: 'readqr',
    aliases: ['scanqr', 'qrread', 'decodeqr'],
    category: 'utility',
    description: 'Decode a QR code from an image',
    usage: '.readqr (reply to an image)',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await readqrCommand(sock, extra.chatId, message);
    },
    readqrCommand,
    parseResponse,
    decodeQr,
    extractImageBuffer,
};
