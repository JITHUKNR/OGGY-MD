const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// Snapchat Regex (Supports Spotlight, Stories, and t.snapchat.com shortlinks)
const SC_REGEX = /(?:https?:\/\/)?(?:www\.|story\.|t\.)?snapchat\.com\/[^\s]+/i;

const extractUrl = (text) => {
  if (!text) return null;
  const match = text.match(SC_REGEX);
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

// --- HIGH QUALITY SNAPCHAT FETCHER ---
async function fetchSnapchat(url) {
  let media = [];
  let caption = "👻 *Snapchat Video*\n\n⚡ *OGGY-MD SYSTEM*";

  // Engine 1: Agatz API
  try {
    const { data } = await axios.get(`https://api.agatz.xyz/api/snapchat?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.status && data.data && data.data.url) {
      media = [data.data.url];
      if (data.data.title) caption = `👻 *${data.data.title}*\n\n⚡ *OGGY-MD SYSTEM*`;
      return { media, caption };
    }
  } catch (e) {}

  // Engine 2: Vreden API
  try {
    const { data } = await axios.get(`https://api.vreden.my.id/api/snapchat?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.result) {
      let dlUrl = typeof data.result === 'string' ? data.result : data.result.url;
      if (dlUrl) {
        media = [dlUrl];
        return { media, caption };
      }
    }
  } catch (e) {}

  // Engine 3: Siputzx All DL Fallback
  try {
    const { data } = await axios.get(`https://api.siputzx.my.id/api/d/alldl?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.data && data.data.video) {
      media = [data.data.video];
      if (data.data.title) caption = `👻 *${data.data.title}*\n\n⚡ *OGGY-MD SYSTEM*`;
      return { media, caption };
    }
  } catch (e) {}

  throw new Error("Failed to fetch Snapchat media");
}

// --- CORE PROCESSOR ---
async function processSnapchat(message, cmd, targetUrl) {
  const waitMsg = await message.sendReply("⚡ *Fetching Snapchat Media...*");
  
  try {
    const data = await fetchSnapchat(targetUrl);
    const mUrl = data.media[0];

    // If user requested SONG/AUDIO
    if (['song', 'audio', 'mp3'].includes(cmd)) {
      await message.client.sendMessage(message.jid, {
        audio: { url: mUrl },
        mimetype: 'audio/mp4', // Magic format to send video audio as voice note
        ptt: false
      }, { quoted: message.data });
    } 
    // If user requested VIDEO
    else {
      await message.client.sendMessage(message.jid, {
        video: { url: mUrl },
        caption: data.caption
      }, { quoted: message.data });
    }

    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

  } catch (err) {
    await message.sendReply(`❌ *Snapchat Download Failed:* Please check if the link is valid and public.`);
    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
  }
}

// --- 1. COMMAND HANDLER (.snap, .snapchat, .spotlight) ---
Module(
  {
    pattern: "^[.]?(snap|snapchat|spotlight)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download High Quality Snapchat Spotlight & Stories",
    use: "download",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();
    let query = match[2] ? match[2].trim() : "";

    // Check reply message if query is empty
    if (!query) query = getReplyText(message).trim();

    const targetUrl = extractUrl(query);

    if (!targetUrl) {
      // Show menu only if they specifically typed .snap without a link
      if (['snap', 'snapchat', 'spotlight'].includes(cmd)) {
        return await message.sendReply(
          `╭━━━〔 👻 *OGGY-MD SNAPCHAT* 〕━━━╮\n` +
          `┃ 📌 *Reply to any Snapchat link with:*\n` +
          `┃ • \`song\` - For Spotlight Audio\n` +
          `┃ • \`video\` - For Spotlight Video\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
        );
      }
      return; 
    }

    // Default to video if just link is provided with .snap
    await processSnapchat(message, 'video', targetUrl);
  }
);

// --- 2. DIRECT REPLY LISTENER (Works without dot) ---
Module({ on: 'text', fromMe: isFromMe }, async (message) => {
  if (!message.jid || !message.reply_message) return;
  const text = (message.text || message.message || "").trim().toLowerCase();
  
  // Trigger only for exact keywords
  if (['song', 'video', 'audio', 'mp3', 'mp4'].includes(text)) {
    const targetUrl = extractUrl(getReplyText(message));
    
    // Check if it is a Snapchat link (so it doesn't clash with IG or YT)
    if (targetUrl) {
      await processSnapchat(message, text, targetUrl);
    }
  }
});
