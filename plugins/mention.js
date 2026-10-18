const { Module } = require("../main");
const { SUDO, HANDLERS } = require("../config");
const config = require("../config");
const { uploadToCatbox } = require("./utils/upload");

const fs = require("fs");
const path = require("path");

var handler = HANDLERS !== "false" ? HANDLERS.split("")[0] : ".";

const { setVar, delVar } = require("./manage");

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
    return await delVar("MENTION_REPLY");
  } catch (error) {
    console.error("Error deleting mention reply:", error);
    return false;
  }
}

function isSudoUser(jid) {
  if (!jid) return false;

  let sudoMap = [];
  if (config.SUDO_MAP) {
    try {
      sudoMap = JSON.parse(config.SUDO_MAP);
      if (!Array.isArray(sudoMap)) sudoMap = [];
    } catch (e) {
      sudoMap = [];
    }
  }

  // Check SUDO string as well
  if (config.SUDO && config.SUDO.includes(jid.split("@")[0])) {
    return true;
  }

  return sudoMap.includes(jid);
}

Module(
  {
    pattern: "mention ?(.*)",
    fromMe: true,
    desc: "Auto mention reply management for OGGY-MD",
    usage:
      ".mention set (reply to msg) | .mention set <text> | .mention get | .mention del | .mention help",
  },
  async (message, match) => {
    const args = match[1]?.trim().split(" ");
    const subcommand = args?.[0]?.toLowerCase();
    const input = args?.slice(1).join(" ");

    if (!subcommand) {
      return await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD MENTION* ⚡ 〕━━━╮\n` +
        `┃ ⚙️ *Available Commands:*\n` +
        `┃ ◦ \`${handler}mention set\` - Set reply (text/media)\n` +
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
        if (mentionData.url) {
          responseText += `┃ 🔗 *Media URL:* \`${mentionData.url}\`\n`;
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
              url: "",
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
              if (replyMsg.image) mediaType = "image";
              else if (replyMsg.video) mediaType = "video";
              else if (replyMsg.audio) mediaType = "audio";
              else if (replyMsg.sticker) mediaType = "sticker";

              const downloadedFilePath = await replyMsg.download();
              const uploadResult = await uploadToCatbox(downloadedFilePath);

              try {
                fs.unlinkSync(downloadedFilePath);
              } catch (e) {}

              if (uploadResult && uploadResult.url) {
                mentionData.type = mediaType;
                mentionData.url = uploadResult.url;
                mentionData.caption = replyMsg.text || "";
              } else {
                return await message.sendReply(
                  "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ ❌ *Failed to upload media! Try again.*\n╰────────────────────────"
                );
              }
            } else if (replyMsg.text) {
              mentionData.type = "text";
              mentionData.content = replyMsg.text;
            } else {
              return await message.sendReply(
                "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ ⚠️ *Unsupported message format!*\n╰────────────────────────"
              );
            }

            const isSaved = await setMentionReply(mentionData);
            if (isSaved) {
              return await message.sendReply(
                `╭───〔 ⚡ *OGGY-MD MENTION SET* 〕───\n` +
                `│ ✅ *Mention reply configured successfully!*\n` +
                `│ 📁 *Type:* \`${mentionData.type.toUpperCase()}\`\n` +
                `│ 💬 *Preview:* _${mentionData.content || mentionData.caption || "Media response"}_\n` +
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
            url: "",
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
          `╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ ⚠️ *Please provide text or reply to a media file!*\n│ 💡 *Example:* \`${handler}mention set Hello! ABHIIXZ is currently away.\`\n╰────────────────────────`
        );

      case "help":
        const helpText = `╭━━━〔 ⚡ *OGGY-MD AUTO MENTION* ⚡ 〕━━━╮\n` +
          `┃ ℹ️ *What is Auto Mention?*\n` +
          `┃ ഗ്രൂപ്പുകളിലോ ചാറ്റുകളിലോ ആരെങ്കിലും നിങ്ങളെ\n` +
          `┃ (@ABHIIXZ) അല്ലെങ്കിൽ ബോട്ടിനെ ടാഗ് ചെയ്യുമ്പോൾ\n` +
          `┃ ഓട്ടോമാറ്റിക്കായി റിപ്ലൈ നൽകുന്ന സിസ്റ്റമാണിത്.\n` +
          `┃\n` +
          `┃ 🛠️ *Commands:*\n` +
          `┃ ◦ \`${handler}mention set <text>\` - സെറ്റ് ചെയ്യുക\n` +
          `┃ ◦ \`${handler}mention set\` - ഓഡിയോ/ഇമേജിന് റിപ്ലൈ അടിക്കുക\n` +
          `┃ ◦ \`${handler}mention get\` - നിലവിലുള്ളത് കാണുക\n` +
          `┃ ◦ \`${handler}mention del\` - ഒഴിവാക്കുക\n` +
          `┃\n` +
          `┃ 💡 *ഉദാഹരണം:*\n` +
          `┃ \`${handler}mention set Hey! ABHIIXZ is busy now. Contact later!\`\n` +
          `╰━━━━━━━━━━━━━━━━━━━━╯`;

        return await message.sendReply(helpText);

      default:
        return await message.sendReply(
          `╭───〔 ⚡ *OGGY-MD* 〕───\n│ ⚠️ *Unknown subcommand:* \`${subcommand}\`\n│ 💡 Type \`${handler}mention help\` for commands.\n╰────────────────────────`
        );
    }
  }
);

Module(
  {
    on: "text",
    fromMe: false,
  },
  async (message) => {
    try {
      if (
        !message.mention ||
        !Array.isArray(message.mention) ||
        message.mention.length === 0
      ) {
        return;
      }

      const botId = message.client.user?.lid?.split(":")[0] + "@s.whatsapp.net";
      const botNumericId = botId?.split("@")[0];

      let isMentioned = false;

      for (const mentionedJid of message.mention) {
        const mentionedNumericId = mentionedJid?.split("@")[0];

        if (mentionedNumericId === botNumericId || mentionedJid === botId) {
          isMentioned = true;
          break;
        }

        if (isSudoUser(mentionedJid)) {
          isMentioned = true;
          break;
        }
      }

      if (!isMentioned) {
        return;
      }

      const mentionData = getMentionReply();
      if (!mentionData) {
        return;
      }

      switch (mentionData.type) {
        case "text":
          if (mentionData.content) {
            await message.sendReply(mentionData.content);
          }
          break;

        case "image":
          if (mentionData.url) {
            await message.sendReply({ url: mentionData.url }, "image", {
              caption: mentionData.caption || "",
            });
          }
          break;

        case "video":
          if (mentionData.url) {
            await message.sendReply({ url: mentionData.url }, "video", {
              caption: mentionData.caption || "",
            });
          }
          break;

        case "audio":
          if (mentionData.url) {
            await message.sendReply({ url: mentionData.url }, "audio", {
              ptt: true,
              mimetype: "audio/mpeg",
            });
          }
          break;

        case "sticker":
          if (mentionData.url) {
            await message.sendReply({ url: mentionData.url }, "sticker");
          }
          break;

        case "document":
          if (mentionData.url) {
            await message.sendReply({ url: mentionData.url }, "document", {
              caption: mentionData.caption || "",
            });
          }
          break;
      }
    } catch (error) {
      console.error("Error in auto mention reply:", error);
    }
  }
);
