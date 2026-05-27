const settings = require('../settings');
const fs = require('fs');
const path = require('path');

async function helpCommand(sock, chatId, message) {
    const helpMessage = `
╭━━━━━━━━━━━━━━━━━━━━━╮
┃   🤖 *${settings.botName || 'Optimus Bot'}*
┃   ⚡ v${settings.version || '1.0.0'} • by *${settings.botOwner || 'Tayyab'}*
╰━━━━━━━━━━━━━━━━━━━━━╯

━━━━〔 🌐 *GENERAL* 〕━━━━
  ◈ .help / .menu / .ping / .alive
  ◈ .owner • .groupinfo • .staff
  ◈ .joke • .quote • .fact
  ◈ .weather <city> • .news
  ◈ .8ball <question>
  ◈ .lyrics <song> • .attp <text>
  ◈ .tts / .tovoice <text>
  ◈ .totext _(reply to voice)_
  ◈ .trt <text> <lang> • .ss <link>
  ◈ .vv • .jid • .url

━━━━〔 👮 *ADMIN* 〕━━━━
  ◈ .ban / .kick / .warn @user
  ◈ .promote / .demote @user
  ◈ .mute <min> • .unmute
  ◈ .delete / .del • .clear
  ◈ .tag / .tagall / .tagnotadmin
  ◈ .hidetag <msg> • .chatbot
  ◈ .antilink • .antibadword
  ◈ .antitag <on/off>
  ◈ .welcome / .goodbye <on/off>
  ◈ .resetlink • .warnings @user
  ◈ .setgname / .setgdesc / .setgpp

━━━━〔 🔒 *OWNER* 〕━━━━
  ◈ .mode <public/private>
  ◈ .setpp _(reply to image)_
  ◈ .autoreact / .autostatus <on/off>
  ◈ .autotyping / .autoread <on/off>
  ◈ .anticall / .antidelete <on/off>
  ◈ .pmblocker <on/off/status>
  ◈ .mention / .setmention <on/off>
  ◈ .clearsession • .cleartmp
  ◈ .update • .settings

━━━━〔 🤖 *AI* 〕━━━━
  ◈ .gpt <question>
  ◈ .gemini <question>
  ◈ .imagine <prompt>
  ◈ .study _(reply to doc)_
  ◈ .summarize / .tldr _(reply to msg)_

━━━━〔 🎯 *FUN ZONE* 〕━━━━
  ◈ .joke • .fact • .quote
  ◈ .truth • .dare • .riddle
  ◈ .flirt • .shayari • .advice
  ◈ .motivate / .motivation
  ◈ .roast @user
  ◈ .compliment / .insult @user
  ◈ .goodnight • .roseday
  ◈ .ship / .simp / .wasted @user
  ◈ .character / .stupid @user

━━━━〔 🎮 *GAMES* 〕━━━━
  ◈ .tictactoe @user
  ◈ .hangman • .guess <letter>
  ◈ .trivia • .answer <answer>

━━━━〔 🎨 *IMAGE & STICKER* 〕━━━━
  ◈ .sticker / .simage / .crop
  ◈ .blur • .removebg • .remini
  ◈ .meme • .take <packname>
  ◈ .tgsticker <link>
  ◈ .emojimix <e1>+<e2>
  ◈ .igs / .igsc <insta link>

━━━━〔 📥 *DOWNLOADER* 〕━━━━
  ◈ .play / .song <name>
  ◈ .video / .ytmp4 <link>
  ◈ .spotify <query>
  ◈ .instagram / .facebook / .tiktok <link>

━━━━〔 🔤 *TEXTMAKER* 〕━━━━
  ◈ .metallic • .ice • .snow • .neon
  ◈ .fire • .glitch • .matrix • .hacker
  ◈ .devil • .thunder • .purple • .light
  ◈ .impressive • .leaves • .arena
  ◈ .1917 • .sand • .blackpink

━━━━〔 🖼️ *PIES* 〕━━━━
  ◈ .pies <country>
  ◈ .china • .japan • .korea
  ◈ .indonesia • .hijab

━━━━〔 🧩 *MISC* 〕━━━━
  ◈ .heart • .circle • .lgbt • .gay
  ◈ .tweet • .ytcomment • .namecard
  ◈ .oogway • .comrade • .glass
  ◈ .jail • .passed • .triggered
  ◈ .horny • .lolice • .its-so-stupid

━━━━〔 🌸 *ANIME* 〕━━━━
  ◈ .hug • .kiss • .pat • .poke
  ◈ .nom • .cry • .wink • .facepalm

━━━━〔 💻 *GITHUB* 〕━━━━
  ◈ .git / .github / .repo / .sc

╭━━━━━━━━━━━━━━━━━━━━━╮
┃  📢 Join our channel for updates
╰━━━━━━━━━━━━━━━━━━━━━╯`;

    try {
        const imagePath = path.join(__dirname, '../assets/bot_image.jpg');

        if (fs.existsSync(imagePath)) {
            const imageBuffer = fs.readFileSync(imagePath);
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: helpMessage,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363000000000000@newsletter',
                        newsletterName: 'Optimus Bot',
                        serverMessageId: -1
                    }
                }
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, {
                text: helpMessage,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363000000000000@newsletter',
                        newsletterName: 'Optimus Bot',
                        serverMessageId: -1
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error in help command:', error);
        await sock.sendMessage(chatId, { text: helpMessage });
    }
}

module.exports = helpCommand;
