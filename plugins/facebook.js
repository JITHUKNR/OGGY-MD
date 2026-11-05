const { Module } = require("../main");
const { fb } = require("./utils"); // Using the custom FB function from your utils
const botConfig = require("../config");
const isFromMe = botConfig.MODE === "public" ? false : true;

// Facebook URL Regex (Matches fb.watch, fb.com, share/r/, etc.)
const FB_REGEX = /(?:https?:\/\/)?(?:www\.|m\.|web\.|video\.|watch\.)?(?:facebook\.com|fb\.watch|fb\.com|fb\.gg|fb\.me)\/[^\s]+/i;

const extractUrl = (text) => {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(FB_REGEX);
  return match ? match[0] : null;
};

const getReplyText = (message) => {
  try {
    if (!message.reply_message) return "";
    let rm = message.reply_message;
    let text = rm.text || rm.caption || rm.conversation || rm.matchedText || rm.canonicalUrl || "";
    
    if (!text && rm.message) {
      if (typeof rm.message === 'string') {
        text = rm.message;
      } else if (typeof rm.message === 'object') {
        text = rm.message.conversation || rm.message.extendedTextMessage?.text || rm.message.videoMessage?.caption || rm.message.imageMessage?.caption || "";
      }
    }
    return String(text).trim();
  } catch (e) {
    return "";
  }
};

// --- CORE PROCESSOR ---
async function processFacebook(message, targetUrl) {
  const waitMsg = await message.sendReply("⚡ *Fetching High-Quality Facebook Video...*");
  
  try {
    // Utilize the robust 'fb' utility function from your reference code
    const { url } = await fb(targetUrl);
    
    if (!url) {
        throw new Error("No download URL returned from API");
    }

    await message.client.sendMessage(message.jid, {
        video: { url: url },
        caption: "🔵 *Facebook Media*\n\n⚡ *OGGY-MD SYSTEM*"
    }, { quoted: message.data });

    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

  } catch (err) {
    console.error("Facebook download error:", err.message);
    await message.sendReply(`❌ *Facebook Download Failed:* ${err.message || "_Something went wrong, Please try again!_"}`);
    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
  }
}

// --- 1. COMMAND HANDLER (.fb, .facebook, .video) ---
Module(
  {
    pattern: "^[.]?(fb|facebook|fbvideo|fbreel|video)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download High Quality Facebook Videos, Reels & Photos",
    use: "download",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();
    let query = match[2] ? String(match[2]).trim() : "";

    if (!query) query = getReplyText(message);
    query = String(query).trim();

    // Prevent clashing with other platforms if they use 'video'
    if (query.match(/youtu|instagram|instagr\.am|tiktok|twitter|x\.com|snapchat|spotify|pinterest|pin\.it|threads/i)) return;

    const targetUrl = extractUrl(query);

    if (!targetUrl) {
      if (['fb', 'facebook'].includes(cmd)) {
        return await message.sendReply(
          `╭━━━〔 🔵 *OGGY-MD FACEBOOK* 〕━━━╮\n` +
          `┃ 📌 *Reply to any FB link with:*\n` +
          `┃ • \`video\` - For HD Video/Reel\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
        );
      }
      return; 
    }

    await processFacebook(message, targetUrl);
  }
);

// --- 2. DIRECT REPLY LISTENER ---
Module({ on: 'text', fromMe: isFromMe }, async (message) => {
  if (!message.jid || !message.reply_message) return;
  const text = String(message.text || message.message || "").trim().toLowerCase();
  
  if (['video', 'mp4'].includes(text)) {
    let replyTxt = getReplyText(message);
    const targetUrl = extractUrl(replyTxt);
    
    if (targetUrl && targetUrl.match(/facebook|fb\.watch|fb\.com/i)) {
      await processFacebook(message, targetUrl);
    }
  }
});
