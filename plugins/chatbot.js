const { Module } = require("../main");
const config = require("../config");
const axios = require("axios");
const fromMe = config.MODE !== "public";
const { setVar } = require("./manage");
const fs = require("fs");

const chatbotStates = new Map();
const chatContexts = new Map();

let globalSystemPrompt =
  "You are OGGY-MD, a smart, polite, highly skilled, and professional WhatsApp AI peer. Keep responses concise, direct, helpful, and well-formatted with WhatsApp markdown (*bold*, _italic_, `code`, bullet points).";

// 1. INITIALIZE SAVED CHATBOT SETTINGS
async function initChatbotData() {
  try {
    const chatbotData = config.CHATBOT || "";
    if (chatbotData) {
      const enabledChats = chatbotData.split(",").filter((jid) => jid.trim());
      enabledChats.forEach((jid) => {
        chatbotStates.set(jid.trim(), true);
      });
    }

    const systemPrompt = config.CHATBOT_SYSTEM_PROMPT;
    if (systemPrompt) {
      globalSystemPrompt = systemPrompt;
    }
  } catch (error) {
    console.error("Error initializing chatbot data:", error);
  }
}

async function saveChatbotData() {
  try {
    const enabledChats = [];
    for (const [jid, enabled] of chatbotStates.entries()) {
      if (enabled) enabledChats.push(jid);
    }
    await setVar("CHATBOT", enabledChats.join(","));
  } catch (error) {
    console.error("Error saving chatbot data:", error);
  }
}

async function saveSystemPrompt(prompt) {
  try {
    globalSystemPrompt = prompt;
    await setVar("CHATBOT_SYSTEM_PROMPT", prompt);
  } catch (error) {
    console.error("Error saving system prompt:", error);
  }
}

// 2. 100% FREE AI ENGINE (NO API KEY OR COOKIES REQUIRED)
async function callFreeAI(messages, systemPrompt = globalSystemPrompt) {
  const payloadMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  try {
    const response = await axios.post(
      "https://text.pollinations.ai/",
      {
        messages: payloadMessages,
        model: "openai",
        seed: Math.floor(Math.random() * 1000000),
      },
      { timeout: 35000 }
    );

    if (response.data && typeof response.data === "string") {
      return response.data.trim();
    }
    if (typeof response.data === "object" && response.data.content) {
      return response.data.content.trim();
    }
    throw new Error("Invalid format received from AI engine");
  } catch (err) {
    console.error("Free AI Error:", err.message);
    throw err;
  }
}

// 3. AI RESPONSE HANDLER WITH PERSISTENT CONTEXT
async function getAIResponse(userText, chatJid) {
  try {
    const context = chatContexts.get(chatJid) || [];
    const messages = [];

    // Keep last 10 messages for conversation memory
    const recentContext = context.slice(-10);
    for (const msg of recentContext) {
      if (msg.role && msg.content) {
        messages.push({
          role: msg.role === "assistant" || msg.role === "model" ? "assistant" : "user",
          content: msg.content,
        });
      }
    }

    messages.push({ role: "user", content: userText });

    const aiReply = await callFreeAI(messages, globalSystemPrompt);

    if (aiReply) {
      if (!chatContexts.has(chatJid)) {
        if (chatContexts.size >= 500) {
          const oldestChatKey = chatContexts.keys().next().value;
          if (oldestChatKey) chatContexts.delete(oldestChatKey);
        }
        chatContexts.set(chatJid, []);
      }

      const contextArray = chatContexts.get(chatJid);
      contextArray.push({ role: "user", content: userText });
      contextArray.push({ role: "assistant", content: aiReply });

      if (contextArray.length > 20) {
        contextArray.splice(0, contextArray.length - 20);
      }

      return aiReply;
    } else {
      return `✦ *Error:* AI returned an empty response. Please try again.`;
    }
  } catch (error) {
    return `✦ *Error:* AI service is busy right now. Please try again in a few moments.`;
  }
}

function isChatbotEnabled(jid) {
  if (chatbotStates.get(jid) === true) return true;
  const isGroup = jid.includes("@g.us");
  if (isGroup && config.CHATBOT_ALL_GROUPS === "true") return true;
  if (!isGroup && config.CHATBOT_ALL_DMS === "true") return true;
  return false;
}

async function enableChatbot(jid) {
  chatbotStates.set(jid, true);
  await saveChatbotData();
}

async function disableChatbot(jid) {
  chatbotStates.set(jid, false);
  chatContexts.delete(jid);
  await saveChatbotData();
}

function clearContext(jid) {
  chatContexts.delete(jid);
}

initChatbotData();

// ==========================================
// 1. CHATBOT MANAGER COMMAND (.chatbot)
// ==========================================
Module(
  {
    pattern: "chatbot ?(.*)",
    fromMe: true,
    desc: "Manage AI Auto-responder and settings",
    usage: ".chatbot <on/off/status/clear>",
    use: "ai",
  },
  async (message, match) => {
    const input = match[1]?.trim();
    const chatJid = message.jid;

    if (!input) {
      const isEnabled = isChatbotEnabled(chatJid);
      const globalGroups = config.CHATBOT_ALL_GROUPS === "true";
      const globalDMs = config.CHATBOT_ALL_DMS === "true";
      const contextSize = chatContexts.get(chatJid)?.length || 0;

      const helpText =
        `⚡ *OGGY-MD* • ᴀɪ ᴍᴀɴᴀɢᴇʀ\n\n` +
        `✦ *Status:* ${isEnabled ? "Enabled ✨" : "Disabled ⏸️"}\n` +
        `✦ *Engine:* Free GPT Engine (Active ✅)\n` +
        `✦ *All Groups:* ${globalGroups ? "Active" : "Inactive"}\n` +
        `✦ *All DMs:* ${globalDMs ? "Active" : "Inactive"}\n` +
        `✦ *Saved History:* ${contextSize} message(s)\n\n` +
        `◈ *Commands:*\n` +
        `• \`.chatbot on\` - Enable in this chat\n` +
        `• \`.chatbot off\` - Disable in this chat\n` +
        `• \`.chatbot on groups\` - Enable across all groups\n` +
        `• \`.chatbot on dms\` - Enable across all DMs\n` +
        `• \`.chatbot clear\` - Reset conversation memory\n` +
        `• \`.chatbot set "prompt"\` - Set custom AI personality\n\n` +
        `_Replies, mentions, and DMs will trigger AI answers automatically._`;

      return await message.sendReply(helpText);
    }

    const args = input.split(" ");
    const command = args[0].toLowerCase();
    const target = args[1]?.toLowerCase();

    switch (command) {
      case "on":
        if (target === "groups") {
          await setVar("CHATBOT_ALL_GROUPS", "true");
          return await message.sendReply(
            `⚡ *OGGY-MD* • ᴀɪ\n\n✦ *Status:* AI auto-responder enabled for all groups.`
          );
        } else if (target === "dms") {
          await setVar("CHATBOT_ALL_DMS", "true");
          return await message.sendReply(
            `⚡ *OGGY-MD* • ᴀɪ\n\n✦ *Status:* AI auto-responder enabled for all DMs.`
          );
        } else {
          await enableChatbot(chatJid);
          return await message.sendReply(
            `⚡ *OGGY-MD* • ᴀɪ\n\n✦ *Status:* AI auto-responder enabled in this chat.`
          );
        }

      case "off":
        if (target === "groups") {
          await setVar("CHATBOT_ALL_GROUPS", "false");
          return await message.sendReply(
            `⚡ *OGGY-MD* • ᴀɪ\n\n✦ *Status:* AI auto-responder disabled for groups.`
          );
        } else if (target === "dms") {
          await setVar("CHATBOT_ALL_DMS", "false");
          return await message.sendReply(
            `⚡ *OGGY-MD* • ᴀɪ\n\n✦ *Status:* AI auto-responder disabled for DMs.`
          );
        } else {
          await disableChatbot(chatJid);
          return await message.sendReply(
            `⚡ *OGGY-MD* • ᴀɪ\n\n✦ *Status:* AI auto-responder disabled in this chat.`
          );
        }

      case "set":
        const promptMatch = input.match(/set\s+"([^"]+)"/);
        if (!promptMatch) {
          return await message.sendReply(
            `✦ *Usage:* \`.chatbot set "You are a friendly assistant."\``
          );
        }
        await saveSystemPrompt(promptMatch[1]);
        return await message.sendReply(
          `⚡ *OGGY-MD* • ᴀɪ\n\n✦ *Status:* System personality prompt updated successfully.`
        );

      case "clear":
        clearContext(chatJid);
        return await message.sendReply(
          `⚡ *OGGY-MD* • ᴀɪ\n\n✦ *Status:* Conversation memory cleared. Fresh chat initialized.`
        );

      default:
        return await message.sendReply(`✦ *Error:* Unknown command. Use \`.chatbot\` for menu.`);
    }
  }
);

// ==========================================
// 2. BACKGROUND AUTO-RESPONDER LISTENER
// ==========================================
Module(
  {
    on: "text",
    fromMe: false,
  },
  async (message) => {
    try {
      const chatJid = message.jid;
      const isGroup = message.isGroup;
      const isDM = !isGroup;

      if (!isChatbotEnabled(chatJid) || message.fromMe) return;

      let shouldRespond = false;
      const messageText = message.text || "";

      if (isDM) {
        shouldRespond = true;
      } else if (isGroup) {
        const botJid = message.client.user?.lid || message.client.user?.id;
        const botNum = botJid?.split(":")[0]?.split("@")[0];

        if (message.mention && message.mention.length > 0) {
          const botMentioned = message.mention.some((jid) => jid.split("@")[0] === botNum);
          if (botMentioned) shouldRespond = true;
        }

        if (message.reply_message && message.reply_message.jid) {
          const repliedToNum = message.reply_message.jid.split("@")[0];
          if (repliedToNum === botNum) shouldRespond = true;
        }
      }

      if (!shouldRespond || messageText.length < 2) return;

      // Ignore messages starting with command handlers (. or ,)
      const handlers = config.HANDLERS || ".,";
      const prefixes = handlers.split("").filter((c) => c.trim());
      if (prefixes.some((p) => messageText.startsWith(p))) return;

      const reply = await getAIResponse(messageText, chatJid);
      if (reply) {
        await message.sendReply(reply);
      }
    } catch (error) {
      console.error("Chatbot listener error:", error);
    }
  }
);

// ==========================================
// 3. INSTANT AI QUERY COMMAND (.ai)
// ==========================================
Module(
  {
    pattern: "ai ?(.*)",
    fromMe,
    desc: "Ask anything to AI Assistant",
    type: "ai",
  },
  async (message, match) => {
    let prompt = match[1]?.trim() || message.reply_message?.text;

    if (!prompt) {
      return await message.sendReply(
        `⚡ *OGGY-MD* • ᴀɪ ᴀꜱꜱɪꜱᴛᴀɴᴛ\n\n` +
        `✦ *Status:* Missing Prompt\n` +
        `✦ *Usage:* \`.ai <your question>\`\n\n` +
        `_Example: .ai write a short leave letter_`
      );
    }

    let thinkingMsg;
    try {
      thinkingMsg = await message.sendReply(
        `⚡ *OGGY-MD* • ᴀɪ ᴀꜱꜱɪꜱᴛᴀɴᴛ\n\n` +
        `✦ *Processing prompt...* ▰▰▰▰▱▱ [60%]`
      );

      const aiReply = await getAIResponse(prompt, message.jid);

      const formatted =
        `⚡ *OGGY-MD* • ᴀɪ ᴀꜱꜱɪꜱᴛᴀɴᴛ\n\n` +
        `${aiReply}\n\n` +
        `◈ *Engine:* Free GPT • ✦ *Status:* Complete ✨`;

      if (thinkingMsg && thinkingMsg.key) {
        await message.edit(formatted, message.jid, thinkingMsg.key);
      } else {
        await message.sendReply(formatted);
      }
    } catch (err) {
      console.error("AI command error:", err);
      const errMsg = `✦ *Error:* AI service is busy. Please try again later.`;
      if (thinkingMsg && thinkingMsg.key) {
        await message.edit(errMsg, message.jid, thinkingMsg.key);
      } else {
        await message.sendReply(errMsg);
      }
    }
  }
);
