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
import os from 'os';
import chalk from 'chalk';
import { File } from 'megajs';

import { Handler, Callupdate, GroupUpdate } from './inconnu/inconnuboy/inconnuv2.js';
import autoreact from './lib/autoreact.cjs';

const { emojis, doReact } = autoreact;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(process.cwd(), 'mydata')));

const MAIN_LOGGER = pino({
  timestamp: () => `,"time":"${new Date().toJSON()}"`
});
const logger = MAIN_LOGGER.child({});
logger.level = 'trace';

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
  const tempDir = path.join(os.tmpdir(), `temp_sessions_${ownerNumber}`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const credsPath = path.join(tempDir, 'creds.json');
  await fs.promises.writeFile(credsPath, sessionBuffer);

  const { state, saveCreds } = await useMultiFileAuthState(tempDir);
  const { version } = await fetchLatestBaileysVersion();

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

  sessions.set(ownerNumber, sock);
  return sock;
}

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

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'mydata', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🌐 Serveur lancé sur le port ${PORT}`);
});
