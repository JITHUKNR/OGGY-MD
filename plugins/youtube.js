const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

const YT_REGEX = /^(https?:\/\/)?((www|m|music)\.)?(youtube(-nocookie)?\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]+(\S+)?$/i;

const extractUrl = (text) => {
  if (!text) return null;
  const match = text.match(YT_REGEX);
  return match ? match[0] : null;
};

// --- AUDIO / SONG DOWNLOADER ---
Module(
  {
    pattern: "^[.]?(song|play|yta|mp3)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download audio from YouTube using API",
    usage: "song <query or link>",
    use: "download",
  },
  async (message, match) => {
    let query = match[2] ? match[2].trim() : '';
    if (!query && message.reply_message?.text) {
      query = message.reply_message.text.trim();
    }
    
    if (!query) {
      return await message.sendReply("❌ *Usage:* `.song <name or link>`\n✨ _You can also reply to a YouTube link_");
    }

    const waitMsg = await message.sendReply("⚡ *Downloading Audio... Please wait...*");

    try {
      const isUrl = extractUrl(query);

      if (isUrl) {
        // Link based download
        const res = await axios.get(`https://api-faa.my.id/faa/ytmp3?url=${encodeURIComponent(isUrl)}`);
        if (!res.data.status) throw new Error("API failed");
        
        const { title, mp3 } = res.data.result;

        await message.client.sendMessage(message.jid, {
          audio: { url: mp3 },
          mimetype: "audio/mpeg",
          fileName: `${title}.mp3`
        }, { quoted: message.data });

      } else {
        // Name search based download
        const res = await axios.get(`https://api-faa.my.id/faa/ytplay?query=${encodeURIComponent(query)}`);
        if (!res.data.status) throw new Error("API failed");
        
        const { title, mp3 } = res.data.result;

        await message.client.sendMessage(message.jid, {
          audio: { url: mp3 },
          mimetype: "audio/mpeg",
          fileName: `${title}.mp3`
        }, { quoted: message.data });
      }

      if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

    } catch (err) {
       await message.sendReply(`❌ *Download failed:* Please check the link or try another song.`);
       if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
    }
  }
);

// --- VIDEO / MP4 DOWNLOADER ---
Module(
  {
    pattern: "^[.]?(video|ytv|mp4)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download video from YouTube using API",
    usage: "video <query or link>",
    use: "download",
  },
  async (message, match) => {
    let query = match[2] ? match[2].trim() : '';
    if (!query && message.reply_message?.text) {
      query = message.reply_message.text.trim();
    }
    
    if (!query) {
      return await message.sendReply("❌ *Usage:* `.video <name or link>`\n✨ _You can also reply to a YouTube link_");
    }

    const waitMsg = await message.sendReply("⚡ *Downloading Video... Please wait...*");

    try {
      let videoUrl = extractUrl(query);

      if (!videoUrl) {
        // Search first if it's not a link
        const search = await axios.get(`https://api-faa.my.id/faa/youtube?q=${encodeURIComponent(query)}`);
        if (!search.data.status || !search.data.result.length) {
          return await message.sendReply("❌ No video found for this name.");
        }
        videoUrl = search.data.result[0].link;
      }

      const res = await axios.get(`https://api-faa.my.id/faa/ytmp4?url=${encodeURIComponent(videoUrl)}`);
      if (!res.data.status) throw new Error("API failed");

      await message.client.sendMessage(message.jid, {
        video: { url: res.data.result.download_url },
        caption: `🎬 *Video Downloaded*\n\n⚡ *OGGY-MD SYSTEM*`
      }, { quoted: message.data });

      if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

    } catch (err) {
       await message.sendReply(`❌ *Download failed:* Please check the link or try another video.`);
       if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
    }
  }
);
