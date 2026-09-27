const mumaker = require('mumaker');
const settings = require('../../settings');
const style = require('../../lib/messageStyle');

// Base channel info template — same newsletter branding as lib/messageConfig,
// unwrapped because this module passes it directly as `contextInfo:`.
const { channelInfo: baseChannelInfo } = require('../../lib/messageConfig');
const channelInfo = baseChannelInfo.contextInfo;

// Reusable message templates
const messageTemplates = {
    error: (message) => ({
        text: message,
        contextInfo: channelInfo
    }),
    success: (text, imageUrl) => ({
        image: { url: imageUrl },
        caption: `${text}\n⚡ ${settings.botName || 'Optimus Bot'}`,
        contextInfo: channelInfo
    })
};

async function textmakerCommand(sock, chatId, message, q, type) {
    try {
        if (!q) {
            return await sock.sendMessage(chatId, messageTemplates.error(buildUsageCard('Please provide text to generate.')));
        }

        // Extract text
        const text = q.split(' ').slice(1).join(' ');

        if (!text) {
            return await sock.sendMessage(chatId, messageTemplates.error(buildUsageCard('Please provide text to generate.')));
        }

        try {
            // The external text-image API takes a few seconds — show progress.
            await sock.sendMessage(chatId, messageTemplates.error(style.processing('Creating your text image')));

            let result;
            switch (type) {
                case 'metallic':
                    result = await mumaker.ephoto("https://en.ephoto360.com/impressive-decorative-3d-metal-text-effect-798.html", text);
                    break;
                case 'ice':
                    result = await mumaker.ephoto("https://en.ephoto360.com/ice-text-effect-online-101.html", text);
                    break;
                case 'snow':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-a-snow-3d-text-effect-free-online-621.html", text);
                    break;
                case 'impressive':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-3d-colorful-paint-text-effect-online-801.html", text);
                    break;
                case 'matrix':
                    result = await mumaker.ephoto("https://en.ephoto360.com/matrix-text-effect-154.html", text);
                    break;
                case 'light':
                    result = await mumaker.ephoto("https://en.ephoto360.com/light-text-effect-futuristic-technology-style-648.html", text);
                    break;
                case 'neon':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-colorful-neon-light-text-effects-online-797.html", text);
                    break;
                case 'devil':
                    result = await mumaker.ephoto("https://en.ephoto360.com/neon-devil-wings-text-effect-online-683.html", text);
                    break;
                case 'purple':
                    result = await mumaker.ephoto("https://en.ephoto360.com/purple-text-effect-online-100.html", text);
                    break;
                case 'thunder':
                    result = await mumaker.ephoto("https://en.ephoto360.com/thunder-text-effect-online-97.html", text);
                    break;
                case 'leaves':
                    result = await mumaker.ephoto("https://en.ephoto360.com/green-brush-text-effect-typography-maker-online-153.html", text);
                    break;
                case '1917':
                    result = await mumaker.ephoto("https://en.ephoto360.com/1917-style-text-effect-523.html", text);
                    break;
                case 'arena':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-cover-arena-of-valor-by-mastering-360.html", text);
                    break;
                case 'hacker':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-anonymous-hacker-avatars-cyan-neon-677.html", text);
                    break;
                case 'sand':
                    result = await mumaker.ephoto("https://en.ephoto360.com/write-names-and-messages-on-the-sand-online-582.html", text);
                    break;
                case 'blackpink':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-a-blackpink-style-logo-with-members-signatures-810.html", text);
                    break;
                case 'glitch':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-digital-glitch-text-effects-online-767.html", text);
                    break;
                case 'fire':
                    result = await mumaker.ephoto("https://en.ephoto360.com/flame-lettering-effect-372.html", text);
                    break;
                default:
                    return await sock.sendMessage(chatId, messageTemplates.error('⚠️ Invalid text generator type.'));
            }

            if (!result || !result.image) {
                throw new Error('No image URL received from the API');
            }

            await sock.sendMessage(chatId, messageTemplates.success(text, result.image));
        } catch (error) {
            console.error('Error in text generator:', error);
            await sock.sendMessage(chatId, messageTemplates.error(style.box('❌ TEXTMAKER FAILED', ["I couldn't generate the text image right now. Please try again."])));
        }
    } catch (error) {
        console.error('Error in textmaker command:', error);
        await sock.sendMessage(chatId, messageTemplates.error('❌ An error occurred. Please try again later.'));
    }
}

const TEXTMAKER_STYLES = ['metallic', 'ice', 'snow', 'impressive', 'matrix', 'light', 'neon', 'devil', 'purple', 'thunder', 'leaves', '1917', 'arena', 'hacker', 'sand', 'blackpink', 'glitch', 'fire'];

/** Boxed usage card listing the real syntax and the actual style names. */
function buildUsageCard(header) {
    const styleLines = [];
    for (let i = 0; i < TEXTMAKER_STYLES.length; i += 6) {
        styleLines.push(TEXTMAKER_STYLES.slice(i, i + 6).join(', '));
    }
    return style.box('🎨 TEXTMAKER', [
        ...(header ? [header, ''] : []),
        'Usage:',
        ' .textmaker <style> <text>',
        ' or .<style> <text> directly',
        '',
        'Available styles:',
        ...styleLines,
        '',
        'Tip: use .textmaker <style> <text> or .<style> <text>.'
    ]);
}

module.exports = {
    name: 'textmaker',
    aliases: TEXTMAKER_STYLES,
    category: 'textmaker',
    description: 'Generate stylized text logos (ephoto360)',
    usage: '.textmaker <style> <text> or .<style> <text>',
    ownerOnly: false,
    modOnly: false,
    groupOnly: false,
    privateOnly: false,
    adminOnly: false,
    botAdminNeeded: false,
    async execute(sock, message, args, extra) {
        let style = extra.commandName;
        let textArgs = args;
        if (style === 'textmaker') {
            style = (args[0] || '').toLowerCase();
            textArgs = args.slice(1);
            if (!TEXTMAKER_STYLES.includes(style)) {
                if (style) {
                    await sock.sendMessage(extra.chatId, {
                        text: `⚠️ Unknown text style: ${style}\n\nUse ${extra.prefix}textmaker to see available styles.`
                    }, { quoted: message });
                } else {
                    await sock.sendMessage(extra.chatId, {
                        text: buildUsageCard()
                    }, { quoted: message });
                }
                return;
            }
        }
        // textmakerCommand expects q where the first token is the command word
        const q = style + ' ' + textArgs.join(' ');
        await textmakerCommand(sock, extra.chatId, message, textArgs.length ? q : '', style);
    }
};