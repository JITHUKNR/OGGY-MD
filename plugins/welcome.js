const { Module } = require("../main");
const { ADMIN_ACCESS, HANDLERS } = require("../config");
const { isAdmin, welcome, goodbye } = require("./utils");
const {
  parseWelcomeMessage,
  sendWelcomeMessage,
} = require("./utils/welcome-parser");
var handler = HANDLERS !== "false" ? HANDLERS.split("")[0] : ".";

Module(
  {
    pattern: "welcome ?(.*)",
    fromMe: false,
    desc: "Set welcome message for group. Supports OGGY-MD placeholders.",
    usage:
      ".welcome Hey $mention, welcome to $group!$pp\n.welcome on/off\n.welcome get\n.welcome del",
    use: "group",
  },
  async (message, match) => {
    let adminAccess = ADMIN_ACCESS
      ? await isAdmin(message, message.sender)
      : false;
    if (!message.fromOwner && !adminAccess) return;

    const input = match[1]?.toLowerCase();
    if (!input) {
      return await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD WELCOME* ⚡ 〕━━━╮\n` +
        `┃ ⚙️ *Setup Commands:*\n` +
        `┃ ◦ \`${handler}welcome <text>\` - Set welcome msg\n` +
        `┃ ◦ \`${handler}welcome on/off\` - Toggle welcome\n` +
        `┃ ◦ \`${handler}welcome get\` - View current msg\n` +
        `┃ ◦ \`${handler}welcome del\` - Delete msg\n` +
        `┃ ◦ \`${handler}welcome status\` - View all groups\n` +
        `┃ ◦ \`${handler}welcome help\` - View placeholders\n` +
        `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
        `╭───〔 💡 *QUICK EXAMPLE* 〕───\n` +
        `│ \`${handler}welcome Hey$mention! Welcome to $group 🎉 $pp\`\n` +
        `╰────────────────────────`
      );
    }

    if (input === "on") {
      const current = await welcome.get(message.jid);
      if (!current) {
        return await message.sendReply(
          "╭───〔 ⚡ *OGGY-MD* 〕───\n│ ⚠️ *No welcome message set yet!*\n│ 💡 Use: `" + handler + "welcome <text>`\n╰────────────────────────"
        );
      }
      await welcome.toggle(message.jid, true);
      return await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ ✅ *Welcome messages enabled for this group!*\n╰────────────────────────"
      );
    }

    if (input === "off") {
      await welcome.toggle(message.jid, false);
      return await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ ❌ *Welcome messages disabled for this group!*\n╰────────────────────────"
      );
    }

    if (input === "get") {
      const current = await welcome.get(message.jid);
      if (!current) {
        return await message.sendReply(
          "╭───〔 ⚡ *OGGY-MD* 〕───\n│ ⚠️ *No welcome message set for this group!*\n╰────────────────────────"
        );
      }
      return await message.sendReply(
        `╭━━━〔 ⚡ *CURRENT WELCOME* 〕━━━╮\n` +
        `┃ 📊 *Status:* ${current.enabled ? "✅ Enabled" : "❌ Disabled"}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
        `*Message Preview:*\n${current.message}`
      );
    }

    if (input === "del" || input === "delete") {
      const deleted = await welcome.delete(message.jid);
      if (deleted) {
        return await message.sendReply(
          "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ 🗑️ *Welcome message deleted successfully!*\n╰────────────────────────"
        );
      }
      return await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD* 〕───\n│ ⚠️ *No welcome message found to delete!*\n╰────────────────────────"
      );
    }

    if (input === "status") {
      if (!message.fromOwner) return;

      try {
        const welcomeData = await welcome.get();
        const goodbyeData = await goodbye.get();

        if (!welcomeData.length && !goodbyeData.length) {
          return await message.sendReply(
            "╭───〔 ⚡ *OGGY-MD* 〕───\n│ ℹ️ *No welcome/goodbye configured in any groups!*\n╰────────────────────────"
          );
        }

        let statusText = `╭━━━〔 ⚡ *OGGY-MD GROUP STATUS* ⚡ 〕━━━╮\n\n`;

        if (welcomeData.length > 0) {
          statusText += `*📥 WELCOME ACTIVE GROUPS:*\n`;
          for (let i = 0; i < welcomeData.length; i++) {
            const data = welcomeData[i];
            try {
              const groupMeta = await message.client.groupMetadata(data.jid);
              const groupName = groupMeta.subject || "Unknown Group";
              const status = data.enabled ? "✅" : "❌";
              statusText += `│ ${i + 1}. *${groupName}* [${status}]\n`;
            } catch {
              statusText += `│ ${i + 1}. *Unknown Group* [${data.enabled ? "✅" : "❌"}]\n`;
            }
          }
          statusText += `\n`;
        }

        if (goodbyeData.length > 0) {
          statusText += `*📤 GOODBYE ACTIVE GROUPS:*\n`;
          for (let i = 0; i < goodbyeData.length; i++) {
            const data = goodbyeData[i];
            try {
              const groupMeta = await message.client.groupMetadata(data.jid);
              const groupName = groupMeta.subject || "Unknown Group";
              const status = data.enabled ? "✅" : "❌";
              statusText += `│ ${i + 1}. *${groupName}* [${status}]\n`;
            } catch {
              statusText += `│ ${i + 1}. *Unknown Group* [${data.enabled ? "✅" : "❌"}]\n`;
            }
          }
        }
        statusText += `╰━━━━━━━━━━━━━━━━━━━━╯`;

        await message.sendReply(statusText);
      } catch (error) {
        console.error("Error getting welcome status:", error);
        await message.sendReply("_Error retrieving welcome/goodbye status!_");
      }
      return;
    }

    if (input === "help") {
      const helpText = `╭━━━〔 ⚡ *OGGY-MD WELCOME HELP* ⚡ 〕━━━╮\n` +
        `┃ 📝 *Available Placeholders:*\n` +
        `┃ ◦ \`$mention\` - Mentions user\n` +
        `┃ ◦ \`$user\` - User's name\n` +
        `┃ ◦ \`$group\` - Group name\n` +
        `┃ ◦ \`$desc\` - Group description\n` +
        `┃ ◦ \`$count\` - Member count\n` +
        `┃ ◦ \`$pp\` - User's profile pic\n` +
        `┃ ◦ \`$gpp\` - Group profile pic\n` +
        `┃ ◦ \`$date\` - Current date\n` +
        `┃ ◦ \`$time\` - Current time\n` +
        `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
        `*💡 Stylish Examples:*\n` +
        `╭───〔 *Example 1* 〕───\n` +
        `│ \`Hey $mention! Welcome to $group 🎉 $pp\`\n` +
        `╰────────────────────────\n` +
        `╭───〔 *Example 2* 〕───\n` +
        `│ \`Welcome $user to our family! We now have $count members!$gpp\`\n` +
        `╰────────────────────────\n\n` +
        `_Tip: Use \`${handler}testwelcome\` to test._`;

      return await message.sendReply(helpText);
    }

    const welcomeMessage = match[1];
    if (welcomeMessage.length > 2000) {
      return await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD* 〕───\n│ ⚠️ *Message too long! (Max 2000 characters)*\n╰────────────────────────"
      );
    }
    await welcome.set(message.jid, welcomeMessage);
    await message.sendReply(
      `╭───〔 ⚡ *OGGY-MD WELCOME SET* 〕───\n` +
      `│ ✅ *Welcome message configured successfully!*\n` +
      `╰────────────────────────\n\n` +
      `*Preview:*\n${welcomeMessage}\n\n` +
      `💡 _Tip: Use \`${handler}testwelcome\` to see how it looks!_`
    );
  }
);

Module(
  {
    pattern: "goodbye ?(.*)",
    fromMe: false,
    desc: "Set goodbye message for group. Supports OGGY-MD placeholders.",
    usage:
      ".goodbye Bye $mention, thanks for being part of $group!$pp\n.goodbye on/off\n.goodbye get\n.goodbye del",
    use: "group",
  },
  async (message, match) => {
    let adminAccess = ADMIN_ACCESS
      ? await isAdmin(message, message.sender)
      : false;
    if (!message.fromOwner && !adminAccess) return;

    const input = match[1]?.toLowerCase();
    if (!input) {
      return await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD GOODBYE* ⚡ 〕━━━╮\n` +
        `┃ ⚙️ *Setup Commands:*\n` +
        `┃ ◦ \`${handler}goodbye <text>\` - Set goodbye msg\n` +
        `┃ ◦ \`${handler}goodbye on/off\` - Toggle goodbye\n` +
        `┃ ◦ \`${handler}goodbye get\` - View current msg\n` +
        `┃ ◦ \`${handler}goodbye del\` - Delete msg\n` +
        `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
        `╭───〔 💡 *QUICK EXAMPLE* 〕───\n` +
        `│ \`${handler}goodbye Goodbye$mention! Thanks for being part of $group 👋 $pp\`\n` +
        `╰────────────────────────`
      );
    }

    if (input === "on") {
      const current = await goodbye.get(message.jid);
      if (!current) {
        return await message.sendReply(
          "╭───〔 ⚡ *OGGY-MD* 〕───\n│ ⚠️ *No goodbye message set yet!*\n│ 💡 Use: `" + handler + "goodbye <text>`\n╰────────────────────────"
        );
      }
      await goodbye.toggle(message.jid, true);
      return await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ ✅ *Goodbye messages enabled for this group!*\n╰────────────────────────"
      );
    }

    if (input === "off") {
      await goodbye.toggle(message.jid, false);
      return await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ ❌ *Goodbye messages disabled for this group!*\n╰────────────────────────"
      );
    }

    if (input === "get") {
      const current = await goodbye.get(message.jid);
      if (!current) {
        return await message.sendReply(
          "╭───〔 ⚡ *OGGY-MD* 〕───\n│ ⚠️ *No goodbye message set for this group!*\n╰────────────────────────"
        );
      }
      return await message.sendReply(
        `╭━━━〔 ⚡ *CURRENT GOODBYE* 〕━━━╮\n` +
        `┃ 📊 *Status:* ${current.enabled ? "✅ Enabled" : "❌ Disabled"}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
        `*Message Preview:*\n${current.message}`
      );
    }

    if (input === "del" || input === "delete") {
      const deleted = await goodbye.delete(message.jid);
      if (deleted) {
        return await message.sendReply(
          "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ 🗑️ *Goodbye message deleted successfully!*\n╰────────────────────────"
        );
      }
      return await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD* 〕───\n│ ⚠️ *No goodbye message found to delete!*\n╰────────────────────────"
      );
    }

    const goodbyeMessage = match[1];
    if (goodbyeMessage.length > 2000) {
      return await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD* 〕───\n│ ⚠️ *Message too long! (Max 2000 characters)*\n╰────────────────────────"
      );
    }
    await goodbye.set(message.jid, goodbyeMessage);
    await message.sendReply(
      `╭───〔 ⚡ *OGGY-MD GOODBYE SET* 〕───\n` +
      `│ ✅ *Goodbye message configured successfully!*\n` +
      `╰────────────────────────\n\n` +
      `*Preview:*\n${goodbyeMessage}\n\n` +
      `💡 _Tip: Use \`${handler}testgoodbye\` to see how it looks!_`
    );
  }
);

Module(
  {
    pattern: "testwelcome ?(.*)",
    fromMe: false,
    desc: "Test the welcome message for current group",
    usage: ".testwelcome",
    use: "group",
  },
  async (message) => {
    let adminAccess = ADMIN_ACCESS
      ? await isAdmin(message, message.sender)
      : false;
    if (!message.fromOwner && !adminAccess) return;

    const welcomeData = await welcome.get(message.jid);
    if (!welcomeData || !welcomeData.enabled) {
      return await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD* 〕───\n│ ⚠️ *No welcome message set or welcome is disabled!* \n╰────────────────────────"
      );
    }
    const parsedMessage = await parseWelcomeMessage(
      welcomeData.message,
      message,
      [message.sender]
    );
    if (parsedMessage) {
      await message.sendReply("╭───〔 ⚡ *TESTING WELCOME* 〕───\n╰────────────────────────");
      await sendWelcomeMessage(message, parsedMessage);
    } else {
      await message.sendReply("_Error parsing welcome message!_");
    }
  }
);

Module(
  {
    pattern: "testgoodbye ?(.*)",
    fromMe: false,
    desc: "Test the goodbye message for current group",
    usage: ".testgoodbye",
    use: "group",
  },
  async (message) => {
    let adminAccess = ADMIN_ACCESS
      ? await isAdmin(message, message.sender)
      : false;
    if (!message.fromOwner && !adminAccess) return;

    const goodbyeData = await goodbye.get(message.jid);
    if (!goodbyeData || !goodbyeData.enabled) {
      return await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD* 〕───\n│ ⚠️ *No goodbye message set or goodbye is disabled!* \n╰────────────────────────"
      );
    }
    const parsedMessage = await parseWelcomeMessage(
      goodbyeData.message,
      message,
      [message.sender]
    );
    if (parsedMessage) {
      await message.sendReply("╭───〔 ⚡ *TESTING GOODBYE* 〕───\n╰────────────────────────");
      await sendWelcomeMessage(message, parsedMessage);
    } else {
      await message.sendReply("_Error parsing goodbye message!_");
    }
  }
);
