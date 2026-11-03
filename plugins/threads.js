const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// Threads URL Regex
const TH_REGEX = /(?:https?:\/\/)?(?:www\.)?threads\.(?:net|com)\/[^\s]+/i;

const extractUrl = (text) => {
  if (!text) return null;
  const match = text.match(TH_REGEX);
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

// --- HIGH QUALITY THREADS FETCHER ---
async function fetchThreads(url) {
  let media = [];
  let caption = "🌀 *Threads Media*\n\n⚡ *OGGY-MD SYSTEM*";

  // 1. Primary Engine: Nexray API (From your original code)
  try {
    const { data } = await axios.get(`https://api.nexray.web.id/downloader/threads?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.status && data.result && data.result.media) {
      // Nexray returns array of media objects
      return { media: data.result.media, caption };
    }
  } catch (e) {}

  // 2. Backup Engine: Agatz API
  try {
    const { data } = await axios.get(`https://api.agatz.xyz/api/threads?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.status && data.data) {
      // Returns an array of URLs
      let mediaItems = data.data.map(m => ({ url: m, type: m.includes('.mp4') ? 'video' : 'image' }));
      return { media: mediaItems, caption };
    }
  } catch (e) {}

  // 3. Backup Engine: Siputzx API
  try {
    const { data } = await axios.get(`https://api.siputzx.my.id/api/d/threads?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.data && data.data.media) {
      return { media: data.data.media, caption };
    }
  } catch (e) {}

  throw new Error("Failed to fetch Threads media. Ensure the post is public.");
}

// --- CORE PROCESSOR ---
async function processThreads(message, cmd, targetUrl) {
  const waitMsg = await message.sendReply("⚡ *Fetching High-Quality Threads Media...*");
  
  try {
    const data = await fetchThreads(targetUrl);
    
    // Process all media in the post (Handles both images and videos)
    for (let i = 0; i < data.media.length; i++) {
      let item = data.media[i];
      let msgObj = {};

      // Handle different API response structures
      let mUrl = typeof item === 'string' ? item : item.url;
      let isVideo = typeof item !== 'string' && item.thumbnail && item.thumbnail !== "-" || mUrl.includes('.mp4');

      if (isVideo) {
        msgObj.video = { url: mUrl };
      } else {
        msgObj.image = { url: mUrl };
      }

      if (i === 0) msgObj.caption = data.caption;
      await message.client.sendMessage(message.jid, msgObj, { quoted: message.data });
    }

    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

  } catch (err) {
    await message.sendReply(`❌ *Threads Download Failed:* ${err.message}`);
    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
  }
}

// --- 1. COMMAND HANDLER (.th, .threads) ---
Module(
  {
    pattern: "^[.]?(th|threads|photo|pic|image|video|mp4)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download High Quality Threads Photos and Videos",
    use: "download",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();
    let query = match[2] ? match[2].trim() : "";

    if (!query) query = getReplyText(message).trim();
    
    // Prevent clashing with other platforms
    if (query.includes('youtu') || query.includes('instagram') || query.includes('twitter') || query.includes('facebook') || query.includes('tiktok') || query.includes('spotify') || query.includes('pin')) return;

    const targetUrl = extractUrl(query);

    if (!targetUrl) {
      if (['th', 'threads'].includes(cmd)) {
        return await message.sendReply(
          `╭━━━〔 🌀 *OGGY-MD THREADS* 〕━━━╮\n` +
          `┃ 📌 *Reply to any Threads link with:*\n` +
          `┃ • \`photo\` - For Image Posts\n` +
          `┃ • \`video\` - For Video Posts\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
        );
      }
      return; 
    }

    await processThreads(message, cmd, targetUrl);
  }
);

// --- 2. DIRECT REPLY LISTENER ---
Module({ on: 'text', fromMe: isFromMe }, async (message) => {
  if (!message.jid || !message.reply_message) return;
  const text = (message.text || message.message || "").trim().toLowerCase();
  
  if (['photo', 'pic', 'image', 'video', 'mp4'].includes(text)) {
    const targetUrl = extractUrl(getReplyText(message));
    
    if (targetUrl && targetUrl.includes('threads')) {
      await processThreads(message, text, targetUrl);
    }
  }
});
