const { commands, Module } = require("../main");
const { MODE, HANDLERS, ALIVE, VERSION } = require("../config");
const config = require("../config");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { uploadToImgbb } = require("./utils/upload");
const { setVar } = require("./manage");
const { getTotalUserCount } = require("../core/store");
const { parseAliveMessage, sendAliveMessage } = require("./utils/alive-parser");

const isPrivateMode = MODE === "private";

// Helper: Calculate Uptime
function getUptime() {
  const sec = Math.floor(process.uptime());
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function bytesToSize(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 Byte";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + " " + sizes[i];
}

const extractCommandName = (pattern) => {
  const match = pattern?.toString().match(/(\W*)([A-Za-z1234567890 ]*)/);
  return match && match[2] ? match[2].trim() : "";
};

const retrieveCommandDetails = (commandName) => {
  const foundCommand = commands.find(
    (cmd) => extractCommandName(cmd.pattern) === commandName
  );
  if (!foundCommand) return null;
  return {
    name: commandName,
    ...foundCommand,
  };
};

// ==========================================
// 1. INFO COMMAND (.info)
// ==========================================
Module(
  {
    pattern: "info ?(.*)",
    fromMe: isPrivateMode,
    desc: "Gives command information",
  },
  async (message, args) => {
    const commandName = args[1]?.trim();
    if (!commandName) {
      return await message.sendReply(
        "_Please provide a command name. Example: .info insta_"
      );
    }

    const commandDetails = retrieveCommandDetails(commandName);
    if (!commandDetails) {
      return await message.sendReply(
        `_Command '${commandName}' not found. Please check the spelling._`
      );
    }

    let infoMessage = `╭───〔 *COMMAND DETAILS* 〕───\n`;
    infoMessage += `│ • *Command:* \`${commandDetails.name}\`\n`;
    infoMessage += `│ • *Description:* ${commandDetails.desc || "N/A"}\n`;
    infoMessage += `│ • *Owner Only:* ${commandDetails.fromMe ? "Yes" : "No"}\n`;
    if (commandDetails.use) infoMessage += `│ • *Category:* ${commandDetails.use}\n`;
    if (commandDetails.usage) infoMessage += `│ • *Usage:* ${commandDetails.name} ${commandDetails.usage}\n`;
    if (commandDetails.warn) infoMessage += `│ • *Warning:* ${commandDetails.warn}\n`;
    infoMessage += `╰────────────────────────`;

    await message.sendReply(infoMessage);
  }
);

// ==========================================
// 2. LIST COMMAND (.list)
// ==========================================
Module(
  {
    pattern: "list ?(.*)",
    fromMe: isPrivateMode,
    excludeFromCommands: true,
  },
  async (message) => {
    const availableCommands = commands.filter(
      (cmd) => !cmd.excludeFromCommands && cmd.pattern
    );
    const totalCommandCount = availableCommands.length;
    const categorizedCommands = {};

    availableCommands.forEach((cmd) => {
      const category = cmd.use || "General";
      if (!categorizedCommands[category]) {
        categorizedCommands[category] = [];
      }
      const commandName = extractCommandName(cmd.pattern);
      if (commandName) {
        categorizedCommands[category].push({
          name: commandName,
          desc: cmd.desc,
        });
      }
    });

    const handlerPrefix = HANDLERS !== "false" ? HANDLERS.split("")[0] : ".";
    let responseMessage = `*Total Available Commands: ${totalCommandCount}*\n\n`;

    for (const category in categorizedCommands) {
      responseMessage += `╭───〔 *${category.toUpperCase()}* 〕───\n`;
      categorizedCommands[category].forEach((cmd) => {
        responseMessage += `│ ◦ \`${handlerPrefix}${cmd.name}\`\n`;
      });
      responseMessage += `╰────────────────────────\n\n`;
    }
    await message.sendReply(responseMessage);
  }
);

// ==========================================
// 3. STYLISH OGGY-MD MENU COMMAND (.menu)
// ==========================================
Module(
  {
    pattern: "menu",
    fromMe: isPrivateMode,
    use: "utility",
    desc: "Displays the complete bot command menu.",
  },
  async (message) => {
    const sender = message.data.participant || message.data.key.remoteJid;
    const userTag = sender ? `@${sender.split("@")[0]}` : (message.senderName || "User");
    const mode = MODE ? MODE.toUpperCase() : "PUBLIC";
    const uptime = getUptime();
    const usedRam = bytesToSize(os.freemem());
    const totalRam = bytesToSize(os.totalmem());

    let totalUsers = 0;
    try {
      totalUsers = await getTotalUserCount();
    } catch (e) {}

    const infoParts = config.BOT_INFO.split(";");
    const botName = "OGGY-MD";
    const botOwner = infoParts[1] || "Admin";
    let botImageLink = infoParts[2] || "";
    if (botImageLink === "default") {
      botImageLink = path.join(__dirname, "utils", "images", "default.png");
    }

    const handlerPrefix = HANDLERS !== "false" ? HANDLERS.split("")[0] : ".";

    // Category Icon Mapping
    const categoryIcons = {
      download: "📥 DOWNLOAD",
      downloader: "📥 DOWNLOAD",
      utility: "🛠️ UTILITY",
      tools: "🧰 TOOLS",
      search: "🔍 SEARCH",
      media: "🎨 MEDIA",
      group: "👥 GROUP",
      admin: "🛡️ ADMIN",
      owner: "👑 OWNER",
      settings: "⚙️ SETTINGS",
      game: "🎮 GAMES",
      games: "🎮 GAMES",
      ai: "🤖 ARTIFICIAL INTEL",
      General: "📌 GENERAL",
    };

    // Filter and dynamically categorize all commands
    const availableCommands = commands.filter(
      (cmd) => !cmd.excludeFromCommands && cmd.pattern
    );
    const totalCmds = availableCommands.length;

    let categorized = {};
    availableCommands.forEach((cmd) => {
      let cat = cmd.use ? cmd.use.toLowerCase() : "general";
      if (!categorized[cat]) categorized[cat] = [];
      let cName = extractCommandName(cmd.pattern);
      if (cName && !categorized[cat].includes(cName)) {
        categorized[cat].push(cName);
      }
    });

    // Build Header
    let menuText = `╭━━━〔 ⚡ *𝑶𝑮𝑮𝒀 - 𝑴𝑫* ⚡ 〕━━━╮\n`;
    menuText += `┃ 👑 *Owner:* ${botOwner}\n`;
    menuText += `┃ 👤 *User:* ${userTag}\n`;
    menuText += `┃ ⏱️ *Uptime:* ${uptime}\n`;
    menuText += `┃ ⚡ *RAM:* ${usedRam} / ${totalRam}\n`;
    menuText += `┃ 👥 *Users:* ${totalUsers || "1"}\n`;
    menuText += `┃ 🌐 *Mode:* ${mode}\n`;
    menuText += `┃ 📊 *Commands:* ${totalCmds}\n`;
    menuText += `┃ ⚙️ *Prefix:* [ ${handlerPrefix} ]\n`;
    menuText += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`;

    // Build Dynamic Category Sections
    for (const cat in categorized) {
      if (!categorized[cat].length) continue;
      const title = categoryIcons[cat] || `📂 ${cat.toUpperCase()}`;
      menuText += `╭───〔 *${title}* 〕───\n`;
      categorized[cat].forEach((cmdName) => {
        menuText += `│ ◦ \`${handlerPrefix}${cmdName}\`\n`;
      });
      menuText += `╰────────────────────────\n\n`;
    }

    menuText += `_Type any command with dot (.) prefix to use!_\n`;
    menuText += `*© 2026 OGGY-MD • All Rights Reserved*`;

    const quotedMessage = message.reply_message ? message.quoted : message.data;

    try {
      if (botImageLink && fs.existsSync(botImageLink)) {
        await message.client.sendMessage(
          message.jid,
          {
            image: fs.readFileSync(botImageLink),
            caption: menuText,
            mentions: sender ? [sender] : [],
          },
          { quoted: quotedMessage }
        );
      } else if (botImageLink && (botImageLink.startsWith("http://") || botImageLink.startsWith("https://"))) {
        await message.client.sendMessage(
          message.jid,
          {
            image: { url: botImageLink },
            caption: menuText,
            mentions: sender ? [sender] : [],
          },
          { quoted: quotedMessage }
        );
      } else {
        await message.client.sendMessage(
          message.jid,
          {
            text: menuText,
            mentions: sender ? [sender] : [],
          },
          { quoted: quotedMessage }
        );
      }
    } catch (error) {
      console.error("Error sending menu:", error);
      await message.client.sendMessage(
        message.jid,
        {
          text: menuText,
          mentions: sender ? [sender] : [],
        },
        { quoted: quotedMessage }
      );
    }
  }
);

// ==========================================
// 4. ALIVE & SETALIVE COMMANDS
// ==========================================
async function parseAlive(message, aliveMessage) {
  if (!aliveMessage) {
    return await message.sendReply("I'm alive! OGGY-MD is online.");
  }
  if (aliveMessage.includes("$")) {
    const parsedMessage = await parseAliveMessage(aliveMessage, message);
    if (parsedMessage) {
      await sendAliveMessage(message, parsedMessage);
    } else {
      await message.sendReply(aliveMessage);
    }
  } else {
    await message.sendReply(aliveMessage);
  }
}

Module(
  {
    pattern: "alive",
    fromMe: isPrivateMode,
    desc: "Checks if the bot is alive.",
  },
  async (message) => {
    await parseAlive(message, ALIVE);
  }
);

Module(
  {
    pattern: "setalive ?(.*)",
    fromMe: true,
    desc: "Sets the alive message for the bot with formatting options.",
    usage: ".setalive <message> (with placeholders)",
    dontAddCommandList: true,
  },
  async (message, match) => {
    if (!match[1]) {
      return await message.sendReply(
        `*Alive Message Setup*\n\n• \`.setalive <msg>\` - Set message\n• \`.setalive get\` - View current\n• \`.setalive del\` - Reset\n• \`.testalive\` - Test`
      );
    }

    const input = match[1].toLowerCase();
    if (input === "get") {
      return await message.sendReply(`*Current Alive:*\n\n${ALIVE || "Default"}`);
    }
    if (input === "del" || input === "delete") {
      await setVar("ALIVE", "");
      return await message.sendReply("_Custom alive message deleted!_");
    }

    const aliveMessage = match[1];
    if (aliveMessage.length > 2000) {
      return await message.sendReply("_Alive message is too long! (Max 2000 chars)_");
    }

    await setVar("ALIVE", aliveMessage);
    return await message.sendReply(`_Alive message set successfully!_`);
  }
);

// ==========================================
// 5. GAMES & SETTINGS COMMANDS
// ==========================================
Module(
  {
    pattern: "games ?(.*)",
    fromMe: isPrivateMode,
    desc: "Lists all available games",
  },
  async (message) => {
    const gameCommands = commands.filter(
      (cmd) => cmd.use === "game" && cmd.pattern
    );
    if (!gameCommands.length) {
      return await message.sendReply("_No games are installed._");
    }
    const handlerPrefix = HANDLERS !== "false" ? HANDLERS.split("")[0] : ".";
    let response = `*───「 Available Games 」───*\n\n`;
    gameCommands.forEach((cmd) => {
      const name = extractCommandName(cmd.pattern);
      if (name) {
        response += `• *Command:* \`${handlerPrefix}${name}\`\n`;
        response += `• *Description:* ${cmd.desc || "N/A"}\n\n`;
      }
    });
    await message.sendReply(response);
  }
);

Module(
  {
    pattern: "setname ?(.*)",
    fromMe: true,
    desc: "Sets the bot name",
    use: "settings",
  },
  async (message, match) => {
    const name = match[1]?.trim();
    if (!name) return await message.sendReply("_Provide a name: .setname OGGY-MD_");
    const parts = config.BOT_INFO.split(";");
    parts[0] = name;
    await setVar("BOT_INFO", parts.join(";"));
    return await message.sendReply(`_Bot name updated successfully!_\n\n*New Name:* ${name}`);
  }
);

Module(
  {
    pattern: "setowner ?(.*)",
    fromMe: true,
    desc: "Sets the bot owner",
    use: "settings",
  },
  async (message, match) => {
    const owner = match[1]?.trim();
    if (!owner) return await message.sendReply("_Provide owner: .setowner YourName_");
    const parts = config.BOT_INFO.split(";");
    parts[1] = owner;
    await setVar("BOT_INFO", parts.join(";"));
    return await message.sendReply(`_Bot owner updated successfully!_\n\n*New Owner:* ${owner}`);
  }
);

Module(
  {
    pattern: "setimage",
    fromMe: true,
    desc: "Sets the bot image (reply to image)",
    use: "settings",
  },
  async (message) => {
    if (!message.reply_message || !message.reply_message.image) {
      return await message.sendReply("_Reply to an image with .setimage_");
    }
    try {
      const downloadedFile = await message.reply_message.download();
      const uploadRes = await uploadToImgbb(downloadedFile);
      try {
        fs.unlinkSync(downloadedFile);
      } catch (e) {}

      const url = uploadRes.url || uploadRes.display_url;
      if (!url) return await message.sendReply("_Image upload failed._");

      const parts = config.BOT_INFO.split(";");
      parts[2] = url;
      await setVar("BOT_INFO", parts.join(";"));
      return await message.sendReply(`_Bot image updated successfully!_\n\n*New Image URL:* ${url}`);
    } catch (error) {
      console.error("Error setting image:", error);
      return await message.sendReply("_Failed to set image. Please try again._");
    }
  }
);

Module(
  {
    pattern: "testalive",
    fromMe: true,
    desc: "Test current alive message.",
    use: "utility",
  },
  async (message) => {
    await message.sendReply("*Testing Alive Message:*");
    await parseAlive(message, ALIVE);
  }
);
