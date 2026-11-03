const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// Instagram URL Regex
const IG_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|tv|stories|audio)\/[a-zA-Z0-9_-]+/i;

const extractUrl = (text) => {
  if (!text) return null;
  const match = text.match(IG_REGEX);
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

// --- HIGH QUALITY INSTAGRAM FETCHER ---
async function fetchInstaHQ(url) {
  let media = [];
  let caption = "";

  // 1. Primary Engine: API-FAA (From your trusted code)
  try {
    const { data } = await axios.get(`https://api-faa.my.id/faa/igdl?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.status && data.result) {
      if (Array.isArray(data.result.url)) {
        media = data.result.url;
      } else if (data.result.url) {
        media = [data.result.url];
      }
      caption = data.result.metadata?.caption || "";
      if (media.length > 0) return { media, caption };
    }
  } catch (e) {}

  // 2. Backup Engine: Vreden API (Excellent for Carousel Slides)
  try {
    const { data } = await axios.get(`https://api.vreden.my.id/api/igdownload?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.result) {
      if (data.result.medias && Array.isArray(data.result.medias)) {
        media = data.result.medias.map(m => m.url);
      } else if (Array.isArray(data.result)) {
        media = data.result.map(m => m.url || m);
      }
      caption = data.result.caption || data.result.title || "";
      if (media.length > 0) return { media, caption };
    }
  } catch(e) {}

  throw new Error("Failed to fetch High Quality Instagram media");
}

// --- CORE PROCESSOR ---
async function processInstagram(message, cmd, targetUrl) {
  const waitMsg = await message.sendReply("⚡ *Fetching High-Quality Instagram Media...*");
  
  try {
    const data = await fetchInstaHQ(targetUrl);
    
    // Add Original Caption
    let captionText = data.caption 
      ? `📝 *Caption:*\n${data.caption.substring(0, 800)}\n\n⚡ *OGGY-MD SYSTEM*` 
      : `⚡ *OGGY-MD SYSTEM*`;

    // Loop through all media (Perfect for Slide/Carousel posts)
    for (let i = 0; i < data.media.length; i++) {
      let mUrl = data.media[i];
      
      // If user requested SONG/AUDIO
      if (['song', 'audio', 'mp3'].includes(cmd)) {
        if (i === 0) { // Extract audio from the first reel/video only
          await message.client.sendMessage(message.jid, {
            audio: { url: mUrl },
            mimetype: 'audio/mp4', // Magic format to send video URL as Voice/Audio in WhatsApp
            ptt: false
          }, { quoted: message.data });
        }
        continue; 
      }

      // Check if the current slide is a Video or Image
      const isVideo = mUrl.includes('.mp4') || mUrl.includes('video');
      
      let msgObj = {};
      if (isVideo) {
        msgObj.video = { url: mUrl };
      } else {
        msgObj.image = { url: mUrl };
      }
      
      // Attach the caption only to the first Photo/Video in the slide
      if (i === 0) msgObj.caption = captionText;

      await message.client.sendMessage(message.jid, msgObj, { quoted: message.data });
    }

    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

  } catch (err) {
    await message.sendReply(`❌ *Instagram Download Failed:* Please check if the link is valid and account is public.`);
    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
  }
}

// --- 1. COMMAND HANDLER (.ig, .reel, .photo, .video, .song) ---
Module(
  {
    pattern: "^[.]?(ig|insta|reel|song|video|photo|pic|mp3|mp4)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download High Quality Instagram Reels & Carousel Posts",
    use: "download",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();
    let query = match[2] ? match[2].trim() : "";

    // Check reply message if query is empty
    if (!query) query = getReplyText(message).trim();
    
    // Ignore YouTube links (youtube.js will handle them)
    if (query.includes('youtu')) return;

    const targetUrl = extractUrl(query);

    if (!targetUrl) {
      // Show menu only if they specifically typed .ig or .insta without a link
      if (['ig', 'insta', 'reel'].includes(cmd)) {
        return await message.sendReply(
          `╭━━━〔 📸 *OGGY-MD INSTAGRAM* 〕━━━╮\n` +
          `┃ 📌 *Reply to any IG link with:*\n` +
          `┃ • \`song\` - For Reel Audio\n` +
          `┃ • \`video\` - For Reels/Video\n` +
          `┃ • \`photo\` - For Post/Slide Photos\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
        );
      }
      return; 
    }

    await processInstagram(message, cmd, targetUrl);
  }
);

// --- 2. DIRECT REPLY LISTENER (Works without dot) ---
Module({ on: 'text', fromMe: isFromMe }, async (message) => {
  if (!message.jid || !message.reply_message) return;
  const text = (message.text || message.message || "").trim().toLowerCase();
  
  // Trigger only for exact keywords
  if (['song', 'video', 'photo', 'audio', 'pic'].includes(text)) {
    const targetUrl = extractUrl(getReplyText(message));
    
    // Ignore YouTube links here too
    if (targetUrl && !targetUrl.includes('youtu')) {
      await processInstagram(message, text, targetUrl);
    }
  }
});
