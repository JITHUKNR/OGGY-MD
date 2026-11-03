const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// Spotify URL Regex
const SP_REGEX = /(?:https?:\/\/)?(?:open\.)?(?:spotify\.com)\/(?:track|episode)\/[^\s?\/]+/i;

const extractUrl = (text) => {
  if (!text) return null;
  const match = text.match(SP_REGEX);
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

// --- HIGH QUALITY SPOTIFY FETCHER ---
async function fetchSpotify(url) {
  let media = null;
  let title = "Spotify Audio";
  let artist = "Unknown Artist";
  let cover = "https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg";

  // 1. Primary Engine: Vreden API
  try {
    const { data } = await axios.get(`https://api.vreden.my.id/api/spotify?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.result && data.result.download) {
      media = data.result.download;
      title = data.result.title || title;
      artist = data.result.artists || artist;
      cover = data.result.image || cover;
      return { media, title, artist, cover };
    }
  } catch (e) {}

  // 2. Backup Engine: Nexray API
  try {
    const { data } = await axios.get(`https://api.nexray.web.id/downloader/spotify?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.status && data.result && data.result.url) {
      media = data.result.url;
      title = data.result.title || title;
      artist = data.result.artist || artist;
      return { media, title, artist, cover };
    }
  } catch (e) {}
  
  // 3. Backup Engine: Siputzx API
  try {
    const { data } = await axios.get(`https://api.siputzx.my.id/api/d/spotify?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.data && data.data.download) {
      media = data.data.download;
      title = data.data.title || title;
      artist = data.data.artist || artist;
      cover = data.data.thumbnail || cover;
      return { media, title, artist, cover };
    }
  } catch (e) {}

  throw new Error("Failed to fetch Spotify audio. Ensure the link is a valid track.");
}

// --- CORE PROCESSOR ---
async function processSpotify(message, targetUrl) {
  const waitMsg = await message.sendReply("🎶 *Fetching High-Quality Spotify Audio...*");
  
  try {
    const data = await fetchSpotify(targetUrl);
    
    await message.client.sendMessage(message.jid, {
      audio: { url: data.media },
      mimetype: 'audio/mpeg',
      fileName: `${data.title} - ${data.artist}.mp3`,
      contextInfo: {
        externalAdReply: {
          title: data.title,
          body: data.artist || "🎧 Spotify Music",
          thumbnailUrl: data.cover,
          mediaType: 2,
          renderLargerThumbnail: true,
        },
      },
    }, { quoted: message.data });

    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

  } catch (err) {
    await message.sendReply(`❌ *Spotify Download Failed:* ${err.message}`);
    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
  }
}

// --- 1. COMMAND HANDLER (.spotify, .sp) ---
Module(
  {
    pattern: "^[.]?(sp|spotify|song|audio|mp3)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download High Quality Spotify Tracks",
    use: "download",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();
    let query = match[2] ? match[2].trim() : "";

    if (!query) query = getReplyText(message).trim();
    
    // Prevent clashing with other platforms
    if (query.includes('youtu') || query.includes('instagram') || query.includes('twitter') || query.includes('facebook') || query.includes('tiktok')) return;

    const targetUrl = extractUrl(query);

    if (!targetUrl) {
      if (['sp', 'spotify'].includes(cmd)) {
        return await message.sendReply(
          `╭━━━〔 🟢 *OGGY-MD SPOTIFY* 〕━━━╮\n` +
          `┃ 📌 *Reply to any Spotify link with:*\n` +
          `┃ • \`song\` - For High Quality MP3\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
        );
      }
      return; 
    }

    await processSpotify(message, targetUrl);
  }
);

// --- 2. DIRECT REPLY LISTENER ---
Module({ on: 'text', fromMe: isFromMe }, async (message) => {
  if (!message.jid || !message.reply_message) return;
  const text = (message.text || message.message || "").trim().toLowerCase();
  
  if (['song', 'audio', 'mp3', 'play'].includes(text)) {
    const targetUrl = extractUrl(getReplyText(message));
    
    // Process only if it is a Spotify link
    if (targetUrl) {
      await processSpotify(message, targetUrl);
    }
  }
});
