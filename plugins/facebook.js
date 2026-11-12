const { Module } = require("../main");
const { fb } = require("./utils"); 
const botConfig = require("../config");
const axios = require("axios"); // Added for caption and photo fetching
const isFromMe = botConfig.MODE === "public" ? false : true;

// Facebook URL Regex
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
async function processFacebook(message, cmd, targetUrl) {
  const waitMsg = await message.sendReply("⚡ *Fetching Facebook Media...*");
  
  try {
    // 1. Fetching Original Caption
    let actualCaption = "";
    try {
       const { data } = await axios.get(`https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(targetUrl)}`);
       if (data && data.result && data.result.title) {
           actualCaption = data.result.title;
       } else if (data && data.result && data.result.desc) {
           actualCaption = data.result.desc;
       }
    } catch(e) {}

    // 2. WhatsApp "Read More" Magic Trick
    const readMore = String.fromCharCode(8206).repeat(4000);
    let finalCaption = `🔵 *Facebook Media*`;
    
    if (actualCaption) {
        finalCaption += `\n${readMore}\n📝 *Caption:*\n${actualCaption}\n\n⚡ *OGGY-MD SYSTEM*`;
    } else {
        finalCaption += `\n\n⚡ *OGGY-MD SYSTEM*`;
    }

    // 3. Process Based on Command
    if (['photo', 'pic', 'image'].includes(cmd)) {
      // Fetching Facebook Photo
      let photoUrl = null;
      try {
         const { data } = await axios.get(`https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(targetUrl)}`);
         if (data && data.result && data.result[0] && data.result[0].url) {
             photoUrl = data.result[0].url;
         }
      } catch(e) {}

      if (!photoUrl) {
         try {
            const { data } = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(targetUrl)}`);
            if (data && data.data && data.data.length > 0) {
                photoUrl = data.data[0].url || data.data[0].thumbnail;
            }
         } catch(e) {}
      }

      if (!photoUrl) throw new Error("Could not fetch photo. Ensure the post is a public photo post.");

      await message.client.sendMessage(message.jid, {
        image: { url: photoUrl },
        caption: finalCaption
      }, { quoted: message.data });

    } else {
      // Fetching Facebook Video or Song using your reliable 'fb' utils
      const { url } = await fb(targetUrl);
      
      if (!url) {
          throw new Error("No download URL returned from API");
      }

      if (['song', 'audio', 'mp3'].includes(cmd)) {
        await message.client.sendMessage(message.jid, {
          audio: { url: url },
          mimetype: 'audio/mp4',
          ptt: false
        }, { quoted: message.data });
      } else {
        await message.client.sendMessage(message.jid, {
          video: { url: url },
          caption: finalCaption
        }, { quoted: message.data });
      }
    }

    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

  } catch (err) {
    console.error("Facebook download error:", err.message);
    await message.sendReply(`❌ *Facebook Download Failed:* ${err.message || "_Something went wrong, Please try again!_"}`);
    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
  }
}

// --- 1. COMMAND HANDLER (.fb, .facebook, .video, .song, .photo) ---
Module(
  {
    pattern: "^[.]?(fb|facebook|fbvideo|fbreel|video|song|photo)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download High Quality Facebook Videos, Audio & Photos",
    use: "download",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();
    let query = match[2] ? String(match[2]).trim() : "";

    if (!query) query = getReplyText(message);
    query = String(query).trim();

    // Prevent clashing with other platforms
    if (query.match(/youtu|instagram|instagr\.am|tiktok|twitter|x\.com|snapchat|spotify|pinterest|pin\.it|threads/i)) return;

    const targetUrl = extractUrl(query);

    if (!targetUrl) {
      if (['fb', 'facebook'].includes(cmd)) {
        return await message.sendReply(
          `╭━━━〔 🔵 *OGGY-MD FACEBOOK* 〕━━━╮\n` +
          `┃ 📌 *Reply to any FB link with:*\n` +
          `┃ • \`video\` - For HD Video/Reel\n` +
          `┃ • \`song\` - For Video Audio\n` +
          `┃ • \`photo\` - For Public Image Post\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
        );
      }
      return; 
    }

    let reqCmd = 'video';
    if (['song', 'audio', 'mp3'].includes(cmd)) reqCmd = 'song';
    if (['photo', 'pic', 'image'].includes(cmd)) reqCmd = 'photo';
    
    await processFacebook(message, reqCmd, targetUrl);
  }
);

// --- 2. DIRECT REPLY LISTENER ---
Module({ on: 'text', fromMe: isFromMe }, async (message) => {
  if (!message.jid || !message.reply_message) return;
  const text = String(message.text || message.message || "").trim().toLowerCase();
  
  if (['song', 'audio', 'mp3', 'video', 'mp4', 'photo', 'pic', 'image'].includes(text)) {
    let replyTxt = getReplyText(message);
    const targetUrl = extractUrl(replyTxt);
    
    if (targetUrl && targetUrl.match(/facebook|fb\.watch|fb\.com/i)) {
      await processFacebook(message, text, targetUrl);
    }
  }
});
