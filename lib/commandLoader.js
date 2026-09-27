/**
 * Command Loader — walks commands/<category>/ folders and registers every
 * command module into a Map keyed by command name (plus aliases).
 *
 * Each command file must export:
 * {
 *     name: 'ping',
 *     aliases: ['p'],
 *     category: 'general',
 *     description: 'Check bot response time',
 *     usage: '.ping',
 *     ownerOnly: false,
 *     modOnly: false,
 *     groupOnly: false,
 *     privateOnly: false,
 *     adminOnly: false,
 *     botAdminNeeded: false,
 *     async execute(sock, message, args, extra) { ... }
 * }
 *
 * A file that throws at require() time is logged and skipped — one broken
 * command must never prevent the bot from booting.
 */

const fs = require('fs');
const path = require('path');

function loadCommands() {
    const commands = new Map();
    const commandsPath = path.join(__dirname, '..', 'commands');

    if (!fs.existsSync(commandsPath)) {
        console.error('❌ Commands directory not found:', commandsPath);
        return commands;
    }

    let loaded = 0;
    let failed = 0;

    for (const category of fs.readdirSync(commandsPath)) {
        const categoryPath = path.join(commandsPath, category);
        if (!fs.statSync(categoryPath).isDirectory()) continue;

        for (const file of fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'))) {
            const filePath = path.join(categoryPath, file);
            try {
                const command = require(filePath);

                if (!command || typeof command.name !== 'string' || typeof command.execute !== 'function') {
                    console.warn(`⚠️ Skipping ${category}/${file}: missing name or execute`);
                    failed++;
                    continue;
                }

                if (commands.has(command.name)) {
                    console.warn(`⚠️ Duplicate command name '${command.name}' in ${category}/${file} — keeping first`);
                    continue;
                }
                commands.set(command.name, command);

                for (const alias of command.aliases || []) {
                    if (commands.has(alias)) {
                        console.warn(`⚠️ Duplicate alias '${alias}' in ${category}/${file} — keeping first`);
                        continue;
                    }
                    commands.set(alias, command);
                }
                loaded++;
            } catch (error) {
                console.error(`❌ Failed to load command ${category}/${file}: ${error.message}`);
                failed++;
            }
        }
    }

    console.log(`✅ Loaded ${loaded} commands${failed ? ` (${failed} failed/skipped)` : ''}`);
    return commands;
}

module.exports = { loadCommands };
