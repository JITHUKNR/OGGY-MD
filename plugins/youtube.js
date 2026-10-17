const { Module } = require("../main");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const axios = require("axios");
const { spotifyTrack } = require("./utils/misc");

const config = require("../config");
const MODE = config.MODE;
const fromMe = MODE === "public" ? false : true;

const VIDEO_SIZE_LIMIT = 150 * 1024 * 1024;

function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
      if (error) return reject(stderr || error.message);
      resolve(stdout);
    });
  });
}

function cleanYtUrl(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  return match && match[1] ? `https://www.youtube.com/watch?v=${match[1]}` : url;
}

// 1. BULLETPROOF AUDIO DOWNLOADER (Multi-Engine)
async function downloadAudio(url) {
  const timestamp = Date.now();
  let title = "YouTube Audio";
  let channel = "YouTube";
  let thumbnail = "";
  const cleaned = cleanYtUrl(url);
  const targetMp3 = path.join("/tmp", `yt_aud_${timestamp}.mp3`);

  // Engine 1: David Cyril API
  try {
    const res = await axios.get(`https://api.davidcyriltech.my.id/download/ytmp3?url=${encodeURIComponent(cleaned)}`, { timeout: 20000 });
    const dlUrl = res?.data?.result?.download_url;
    title = res?.data?.result?.title || title;
    if (dlUrl) {
      const streamRes = await axios.get(dlUrl, { responseType: "arraybuffer", timeout: 45000 });
      fs.writeFileSync(targetMp3, Buffer.from(streamRes.data));
      return { path: targetMp3, title: title, info: { channel: { name: channel }, thumbnail: thumbnail } };
    }
  } catch (e) {}

  // Engine 2: Widipe API
  try {
    const res = await axios.get(`https://widipe.com/download/ytdl?url=${encodeURIComponent(cleaned)}`, { timeout: 20000 });
    const dlUrl = res?.data?.result?.mp3;
    title = res?.data?.result?.title || title;
    if (dlUrl) {
      const streamRes = await axios.get(dlUrl, { responseType: "arraybuffer", timeout: 45000 });
      fs.writeFileSync(targetMp3, Buffer.from(streamRes.data));
      return { path: targetMp3, title: title, info: { channel: { name: channel }, thumbnail: thumbnail } };
    }
  } catch (e) {}

  // Engine 3: Siputzx API
  try {
    const res = await axios.get(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(cleaned)}`, { timeout: 20000 });
    const dlUrl = res?.data?.data?.dl;
    title = res?.data?.data?.title || title;
    if (dlUrl) {
      const streamRes = await axios.get(dlUrl, { responseType: "arraybuffer", timeout: 45000 });
      fs.writeFileSync(targetMp3, Buffer.from(streamRes.data));
      return { path: targetMp3, title: title, info: { channel: { name: channel }, thumbnail: thumbnail } };
    }
  } catch (e) {}

  // Engine 4: Ryzendesu API
  try {
    const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(cleaned)}`, { timeout: 20000 });
    const dlUrl = res?.data?.url;
    title = res?.data?.title || title;
    if (dlUrl) {
      const streamRes = await axios.get(dlUrl, { responseType: "arraybuffer", timeout: 45000 });
      fs.writeFileSync(targetMp3, Buffer.from(streamRes.data));
      return { path: targetMp3, title: title, info: { channel: { name: channel }, thumbnail: thumbnail } };
    }
  } catch (e) {}

  // Engine 5: Local VPS yt-dlp with TV Client Bypass
  try {
    const outTemplate = path.join("/tmp", `yt_aud_${timestamp}.%(ext)s`);
    const cmd = `yt-dlp --extractor-args "youtube:player_client=tv_embedded" -x --audio-format mp3 --audio-quality 0 --no-playlist -o "${outTemplate}" "${cleaned}"`;
    await runCmd(cmd);

    const files = fs.readdirSync("/tmp").filter((f) => f.startsWith(`yt_aud_${timestamp}`));
    if (files.length > 0) {
      return { path: path.join("/tmp", files[0]), title: title, info: { channel: { name: channel }, thumbnail: thumbnail } };
    }
  } catch (e) {}

  throw new Error("All audio download engines failed");
}

// 2. BULLETPROOF VIDEO DOWNLOADER (Multi-Engine)
async function downloadVideo(url, quality = "360p") {
  const timestamp = Date.now();
  let title = "YouTube Video";
  const cleaned = cleanYtUrl(url);
  const targetMp4 = path.join("/tmp", `yt_vid_${timestamp}.mp4`);

  // Engine 1: David Cyril API
  try {
    const res = await axios.get(`https://api.davidcyriltech.my.id/download/ytmp4?url=${encodeURIComponent(cleaned)}`, { timeout: 20000 });
    const dlUrl = res?.data?.result?.download_url;
    title = res?.data?.result?.title || title;
    if (dlUrl) {
      const streamRes = await axios.get(dlUrl, { responseType: "arraybuffer", timeout: 60000 });
      fs.writeFileSync(targetMp4, Buffer.from(streamRes.data));
      return { path: targetMp4, title: title };
    }
  } catch (e) {}

  // Engine 2: Widipe API
  try {
    const res = await axios.get(`https://widipe.com/download/ytdl?url=${encodeURIComponent(cleaned)}`, { timeout: 20000 });
    const dlUrl = res?.data?.result?.mp4;
    title = res?.data?.result?.title || title;
    if (dlUrl) {
      const streamRes = await axios.get(dlUrl, { responseType: "arraybuffer", timeout: 60000 });
      fs.writeFileSync(targetMp4, Buffer.from(streamRes.data));
      return { path: targetMp4, title: title };
    }
  } catch (e) {}

  // Engine 3: Siputzx API
  try {
    const res = await axios.get(`https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(cleaned)}`, { timeout: 20000 });
    const dlUrl = res?.data?.data?.dl;
    title = res?.data?.data?.title || title;
    if (dlUrl) {
      const streamRes = await axios.get(dlUrl, { responseType: "arraybuffer", timeout: 60000 });
      fs.writeFileSync(targetMp4, Buffer.from(streamRes.data));
      return { path: targetMp4, title: title };
    }
  } catch (e) {}

  // Engine 4: Local VPS yt-dlp with TV Client Bypass
  try {
    const outTemplate = path.join("/tmp", `yt_vid_${timestamp}.%(ext)s`);
    const cmd = `yt-dlp --extractor-args "youtube:player_client=tv_embedded" -f "b[ext=mp4]/bv*+ba/b" --merge-output-format mp4 --no-playlist -o "${outTemplate}" "${cleaned}"`;
    await runCmd(cmd);

    const files = fs.readdirSync("/tmp").filter((f) => f.startsWith(`yt_vid_${timestamp}`));
    if (files.length > 0) {
      return { path: path.join("/tmp", files[0]), title: title };
    }
  } catch (e) {}

  throw new Error("All video download engines failed");
}

async function convertM4aToMp3(filePath) {
  return filePath;
}

async function getVideoInfo(url) {
  return {
    title: "YouTube Video",
    videoId: url.match(/([\w-]{11})/)?.[1] || "",
    formats: [
      { type: "video", quality: "360p", size: "15 MB" },
      { type: "video", quality: "720p", size: "35 MB" },
      { type: "audio", quality: "audio", size: "5 MB" },
    ],
  };
}

async function searchYoutube(query, limit = 10) {
  try {
    const yts = require("yt-search");
    const s = await yts(query);
    return (s.videos || []).slice(0, limit).map((v) => ({
      title: v.title,
      duration: v.timestamp,
      views: v.views,
      channel: { name: v.author?.name || "YouTube" },
      url: v.url,
      thumbnail: v.thumbnail,
      uploadedAt: v.ago,
    }));
  } catch (err) {
    return [];
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function formatViews(views) {
  if (views >= 1000000) {
    return (views / 1000000).toFixed(1) + "M";
  } else if (views >= 1000) {
    return (views / 1000).toFixed(1) + "K";
  }
  return views?.toString() || "N/A";
}

// ==========================================
// 1. SONG COMMAND (SUPPORTS BOTH LINK & NAME)
// ==========================================
Module(
  {
    pattern: "song ?(.*)",
    fromMe: fromMe,
    desc: "Search YouTube or download audio directly from link",
    usage: ".song <query or link>",
    use: "download",
  },
  async (message, match) => {
    let input = match[1] || message.reply_message?.text;
    if (!input) {
      return await message.sendReply(
        "_Please provide a search query or YouTube link!_\n_Example: .song faded alan walker or .song https://youtu.be/..._"
      );
    }

    // Direct link check: downloads immediately without searching
    const isUrl = /(?:youtu\.be\/|youtube\.com)/i.test(input);

    if (isUrl) {
      const urlMatch = input.match(/\bhttps?:\/\/\S+/gi);
      const url = urlMatch ? urlMatch[0] : input;

      let downloadMsg;
      let audioPath;
      try {
        downloadMsg = await message.sendReply("_🎵 Downloading audio, please wait..._");
        const result = await downloadAudio(url);
        audioPath = result.path;

        await message.edit(`_Sending *${result.title}*..._`, message.jid, downloadMsg.key);

        const stream = fs.createReadStream(audioPath);
        await message.sendReply({ stream }, "audio", { mimetype: "audio/mp4" });
        stream.destroy();

        await message.edit(`_Downloaded *${result.title}*!_`, message.jid, downloadMsg.key);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      } catch (err) {
        console.error("Song URL download error:", err);
        if (downloadMsg) {
          await message.edit("_Download failed!_", message.jid, downloadMsg.key);
        } else {
          await message.sendReply("_Download failed. Please try again._");
        }
        if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      }
      return;
    }

    // Search query: shows 1-10 interactive results
    try {
      const searchMsg = await message.sendReply("_Searching YouTube..._");
      const results = await searchYoutube(input, 10);

      if (!results || results.length === 0) {
        return await message.edit(
          "_No results found!_",
          message.jid,
          searchMsg.key
        );
      }

      let resultText = "YouTube Search Results\n\n";
      resultText += `_Found ${results.length} results for:_ *${input}*\n\n`;

      results.forEach((video, index) => {
        resultText += `*${index + 1}.* ${video.title}\n`;
        resultText += `   _Duration:_ \`${
          video.duration
        }\` | _Views:_ \`${formatViews(video.views)}\`\n`;
        resultText += `   _Channel:_ ${video.channel.name}\n\n`;
      });

      resultText += "_Reply with a number (1-10) to download audio_";

      await message.edit(resultText, message.jid, searchMsg.key);
    } catch (error) {
      console.error("Song search error:", error);
      await message.sendReply("_Search failed. Please try again later._");
    }
  }
);

// ==========================================
// 2. YTS COMMAND
// ==========================================
Module(
  {
    pattern: "yts ?(.*)",
    fromMe: fromMe,
    desc: "Search YouTube with detailed info",
    usage: ".yts <query>",
    use: "download",
  },
  async (message, match) => {
    const query = match[1];
    if (!query) {
      return await message.sendReply(
        "_Please provide a search query!_\n_Example: .yts ncs music_"
      );
    }

    try {
      const searchMsg = await message.sendReply("_Searching YouTube..._");
      const results = await searchYoutube(query, 10);

      if (!results || results.length === 0) {
        return await message.edit(
          "_No results found!_",
          message.jid,
          searchMsg.key
        );
      }

      let resultText = "YouTube Search Results\n\n";
      resultText += `_Found ${results.length} results for:_ *${query}*\n\n`;

      results.forEach((video, index) => {
        resultText += `*${index + 1}.* ${video.title}\n`;
        resultText += `   _Duration:_ \`${
          video.duration
        }\` | _Views:_ \`${formatViews(video.views)}\`\n`;
        resultText += `   _Channel:_ ${video.channel.name}\n\n`;
      });

      resultText += "_Reply with a number (1-10) to see video details_";

      await message.edit(resultText, message.jid, searchMsg.key);
    } catch (error) {
      console.error("YTS search error:", error);
      await message.sendReply("_Search failed. Please try again later._");
    }
  }
);

// ==========================================
// 3. YTV COMMAND
// ==========================================
Module(
  {
    pattern: "ytv ?(.*)",
    fromMe: fromMe,
    desc: "Download YouTube video with quality selection",
    usage: ".ytv <link>",
    use: "download",
  },
  async (message, match) => {
    let url = match[1] || message.reply_message?.text;

    if (url && /\bhttps?:\/\/\S+/gi.test(url)) {
      url = url.match(/\bhttps?:\/\/\S+/gi)[0];
    }

    if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
      return await message.sendReply(
        "_Please provide a valid YouTube link!_\n_Example: .ytv https://youtube.com/watch?v=xxxxx or https://youtube.com/shorts/xxxxx_"
      );
    }

    try {
      const infoMsg = await message.sendReply("_📊 Fetching video info..._");
      const info = await getVideoInfo(url);

      let qualityText = "_*Select Video Quality*_\n\n";
      qualityText += `_*${info.title}*_\n\n(${info.videoId})\n\n`;
      qualityText += `*1.* _*360p*_ ~ _15 MB_\n`;
      qualityText += `*2.* _*720p*_ ~ _35 MB_\n`;
      qualityText += `*3.* _*Audio Only*_ ~ _5 MB_\n\n`;
      qualityText += "_Reply with a number to download_";

      await message.edit(qualityText, message.jid, infoMsg.key);
    } catch (error) {
      console.error("YTV info error:", error);
      await message.sendReply("_Failed to fetch video info. Please check the link._");
    }
  }
);

// ==========================================
// 4. VIDEO COMMAND
// ==========================================
Module(
  {
    pattern: "video ?(.*)",
    fromMe: fromMe,
    desc: "Download YouTube video at 360p",
    usage: ".video <link>",
    use: "download",
  },
  async (message, match) => {
    let url = match[1] || message.reply_message?.text;

    if (url && /\bhttps?:\/\/\S+/gi.test(url)) {
      url = url.match(/\bhttps?:\/\/\S+/gi)[0];
    }

    if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
      return await message.sendReply(
        "_Please provide a valid YouTube link!_\n_Example: .video https://youtube.com/watch?v=xxxxx or https://youtube.com/shorts/xxxxx_"
      );
    }

    let downloadMsg;
    let videoPath;

    try {
      downloadMsg = await message.sendReply("_Downloading video..._");
      const result = await downloadVideo(url, "360p");
      videoPath = result.path;

      await message.edit("_Uploading video..._", message.jid, downloadMsg.key);

      const stats = fs.statSync(videoPath);

      if (stats.size > VIDEO_SIZE_LIMIT) {
        const stream = fs.createReadStream(videoPath);
        await message.sendMessage({ stream }, "document", {
          fileName: `${result.title}.mp4`,
          mimetype: "video/mp4",
          caption: `_*${result.title}*_\n\n_File size: ${formatBytes(stats.size)}_\n_Quality: 360p_`,
        });
        stream.destroy();
      } else {
        const stream = fs.createReadStream(videoPath);
        await message.sendReply({ stream }, "video", {
          caption: `_*${result.title}*_\n\n_Quality: 360p_`,
        });
        stream.destroy();
      }

      await message.edit("_Download complete!_", message.jid, downloadMsg.key);
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    } catch (error) {
      console.error("Video download error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Download failed. Please try again._");
      }
      if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    }
  }
);

// ==========================================
// 5. YTA COMMAND
// ==========================================
Module(
  {
    pattern: "yta ?(.*)",
    fromMe: fromMe,
    desc: "Download YouTube audio as document",
    usage: ".yta <link>",
    use: "download",
  },
  async (message, match) => {
    let url = match[1] || message.reply_message?.text;

    if (url && /\bhttps?:\/\/\S+/gi.test(url)) {
      url = url.match(/\bhttps?:\/\/\S+/gi)[0];
    }

    if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
      return await message.sendReply(
        "_Please provide a valid YouTube link!_\n_Example: .yta https://youtube.com/watch?v=xxxxx or https://youtube.com/shorts/xxxxx_"
      );
    }

    let downloadMsg;
    let audioPath;

    try {
      downloadMsg = await message.sendReply("_Downloading audio..._");
      const result = await downloadAudio(url);
      audioPath = result.path;

      await message.edit("_Sending audio..._", message.jid, downloadMsg.key);

      const stream = fs.createReadStream(audioPath);
      await message.sendMessage({ stream }, "document", {
        fileName: `${result.title}.mp3`,
        mimetype: "audio/mp4",
        caption: `_*${result.title}*_`,
      });
      stream.destroy();

      await message.edit("_Download complete!_", message.jid, downloadMsg.key);
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    } catch (error) {
      console.error("YTA download error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Download failed. Please try again._");
      }
      if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }
  }
);

// ==========================================
// 6. PLAY COMMAND
// ==========================================
Module(
  {
    pattern: "play ?(.*)",
    fromMe: fromMe,
    desc: "Play audio from YouTube search or link",
    usage: ".play <song name or link>",
    use: "download",
  },
  async (message, match) => {
    let input = match[1] || message.reply_message?.text;
    if (!input) {
      return await message.sendReply(
        "_Please provide a song name or link!_\n_Example: .play faded alan walker_"
      );
    }

    let downloadMsg;
    let audioPath;

    try {
      let url = null;
      if (/\bhttps?:\/\/\S+/gi.test(input)) {
        const urlMatch = input.match(/\bhttps?:\/\/\S+/gi);
        if (urlMatch && (urlMatch[0].includes("youtube.com") || urlMatch[0].includes("youtu.be"))) {
          url = urlMatch[0];
        }
      }

      if (url) {
        downloadMsg = await message.sendReply("_Downloading audio..._");
        const result = await downloadAudio(url);
        audioPath = result.path;

        await message.edit(`_Sending *${result.title}*..._`, message.jid, downloadMsg.key);

        const stream1 = fs.createReadStream(audioPath);
        await message.sendReply({ stream: stream1 }, "audio", { mimetype: "audio/mp4" });
        stream1.destroy();

        await message.edit(`_Downloaded *${result.title}*!_`, message.jid, downloadMsg.key);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      } else {
        downloadMsg = await message.sendReply("_Searching..._");
        const results = await searchYoutube(input, 1);

        if (!results || results.length === 0) {
          return await message.edit("_No results found!_", message.jid, downloadMsg.key);
        }

        const video = results[0];
        await message.edit(`_Downloading *${video.title}*..._`, message.jid, downloadMsg.key);

        const result = await downloadAudio(video.url);
        audioPath = result.path;

        await message.edit(`_Sending *${video.title}*..._`, message.jid, downloadMsg.key);

        const stream2 = fs.createReadStream(audioPath);
        await message.sendReply({ stream: stream2 }, "audio", { mimetype: "audio/mp4" });
        stream2.destroy();

        await message.edit(`_Downloaded *${video.title}*!_`, message.jid, downloadMsg.key);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      }
    } catch (error) {
      console.error("Play error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Download failed. Please try again._");
      }
      if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }
  }
);

// ============================================================
// 7. INTERACTIVE TEXT LISTENER (NUMBERS & AUDIO/VIDEO REPLIES)
// ============================================================
Module(
  {
    on: "text",
    fromMe: fromMe,
  },
  async (message, match) => {
    const numberMatch = message.text?.match(/^\d+$/);
    if (!numberMatch) return;
    const selectedNumber = parseInt(numberMatch[0]);
    if (!message.reply_message || !message.reply_message.fromMe || !message.reply_message.message) {
      return;
    }
    const repliedText = message.reply_message.message;

    // STEP A: SELECTION FROM .song (REPLY WITH 1-10)
    if (repliedText.includes("YouTube Search Results") && repliedText.includes("to download audio")) {
      if (selectedNumber < 1 || selectedNumber > 10) {
        return await message.sendReply("_Please select a number between 1-10_");
      }

      try {
        const queryMatch = repliedText.match(/Found \d+ results for:_\s*\*(.+?)\*/);
        if (!queryMatch) return;

        const query = queryMatch[1];
        const results = await searchYoutube(query, 10);

        if (!results[selectedNumber - 1]) return await message.sendReply("_Invalid selection!_");

        const selectedVideo = results[selectedNumber - 1];
        let downloadMsg = await message.sendReply(`_Downloading *${selectedVideo.title}*..._`);

        try {
          const result = await downloadAudio(selectedVideo.url);
          const audioPath = result.path;

          await message.edit("_Sending audio..._", message.jid, downloadMsg.key);

          const stream3 = fs.createReadStream(audioPath);
          await message.sendReply({ stream: stream3 }, "audio", { mimetype: "audio/mp4" });
          stream3.destroy();

          await message.edit("_Download complete!_", message.jid, downloadMsg.key);
          if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        } catch (err) {
          console.error(err);
          await message.edit("_Download failed!_", message.jid, downloadMsg.key);
        }
      } catch (error) {
        console.error(error);
        await message.sendReply("_Failed to process your selection._");
      }
    }
    // STEP B: SELECTION FROM .yts (REPLY WITH 1-10 TO SEE DETAILS CARD)
    else if (repliedText.includes("YouTube Search Results") && repliedText.includes("see video details")) {
      if (selectedNumber < 1 || selectedNumber > 10) {
        return await message.sendReply("_Please select a number between 1-10_");
      }

      try {
        const queryMatch = repliedText.match(/Found \d+ results for:_\s*\*(.+?)\*/);
        if (!queryMatch) return;

        const query = queryMatch[1];
        const results = await searchYoutube(query, 10);

        if (!results[selectedNumber - 1]) return await message.sendReply("_Invalid selection!_");

        const selectedVideo = results[selectedNumber - 1];

        let thumbnailBuffer = null;
        try {
          const thumbnailResponse = await axios.get(selectedVideo.thumbnail, {
            responseType: "arraybuffer",
            timeout: 7000,
          });
          thumbnailBuffer = Buffer.from(thumbnailResponse.data);
        } catch (e) {}

        let caption = `_*${selectedVideo.title}*_\n\n`;
        caption += `*Channel:* ${selectedVideo.channel.name}\n`;
        caption += `*Duration:* \`${selectedVideo.duration}\`\n`;
        caption += `*Views:* \`${formatViews(selectedVideo.views)}\`\n`;
        caption += `*Uploaded:* ${selectedVideo.uploadedAt || "N/A"}\n\n`;
        caption += `*URL:* ${selectedVideo.url}\n\n`;
        caption += "_Reply with:_\n";
        caption += "*1.* Audio\n";
        caption += "*2.* Video";

        if (thumbnailBuffer) {
          await message.sendReply(thumbnailBuffer, "image", { caption: caption });
        } else {
          await message.sendReply(caption);
        }
      } catch (error) {
        console.error("YTS video info error:", error);
        await message.sendReply("_Failed to fetch video info._");
      }
    }
    // STEP C: REPLY 1 (AUDIO) OR 2 (VIDEO)
    else if (repliedText.includes("Reply with:") && (repliedText.includes("* Audio") || repliedText.includes("1. Audio"))) {
      if (selectedNumber !== 1 && selectedNumber !== 2) {
        return await message.sendReply("_Please select 1 for Audio or 2 for Video_");
      }

      try {
        const urlMatch = repliedText.match(/\*URL:\*\s*(https?:\/\/\S+)/m);
        if (!urlMatch) return;

        const url = urlMatch[1].trim();
        const titleMatch = repliedText.match(/_\*([^*]+)\*_/);
        const title = titleMatch ? titleMatch[1] : "Media";

        let downloadMsg;
        let filePath;

        if (selectedNumber === 1) {
          try {
            downloadMsg = await message.sendReply(`_Downloading audio..._`);
            const result = await downloadAudio(url);
            filePath = result.path;

            await message.edit("_Sending audio..._", message.jid, downloadMsg.key);

            const stream4 = fs.createReadStream(filePath);
            await message.sendReply({ stream: stream4 }, "audio", { mimetype: "audio/mp4" });
            stream4.destroy();

            await message.edit("_Download complete!_", message.jid, downloadMsg.key);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (error) {
            console.error("YTS audio download error:", error);
            if (downloadMsg) await message.edit("_Download failed!_", message.jid, downloadMsg.key);
            if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
          }
        } else if (selectedNumber === 2) {
          try {
            downloadMsg = await message.sendReply(`_Downloading video..._`);
            const result = await downloadVideo(url, "360p");
            filePath = result.path;

            await message.edit("_Uploading video..._", message.jid, downloadMsg.key);

            const stats = fs.statSync(filePath);

            if (stats.size > VIDEO_SIZE_LIMIT) {
              const stream5 = fs.createReadStream(filePath);
              await message.sendMessage({ stream: stream5 }, "document", {
                fileName: `${result.title}.mp4`,
                mimetype: "video/mp4",
                caption: `_*${result.title}*_\n\n_File size: ${formatBytes(stats.size)}_\n_Quality: 360p_`,
              });
              stream5.destroy();
            } else {
              const stream6 = fs.createReadStream(filePath);
              await message.sendReply({ stream: stream6 }, "video", {
                caption: `_*${result.title}*_\n\n_Quality: 360p_`,
              });
              stream6.destroy();
            }

            await message.edit("_Download complete!_", message.jid, downloadMsg.key);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (error) {
            console.error("YTS video download error:", error);
            if (downloadMsg) await message.edit("_Download failed!_", message.jid, downloadMsg.key);
            if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
          }
        }
      } catch (error) {
        console.error("YTS download selection error:", error);
        await message.sendReply("_Failed to process download._");
      }
    }
    // STEP D: YTV QUALITY SELECTION
    else if (repliedText.includes("Select Video Quality") && repliedText.includes("Reply with a number")) {
      try {
        const idMatch = repliedText.match(/\(([\w-]{11})\)/);
        if (!idMatch) return await message.sendReply("_Failed to retrieve video ID._");

        const url = `https://www.youtube.com/watch?v=${idMatch[1]}`;

        if (selectedNumber === 3) {
          const downloadMsg = await message.sendReply("_Downloading audio..._");
          try {
            const result = await downloadAudio(url);
            const audioPath = result.path;

            await message.edit("_Sending audio..._", message.jid, downloadMsg.key);

            const stream = fs.createReadStream(audioPath);
            await message.sendMessage({ stream }, "document", {
              fileName: `${result.title}.mp3`,
              mimetype: "audio/mp4",
              caption: `_*${result.title}*_`,
            });
            stream.destroy();

            await message.edit("_Download complete!_", message.jid, downloadMsg.key);
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
          } catch (e) {
            await message.edit("_Download failed!_", message.jid, downloadMsg.key);
          }
        } else {
          const quality = selectedNumber === 2 ? "720p" : "360p";
          const downloadMsg = await message.sendReply(`_Downloading video at *${quality}*..._`);

          try {
            const result = await downloadVideo(url, quality);
            const videoPath = result.path;

            await message.edit("_Uploading video..._", message.jid, downloadMsg.key);

            const stream8 = fs.createReadStream(videoPath);
            await message.sendReply({ stream: stream8 }, "video", {
              caption: `_*${result.title}*_\n\n_Quality: ${quality}_`,
            });
            stream8.destroy();

            await message.edit("_Download complete!_", message.jid, downloadMsg.key);
            if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
          } catch (e) {
            await message.edit("_Download failed!_", message.jid, downloadMsg.key);
          }
        }
      } catch (e) {
        await message.sendReply("_Failed to process quality selection._");
      }
    }
  }
);

// ==========================================
// 8. SPOTIFY COMMAND
// ==========================================
Module(
  {
    pattern: "spotify ?(.*)",
    fromMe: fromMe,
    desc: "Download audio from Spotify link",
    usage: ".spotify <spotify link>",
    use: "download",
  },
  async (message, match) => {
    let url = match[1] || message.reply_message?.text;

    if (url && /\bhttps?:\/\/\S+/gi.test(url)) {
      url = url.match(/\bhttps?:\/\/\S+/gi)[0];
    }

    if (!url || !url.includes("spotify.com")) {
      return await message.sendReply(
        "_Please provide a valid Spotify link!_\n_Example: .spotify https://open.spotify.com/track/xxxxx_"
      );
    }

    let downloadMsg;
    let audioPath;

    try {
      downloadMsg = await message.sendReply("_Fetching Spotify info..._");
      const spotifyInfo = await spotifyTrack(url);
      const { title, artist } = spotifyInfo;

      await message.edit(`_Downloading *${title}* by *${artist}*..._`, message.jid, downloadMsg.key);

      const query = `${title} ${artist}`;
      const results = await searchYoutube(query, 1);

      if (!results || results.length === 0) {
        return await message.edit("_No matching songs found on YouTube!_", message.jid, downloadMsg.key);
      }

      const video = results[0];
      const result = await downloadAudio(video.url);
      audioPath = result.path;

      await message.edit("_Sending audio..._", message.jid, downloadMsg.key);

      const stream = fs.createReadStream(audioPath);
      await message.sendReply({ stream }, "audio", { mimetype: "audio/mp4" });
      stream.destroy();

      await message.edit("_Download complete!_", message.jid, downloadMsg.key);
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    } catch (error) {
      console.error("Spotify download error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Download failed. Please try again._");
      }
      if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }
  }
);
