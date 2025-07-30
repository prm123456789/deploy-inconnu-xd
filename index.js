import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import bodyParser from 'body-parser';
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';

import pino from 'pino';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { File } from 'megajs';

import { Handler, Callupdate, GroupUpdate } from './inconnu/inconnuboy/inconnuv2.js';
import autoreact from './lib/autoreact.cjs';

const { emojis, doReact } = autoreact;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware pour parser JSON
app.use(bodyParser.json());

// Servir les fichiers statiques dans mydata/
app.use(express.static(path.join(process.cwd(), 'mydata')));

const MAIN_LOGGER = pino({
  timestamp: () => `,"time":"${new Date().toJSON()}"`
});
const logger = MAIN_LOGGER.child({});
logger.level = 'trace';

// Garde les sessions en mémoire (clé = numéro de téléphone)
const sessions = new Map();

async function downloadSessionToBuffer(sessionId) {
  if (!sessionId) throw new Error("SESSION_ID vide");

  const sessionEncoded = sessionId.split("INCONNU~XD~")[1];
  if (!sessionEncoded || !sessionEncoded.includes('#')) {
    throw new Error("Format SESSION_ID invalide. Doit contenir fileId#key");
  }

  const [fileId, decryptionKey] = sessionEncoded.split('#');
  const sessionFile = File.fromURL(`https://mega.nz/file/${fileId}#${decryptionKey}`);

  return new Promise((resolve, reject) => {
    sessionFile.download((err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

async function startBot(sessionBuffer, ownerNumber, prefix) {
  // Crée un dossier temporaire pour la session en mémoire
  const tempDir = path.join(process.cwd(), `temp_sessions/${ownerNumber}`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Ecris la session sur disque
  const credsPath = path.join(tempDir, 'creds.json');
  await fs.promises.writeFile(credsPath, sessionBuffer);

  // Baileys auth state
  const { state, saveCreds } = await useMultiFileAuthState(tempDir);

  // Version WA
  const { version } = await fetchLatestBaileysVersion();

  // Crée le socket
  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['INCONNU-XD', 'Safari', '3.3'],
    auth: state,
    getMessage: async () => ({})
  });

  sock.ev.on("connection.update", async update => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        console.log("❗Reconnexion automatique...");
        startBot(sessionBuffer, ownerNumber, prefix);
      }
    } else if (connection === "open") {
      console.log(chalk.green(`✅ Bot ${ownerNumber} connecté !`));
      try {
        await sock.sendMessage(sock.user.id, {
          text: `🤖 Bot INCONNU-XD connecté\nNuméro propriétaire : ${ownerNumber}\nPréfixe : ${prefix}`
        });
      } catch (e) {
        console.error("Erreur message bienvenue:", e);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("messages.upsert", msg => Handler(msg, sock, logger));
  sock.ev.on("call", call => Callupdate(call, sock));
  sock.ev.on("group-participants.update", group => GroupUpdate(sock, group));

  sock.public = true;
  sock.ev.on("messages.upsert", async update => {
    try {
      const msg = update.messages[0];
      if (!msg.key.fromMe) {
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        await doReact(emoji, msg, sock);
      }
    } catch (e) {
      console.error("Auto react error:", e);
    }
  });

  // Stocke le bot en mémoire
  sessions.set(ownerNumber, sock);
  return sock;
}

// Route POST pour démarrer le bot
// Body JSON : { number: "5544xxxxxx", sessionId: "INCONNUabc#key", prefix: "!" }
app.post('/start', async (req, res) => {
  const { number, sessionId, prefix } = req.body;

  if (!number || !sessionId || !prefix) {
    return res.status(400).json({ error: "number, sessionId et prefix sont requis" });
  }

  try {
    const sessionBuffer = await downloadSessionToBuffer(sessionId);

    await startBot(sessionBuffer, number, prefix);

    return res.json({ success: true, message: `Bot lancé pour ${number}` });
  } catch (e) {
    console.error("Erreur lancement bot:", e);
    return res.status(500).json({ error: e.message });
  }
});

// Route GET pour servir la page HTML principale
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'mydata', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🌐 Serveur lancé sur le port ${PORT}`);
});
