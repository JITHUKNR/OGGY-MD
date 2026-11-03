const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// Supports Standard links, Mobile links, Music, Shorts, and Live URLs anywhere in text
const YT_REGEX = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)[\w-]+(?:\S+)?/i;

const extractUrl = (text) => {
  if (!text) return null;
  const match = text.match(YT_REGEX);
  return match ? match[0] : null;
};

const getReplyText = (message) => {
  if (!message.reply_message) return "";
  return (
    message.reply_message.text ||
    message.reply_message.message ||
    message.reply_message.caption ||
    message.reply_message?.data?.message?.conversation ||
    message.reply_message?.data?.message?.extendedTextMessage?.text ||
    ""
  );
};

// --- 1. AUDIO / SONG DOWNLOADER (song, play, mp3, ytmp3, yta, yt) ---
Module(
  {
    pattern: "^[.]?(song|play|yt|ytmp3|mp3|yta)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download high quality YouTube Audio",
    usage: ".song <song name or link>",
    use: "download",
  },
  async (message, match) => {
    let query = match[2] ? match[2].trim() : "";
    if (!query) {
      query = getReplyText(message).trim();
    }

    if (!query) {
      return await message.sendReply(
        `🎧 *OGGY-MD YOUTUBE AUDIO*\n\n📌 *Usage:*\n• \`song <song name>\`\n• \`song <youtube/shorts link>\`\n\n✨ _Reply 'song' to any YouTube link also works!_`
      );
    }

    const waitMsg = await message.sendReply("🎶 *Downloading high-quality audio...*");

    try {
      const audioUrl = extractUrl(query);

      if (audioUrl) {
        // Direct Link or Shorts Link Download
        const audioRes = await axios.get(
          `https://api-faa.my.id/faa/ytmp3?url=${encodeURIComponent(audioUrl)}`,
          { timeout: 20000 }
        );
        const audioData = audioRes.data;

        if (!audioData || !audioData.status || !audioData.result?.mp3) {
          throw new Error("API failed to fetch audio");
        }

        const {
          title: audioTitle,
          thumbnail: audioThumbnail,
          mp3: audioMp3,
        } = audioData.result;

        await message.client.sendMessage(
          message.jid,
          {
            audio: { url: audioMp3 },
            mimetype: "audio/mpeg",
            fileName: `${audioTitle || "Audio"}.mp3`,
            contextInfo: {
              externalAdReply: {
                title: audioTitle || "YouTube Audio",
                body: "🎧 OGGY-MD MUSIC ENGINE",
                thumbnailUrl: audioThumbnail || "",
                mediaType: 2,
                renderLargerThumbnail: true,
              },
            },
          },
          { quoted: message.data }
        );
      } else {
        // Search by Song Name and Download
        const playRes = await axios.get(
          `https://api-faa.my.id/faa/ytplay?query=${encodeURIComponent(query)}`,
          { timeout: 20000 }
        );
        const playData = playRes.data;

        if (!playData || !playData.status || !playData.result?.mp3) {
          throw new Error("Song not found");
        }

        const {
          title: playTitle,
          author: playAuthor,
          thumbnail: playThumbnail,
          mp3: playMp3,
        } = playData.result;

        await message.client.sendMessage(
          message.jid,
          {
            audio: { url: playMp3 },
            mimetype: "audio/mpeg",
            fileName: `${playTitle || "Song"}.mp3`,
            contextInfo: {
              externalAdReply: {
                title: playTitle || "YouTube Song",
                body: playAuthor || "⚡ OGGY-MD SYSTEM",
                thumbnailUrl: playThumbnail || "",
                mediaType: 2,
                renderLargerThumbnail: true,
              },
            },
          },
          { quoted: message.data }
        );
      }

      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
    } catch (err) {
      await message.sendReply(`❌ *Audio Download Failed:* Please check the link or try again.`);
      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
    }
  }
);

// --- 2. VIDEO / SHORTS DOWNLOADER (video, mp4, ytmp4, ytv) ---
Module(
  {
    pattern: "^[.]?(video|mp4|ytmp4|ytv)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download high quality YouTube Video & Shorts",
    usage: ".video <video name or link>",
    use: "download",
  },
  async (message, match) => {
    let query = match[2] ? match[2].trim() : "";
    if (!query) {
      query = getReplyText(message).trim();
    }

    if (!query) {
      return await message.sendReply(
        `🎬 *OGGY-MD YOUTUBE VIDEO*\n\n📌 *Usage:*\n• \`video <video name>\`\n• \`video <youtube/shorts link>\`\n\n✨ _Reply 'video' to any YouTube or Shorts link also works!_`
      );
    }

    const waitMsg = await message.sendReply("🎥 *Downloading high-quality video...*");

    try {
      let videoUrl = extractUrl(query);
      let videoTitle = "YouTube Video";

      if (!videoUrl) {
        const search = await axios.get(
          `https://api-faa.my.id/faa/youtube?q=${encodeURIComponent(query)}`,
          { timeout: 20000 }
        );
        if (!search.data || !search.data.status || !search.data.result?.length) {
          if (waitMsg && waitMsg.key) {
            await message.client.sendMessage(message.jid, { delete: waitMsg.key });
          }
          return await message.sendReply("❌ No video found for your query.");
        }

        videoUrl = search.data.result[0].link;
        videoTitle = search.data.result[0].title || videoTitle;
      }

      const videoRes = await axios.get(
        `https://api-faa.my.id/faa/ytmp4?url=${encodeURIComponent(videoUrl)}`,
        { timeout: 25000 }
      );
      const videoData = videoRes.data;

      if (!videoData || !videoData.status || !videoData.result?.download_url) {
        throw new Error("Video API failed");
      }

      if (videoData.result.title) {
        videoTitle = videoData.result.title;
      }

      await message.client.sendMessage(
        message.jid,
        {
          video: { url: videoData.result.download_url },
          mimetype: "video/mp4",
          caption: `🎬 *${videoTitle}*\n\n⚡ *Powered by OGGY-MD*`,
        },
        { quoted: message.data }
      );

      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
    } catch (err) {
      await message.sendReply(`❌ *Video Download Failed:* Please check the link or try again.`);
      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
    }
  }
);
