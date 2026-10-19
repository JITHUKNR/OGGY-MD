const { Module } = require("../main");
const { SUDO, HANDLERS } = require("../config");
const config = require("../config");
const fs = require("fs");
const path = require("path");

var handler = HANDLERS !== "false" ? HANDLERS.split("")[0] : ".";
const { setVar, delVar } = require("./manage");

const LOCAL_MENTION_DIR = "/root/RAGANORK-BOT";
const LOCAL_MENTION_FILE = path.join(LOCAL_MENTION_DIR, "mention_media");

function getMentionReply() {
  try {
    return config.MENTION_REPLY ? JSON.parse(config.MENTION_REPLY) : null;
  } catch (error) {
    console.error("Error parsing mention reply:", error);
    return null;
  }
}

async function setMentionReply(data) {
  try {
    return await setVar("MENTION_REPLY", JSON.stringify(data));
  } catch (error) {
    console.error("Error setting mention reply:", error);
    return false;
  }
}

async function deleteMentionReply() {
  try {
    // Delete local file if exists
    const files = fs.readdirSync(LOCAL_MENTION_DIR).filter((f) => f.startsWith("mention_media"));
    for (const file of files) {
      try { fs.unlinkSync(path.join(LOCAL_MENTION_DIR, file)); } catch (e) {}
    }
    return await delVar("MENTION_REPLY");
  } catch (error) {
    console.error("Error deleting mention reply:", error);
    return false;
  }
}

function isSudoUser(jid) {
  if (!jid) return false;
  const num = jid.split("@")[0];

  let sudoMap = [];
  if (config.SUDO_MAP) {
    try {
      sudoMap = JSON.parse(config.SUDO_MAP);
      if (!Array.isArray(sudoMap)) sudoMap = [];
    } catch (e) {
      sudoMap = [];
    }
  }

  if (config.SUDO && config.SUDO.includes(num)) return true;
  return sudoMap.includes(jid) || sudoMap.includes(num);
}

Module(
  {
    pattern: "mention ?(.*)",
    fromMe: true,
    desc: "Auto mention reply management for OGGY-MD",
    usage: ".mention set (reply to msg) | .mention set <text> | .mention get | .mention del | .mention help",
  },
  async (message, match) => {
    const args = match[1]?.trim().split(" ");
    const subcommand = args?.[0]?.toLowerCase();
    const input = args?.slice(1).join(" ");

    if (!subcommand) {
      return await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD MENTION* ⚡ 〕━━━╮\n` +
        `┃ ⚙️ *Available Commands:*\n` +
        `┃ ◦ \`${handler}mention set\` - Set reply (Audio/Text/Image)\n` +
        `┃ ◦ \`${handler}mention get\` - View current reply\n` +
        `┃ ◦ \`${handler}mention del\` - Delete reply\n` +
        `┃ ◦ \`${handler}mention help\` - Detailed setup guide\n` +
        `╰━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    switch (subcommand) {
      case "del":
      case "delete":
        const success = await deleteMentionReply();
        if (success) {
          return await message.sendReply(
            "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ ✅ *Mention reply deleted successfully!*\n╰────────────────────────"
          );
        } else {
          return await message.sendReply(
            "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ ❌ *Failed to delete mention reply!*\n╰────────────────────────"
          );
        }

      case "get":
      case "show":
        const mentionData = getMentionReply();
        if (!mentionData) {
          return await message.sendReply(
            "╭───〔 ⚡ *OGGY-MD MENTION* 〕───\n│ ⚠️ *No mention reply configured yet!*\n│\n│ 💡 *How to set:*\n│ • Reply to any audio/image with \`${handler}mention set\`\n│ • Or type \`${handler}mention set <text>\`\n╰────────────────────────"
          );
        }

        let responseText = `╭━━━〔 ⚡ *CURRENT MENTION REPLY* 〕━━━╮\n`;
        responseText += `┃ 📁 *Type:* \`${mentionData.type.toUpperCase()}\`\n`;
        if (mentionData.caption) {
          responseText += `┃ 📝 *Caption:* _${mentionData.caption}_\n`;
        }
        if (mentionData.content) {
          responseText += `┃ 💬 *Text:* _${mentionData.content}_\n`;
        }
        if (mentionData.localFile) {
          responseText += `┃ 💾 *Stored:* \`Locally on Server (100% Reliable)\`\n`;
        }
        responseText += `┃ ⏱️ *Updated:* _${new Date(mentionData.timestamp).toLocaleString()}_\n`;
        responseText += `╰━━━━━━━━━━━━━━━━━━━━╯`;

        return await message.sendReply(responseText);

      case "set":
        if (message.reply_message) {
          try {
            const replyMsg = message.reply_message;
            let mentionData = {
              type: "text",
              content: "",
              caption: "",
              localFile: "",
              timestamp: new Date().toISOString(),
            };

            if (
              replyMsg.image ||
              replyMsg.video ||
              replyMsg.audio ||
              replyMsg.document ||
              replyMsg.sticker
            ) {
              let mediaType = "document";
              let ext = "bin";

              if (replyMsg.image) { mediaType = "image"; ext = "jpg"; }
              else if (replyMsg.video) { mediaType = "video"; ext = "mp4"; }
              else if (replyMsg.audio) { mediaType = "audio"; ext = "mp3"; }
              else if (replyMsg.sticker) { mediaType = "sticker"; ext = "webp"; }

              const downloadedFilePath = await replyMsg.download();
              const savePath = `${LOCAL_MENTION_FILE}.${ext}`;

              if (typeof downloadedFilePath === "string" && fs.existsSync(downloadedFilePath)) {
                fs.copyFileSync(downloadedFilePath, savePath);
                try { fs.unlinkSync(downloadedFilePath); } catch (e) {}
              } else if (Buffer.isBuffer(downloadedFilePath)) {
                fs.writeFileSync(savePath, downloadedFilePath);
              }

              mentionData.type = mediaType;
              mentionData.localFile = savePath;
              mentionData.caption = replyMsg.text || "";
            } else if (replyMsg.text) {
              mentionData.type = "text";
              mentionData.content = replyMsg.text;
            }

            const isSaved = await setMentionReply(mentionData);
            if (isSaved) {
              return await message.sendReply(
                `╭───〔 ⚡ *OGGY-MD MENTION SET* 〕───\n` +
                `│ ✅ *Mention reply configured successfully!*\n` +
                `│ 📁 *Type:* \`${mentionData.type.toUpperCase()}\`\n` +
                `│ 💾 *Status:* _Saved directly to Server_\n` +
                `╰────────────────────────`
              );
            } else {
              return await message.sendReply("╭───〔 ⚡ *OGGY-MD* 〕───\n│ ❌ *Failed to save mention reply!*\n╰────────────────────────");
            }
          } catch (error) {
            console.error("Error setting mention reply:", error);
            return await message.sendReply(
              "╭───〔 ⚡ *OGGY-MD* 〕───\n│ ❌ *Error processing media reply!*\n╰────────────────────────"
            );
          }
        }

        if (input && input.trim()) {
          const mentionData = {
            type: "text",
            content: input.trim(),
            caption: "",
            localFile: "",
            timestamp: new Date().toISOString(),
          };

          const isSaved = await setMentionReply(mentionData);
          if (isSaved) {
            return await message.sendReply(
              `╭───〔 ⚡ *OGGY-MD MENTION SET* 〕───\n` +
              `│ ✅ *Text reply saved successfully!*\n` +
              `│ 💬 *Text:* _${mentionData.content}_\n` +
              `╰────────────────────────`
            );
          } else {
            return await message.sendReply("╭───〔 ⚡ *OGGY-MD* 〕───\n│ ❌ *Failed to save mention reply!*\n╰────────────────────────");
          }
        }

        return await message.sendReply(
          `╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ ⚠️ *Please provide text or reply to an audio/media file!*\n╰────────────────────────`
        );

      case "help":
        const helpText = `╭━━━〔 ⚡ *OGGY-MD AUTO MENTION* ⚡ 〕━━━╮\n` +
          `┃ ℹ️ *സെറ്റ് ചെയ്യേണ്ട വിധം:*\n` +
          `┃ 1. നിങ്ങൾക്ക് ഇഷ്ടമുള്ള പാട്ട്/വോയ്‌സ് അയക്കുക.\n` +
          `┃ 2. ആ പാട്ടിലേക്ക് Reply ചെയ്ത് \`${handler}mention set\` എന്ന് അടിക്കുക.\n` +
          `┃ 3. ഇനി ഗ്രൂപ്പിൽ ആരെങ്കിലും നിങ്ങളെയോ ബോട്ടിനെയോ ടാഗ് ചെയ്യുമ്പോൾ ഈ പാട്ട് ഉടൻ റിപ്ലൈ ആയി വരും!\n` +
          `╰━━━━━━━━━━━━━━━━━━━━╯`;

        return await message.sendReply(helpText);

      default:
        return await message.sendReply(
          `╭───〔 ⚡ *OGGY-MD* 〕───\n│ ⚠️ *Unknown subcommand:* \`${subcommand}\`\n╰────────────────────────`
        );
    }
  }
);

// ============================================================
// AUTO MENTION EVENT LISTENER (GROUP MENTIONS DETECTOR)
// ============================================================
Module(
  {
    on: "text",
    fromMe: false,
  },
  async (message) => {
    try {
      const sock = message.client || message;

      // Extract all mentioned JIDs accurately from contextInfo
      const mentionedJids = [
        ...(message.mention || []),
        ...(message.data?.message?.extendedTextMessage?.contextInfo?.mentionedJid || []),
      ];

      if (!mentionedJids || mentionedJids.length === 0) {
        return;
      }

      // Accurate Bot phone JID detection
      const rawBotId = sock.user?.id || sock.user?.jid || "";
      const botNumber = rawBotId.split(":")[0]?.replace(/[^0-9]/g, "");
      const botLid = sock.user?.lid ? sock.user.lid.split(":")[0]?.replace(/[^0-9]/g, "") : "";

      let isMentioned = false;

      for (const mentionedJid of mentionedJids) {
        const mentionedNumber = mentionedJid.split("@")[0]?.replace(/[^0-9]/g, "");

        // Match Bot Number or Bot LID
        if (mentionedNumber && (mentionedNumber === botNumber || mentionedNumber === botLid)) {
          isMentioned = true;
          break;
        }

        // Match Owner / Sudo Number
        if (isSudoUser(mentionedJid)) {
          isMentioned = true;
          break;
        }
      }

      if (!isMentioned) return;

      const mentionData = getMentionReply();
      if (!mentionData) return;

      // Check if local file exists
      const hasLocalFile = mentionData.localFile && fs.existsSync(mentionData.localFile);

      switch (mentionData.type) {
        case "text":
          if (mentionData.content) {
            await message.sendReply(mentionData.content);
          }
          break;

        case "audio":
          if (hasLocalFile) {
            await sock.sendMessage(
              message.jid,
              {
                audio: fs.readFileSync(mentionData.localFile),
                mimetype: "audio/mp4",
                ptt: true, // Sends as playable voice note / audio
              },
              { quoted: message.data }
            );
          }
          break;

        case "image":
          if (hasLocalFile) {
            await sock.sendMessage(
              message.jid,
              {
                image: fs.readFileSync(mentionData.localFile),
                caption: mentionData.caption || "",
              },
              { quoted: message.data }
            );
          }
          break;

        case "video":
          if (hasLocalFile) {
            await sock.sendMessage(
              message.jid,
              {
                video: fs.readFileSync(mentionData.localFile),
                caption: mentionData.caption || "",
              },
              { quoted: message.data }
            );
          }
          break;

        case "sticker":
          if (hasLocalFile) {
            await sock.sendMessage(
              message.jid,
              {
                sticker: fs.readFileSync(mentionData.localFile),
              },
              { quoted: message.data }
            );
          }
          break;
      }
    } catch (error) {
      console.error("Error in auto mention reply:", error);
    }
  }
);
