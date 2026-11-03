const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// SoundCloud URL Regex
const SC_REGEX = /(?:https?:\/\/)?(?:www\.|on\.)?soundcloud\.com\/[^\s]+/i;

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

// --- HIGH QUALITY SOUNDCLOUD FETCHER ---
async function fetchSoundCloud(url) {
  let media = null;
  let title = "SoundCloud Audio";

  // 1. Primary Engine: Nexray API (From your original code)
  try {
    const { data } = await axios.get(`https://api.nexray.web.id/downloader/soundcloud?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.status && data.result && data.result.url) {
      media = data.result.url;
      title = data.result.title || title;
      return { media, title };
    }
  } catch (e) {}

  // 2. Backup Engine: Vreden API
  try {
    const { data } = await axios.get(`https://api.vreden.my.id/api/soundcloud?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.result && data.result.download) {
      media = data.result.download;
      title = data.result.title || title;
      return { media, title };
    }
  } catch (e) {}

  // 3. Backup Engine: Siputzx API
  try {
    const { data } = await axios.get(`https://api.siputzx.my.id/api/d/soundcloud?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.data && data.data.url) {
      media = data.data.url;
      title = data.data.title || title;
      return { media, title };
    }
  } catch (e) {}

  throw new Error("Failed to fetch SoundCloud audio. Ensure the link is correct.");
}

// --- CORE PROCESSOR ---
async function processSoundCloud(message, targetUrl) {
  const waitMsg = await message.sendReply("🎶 *Fetching High-Quality SoundCloud Audio...*");
  
  try {
    const data = await fetchSoundCloud(targetUrl);
    
    await message.client.sendMessage(message.jid, {
      audio: { url: data.media },
      mimetype: 'audio/mpeg',
      fileName: `${data.title}.mp3`,
      contextInfo: {
        externalAdReply: {
          title: data.title,
          body: "☁️ SoundCloud Music",
          thumbnailUrl: "https://developers.soundcloud.com/assets/logo_black-893bd5f25a3d76bc9dfd82eecfb848c1.png",
          mediaType: 2,
          renderLargerThumbnail: true,
        },
      },
    }, { quoted: message.data });

    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

  } catch (err) {
    await message.sendReply(`❌ *SoundCloud Download Failed:* ${err.message}`);
    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
  }
}

// --- 1. COMMAND HANDLER (.sc, .soundcloud) ---
Module(
  {
    pattern: "^[.]?(sc|soundcloud|song|audio|mp3)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download High Quality SoundCloud Tracks",
    use: "download",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();
    let query = match[2] ? match[2].trim() : "";

    if (!query) query = getReplyText(message).trim();
    
    // Prevent clashing with other platforms
    if (query.includes('youtu') || query.includes('instagram') || query.includes('twitter') || query.includes('facebook') || query.includes('tiktok') || query.includes('spotify') || query.includes('pin') || query.includes('threads')) return;

    const targetUrl = extractUrl(query);

    if (!targetUrl) {
      if (['sc', 'soundcloud'].includes(cmd)) {
        return await message.sendReply(
          `╭━━━〔 ☁️ *OGGY-MD SOUNDCLOUD* 〕━━━╮\n` +
          `┃ 📌 *Reply to any SoundCloud link with:*\n` +
          `┃ • \`song\` - For High Quality MP3\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
        );
      }
      return; 
    }

    await processSoundCloud(message, targetUrl);
  }
);

// --- 2. DIRECT REPLY LISTENER ---
Module({ on: 'text', fromMe: isFromMe }, async (message) => {
  if (!message.jid || !message.reply_message) return;
  const text = (message.text || message.message || "").trim().toLowerCase();
  
  if (['song', 'audio', 'mp3', 'play'].includes(text)) {
    const targetUrl = extractUrl(getReplyText(message));
    
    // Process only if it is a SoundCloud link
    if (targetUrl && targetUrl.includes('soundcloud')) {
      await processSoundCloud(message, targetUrl);
    }
  }
});
