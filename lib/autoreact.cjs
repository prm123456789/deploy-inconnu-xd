const doReact = async (emoji, msg, sock) => {
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      react: {
        text: emoji,
        key: msg.key
      }
    });
  } catch (e) {
    console.error("⚠️ Erreur auto-react :", e);
  }
};

module.exports = {
  doReact,
  emojis: ['🔥', '😁', '💯', '🤖', '👌', '👏', '🙌', '🎉', '😎', '🥳']
};
