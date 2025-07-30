module.exports = {
  SESSION_ID: process.env.SESSION_ID || "", // Format: INCONNU<fileId>#<decryptionKey>
  PREFIX: process.env.PREFIX || ".",
  MODE: process.env.MODE || "public",
  AUTO_REACT: true
};
