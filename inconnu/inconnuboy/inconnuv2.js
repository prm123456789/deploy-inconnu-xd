import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pluginsDir = path.join(__dirname, '../../../plugins');

// Handler des messages
export async function Handler(m, sock, logger) {
  try {
    const message = m.messages[0];
    if (!message || !message.message) return;

    const from = message.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const isOwner = message.key.participant === sock.user.id || message.key.fromMe;
    const pushName = message.pushName || 'Utilisateur';

    const type = Object.keys(message.message)[0];
    const body = message.message?.conversation ||
                 message.message?.extendedTextMessage?.text ||
                 message.message?.imageMessage?.caption || '';

    const config = await import('../../../config.cjs').then(m => m.default || m);

    const prefix = config.PREFIX;
    if (!body.startsWith(prefix)) return;

    const args = body.trim().slice(prefix.length).split(/ +/);
    const cmdName = args.shift().toLowerCase();

    const files = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
    for (const file of files) {
      const { command } = await import(path.join(pluginsDir, file));
      if (command.name === cmdName) {
        return command.execute(message, sock, args, null, config);
      }
    }

  } catch (err) {
    console.error("⚠️ Handler Error:", err);
  }
}

// Handler des appels
export async function Callupdate(callEvent, sock) {
  try {
    for (const call of callEvent) {
      if (call.isGroup === false && call.status === "offer") {
        await sock.sendMessage(call.from, {
          text: `❌ Les appels ne sont pas autorisés. Tu vas être bloqué.`
        });
        await sock.updateBlockStatus(call.from, "block");
      }
    }
  } catch (e) {
    console.error("⚠️ Call handler error:", e);
  }
}

// Handler des modifications de groupe
export async function GroupUpdate(sock, group) {
  try {
    const metadata = await sock.groupMetadata(group.id);
    for (const participant of group.participants) {
      if (group.action === "add") {
        await sock.sendMessage(group.id, {
          text: `👋 Bienvenue @${participant.split("@")[0]} dans ${metadata.subject}!`,
          mentions: [participant]
        });
      } else if (group.action === "remove") {
        await sock.sendMessage(group.id, {
          text: `😢 Au revoir @${participant.split("@")[0]}`,
          mentions: [participant]
        });
      }
    }
  } catch (e) {
    console.error("⚠️ Group update error:", e);
  }
}
