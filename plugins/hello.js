export const command = {
  name: "hello",
  description: "Répond avec un message de bienvenue",
  category: "utilitaire",
  async execute(m, sock, args, store, config) {
    await sock.sendMessage(m.key.remoteJid, {
      text: `👋 Salut ${m.pushName || "utilisateur"} ! Bienvenue sur INCONNU XD !`
    }, { quoted: m });
  }
};
