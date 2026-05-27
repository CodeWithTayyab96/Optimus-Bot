const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { chat } = require('../lib/ai');
const { channelInfo } = require('../lib/messageConfig');
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
 * .study command — AI-powered document scanner
 * Usage: Reply to a document with .study (summary) or .study <question>
 */
async function studyCommand(sock, chatId, message) {
    try {
        // Extract user's question (text after .study)
        const msgText = message.message?.conversation?.trim()
            || message.message?.extendedTextMessage?.text?.trim()
            || message.message?.documentWithCaptionMessage?.message?.documentMessage?.caption?.trim()
            || '';
        const userQuestion = msgText.replace(/^\.\w+\s*/, '').trim();

        // Find the document — check quoted message first, then direct message
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const docMsg = quoted?.documentMessage
            || quoted?.documentWithCaptionMessage?.message?.documentMessage
            || message.message?.documentMessage
            || message.message?.documentWithCaptionMessage?.message?.documentMessage;

        if (!docMsg) {
            return await sock.sendMessage(chatId, {
                text: `📄 *Study Command — AI Document Scanner*\n\nReply to a document with:\n• \`.study\` — Get a full summary\n• \`.study <question>\` — Ask about the document\n\n*Supported formats:*\n📕 PDF files\n📘 Word documents (.docx)\n📝 Text files (.txt, .csv, .json)\n💻 Code files (.js, .py, .java, etc.)\n\n*Example:*\n> Reply to a PDF → \`.study what are the key points?\``,
                ...channelInfo
            }, { quoted: message });
        }

        // React to show processing
        await sock.sendMessage(chatId, {
            react: { text: '📄', key: message.key }
        });

        await sock.sendMessage(chatId, {
            text: '📄 Scanning document... Please wait.',
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
                text: '❌ Failed to download the document. Please try sending it again.',
                ...channelInfo
            }, { quoted: message });
        }

        if (!docBuffer || docBuffer.length === 0) {
            return await sock.sendMessage(chatId, {
                text: '❌ The document appears to be empty.',
                ...channelInfo
            }, { quoted: message });
        }

        // Extract text based on file type
        let extractedText = '';

        if (ext === '.pdf') {
            try {
                const pdfParse = require('pdf-parse');
                const data = await pdfParse(docBuffer);
                extractedText = data.text || '';
            } catch (pdfErr) {
                console.error('PDF parse error:', pdfErr.message);
                return await sock.sendMessage(chatId, {
                    text: '❌ Failed to read this PDF. It may be scanned/image-based or corrupted.',
                    ...channelInfo
                }, { quoted: message });
            }
        } else if (ext === '.docx') {
            try {
                const mammoth = require('mammoth');
                const result = await mammoth.extractRawText({ buffer: docBuffer });
                extractedText = result.value || '';
            } catch (docxErr) {
                console.error('DOCX parse error:', docxErr.message);
                return await sock.sendMessage(chatId, {
                    text: '❌ Failed to read this Word document. It may be corrupted or password-protected.',
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
                        text: `❌ Unsupported file type: *${ext || 'unknown'}*\n\nSupported: PDF, DOCX, TXT, CSV, JSON, and code files.`,
                        ...channelInfo
                    }, { quoted: message });
                }
            } catch {
                return await sock.sendMessage(chatId, {
                    text: `❌ Cannot read this file type: *${ext || 'unknown'}*`,
                    ...channelInfo
                }, { quoted: message });
            }
        }

        // Clean and validate extracted text
        extractedText = extractedText.replace(/\s+/g, ' ').trim();

        if (!extractedText || extractedText.length < 10) {
            return await sock.sendMessage(chatId, {
                text: '❌ No readable text found in this document. It may be an image-based PDF or empty file.',
                ...channelInfo
            }, { quoted: message });
        }

        // Truncate if too long
        const wasTruncated = extractedText.length > MAX_TEXT_LENGTH;
        if (wasTruncated) {
            extractedText = extractedText.slice(0, MAX_TEXT_LENGTH) + '...';
        }

        // Build AI prompt
        const systemPrompt = `You are an AI study assistant for Optimus Bot. You analyze documents and help users understand them. Be clear, concise, and well-structured in your responses. Use bullet points and headings where helpful. If the document is in a non-English language, respond in the same language.`;

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
                text: '❌ AI analysis failed. Please try again later.',
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
            text: '❌ Failed to analyze document. Please try again later.',
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = studyCommand;
