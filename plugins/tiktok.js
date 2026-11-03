const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// TikTok URL Regex
const TT_REGEX = /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/[^\s]+/i;

const extractUrl = (text) => {
  if (!text) return null;
  const match = text.match(TT_REGEX);
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

// --- HIGH QUALITY TIKTOK FETCHER (NO WATERMARK) ---
async function fetchTikTok(url) {
  // 1. Primary Engine: TikWM API (Best for No-Watermark, Audio & Slides)
  try {
    const { data } = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.code === 0 && data.data) {
      return data.data; // Contains .play (video), .music (audio), .images (array)
    }
  } catch (e) {}

  // 2. Backup Engine: Vreden API
  try {
    const { data } = await axios.get(`https://api.vreden.my.id/api/tiktok?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (data && data.result) {
      let r = data.result;
      return {
        play: r.video_nowatermark || r.video,
        music: r.audio,
        images: r.images,
        title: r.title
      };
    }
  } catch (e) {}

  throw new Error("Failed to fetch TikTok media. Ensure the post is public.");
}

// --- CORE PROCESSOR ---
async function processTikTok(message, cmd, targetUrl) {
  const waitMsg = await message.sendReply("⚡ *Fetching High-Quality TikTok Media...*");
  
  try {
    const data = await fetchTikTok(targetUrl);
    let captionText = data.title ? `🎵 *${data.title}*\n\n⚡ *OGGY-MD SYSTEM*` : `⚡ *OGGY-MD SYSTEM*`;

    // If user requested SONG/AUDIO
    if (['song', 'audio', 'mp3'].includes(cmd)) {
      const audioUrl = data.music || data.music_info?.url || data.audio;
      if (!audioUrl) throw new Error("Audio not found in this post!");
      
      await message.client.sendMessage(message.jid, {
        audio: { url: audioUrl },
        mimetype: 'audio/mp4',
        ptt: false
      }, { quoted: message.data });
    } 
    // If user requested PHOTO (TikTok Slides)
    else if (['photo', 'pic', 'image'].includes(cmd)) {
      if (data.images && data.images.length > 0) {
        for (let i = 0; i < data.images.length; i++) {
          let msgObj = { image: { url: data.images[i] } };
          if (i === 0) msgObj.caption = captionText;
          await message.client.sendMessage(message.jid, msgObj, { quoted: message.data });
        }
      } else {
        throw new Error("This is a video post, no slide photos available!");
      }
    } 
    // If user requested VIDEO (Default)
    else {
      const videoUrl = data.play || data.video_no_watermark || data.video;
      
      // If the post is actually a Photo Slide but they asked for video, send photos
      if (!videoUrl && data.images && data.images.length > 0) {
        for (let i = 0; i < data.images.length; i++) {
          let msgObj = { image: { url: data.images[i] } };
          if (i === 0) msgObj.caption = captionText;
          await message.client.sendMessage(message.jid, msgObj, { quoted: message.data });
        }
      } else if (videoUrl) {
        await message.client.sendMessage(message.jid, {
          video: { url: videoUrl },
          caption: captionText
        }, { quoted: message.data });
      } else {
        throw new Error("Video not found!");
      }
    }

    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

  } catch (err) {
    await message.sendReply(`❌ *TikTok Download Failed:* ${err.message}`);
    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
  }
}

// --- 1. COMMAND HANDLER (.tt, .tiktok) ---
Module(
  {
    pattern: "^[.]?(tt|tiktok|ttdl|video|song|photo|pic|mp3|mp4)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download High Quality TikTok Videos (No Watermark) & Audio",
    use: "download",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();
    let query = match[2] ? match[2].trim() : "";

    if (!query) query = getReplyText(message).trim();
    // Prevent clashing
    if (query.includes('youtu') || query.includes('instagram') || query.includes('twitter') || query.includes('facebook') || query.includes('fb.watch')) return;

    const targetUrl = extractUrl(query);

    if (!targetUrl) {
      if (['tt', 'tiktok', 'ttdl'].includes(cmd)) {
        return await message.sendReply(
          `╭━━━〔 🎵 *OGGY-MD TIKTOK* 〕━━━╮\n` +
          `┃ 📌 *Reply to any TikTok link with:*\n` +
          `┃ • \`video\` - No Watermark Video\n` +
          `┃ • \`song\` - Extract Trending Audio\n` +
          `┃ • \`photo\` - For Slide Photos\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
        );
      }
      return; 
    }

    let reqCmd = 'video';
    if (['song', 'audio', 'mp3'].includes(cmd)) reqCmd = 'song';
    if (['photo', 'pic', 'image'].includes(cmd)) reqCmd = 'photo';

    await processTikTok(message, reqCmd, targetUrl);
  }
);

// --- 2. DIRECT REPLY LISTENER ---
Module({ on: 'text', fromMe: isFromMe }, async (message) => {
  if (!message.jid || !message.reply_message) return;
  const text = (message.text || message.message || "").trim().toLowerCase();
  
  if (['song', 'video', 'photo', 'audio', 'pic', 'mp3', 'mp4'].includes(text)) {
    const targetUrl = extractUrl(getReplyText(message));
    
    // Process only if it is a TikTok link
    if (targetUrl && targetUrl.includes('tiktok')) {
      await processTikTok(message, text, targetUrl);
    }
  }
});
