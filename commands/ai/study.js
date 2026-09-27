const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { chat, chatGeminiVision } = require('../../lib/ai');
const { channelInfo } = require('../../lib/messageConfig');
const style = require('../../lib/messageStyle');
const { getPrompt } = require('../../lib/aiHelpers');
const path = require('path');

// Supported text-based extensions (read as UTF-8 directly)
const TEXT_EXTENSIONS = [
    '.txt', '.csv', '.json', '.js', '.ts', '.py', '.java', '.c', '.cpp',
    '.h', '.html', '.css', '.xml', '.md', '.log', '.yaml', '.yml',
    '.ini', '.cfg', '.env', '.sh', '.bat', '.sql', '.rb', '.php',
    '.go', '.rs', '.swift', '.kt', '.dart'
];

const MAX_TEXT_LENGTH = 12000; // ~12k chars to stay within Groq context limits

/**
 * Best-effort analysis of a scanned / image-based PDF.
 *
 * Text extraction fails on image-only PDFs. When a PDF rasterizer is available
 * in the runtime we render pages to PNG and let Gemini (multimodal) read them.
 * If no rasterizer is present (this build) or Gemini is not configured, we
 * return null so the caller can show a clear, non-crashing message.
 *
 * No external upload of the document ever happens — everything stays local
 * except the (already centralized) Gemini call.
 *
 * @returns {Promise<string|null>} analysis text, or null if unavailable
 */
async function analyzeScannedPdf(docBuffer, userQuestion) {
    let render;
    try {
        render = require('pdf-to-img');
    } catch {
        return null; // rasterizer not installed in this build
    }

    try {
        const doc = await render(docBuffer, { scale: 1.5 });
        let pages = 0;
        for await (const page of doc) {
            const png = Buffer.isBuffer(page) ? page : page?.data || page;
            if (!Buffer.isBuffer(png)) continue;
            const analysis = await chatGeminiVision(
                'You are an AI study assistant for Optimus Bot. Analyze the document page and help the user understand it. Be clear, concise, and well-structured. Use bullet points and headings where helpful. Respond in Roman Urdu or English — match the language of the document or user question, or mix both naturally.',
                png,
                userQuestion
                    ? `User's question about the document: ${userQuestion}`
                    : 'Please provide: 1) a brief summary of this document, 2) key points or highlights, 3) any important details worth noting.',
                { mimeType: 'image/png', maxTokens: 2048 }
            );
            if (analysis) return analysis;
            if (++pages >= 3) break;
        }
        return null;
    } catch (e) {
        console.error('Scanned PDF analysis error:', e?.message || e);
        return null;
    }
}

/**
 * .study command — AI-powered document scanner
 * Usage: Reply to a document with .study (summary) or .study <question>
 */
async function studyCommand(sock, chatId, message, args, extra) {
    try {
        const userQuestion = getPrompt(args, message, extra.prefix);

        // Find the document — check quoted message first, then direct message
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const docMsg = quoted?.documentMessage
            || quoted?.documentWithCaptionMessage?.message?.documentMessage
            || message.message?.documentMessage
            || message.message?.documentWithCaptionMessage?.message?.documentMessage;

        if (!docMsg) {
            return await sock.sendMessage(chatId, {
                text: style.box('📄 AI STUDY', [
                    'Reply to a document with:',
                    `• ${extra.prefix}study — Get a full summary`,
                    `• ${extra.prefix}study <question> — Ask about the document`,
                    '',
                    'Supported formats:',
                    '📕 PDF files',
                    '📘 Word documents (.docx)',
                    '📝 Text files (.txt, .csv, .json)',
                    '💻 Code files (.js, .py, .java, etc.)',
                    '',
                    'Example:',
                    'Reply to a PDF → .study what are the key points?'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        // React to show processing
        await sock.sendMessage(chatId, {
            react: { text: '📄', key: message.key }
        });

        await sock.sendMessage(chatId, {
            text: style.processing('Scanning document...'),
            ...channelInfo
        }, { quoted: message });

        // Get filename and extension
        const fileName = docMsg.fileName || 'unknown';
        const ext = path.extname(fileName).toLowerCase();

        // Download the document
        const msgToDownload = quoted?.documentMessage
            ? { message: { documentMessage: quoted.documentMessage } }
            : quoted?.documentWithCaptionMessage
            ? { message: { documentMessage: quoted.documentWithCaptionMessage.message.documentMessage } }
            : message;

        let docBuffer;
        try {
            docBuffer = await downloadMediaMessage(msgToDownload, 'buffer', {}, {});
        } catch (dlErr) {
            console.error('Document download error:', dlErr.message);
            return await sock.sendMessage(chatId, {
                text: style.error('Failed to download the document. Please try sending it again.'),
                ...channelInfo
            }, { quoted: message });
        }

        if (!docBuffer || docBuffer.length === 0) {
            return await sock.sendMessage(chatId, {
                text: style.error('The document appears to be empty.'),
                ...channelInfo
            }, { quoted: message });
        }

        // Extract text based on file type
        let extractedText = '';
        let pdfFailed = false;

        if (ext === '.pdf') {
            try {
                const pdfParse = require('pdf-parse');
                const data = await pdfParse(docBuffer);
                extractedText = data.text || '';
            } catch (pdfErr) {
                console.error('PDF parse error:', pdfErr.message);
                pdfFailed = true;
            }
        } else if (ext === '.docx') {
            try {
                const mammoth = require('mammoth');
                const result = await mammoth.extractRawText({ buffer: docBuffer });
                extractedText = result.value || '';
            } catch (docxErr) {
                console.error('DOCX parse error:', docxErr.message);
                return await sock.sendMessage(chatId, {
                    text: style.error('Failed to read this Word document. It may be corrupted or password-protected.'),
                    ...channelInfo
                }, { quoted: message });
            }
        } else if (TEXT_EXTENSIONS.includes(ext)) {
            extractedText = docBuffer.toString('utf-8');
        } else {
            // Try reading as text anyway (unknown extension)
            try {
                const textAttempt = docBuffer.toString('utf-8');
                // Check if it looks like text (not binary)
                const nonPrintable = textAttempt.slice(0, 1000).replace(/[\x20-\x7E\n\r\t]/g, '').length;
                if (nonPrintable < 50) {
                    extractedText = textAttempt;
                } else {
                    return await sock.sendMessage(chatId, {
                        text: style.error(`Unsupported file type: ${ext || 'unknown'}.\n\nSupported: PDF, DOCX, TXT, CSV, JSON, and code files.`),
                        ...channelInfo
                    }, { quoted: message });
                }
            } catch {
                return await sock.sendMessage(chatId, {
                    text: style.error(`Cannot read this file type: ${ext || 'unknown'}.`),
                    ...channelInfo
                }, { quoted: message });
            }
        }

        // ---- Scanned / image-only PDF path ----
        if (ext === '.pdf' && (pdfFailed || extractedText.trim().length < 30)) {
            const scannedAnalysis = await analyzeScannedPdf(docBuffer, userQuestion);
            if (scannedAnalysis) {
                const header = `📄 *Study: ${fileName}* _(scanned — read via vision)_\n\n`;
                return await sock.sendMessage(chatId, {
                    text: header + scannedAnalysis,
                    ...channelInfo
                }, { quoted: message });
            }
            return await sock.sendMessage(chatId, {
                text: style.error('This PDF appears to be scanned / image-based and no text could be extracted. Install a PDF rasterizer (pdf-to-img) and configure Gemini to analyze scanned documents in this build.'),
                ...channelInfo
            }, { quoted: message });
        }

        // Clean and validate extracted text
        extractedText = extractedText.replace(/\s+/g, ' ').trim();

        if (!extractedText || extractedText.length < 10) {
            return await sock.sendMessage(chatId, {
                text: style.error('No readable text found in this document. It may be an image-based PDF or empty file.'),
                ...channelInfo
            }, { quoted: message });
        }

        // Truncate if too long
        const wasTruncated = extractedText.length > MAX_TEXT_LENGTH;
        if (wasTruncated) {
            extractedText = extractedText.slice(0, MAX_TEXT_LENGTH) + '...';
        }

        // Build AI prompt
        const systemPrompt = `You are an AI study assistant for Optimus Bot. You analyze documents and help users understand them. Be clear, concise, and well-structured in your responses. Use bullet points and headings where helpful. Respond in Roman Urdu or English — match the language of the document or user question, or mix both naturally.`;

        let userPrompt;
        if (userQuestion) {
            userPrompt = `Document "${fileName}":\n\n${extractedText}\n\n---\nUser's question: ${userQuestion}`;
        } else {
            userPrompt = `Document "${fileName}":\n\n${extractedText}\n\n---\nPlease provide:\n1. A brief summary of this document\n2. Key points or highlights\n3. Any important details worth noting`;
        }

        // Send to AI
        const analysis = await chat(systemPrompt, userPrompt, { maxTokens: 2048 });

        if (!analysis) {
            return await sock.sendMessage(chatId, {
                text: style.error('AI analysis failed. Please try again later.'),
                ...channelInfo
            }, { quoted: message });
        }

        // Format and send response
        const header = `📄 *Study: ${fileName}*${wasTruncated ? ' _(truncated)_' : ''}\n\n`;
        await sock.sendMessage(chatId, {
            text: header + analysis,
            ...channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('Error in study command:', error.message);
        await sock.sendMessage(chatId, {
            text: style.error('Failed to analyze the document. Please try again later.'),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'study',
    aliases: [],
    category: 'ai',
    description: 'AI study helper',
    usage: '.study <question>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        await studyCommand(sock, extra.chatId, message, args, extra);
    },

};
