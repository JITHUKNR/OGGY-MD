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

// Shell command executor for local VPS engine
function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
      if (error) return reject(stderr || error.message);
      resolve(stdout);
    });
  });
}

// 1. VPS Local Audio Downloader (yt-dlp)
async function downloadAudio(url) {
  const timestamp = Date.now();
  let title = "YouTube Audio";
  let channel = "YouTube";
  let thumbnail = "";

  try {
    const rawMeta = await runCmd(`yt-dlp -J --no-playlist "${url}"`);
    const meta = JSON.parse(rawMeta);
    title = meta.title || title;
    channel = meta.uploader || meta.channel || channel;
    thumbnail = meta.thumbnail || "";
  } catch (e) {
    title = `audio_${timestamp}`;
  }

  const outTemplate = path.join("/tmp", `yt_aud_${timestamp}.%(ext)s`);
  await runCmd(`yt-dlp -x --audio-format mp3 --audio-quality 0 --no-playlist -o "${outTemplate}" "${url}"`);

  const files = fs.readdirSync("/tmp").filter((f) => f.startsWith(`yt_aud_${timestamp}`));
  if (files.length === 0) throw new Error("Audio download failed");
  const finalPath = path.join("/tmp", files[0]);

  return {
    path: finalPath,
    title: title,
    info: {
      channel: { name: channel },
      thumbnail: thumbnail,
    },
  };
}

// 2. VPS Local Video Downloader (yt-dlp)
async function downloadVideo(url, quality = "360p") {
  const timestamp = Date.now();
  let title = "YouTube Video";

  try {
    const rawMeta = await runCmd(`yt-dlp -J --no-playlist "${url}"`);
    const meta = JSON.parse(rawMeta);
    title = meta.title || title;
  } catch (e) {
    title = `video_${timestamp}`;
  }

  const res = parseInt(quality) || 360;
  const outTemplate = path.join("/tmp", `yt_vid_${timestamp}.%(ext)s`);
  const formatSelector = `bv*[height<=${res}][ext=mp4]+ba*[ext=m4a]/b[height<=${res}][ext=mp4]/bv*+ba/b`;

  await runCmd(`yt-dlp -f "${formatSelector}" --merge-output-format mp4 --no-playlist -o "${outTemplate}" "${url}"`);

  const files = fs.readdirSync("/tmp").filter((f) => f.startsWith(`yt_vid_${timestamp}`));
  if (files.length === 0) throw new Error("Video download failed");
  const finalPath = path.join("/tmp", files[0]);

  return {
    path: finalPath,
    title: title,
  };
}

// 3. Audio Post-Processor
async function convertM4aToMp3(filePath) {
  return filePath;
}

// 4. Video Quality & Info Fetcher (yt-dlp)
async function getVideoInfo(url) {
  const rawMeta = await runCmd(`yt-dlp -J --no-playlist "${url}"`);
  const meta = JSON.parse(rawMeta);

  const formats = [];
  if (meta.formats) {
    meta.formats.forEach((f) => {
      const hasVideo = f.vcodec && f.vcodec !== "none";
      const hasAudio = f.acodec && f.acodec !== "none";
      const sizeStr = f.filesize
        ? `${(f.filesize / (1024 * 1024)).toFixed(1)} MB`
        : f.filesize_approx
        ? `${(f.filesize_approx / (1024 * 1024)).toFixed(1)} MB`
        : "15 MB";

      if (hasVideo && f.height) {
        formats.push({
          type: "video",
          quality: `${f.height}p`,
          size: sizeStr,
        });
      } else if (hasAudio && !hasVideo) {
        formats.push({
          type: "audio",
          quality: "audio",
          size: sizeStr,
        });
      }
    });
  }

  if (!formats.some((f) => f.type === "video")) {
    formats.push({ type: "video", quality: "360p", size: "15 MB" });
    formats.push({ type: "video", quality: "720p", size: "35 MB" });
  }
  if (!formats.some((f) => f.type === "audio")) {
    formats.push({ type: "audio", quality: "audio", size: "5 MB" });
  }

  return {
    title: meta.title || "YouTube Video",
    videoId: meta.id || "",
    formats: formats,
  };
}

// 5. Search YouTube Helper
let searchYoutubeOriginal;
try {
  searchYoutubeOriginal = require("./utils/yt").searchYoutube;
} catch (e) {}

async function searchYoutube(query, limit = 10) {
  if (searchYoutubeOriginal) {
    try {
      const res = await searchYoutubeOriginal(query, limit);
      if (res && res.length > 0) return res;
    } catch (e) {}
  }

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
// 1. SONG COMMAND
// ==========================================
Module(
  {
    pattern: "song ?(.*)",
    fromMe: fromMe,
    desc: "Search YouTube and download audio",
    usage: ".song <query>",
    use: "download",
  },
  async (message, match) => {
    const query = match[1];
    if (!query) {
      return await message.sendReply(
        "_Please provide a search query!_\n_Example: .song faded alan walker_"
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

    if (url.includes("youtube.com/shorts/")) {
      const shortId = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]+)/)?.[1];
      if (shortId) {
        url = `https://www.youtube.com/watch?v=${shortId}`;
      }
    }

    try {
      const infoMsg = await message.sendReply("_📊 Fetching video info..._");
      const info = await getVideoInfo(url);

      const videoFormats = info.formats
        .filter((f) => f.type === "video" && f.quality)
        .sort((a, b) => {
          const getRes = (q) => {
            const m = q.match(/(\d+)/);
            return m ? parseInt(m[1]) : 0;
          };
          return getRes(b.quality) - getRes(a.quality);
        });

      const uniqueQualities = [...new Set(videoFormats.map((f) => f.quality))];

      const videoIdMatch = url.match(
        /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([^&\s/?]+)/
      );
      const videoId = videoIdMatch ? videoIdMatch[1] : info.videoId || "";

      let qualityText = "_*Select Video Quality*_\n\n";
      qualityText += `_*${info.title}*_\n\n(${videoId})\n\n`;

      if (uniqueQualities.length === 0) {
        return await message.edit(
          "_No video formats available for this video._",
          message.jid,
          infoMsg.key
        );
      }

      uniqueQualities.forEach((quality, index) => {
        const format = videoFormats.find((f) => f.quality === quality);
        qualityText += `*${index + 1}.* _*${quality}*_${format?.size ? ` ~ _${format.size}_` : ""}\n`;
      });

      const audioFormat = info.formats.find((f) => f.type === "audio");
      qualityText += `*${uniqueQualities.length + 1}.* _*Audio Only*_${audioFormat?.size ? ` ~ _${audioFormat.size}_` : ""}\n`;
      qualityText += "\n_Reply with a number to download_";

      await message.edit(qualityText, message.jid, infoMsg.key);
    } catch (error) {
      console.error("YTV info error:", error);
      await message.sendReply(
        "_Failed to fetch video info. Please check the link._"
      );
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

    if (url.includes("youtube.com/shorts/")) {
      const shortId = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]+)/)?.[1];
      if (shortId) {
        url = `https://www.youtube.com/watch?v=${shortId}`;
      }
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
          caption: `_*${result.title}*_\n\n_File size: ${formatBytes(
            stats.size
          )}_\n_Quality: 360p_`,
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

      await new Promise((resolve) => setTimeout(resolve, 100));
      if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
    } catch (error) {
      console.error("Video download error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Download failed. Please try again._");
      }

      if (videoPath && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
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

    if (url.includes("youtube.com/shorts/")) {
      const shortId = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]+)/)?.[1];
      if (shortId) {
        url = `https://www.youtube.com/watch?v=${shortId}`;
      }
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

      await new Promise((resolve) => setTimeout(resolve, 100));
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    } catch (error) {
      console.error("YTA download error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Download failed. Please try again._");
      }

      if (audioPath && fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
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
        if (
          urlMatch &&
          (urlMatch[0].includes("youtube.com") ||
            urlMatch[0].includes("youtu.be"))
        ) {
          url = urlMatch[0];
          if (url.includes("youtube.com/shorts/")) {
            const shortId = url.match(
              /youtube\.com\/shorts\/([A-Za-z0-9_-]+)/
            )?.[1];
            if (shortId) {
              url = `https://www.youtube.com/watch?v=${shortId}`;
            }
          }
        }
      }

      if (url) {
        downloadMsg = await message.sendReply("_Downloading audio..._");
        const result = await downloadAudio(url);
        audioPath = result.path;

        await message.edit(
          `_Sending *${result.title}*..._`,
          message.jid,
          downloadMsg.key
        );

        const stream1 = fs.createReadStream(audioPath);
        await message.sendReply({ stream: stream1 }, "audio", {
          mimetype: "audio/mp4",
        });
        stream1.destroy();

        await message.edit(
          `_Downloaded *${result.title}*!_`,
          message.jid,
          downloadMsg.key
        );

        await new Promise((resolve) => setTimeout(resolve, 100));
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      } else {
        const query = input;
        downloadMsg = await message.sendReply("_Searching..._");
        const results = await searchYoutube(query, 1);

        if (!results || results.length === 0) {
          return await message.edit(
            "_No results found!_",
            message.jid,
            downloadMsg.key
          );
        }

        const video = results[0];
        await message.edit(
          `_Downloading *${video.title}*..._`,
          message.jid,
          downloadMsg.key
        );

        const result = await downloadAudio(video.url);
        audioPath = result.path;

        await message.edit(
          `_Sending *${video.title}*..._`,
          message.jid,
          downloadMsg.key
        );

        const stream2 = fs.createReadStream(audioPath);
        await message.sendReply({ stream: stream2 }, "audio", {
          mimetype: "audio/mp4",
        });
        stream2.destroy();

        await message.edit(
          `_Downloaded *${video.title}*!_`,
          message.jid,
          downloadMsg.key
        );

        await new Promise((resolve) => setTimeout(resolve, 100));
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      }
    } catch (error) {
      console.error("Play error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Download failed. Please try again._");
      }

      if (audioPath && fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    }
  }
);

// ============================================================
// 7. INTERACTIVE TEXT LISTENER (NUMBERS & AUDIO/VIDEO SELECTION)
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
    if (
      !message.reply_message ||
      !message.reply_message.fromMe ||
      !message.reply_message.message
    ) {
      return;
    }
    const repliedText = message.reply_message.message;

    // STEP A: SELECTION FROM .song (REPLY WITH 1-10 TO GET AUDIO)
    if (
      repliedText.includes("YouTube Search Results") &&
      repliedText.includes("to download audio")
    ) {
      if (selectedNumber < 1 || selectedNumber > 10) {
        return await message.sendReply("_Please select a number between 1-10_");
      }

      try {
        const queryMatch = repliedText.match(
          /Found \d+ results for:_\s*\*(.+?)\*/
        );
        if (!queryMatch) return;

        const query = queryMatch[1];
        const results = await searchYoutube(query, 10);

        if (!results[selectedNumber - 1]) {
          return await message.sendReply("_Invalid selection!_");
        }

        const selectedVideo = results[selectedNumber - 1];
        let downloadMsg;
        let audioPath;

        try {
          downloadMsg = await message.sendReply(
            `_Downloading *${selectedVideo.title}*..._`
          );

          const result = await downloadAudio(selectedVideo.url);
          audioPath = result.path;

          await message.edit(
            "_Sending audio..._",
            message.jid,
            downloadMsg.key
          );

          const stream3 = fs.createReadStream(audioPath);
          await message.sendReply({ stream: stream3 }, "audio", {
            mimetype: "audio/mp4",
          });
          stream3.destroy();

          await message.edit(
            "_Download complete!_",
            message.jid,
            downloadMsg.key
          );

          await new Promise((resolve) => setTimeout(resolve, 100));
          if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
          }
        } catch (error) {
          console.error("Song download error:", error);
          if (downloadMsg) {
            await message.edit(
              "_Download failed!_",
              message.jid,
              downloadMsg.key
            );
          }

          if (audioPath && fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
          }
        }
      } catch (error) {
        console.error("Song selection error:", error);
        await message.sendReply("_Failed to process your selection._");
      }
    }
    // STEP B: SELECTION FROM .yts (REPLY WITH 1-10 TO SEE DETAILS & CARD)
    else if (
      repliedText.includes("YouTube Search Results") &&
      repliedText.includes("see video details")
    ) {
      if (selectedNumber < 1 || selectedNumber > 10) {
        return await message.sendReply("_Please select a number between 1-10_");
      }

      try {
        const queryMatch = repliedText.match(
          /Found \d+ results for:_\s*\*(.+?)\*/
        );
        if (!queryMatch) return;

        const query = queryMatch[1];
        const results = await searchYoutube(query, 10);

        if (!results[selectedNumber - 1]) {
          return await message.sendReply("_Invalid selection!_");
        }

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
          await message.sendReply(thumbnailBuffer, "image", {
            caption: caption,
          });
        } else {
          await message.sendReply(caption);
        }
      } catch (error) {
        console.error("YTS video info error:", error);
        await message.sendReply("_Failed to fetch video info._");
      }
    }
    // STEP C: REPLY 1 (AUDIO) OR 2 (VIDEO) ON THE DETAILS CARD
    else if (
      repliedText.includes("Reply with:") &&
      (repliedText.includes("* Audio") || repliedText.includes("1. Audio"))
    ) {
      if (selectedNumber !== 1 && selectedNumber !== 2) {
        return await message.sendReply(
          "_Please select 1 for Audio or 2 for Video_"
        );
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

            await message.edit(
              "_Sending audio..._",
              message.jid,
              downloadMsg.key
            );

            const stream4 = fs.createReadStream(filePath);
            await message.sendReply({ stream: stream4 }, "audio", {
              mimetype: "audio/mp4",
            });
            stream4.destroy();

            await message.edit(
              "_Download complete!_",
              message.jid,
              downloadMsg.key
            );

            await new Promise((resolve) => setTimeout(resolve, 100));
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (error) {
            console.error("YTS audio download error:", error);
            if (downloadMsg) {
              await message.edit(
                "_Download failed!_",
                message.jid,
                downloadMsg.key
              );
            }

            if (filePath && fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }
        } else if (selectedNumber === 2) {
          try {
            downloadMsg = await message.sendReply(`_Downloading video..._`);
            const result = await downloadVideo(url, "360p");
            filePath = result.path;

            await message.edit(
              "_Uploading video..._",
              message.jid,
              downloadMsg.key
            );

            const stats = fs.statSync(filePath);

            if (stats.size > VIDEO_SIZE_LIMIT) {
              const stream5 = fs.createReadStream(filePath);
              await message.sendMessage({ stream: stream5 }, "document", {
                fileName: `${result.title}.mp4`,
                mimetype: "video/mp4",
                caption: `_*${result.title}*_\n\n_File size: ${formatBytes(
                  stats.size
                )}_\n_Quality: 360p_`,
              });
              stream5.destroy();
            } else {
              const stream6 = fs.createReadStream(filePath);
              await message.sendReply({ stream: stream6 }, "video", {
                caption: `_*${result.title}*_\n\n_Quality: 360p_`,
              });
              stream6.destroy();
            }

            await message.edit(
              "_Download complete!_",
              message.jid,
              downloadMsg.key
            );

            await new Promise((resolve) => setTimeout(resolve, 100));
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (error) {
            console.error("YTS video download error:", error);
            if (downloadMsg) {
              await message.edit(
                "_Download failed!_",
                message.jid,
                downloadMsg.key
              );
            }

            if (filePath && fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }
        }
      } catch (error) {
        console.error("YTS download selection error:", error);
        await message.sendReply("_Failed to process download._");
      }
    }
    // STEP D: SELECT VIDEO QUALITY (.ytv)
    else if (
      repliedText.includes("Select Video Quality") &&
      repliedText.includes("Reply with a number")
    ) {
      try {
        const lines = repliedText.split("\n");
        let videoId = "";

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          if (
            line.startsWith("(") &&
            line.endsWith(")") &&
            line.length >= 13 &&
            !line.includes("Select") &&
            !line.includes("Reply") &&
            !line.match(/^\*\d+\./)
          ) {
            videoId = line.replace(/[()]/g, "").trim();
            if (videoId.length >= 10) break;
          }
        }

        if (!videoId || videoId.length < 10) {
          return await message.sendReply("_Failed to retrieve video ID._");
        }

        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const qualityLines = lines.filter((line) => line.match(/^\*\d+\./));

        if (!qualityLines[selectedNumber - 1]) {
          return await message.sendReply("_Invalid quality selection!_");
        }

        const selectedLine = qualityLines[selectedNumber - 1];
        const isAudioOnly = selectedLine.includes("Audio Only");

        if (isAudioOnly) {
          let downloadMsg;
          let audioPath;

          try {
            downloadMsg = await message.sendReply("_Downloading audio..._");
            const result = await downloadAudio(url);
            audioPath = result.path;

            await message.edit(
              "_Sending audio..._",
              message.jid,
              downloadMsg.key
            );

            const stream = fs.createReadStream(audioPath);
            await message.sendMessage({ stream }, "document", {
              fileName: `${result.title}.mp3`,
              mimetype: "audio/mp4",
              caption: `_*${result.title}*_`,
            });
            stream.destroy();

            await message.edit(
              "_Download complete!_",
              message.jid,
              downloadMsg.key
            );

            await new Promise((resolve) => setTimeout(resolve, 100));
            if (fs.existsSync(audioPath)) {
              fs.unlinkSync(audioPath);
            }
          } catch (error) {
            console.error("YTV audio download error:", error);
            if (downloadMsg) {
              await message.edit(
                "_Download failed!_",
                message.jid,
                downloadMsg.key
              );
            }

            if (audioPath && fs.existsSync(audioPath)) {
              fs.unlinkSync(audioPath);
            }
          }
        } else {
          const qualityMatch = selectedLine.match(/(\d+p)/);
          const selectedQuality = qualityMatch ? qualityMatch[1] : "360p";

          let downloadMsg;
          let videoPath;

          try {
            downloadMsg = await message.sendReply(
              `_Downloading video at *${selectedQuality}*..._`
            );

            const result = await downloadVideo(url, selectedQuality);
            videoPath = result.path;

            await message.edit(
              "_Uploading video..._",
              message.jid,
              downloadMsg.key
            );

            const stats = fs.statSync(videoPath);

            if (stats.size > VIDEO_SIZE_LIMIT) {
              const stream7 = fs.createReadStream(videoPath);
              await message.sendMessage({ stream: stream7 }, "document", {
                fileName: `${result.title}.mp4`,
                mimetype: "video/mp4",
                caption: `_*${result.title}*_\n\n_File size: ${formatBytes(
                  stats.size
                )}_\n_Quality: ${selectedQuality}_`,
              });
              stream7.destroy();
            } else {
              const stream8 = fs.createReadStream(videoPath);
              await message.sendReply({ stream: stream8 }, "video", {
                caption: `_*${result.title}*_\n\n_Quality: ${selectedQuality}_`,
              });
              stream8.destroy();
            }

            await message.edit(
              "_Download complete!_",
              message.jid,
              downloadMsg.key
            );

            await new Promise((resolve) => setTimeout(resolve, 100));
            if (fs.existsSync(videoPath)) {
              fs.unlinkSync(videoPath);
            }
          } catch (error) {
            console.error("YTV video download error:", error);
            if (downloadMsg) {
              await message.edit(
                "_Download failed!_",
                message.jid,
                downloadMsg.key
              );
            }

            if (videoPath && fs.existsSync(videoPath)) {
              fs.unlinkSync(videoPath);
            }
          }
        }
      } catch (error) {
        console.error("YTV quality selection error:", error);
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

      await message.edit(
        `_Downloading *${title}* by *${artist}*..._`,
        message.jid,
        downloadMsg.key
      );

      const query = `${title} ${artist}`;
      const results = await searchYoutube(query, 1);

      if (!results || results.length === 0) {
        return await message.edit(
          "_No matching songs found on YouTube!_",
          message.jid,
          downloadMsg.key
        );
      }

      const video = results[0];
      const result = await downloadAudio(video.url);
      audioPath = result.path;

      await message.edit(
        "_Sending audio..._",
        message.jid,
        downloadMsg.key
      );

      const stream = fs.createReadStream(audioPath);
      await message.sendReply({ stream: stream }, "audio", {
        mimetype: "audio/mp4",
      });
      stream.destroy();

      await message.edit(
        "_Download complete!_",
        message.jid,
        downloadMsg.key
      );

      await new Promise((resolve) => setTimeout(resolve, 100));
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    } catch (error) {
      console.error("Spotify download error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Download failed. Please try again._");
      }

      if (audioPath && fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    }
  }
);
