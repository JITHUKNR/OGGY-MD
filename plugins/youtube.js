const { Module } = require("../main");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const axios = require("axios");
const { spotifyTrack } = require("./utils/misc");
const { addID3, getBuffer, uploadToCatbox } = require("./utils");
const { setVar } = require("./manage");

const config = require("../config");
const MODE = config.MODE;
const fromMe = MODE === "public" ? false : true;

const VIDEO_SIZE_LIMIT = 150 * 1024 * 1024;
const COOKIE_PATH = "/root/RAGANORK-BOT/cookies.txt";
const YT_FLAGS = `--cookies "${COOKIE_PATH}" --extractor-args "youtube:player_client=mweb,web"`;

function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
      if (error) return reject(stderr || error.message);
      resolve(stdout ? stdout.trim() : "");
    });
  });
}

function cleanYtUrl(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  return match && match[1] ? `https://www.youtube.com/watch?v=${match[1]}` : url;
}

// OGGY-MD AUDIO METADATA & COVER HELPER
async function prepareOggyAudio(audioPath, title, customThumbnail = "") {
  let audioBuffer = fs.readFileSync(audioPath);
  let cleanTitle = (title || "YouTube Audio").replace(/[\\/:*?"<>|]/g, "").substring(0, 40).trim();
  let artist = config.AUDIO_DATA?.split(";")[1] || "ABHIIXZ";
  let album = "OGGY-MD";
  let coverUrl = config.AUDIO_COVER || customThumbnail || "https://i.ibb.co/s98DyMMq/NL-1.png";

  let imgBuffer = null;
  try {
    if (coverUrl) {
      imgBuffer = await getBuffer(coverUrl);
    }
  } catch (e) {
    imgBuffer = null;
  }

  try {
    if (addID3 && imgBuffer) {
      audioBuffer = await addID3(audioBuffer, cleanTitle, artist, album, imgBuffer);
    }
  } catch (e) {
    console.error("ID3 Tagging failed, using raw buffer:", e);
  }

  return {
    buffer: audioBuffer,
    fileName: `${cleanTitle} - OGGY MD.mp3`,
    title: cleanTitle,
    artist: artist,
    coverUrl: coverUrl,
  };
}

// 1. BULLETPROOF YT-DLP AUDIO DOWNLOADER (DENO + COOKIES)
async function downloadAudio(url) {
  const timestamp = Date.now();
  const cleaned = cleanYtUrl(url);
  let title = "YouTube Audio";

  try {
    const t = await runCmd(`yt-dlp ${YT_FLAGS} --print "%(title)s" --no-playlist "${cleaned}"`);
    if (t) title = t.split("\n")[0].trim();
  } catch (e) {
    title = `audio_${timestamp}`;
  }

  const outTemplate = path.join("/tmp", `yt_aud_${timestamp}.%(ext)s`);
  await runCmd(`yt-dlp ${YT_FLAGS} -f "ba/b" --no-playlist -o "${outTemplate}" "${cleaned}" --force-overwrites`);

  const files = fs.readdirSync("/tmp").filter((f) => f.startsWith(`yt_aud_${timestamp}`));
  if (files.length === 0) throw new Error("Audio download failed");
  const finalPath = path.join("/tmp", files[0]);

  return {
    path: finalPath,
    title: title,
    info: { channel: { name: "YouTube" }, thumbnail: "" },
  };
}

// 2. BULLETPROOF YT-DLP VIDEO DOWNLOADER (DENO + COOKIES)
async function downloadVideo(url, quality = "360p") {
  const timestamp = Date.now();
  const cleaned = cleanYtUrl(url);
  let title = "YouTube Video";

  try {
    const t = await runCmd(`yt-dlp ${YT_FLAGS} --print "%(title)s" --no-playlist "${cleaned}"`);
    if (t) title = t.split("\n")[0].trim();
  } catch (e) {
    title = `video_${timestamp}`;
  }

  const outTemplate = path.join("/tmp", `yt_vid_${timestamp}.%(ext)s`);
  let formatSelector;
  if (quality === "best") {
    formatSelector = "bv*[ext=mp4]+ba*[ext=m4a]/b[ext=mp4]/bv*+ba/best";
  } else {
    const res = parseInt(quality) || 720;
    formatSelector = `b[height<=${res}][ext=mp4]/bv*[height<=${res}][ext=mp4]+ba*[ext=m4a]/b[height<=${res}]/bv*+ba/b`;
  }

  await runCmd(`yt-dlp ${YT_FLAGS} -f "${formatSelector}" --merge-output-format mp4 --no-playlist -o "${outTemplate}" "${cleaned}" --force-overwrites`);

  const files = fs.readdirSync("/tmp").filter((f) => f.startsWith(`yt_vid_${timestamp}`));
  if (files.length === 0) throw new Error("Video download failed");
  const finalPath = path.join("/tmp", files[0]);

  return {
    path: finalPath,
    title: title,
  };
}

async function convertM4aToMp3(filePath) {
  return filePath;
}

async function getVideoInfo(url) {
  const cleaned = cleanYtUrl(url);
  let title = "YouTube Video";
  try {
    const t = await runCmd(`yt-dlp ${YT_FLAGS} --print "%(title)s" --no-playlist "${cleaned}"`);
    if (t) title = t.split("\n")[0].trim();
  } catch (e) {}

  return {
    title: title,
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
  if (views >= 1000000) return (views / 1000000).toFixed(1) + "M";
  if (views >= 1000) return (views / 1000).toFixed(1) + "K";
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

    const sock = message.client || message;
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

        const oggyAudio = await prepareOggyAudio(audioPath, result.title, result.info?.thumbnail);

        await sock.sendMessage(
          message.jid,
          {
            audio: oggyAudio.buffer,
            mimetype: "audio/mp4",
            ptt: false,
            fileName: oggyAudio.fileName,
            contextInfo: {
              externalAdReply: {
                title: oggyAudio.title,
                body: "OGGY-MD • ABHIIXZ",
                mediaType: 2,
                thumbnailUrl: oggyAudio.coverUrl,
                renderLargerThumbnail: true,
                showAdAttribution: false,
              },
            },
          },
          { quoted: message.data }
        );

        if (downloadMsg && downloadMsg.key) {
          await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
        }
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

    try {
      const searchMsg = await message.sendReply("_Searching YouTube..._");
      const results = await searchYoutube(input, 10);

      if (!results || results.length === 0) {
        return await message.edit("_No results found!_", message.jid, searchMsg.key);
      }

      let resultText = "╭───〔 ⚡ *OGGY-MD MUSIC* ⚡ 〕───\n";
      resultText += `│ _Results for:_ *${input}*\n╰────────────────────────\n\n`;

      results.forEach((video, index) => {
        resultText += `*${index + 1}.* ${video.title}\n`;
        resultText += `   _Duration:_ \`${video.duration}\` | _Views:_ \`${formatViews(video.views)}\`\n`;
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
    if (!query) return await message.sendReply("_Please provide a search query!_\n_Example: .yts ncs music_");

    try {
      const searchMsg = await message.sendReply("_Searching YouTube..._");
      const results = await searchYoutube(query, 10);

      if (!results || results.length === 0) {
        return await message.edit("_No results found!_", message.jid, searchMsg.key);
      }

      let resultText = "╭───〔 ⚡ *OGGY-MD SEARCH* ⚡ 〕───\n";
      resultText += `│ _Results for:_ *${query}*\n╰────────────────────────\n\n`;

      results.forEach((video, index) => {
        resultText += `*${index + 1}.* ${video.title}\n`;
        resultText += `   _Duration:_ \`${video.duration}\` | _Views:_ \`${formatViews(video.views)}\`\n`;
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
    if (url && /\bhttps?:\/\/\S+/gi.test(url)) url = url.match(/\bhttps?:\/\/\S+/gi)[0];

    if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
      return await message.sendReply("_Please provide a valid YouTube link!_");
    }

    try {
      const infoMsg = await message.sendReply("_📊 Fetching video info..._");
      const info = await getVideoInfo(url);

      let qualityText = "╭───〔 ⚡ *OGGY-MD VIDEO* 〕───\n";
      qualityText += `│ *${info.title}*\n│ (${info.videoId})\n╰────────────────────────\n\n`;
      qualityText += `*1.* _*360p*_ ~ _15 MB_\n`;
      qualityText += `*2.* _*720p*_ ~ _35 MB_\n`;
      qualityText += `*3.* _*Audio Only*_ ~ _5 MB_\n\n`;
      qualityText += "_Reply with a number to download_";

      await message.edit(qualityText, message.jid, infoMsg.key);
    } catch (error) {
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
    if (url && /\bhttps?:\/\/\S+/gi.test(url)) url = url.match(/\bhttps?:\/\/\S+/gi)[0];

    if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
      return await message.sendReply("_Please provide a valid YouTube link!_");
    }

    const sock = message.client || message;
    let downloadMsg;
    let videoPath;

    try {
      downloadMsg = await message.sendReply("_Downloading video in highest quality..._");
      const result = await downloadVideo(url, "best");
      videoPath = result.path;

      await sock.sendMessage(
        message.jid,
        {
          video: fs.readFileSync(videoPath),
          caption: `_*${result.title}*_\n\n_By: OGGY-MD • ABHIIXZ_`,
          mimetype: "video/mp4",
        },
        { quoted: message.data }
      );

      if (downloadMsg && downloadMsg.key) {
        await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
      }
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    } catch (error) {
      console.error("Video download error:", error);
      if (downloadMsg) await message.edit("_Download failed!_", message.jid, downloadMsg.key);
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
    if (url && /\bhttps?:\/\/\S+/gi.test(url)) url = url.match(/\bhttps?:\/\/\S+/gi)[0];

    if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
      return await message.sendReply("_Please provide a valid YouTube link!_");
    }

    const sock = message.client || message;
    let downloadMsg;
    let audioPath;

    try {
      downloadMsg = await message.sendReply("_Downloading audio..._");
      const result = await downloadAudio(url);
      audioPath = result.path;

      const oggyAudio = await prepareOggyAudio(audioPath, result.title);

      await sock.sendMessage(
        message.jid,
        {
          document: oggyAudio.buffer,
          fileName: oggyAudio.fileName,
          mimetype: "audio/mp4",
          caption: `_*${result.title}*_\n_By: OGGY-MD • ABHIIXZ_`,
        },
        { quoted: message.data }
      );

      if (downloadMsg && downloadMsg.key) {
        await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
      }
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    } catch (error) {
      console.error("YTA download error:", error);
      if (downloadMsg) await message.edit("_Download failed!_", message.jid, downloadMsg.key);
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
    if (!input) return await message.sendReply("_Please provide a song name or link!_");

    const sock = message.client || message;
    let downloadMsg;
    let audioPath;

    try {
      let targetUrl = input;
      let songThumb = "";
      const isUrl = /(?:youtu\.be\/|youtube\.com)/i.test(input);

      if (!isUrl) {
        downloadMsg = await message.sendReply("_Searching..._");
        const results = await searchYoutube(input, 1);
        if (!results || results.length === 0) {
          return await message.edit("_No results found!_", message.jid, downloadMsg.key);
        }
        targetUrl = results[0].url;
        songThumb = results[0].thumbnail;
      }

      if (!downloadMsg) downloadMsg = await message.sendReply("_Downloading audio..._");
      else await message.edit("_Downloading audio..._", message.jid, downloadMsg.key);

      const result = await downloadAudio(targetUrl);
      audioPath = result.path;

      const oggyAudio = await prepareOggyAudio(audioPath, result.title, songThumb);

      await sock.sendMessage(
        message.jid,
        {
          audio: oggyAudio.buffer,
          mimetype: "audio/mp4",
          ptt: false,
          fileName: oggyAudio.fileName,
          contextInfo: {
            externalAdReply: {
              title: oggyAudio.title,
              body: "OGGY-MD • ABHIIXZ",
              mediaType: 2,
              thumbnailUrl: oggyAudio.coverUrl,
              renderLargerThumbnail: true,
              showAdAttribution: false,
            },
          },
        },
        { quoted: message.data }
      );

      if (downloadMsg && downloadMsg.key) {
        await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
      }
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    } catch (error) {
      console.error("Play error:", error);
      if (downloadMsg) await message.edit("_Download failed!_", message.jid, downloadMsg.key);
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
    if (!message.reply_message || !message.reply_message.fromMe || !message.reply_message.message) return;

    const repliedText = message.reply_message.message;
    const sock = message.client || message;

    // STEP A: SELECTION FROM .song (REPLY WITH 1-10)
    if (repliedText.includes("OGGY-MD MUSIC") || (repliedText.includes("YouTube Search Results") && repliedText.includes("to download audio"))) {
      if (selectedNumber < 1 || selectedNumber > 10) {
        return await message.sendReply("_Please select a number between 1-10_");
      }

      try {
        const queryMatch = repliedText.match(/Results for:_\s*\*(.+?)\*/);
        if (!queryMatch) return;

        const results = await searchYoutube(queryMatch[1], 10);
        if (!results[selectedNumber - 1]) return await message.sendReply("_Invalid selection!_");

        const selectedVideo = results[selectedNumber - 1];
        let downloadMsg = await message.sendReply(`_Downloading *${selectedVideo.title}*..._`);

        try {
          const result = await downloadAudio(selectedVideo.url);
          const audioPath = result.path;

          const oggyAudio = await prepareOggyAudio(audioPath, selectedVideo.title, selectedVideo.thumbnail);

          await sock.sendMessage(
            message.jid,
            {
              audio: oggyAudio.buffer,
              mimetype: "audio/mp4",
              ptt: false,
              fileName: oggyAudio.fileName,
              contextInfo: {
                externalAdReply: {
                  title: oggyAudio.title,
                  body: "OGGY-MD • ABHIIXZ",
                  mediaType: 2,
                  thumbnailUrl: oggyAudio.coverUrl,
                  renderLargerThumbnail: true,
                  showAdAttribution: false,
                },
              },
            },
            { quoted: message.data }
          );

          if (downloadMsg && downloadMsg.key) {
            await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
          }
          if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        } catch (err) {
          if (downloadMsg) await message.edit("_Download failed!_", message.jid, downloadMsg.key);
        }
      } catch (error) {
        await message.sendReply("_Failed to process your selection._");
      }
    }
    // STEP B: SELECTION FROM .yts (REPLY WITH 1-10 TO SEE DETAILS CARD)
    else if (repliedText.includes("OGGY-MD SEARCH") || (repliedText.includes("YouTube Search Results") && repliedText.includes("see video details"))) {
      if (selectedNumber < 1 || selectedNumber > 10) return;

      try {
        const queryMatch = repliedText.match(/Results for:_\s*\*(.+?)\*/);
        if (!queryMatch) return;

        const results = await searchYoutube(queryMatch[1], 10);
        if (!results[selectedNumber - 1]) return;

        const selectedVideo = results[selectedNumber - 1];
        let thumbnailBuffer = null;
        try {
          const res = await axios.get(selectedVideo.thumbnail, { responseType: "arraybuffer", timeout: 7000 });
          thumbnailBuffer = Buffer.from(res.data);
        } catch (e) {}

        let caption = `╭───〔 ⚡ *OGGY-MD MEDIA* 〕───\n`;
        caption += `│ *${selectedVideo.title}*\n╰────────────────────────\n\n`;
        caption += `*Channel:* ${selectedVideo.channel.name}\n`;
        caption += `*Duration:* \`${selectedVideo.duration}\`\n`;
        caption += `*Views:* \`${formatViews(selectedVideo.views)}\`\n`;
        caption += `*URL:* ${selectedVideo.url}\n\n`;
        caption += "_Reply with:_\n*1.* Audio\n*2.* Video";

        if (thumbnailBuffer) {
          await sock.sendMessage(message.jid, { image: thumbnailBuffer, caption }, { quoted: message.data });
        } else {
          await message.sendReply(caption);
        }
      } catch (error) {}
    }
    // STEP C: REPLY 1 (AUDIO) OR 2 (VIDEO) ON CARD
    else if (repliedText.includes("Reply with:") && (repliedText.includes("* Audio") || repliedText.includes("1. Audio"))) {
      if (selectedNumber !== 1 && selectedNumber !== 2) return;

      try {
        const urlMatch = repliedText.match(/\*URL:\*\s*(https?:\/\/\S+)/m);
        if (!urlMatch) return;

        const url = urlMatch[1].trim();

        if (selectedNumber === 1) {
          let downloadMsg = await message.sendReply(`_Downloading audio..._`);
          try {
            const result = await downloadAudio(url);
            const oggyAudio = await prepareOggyAudio(result.path, result.title);

            await sock.sendMessage(
              message.jid,
              {
                audio: oggyAudio.buffer,
                mimetype: "audio/mp4",
                ptt: false,
                fileName: oggyAudio.fileName,
                contextInfo: {
                  externalAdReply: {
                    title: oggyAudio.title,
                    body: "OGGY-MD • ABHIIXZ",
                    mediaType: 2,
                    thumbnailUrl: oggyAudio.coverUrl,
                    renderLargerThumbnail: true,
                    showAdAttribution: false,
                  },
                },
              },
              { quoted: message.data }
            );
            if (downloadMsg && downloadMsg.key) {
              await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
            }
            if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
          } catch (e) {
            if (downloadMsg) await message.edit("_Download failed!_", message.jid, downloadMsg.key);
          }
        } else if (selectedNumber === 2) {
          let downloadMsg = await message.sendReply(`_Downloading video..._`);
          try {
            const result = await downloadVideo(url, "360p");
            await sock.sendMessage(
              message.jid,
              {
                video: fs.readFileSync(result.path),
                caption: `_*${result.title}*_\n\n_By: OGGY-MD • ABHIIXZ_`,
                mimetype: "video/mp4",
              },
              { quoted: message.data }
            );
            if (downloadMsg && downloadMsg.key) {
              await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
            }
            if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
          } catch (e) {
            if (downloadMsg) await message.edit("_Download failed!_", message.jid, downloadMsg.key);
          }
        }
      } catch (e) {}
    }
    // STEP D: YTV QUALITY PICKER (1: 360p, 2: 720p, 3: Audio)
    else if (repliedText.includes("Select Video Quality") || (repliedText.includes("OGGY-MD VIDEO") && repliedText.includes("Reply with a number"))) {
      try {
        const idMatch = repliedText.match(/\(([\w-]{11})\)/);
        if (!idMatch) return;

        const url = `https://www.youtube.com/watch?v=${idMatch[1]}`;

        if (selectedNumber === 3) {
          const downloadMsg = await message.sendReply("_Downloading audio..._");
          try {
            const result = await downloadAudio(url);
            const oggyAudio = await prepareOggyAudio(result.path, result.title);

            await sock.sendMessage(
              message.jid,
              {
                document: oggyAudio.buffer,
                fileName: oggyAudio.fileName,
                mimetype: "audio/mp4",
                caption: `_*${result.title}*_\n_By: OGGY-MD • ABHIIXZ_`,
              },
              { quoted: message.data }
            );
            if (downloadMsg && downloadMsg.key) {
              await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
            }
            if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
          } catch (e) {
            if (downloadMsg) await message.edit("_Download failed!_", message.jid, downloadMsg.key);
          }
        } else {
          const quality = selectedNumber === 2 ? "720p" : "360p";
          const downloadMsg = await message.sendReply(`_Downloading video at *${quality}*..._`);

          try {
            const result = await downloadVideo(url, quality);
            await sock.sendMessage(
              message.jid,
              {
                video: fs.readFileSync(result.path),
                caption: `_*${result.title}*_\n\n_Quality: ${quality}_\n_By: OGGY-MD • ABHIIXZ_`,
                mimetype: "video/mp4",
              },
              { quoted: message.data }
            );
            if (downloadMsg && downloadMsg.key) {
              await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
            }
            if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
          } catch (e) {
            if (downloadMsg) await message.edit("_Download failed!_", message.jid, downloadMsg.key);
          }
        }
      } catch (e) {}
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
    usage: ".spotify <link>",
    use: "download",
  },
  async (message, match) => {
    let url = match[1] || message.reply_message?.text;
    if (url && /\bhttps?:\/\/\S+/gi.test(url)) url = url.match(/\bhttps?:\/\/\S+/gi)[0];

    if (!url || !url.includes("spotify.com")) {
      return await message.sendReply("_Please provide a valid link!_");
    }

    const sock = message.client || message;
    let downloadMsg;

    try {
      downloadMsg = await message.sendReply("_Fetching info..._");
      const spotifyInfo = await spotifyTrack(url);
      const { title, artist } = spotifyInfo;

      await message.edit(`_Downloading *${title}* by *${artist}*..._`, message.jid, downloadMsg.key);
      const results = await searchYoutube(`${title} ${artist}`, 1);

      if (!results || results.length === 0) {
        return await message.edit("_No matching songs found on YouTube!_", message.jid, downloadMsg.key);
      }

      const result = await downloadAudio(results[0].url);
      const oggyAudio = await prepareOggyAudio(result.path, title, results[0].thumbnail);

      await sock.sendMessage(
        message.jid,
        {
          audio: oggyAudio.buffer,
          mimetype: "audio/mp4",
          ptt: false,
          fileName: oggyAudio.fileName,
          contextInfo: {
            externalAdReply: {
              title: oggyAudio.title,
              body: "OGGY-MD • ABHIIXZ",
              mediaType: 2,
              thumbnailUrl: oggyAudio.coverUrl,
              renderLargerThumbnail: true,
              showAdAttribution: false,
            },
          },
        },
        { quoted: message.data }
      );

      if (downloadMsg && downloadMsg.key) {
        await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
      }
      if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
    } catch (error) {
      if (downloadMsg) await message.edit("_Download failed!_", message.jid, downloadMsg.key);
    }
  }
);

// ============================================================
// 9. WHATSAPP-ൽ നിന്ന് തന്നെ ലോഗോ മാറ്റാനുള്ള കമാൻഡ് (.setaudiocover)
// ============================================================
Module(
  {
    pattern: "setaudiocover ?(.*)",
    fromMe: true,
    desc: "Set custom thumbnail/logo for audio downloads by replying to an image",
    use: "owner",
  },
  async (message) => {
    if (!message.reply_message?.image) {
      return await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD AUDIO COVER* 〕───\n│ ⚠️ *ഒരു ഫോട്ടോയ്ക്ക് റിപ്ലൈ ആയി ഈ കമാൻഡ് അടിക്കുക!*\n│ 💡 *ഉദാഹരണം:* ലോഗോ അയക്കുക ➔ Reply: `.setaudiocover`\n╰────────────────────────"
      );
    }

    try {
      const waitMsg = await message.sendReply("_⚡ Uploading and setting custom audio cover..._");
      const imgPath = await message.reply_message.download();
      const upload = await uploadToCatbox(imgPath);

      try { fs.unlinkSync(imgPath); } catch (e) {}

      if (upload && upload.url) {
        await setVar("AUDIO_COVER", upload.url);
        config.AUDIO_COVER = upload.url;
        return await message.edit(
          `╭───〔 ⚡ *OGGY-MD SUCCESS* 〕───\n│ ✅ *പുതിയ ഓഡിയോ ലോഗോ വിജയകരമായി സെറ്റ് ചെയ്തു!*\n│ 🔗 *URL:* ${upload.url}\n│ 💡 ഇനി ഡൗൺലോഡ് ചെയ്യുന്ന പാട്ടുകൾക്ക് ഈ ലോഗോ വരും.\n╰────────────────────────`,
          message.jid,
          waitMsg.key
        );
      } else {
        return await message.edit("_❌ ഫോട്ടോ അപ്‌ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല!_", message.jid, waitMsg.key);
      }
    } catch (err) {
      return await message.sendReply("_❌ എറർ സംഭവിച്ചു. വീണ്ടും ശ്രമിക്കുക!_");
    }
  }
);

// ============================================================
// 10. ഓഡിയോ വിവരങ്ങൾ മാറ്റാനുള്ള കമാൻഡ് (.setaudiodata)
// ============================================================
Module(
  {
    pattern: "setaudiodata ?(.*)",
    fromMe: true,
    desc: "Set default audio title and artist name",
    use: "owner",
  },
  async (message, match) => {
    const input = match[1]?.trim();
    if (!input) {
      return await message.sendReply(
        `╭───〔 ⚡ *OGGY-MD AUDIO DATA* 〕───\n│ 💡 *ഉപയോഗിക്കേണ്ട വിധം:*\n│ \`.setaudiodata OGGY-MD;ABHIIXZ\`\n╰────────────────────────`
      );
    }

    await setVar("AUDIO_DATA", input);
    config.AUDIO_DATA = input;
    return await message.sendReply(
      `╭───〔 ⚡ *OGGY-MD UPDATED* 〕───\n│ ✅ *ഓഡിയോ വിവരങ്ങൾ മാറ്റി:*\n│ 🎵 *Data:* ${input}\n╰────────────────────────`
    );
  }
);
