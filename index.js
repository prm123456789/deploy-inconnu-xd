import dotenv from 'dotenv';
dotenv.config();

import {
  makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';

import { Handler, Callupdate, GroupUpdate } from './inconnu/inconnuboy/inconnuv2.js';
import pino from 'pino';
import fs from 'fs';
import NodeCache from 'node-cache';
import path from 'path';
import chalk from 'chalk';
import axios from 'axios';
import config from './config.cjs';
import autoreact from './lib/autoreact.cjs';
import { fileURLToPath } from 'url';
import { File } from 'megajs';

const { emojis, doReact } = autoreact;

let useQR = false;
let initialConnection = true;

const MAIN_LOGGER = pino({
  timestamp: () => `,"time":"${new Date().toJSON()}"`
});
const logger = MAIN_LOGGER.child({});
logger.level = 'trace';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

// Télécharger les identifiants MEGA pour la session
async function downloadSessionData() {
  console.log("🔍 SESSION_ID fourni :", config.SESSION_ID);
  if (!config.SESSION_ID) {
    console.error("❌ SESSION_ID manquant dans .env ou config.cjs !");
    return false;
  }

  const sessionEncoded = config.SESSION_ID.split("INCONNU")[1];
  if (!sessionEncoded || !sessionEncoded.includes('#')) {
    console.error("❌ Format SESSION_ID invalide. Attendu : INCONNU<fileId>#<key>");
    return false;
  }

  const [fileId, decryptionKey] = sessionEncoded.split('#');
  try {
    console.log("🔄 Téléchargement de la session...");
    const sessionFile = File.fromURL(`https://mega.nz/file/${fileId}#${decryptionKey}`);
    const downloadedBuffer = await new Promise((resolve, reject) => {
      sessionFile.download((error, data) => {
        if (error) reject(error);
        else resolve(data);
      });
    });

    await fs.promises.writeFile(credsPath, downloadedBuffer);
    console.log("🔐 Session téléchargée avec succès !");
    return true;

  } catch (error) {
    console.error("❌ Erreur lors du téléchargement de la session :", error);
    return false;
  }
}

// Fonction principale
async function start() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`🤖 INCONNU-XD utilise WA v${version.join('.')} | isLatest: ${isLatest}`);

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: useQR,
      browser: ['INCONNU-XD', 'Safari', '3.3'],
      auth: state,
      getMessage: async key => ({})
    });

    sock.ev.on("connection.update", async update => {
      const { connection, lastDisconnect } = update;
      if (connection === "close") {
        if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
          start();
        }
      } else if (connection === "open") {
        if (initialConnection) {
          console.log(chalk.green("✅ INCONNU-XD connecté avec succès !"));

          // Newsletter
          await sock.newsletterFollow("120363397722863547@newsletter");

          // Auto group join
          try {
            const inviteCode = "LtdbziJQbmj48sbO05UZZJ";
            await sock.groupAcceptInvite(inviteCode);
            console.log(chalk.green("✅ Groupe rejoint avec succès !"));
          } catch (e) {
            console.error("❌ Erreur lors du join group:", e);
          }

          await sock.sendMessage(sock.user.id, {
            image: { url: 'https://i.postimg.cc/BvY75gbx/IMG-20250625-WA0221.jpg' },
            caption: `

HELLO INCONNU XD V2 USER (${sock.user.name || 'Unknown'})

╔═════════════════
║ INCONNU XD CONNECTÉ
╠═════════════════
║ PRÉFIXE : ${config.PREFIX}
╠═════════════════
║ DEV INCONNU BOY
╠═════════════════
║ NUM DEV : 554488138425
╚═════════════════`,
            contextInfo: {
              isForwarded: true,
              forwardingScore: 999,
              forwardedNewsletterMessageInfo: {
                newsletterJid: "120363397722863547@newsletter",
                newsletterName: "INCONNU-XD",
                serverMessageId: -1
              },
              externalAdReply: {
                title: "INCONNU-XD",
                body: "ᴘᴏᴡᴇʀᴇᴅ ʙʏ inconnu-xd",
                thumbnailUrl: "https://files.catbox.moe/959dyk.jpg",
                sourceUrl: "https://whatsapp.com/channel/0029Vb6T8td5K3zQZbsKEU1R",
                mediaType: 1,
                renderLargerThumbnail: false
              }
            }
          });

          initialConnection = false;
        } else {
          console.log(chalk.blue("♻️ Connexion rétablie après redémarrage"));
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("messages.upsert", msg => Handler(msg, sock, logger));
    sock.ev.on("call", call => Callupdate(call, sock));
    sock.ev.on("group-participants.update", group => GroupUpdate(sock, group));
    sock.public = config.MODE === 'public';

    sock.ev.on("messages.upsert", async update => {
      try {
        const msg = update.messages[0];
        if (!msg.key.fromMe && config.AUTO_REACT && msg.message) {
          const emoji = emojis[Math.floor(Math.random() * emojis.length)];
          await doReact(emoji, msg, sock);
        }
      } catch (err) {
        console.error("Auto react error:", err);
      }
    });

  } catch (err) {
    console.error("❌ Erreur critique :", err);
    process.exit(1);
  }
}

async function init() {
  if (fs.existsSync(credsPath)) {
    console.log("🔒 Session locale trouvée. Démarrage direct.");
    await start();
  } else {
    const downloaded = await downloadSessionData();
    if (downloaded) {
      console.log("✅ Session téléchargée. Lancement...");
      await start();
    } else {
      console.log("❌ Session non valide. QR requis.");
      useQR = true;
      await start();
    }
  }
}

init();
