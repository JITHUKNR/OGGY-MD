const { Module } = require("../main");

Module(
  {
    pattern: "reload",
    fromMe: true,
    excludeFromCommands: true,
  },
  async (m) => {
    await m.sendReply(
      "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ 🔄 *Reloading OGGY-MD...*\n│ ⏱️ _Please wait a moment!_\n╰────────────────────────"
    );
    process.exit(0);
  }
);

Module(
  {
    pattern: "reboot",
    fromMe: true,
    excludeFromCommands: true,
  },
  async (m) => {
    await m.sendReply(
      "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ 🔄 *Rebooting OGGY-MD...*\n│ ⏱️ _Please wait a moment!_\n╰────────────────────────"
    );
    process.exit(0);
  }
);

Module(
  {
    pattern: "restart",
    fromMe: true,
    desc: "Restarts OGGY-MD bot",
    use: "system",
  },
  async (m) => {
    await m.sendReply(
      "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ 🚀 *Restarting OGGY-MD...*\n│ ⏱️ _Bot will be back online shortly!_\n╰────────────────────────"
    );
    process.exit(0);
  }
);
