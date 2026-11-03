const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// Twitter / X URL Regex
const TW_REGEX = /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/[^\s]+/i;

const extractUrl = (text) => {
  if (!text) return null;
  const match = text.match(TW_REGEX);
  return match ? match[0] : null;
};

const getReplyText = (message) => {
  if (!message.reply_message) return "";
  return (
    message.reply_message.text ||
    message.reply_message.caption ||
    message.reply_message.message ||
    message.reply_message?.data?.message?.conversation ||
    ""
  );
};

// --- HIGH QUALITY TWITTER FETCHER ---
async function fetchTwitter(url) {
  let cleanUrl = url.split("?")[0].replace(/(twitter\.com|x\.com)/i, "api.vxtwitter.com");
  
  // 1. Primary Engine: VxTwitter API (Best for Media & Quality)
  try {
    const { data } = await axios.get(cleanUrl, { timeout: 15000 });
    if (data && data.media_extended && data.media_extended.length > 0) {
      let mediaItems = data.media_extended.map(m => ({
        url: m.url,
        type: m.type === 'image' ? 'image' : 'video'
      }));
      let caption = data.text || "🐦 *X / Twitter Media*\n\n⚡ *OGGY-MD SYSTEM*";
      return { media: mediaItems, caption };
    }
  } catch (e) {}

  // 2. Backup Engine: Vreden Twitter API
  try {
    const { data } = await axios.get(`https://api.vreden.my.id/api/twitter?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.result) {
      let r = data.result;
      let mediaItems = [];
      if (r.type === 'video' && r.download_url) {
        let bestVideo = r.download_url.find(v => v.resolusi === '768p' || v.resolusi === '640p') || r.download_url[0];
        mediaItems.push({ url: bestVideo.url, type: 'video' });
      } else if (r.type === 'image' && r.download_url) {
        mediaItems = r.download_url.map(img => ({ url: img.url, type: 'image' }));
      }
      return { media: mediaItems, caption: "🐦 *X / Twitter Media*\n\n⚡ *OGGY-MD SYSTEM*" };
    }
  } catch (e) {}

  throw new Error("Failed to fetch Twitter media. Ensure the post is public.");
}

// --- CORE PROCESSOR ---
async function processTwitter(message, cmd, targetUrl) {
  const waitMsg = await message.sendReply("⚡ *Fetching High-Quality Twitter Media...*");
  
  try {
    const data = await fetchTwitter(targetUrl);
    let captionText = `📝 ${data.caption.substring(0, 700)}\n\n⚡ *OGGY-MD SYSTEM*`;

    for (let i = 0; i < data.media.length; i++) {
      let item = data.media[i];

      // If user requested SONG/AUDIO
      if (['song', 'audio', 'mp3'].includes(cmd)) {
        if (item.type === 'video') {
          if (i === 0) {
            await message.client.sendMessage(message.jid, {
              audio: { url: item.url },
              mimetype: 'audio/mp4',
              ptt: false
            }, { quoted: message.data });
          }
          break;
        } else {
          throw new Error("This is an image post, no audio available!");
        }
      }

      let msgObj = {};
      if (item.type === 'image') {
        msgObj.image = { url: item.url };
      } else {
        msgObj.video = { url: item.url };
      }

      if (i === 0) msgObj.caption = captionText;
      await message.client.sendMessage(message.jid, msgObj, { quoted: message.data });
    }

    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

  } catch (err) {
    await message.sendReply(`❌ *Twitter Download Failed:* ${err.message}`);
    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
  }
}

// --- 1. COMMAND HANDLER (.tw, .twitter, .x) ---
Module(
  {
    pattern: "^[.]?(tw|twitter|x|video|song|photo|pic|mp3|mp4)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download High Quality Twitter / X Videos and Photos",
    use: "download",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();
    let query = match[2] ? match[2].trim() : "";

    if (!query) query = getReplyText(message).trim();
    if (query.includes('youtu') || query.includes('instagram')) return;

    const targetUrl = extractUrl(query);

    if (!targetUrl) {
      if (['tw', 'twitter', 'x'].includes(cmd)) {
        return await message.sendReply(
          `╭━━━〔 🐦 *OGGY-MD TWITTER* 〕━━━╮\n` +
          `┃ 📌 *Reply to any X/Twitter link with:*\n` +
          `┃ • \`video\` - For HD Video\n` +
          `┃ • \`song\` - For Video Audio\n` +
          `┃ • \`photo\` - For Images\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
        );
      }
      return; 
    }

    await processTwitter(message, cmd, targetUrl);
  }
);

// --- 2. DIRECT REPLY LISTENER ---
Module({ on: 'text', fromMe: isFromMe }, async (message) => {
  if (!message.jid || !message.reply_message) return;
  const text = (message.text || message.message || "").trim().toLowerCase();
  
  if (['song', 'video', 'photo', 'audio', 'pic', 'mp3', 'mp4'].includes(text)) {
    const targetUrl = extractUrl(getReplyText(message));
    
    if (targetUrl) {
      await processTwitter(message, text, targetUrl);
    }
  }
});
