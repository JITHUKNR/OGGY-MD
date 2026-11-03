const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// Facebook URL Regex (Supports fb.watch, fb.com, share/r/, etc.)
const FB_REGEX = /(?:https?:\/\/)?(?:www\.|m\.|web\.|video\.|watch\.)?(?:facebook\.com|fb\.watch|fb\.com|fb\.gg|fb\.me)\/[^\s]+/i;

const extractUrl = (text) => {
  if (!text) return null;
  const match = text.match(FB_REGEX);
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

// Helper: Resolve Facebook Redirects (Important for share/r/ or fb.watch links)
async function resolveRedirectUrl(url) {
  try {
    const res = await axios.get(url, { maxRedirects: 5, timeout: 8000 });
    return res.request?.res?.responseUrl || url;
  } catch (e) {
    return e.request?.res?.responseUrl || url;
  }
}

// --- HIGH QUALITY FACEBOOK FETCHER ---
async function fetchFacebook(url) {
  let resolvedUrl = await resolveRedirectUrl(url);
  let media = [];
  let caption = "🔵 *Facebook Media*\n\n⚡ *OGGY-MD SYSTEM*";

  // 1. Primary Engine: Vreden API (Best for HD Videos)
  try {
    const { data } = await axios.get(`https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(resolvedUrl)}`, { timeout: 15000 });
    if (data && data.result) {
       let bestVideo = data.result.find(v => v.resolusi === 'HD') || data.result[0];
       if (bestVideo && bestVideo.url) {
          return { media: [{ url: bestVideo.url, type: 'video' }], caption };
       }
    }
  } catch (e) {}

  // 2. Engine: Agatz API
  try {
    const { data } = await axios.get(`https://api.agatz.xyz/api/facebook?url=${encodeURIComponent(resolvedUrl)}`, { timeout: 15000 });
    if (data && data.status && data.data) {
      let d = data.data;
      let best = d.hd || d.sd || d.url;
      if (best) return { media: [{ url: best, type: 'video' }], caption: d.title ? `🔵 *${d.title}*\n\n⚡ *OGGY-MD SYSTEM*` : caption };
    }
  } catch (e) {}

  // 3. Backup Engine: Siputzx All DL (Handles photos well)
  try {
    const { data } = await axios.get(`https://api.siputzx.my.id/api/d/alldl?url=${encodeURIComponent(resolvedUrl)}`, { timeout: 15000 });
    if (data && data.data) {
      let d = data.data;
      if (d.video) return { media: [{ url: d.video, type: 'video' }], caption: d.title ? `🔵 *${d.title}*\n\n⚡ *OGGY-MD SYSTEM*` : caption };
      if (d.image) return { media: [{ url: d.image, type: 'image' }], caption: d.title ? `🔵 *${d.title}*\n\n⚡ *OGGY-MD SYSTEM*` : caption };
    }
  } catch (e) {}

  throw new Error("Failed to fetch Facebook media. Ensure the post is public.");
}

// --- CORE PROCESSOR ---
async function processFacebook(message, cmd, targetUrl) {
  const waitMsg = await message.sendReply("⚡ *Fetching High-Quality Facebook Media...*");
  
  try {
    const data = await fetchFacebook(targetUrl);
    
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

      if (i === 0) msgObj.caption = data.caption;
      await message.client.sendMessage(message.jid, msgObj, { quoted: message.data });
    }

    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

  } catch (err) {
    await message.sendReply(`❌ *Facebook Download Failed:* ${err.message}`);
    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
  }
}

// --- 1. COMMAND HANDLER (.fb, .facebook) ---
Module(
  {
    pattern: "^[.]?(fb|facebook|fbvideo|fbreel)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download High Quality Facebook Videos, Reels & Photos",
    use: "download",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();
    let query = match[2] ? match[2].trim() : "";

    if (!query) query = getReplyText(message).trim();
    // Prevent clashing with other modules
    if (query.includes('youtu') || query.includes('instagram') || query.includes('twitter') || query.includes('x.com')) return;

    const targetUrl = extractUrl(query);

    if (!targetUrl) {
      if (['fb', 'facebook'].includes(cmd)) {
        return await message.sendReply(
          `╭━━━〔 🔵 *OGGY-MD FACEBOOK* 〕━━━╮\n` +
          `┃ 📌 *Reply to any FB link with:*\n` +
          `┃ • \`video\` - For HD Video/Reel\n` +
          `┃ • \`song\` - For Video Audio\n` +
          `┃ • \`photo\` - For Image Post\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
        );
      }
      return; 
    }

    // Default to video if just the link is passed with command
    let reqCmd = 'video';
    if (['song', 'photo'].includes(cmd)) reqCmd = cmd;
    await processFacebook(message, reqCmd, targetUrl);
  }
);

// --- 2. DIRECT REPLY LISTENER ---
Module({ on: 'text', fromMe: isFromMe }, async (message) => {
  if (!message.jid || !message.reply_message) return;
  const text = (message.text || message.message || "").trim().toLowerCase();
  
  if (['song', 'video', 'photo', 'audio', 'pic', 'mp3', 'mp4'].includes(text)) {
    const targetUrl = extractUrl(getReplyText(message));
    
    // Process only if it is a Facebook link
    if (targetUrl && !targetUrl.includes('youtu') && !targetUrl.includes('instagram') && !targetUrl.includes('twitter')) {
      await processFacebook(message, text, targetUrl);
    }
  }
});
