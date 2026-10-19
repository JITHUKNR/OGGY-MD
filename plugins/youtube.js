const { Module } = require("../main");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const axios = require("axios");
const { spotifyTrack } = require("./utils/misc");

const config = require("../config");
const MODE = config.MODE;
const fromMe = MODE === "public" ? false : true;

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

// 1. FAST BULLETPROOF YT-DLP AUDIO DOWNLOADER WITH REAL METADATA
async function downloadAudio(url) {
  const timestamp = Date.now();
  const cleaned = cleanYtUrl(url);
  let title = "YouTube Audio";
  let uploader = "YouTube Music";
  let duration = "";
  let thumbnail = "";

  try {
    const meta = await runCmd(
      `yt-dlp ${YT_FLAGS} --print "%(title)s|||%(uploader)s|||%(duration_string)s|||%(thumbnail)s" --no-playlist "${cleaned}"`
    );
    if (meta) {
      const parts = meta.split("\n")[0].split("|||");
      if (parts[0]) title = parts[0].trim();
      if (parts[1]) uploader = parts[1].trim();
      if (parts[2]) duration = parts[2].trim();
      if (parts[3]) thumbnail = parts[3].trim();
    }
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
    uploader: uploader,
    duration: duration,
    thumbnail: thumbnail,
    url: cleaned,
  };
}

// 2. BULLETPROOF INSTAGRAM AUDIO EXTRACTOR (REELS, PHOTO-CAROUSELS & POSTS)
async function downloadInstaAudio(url) {
  const timestamp = Date.now();
  const cleanUrl = url.split("?")[0].replace(/\/+$/, "");
  let title = "Instagram Audio";
  let uploader = "Instagram Post";
  let thumbnail = "";

  const outTemplate = path.join("/tmp", `insta_raw_${timestamp}.%(ext)s`);
  const m4aPath = path.join("/tmp", `insta_final_${timestamp}.m4a`);

  // Try Local yt-dlp first
  try {
    const meta = await runCmd(
      `yt-dlp --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" --print "%(title)s|||%(uploader)s|||%(thumbnail)s" --no-playlist "${cleanUrl}/"`
    );
    if (meta) {
      const parts = meta.split("\n")[0].split("|||");
      if (parts[0] && parts[0] !== "NA") title = parts[0].trim().substring(0, 50);
      if (parts[1] && parts[1] !== "NA") uploader = parts[1].trim();
      if (parts[2] && parts[2] !== "NA") thumbnail = parts[2].trim();
    }

    await runCmd(
      `yt-dlp --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" -f "bestaudio/b/best" --no-playlist -o "${outTemplate}" "${cleanUrl}/" --force-overwrites`
    );

    const files = fs.readdirSync("/tmp").filter((f) => f.startsWith(`insta_raw_${timestamp}`));
    if (files.length > 0) {
      const rawPath = path.join("/tmp", files[0]);
      await runCmd(`ffmpeg -i "${rawPath}" -vn -c:a aac -b:a 192k "${m4aPath}" -y`);
      try { fs.unlinkSync(rawPath); } catch (e) {}
      return { path: m4aPath, title, uploader, duration: "", thumbnail, url: cleanUrl };
    }
  } catch (e) {}

  // Fallback API for Instagram Photo-Carousels with Background Music
  try {
    const res = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
    const data = res.data?.data;
    let targetAudioStream = null;

    if (Array.isArray(data)) {
      const directAudio = data.find((item) => item.type === "audio" || item.url?.includes(".mp3") || item.url?.includes(".m4a"));
      if (directAudio) targetAudioStream = directAudio.url;
      else if (data[0]?.url) targetAudioStream = data[0].url;
    } else if (data?.url) {
      targetAudioStream = data.url;
    }

    if (targetAudioStream) {
      const tempStream = path.join("/tmp", `stream_${timestamp}.bin`);
      const streamRes = await axios.get(targetAudioStream, { responseType: "arraybuffer", timeout: 20000 });
      fs.writeFileSync(tempStream, Buffer.from(streamRes.data));

      await runCmd(`ffmpeg -i "${tempStream}" -vn -c:a aac -b:a 192k "${m4aPath}" -y`);
      try { fs.unlinkSync(tempStream); } catch (e) {}

      return { path: m4aPath, title, uploader, duration: "", thumbnail, url: cleanUrl };
    }
  } catch (fallbackErr) {}

  throw new Error("Instagram audio extraction failed");
}

// 3. BULLETPROOF YT-DLP VIDEO DOWNLOADER
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

function formatViews(views) {
  if (views >= 1000000) return (views / 1000000).toFixed(1) + "M";
  if (views >= 1000) return (views / 1000).toFixed(1) + "K";
  return views?.toString() || "N/A";
}

// FETCHES & CONVERTS THUMBNAIL TO SAFE COMPRESSED JPEG BUFFER
async function getSafeJpegThumb(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 8000 });
    const tmpIn = path.join("/tmp", `thumb_in_${Date.now()}`);
    const tmpOut = path.join("/tmp", `thumb_out_${Date.now()}.jpg`);
    fs.writeFileSync(tmpIn, Buffer.from(res.data));
    await runCmd(`ffmpeg -i "${tmpIn}" -vf "scale=400:400:force_original_aspect_ratio=increase,crop=400:400" -q:v 6 "${tmpOut}" -y`);
    try { fs.unlinkSync(tmpIn); } catch (e) {}
    if (fs.existsSync(tmpOut)) {
      const buf = fs.readFileSync(tmpOut);
      try { fs.unlinkSync(tmpOut); } catch (e) {}
      return buf;
    }
  } catch (e) {}
  return null;
}

// INLINE PREVIEW CARD HELPER (COMPATIBLE PLAYABLE AUDIO)
async function sendInlineSong(sock, jid, result, quotedData, customUrl = "") {
  const cleanTitle = (result.title || "Audio").replace(/[\\/:*?"<>|]/g, "").substring(0, 50).trim();
  const artist = result.uploader || result.channel?.name || "Music Artist";
  const songUrl = customUrl || result.url || "https://www.youtube.com";
  const isInsta = /instagram\.com/i.test(songUrl);

  const headerTitle = isInsta ? "INSTAGRAM MUSIC" : "YOUTUBE MUSIC";
  let caption = `╭━━━〔 🎵 *${headerTitle}* 〕━━━╮\n`;
  caption += `┃ 🎶 *Title:* ${cleanTitle}\n`;
  caption += `┃ 👤 *Artist:* ${artist}\n`;
  if (result.duration) {
    caption += `┃ ⏱️ *Duration:* ${result.duration}\n`;
  }
  caption += `╰━━━━━━━━━━━━━━━━━━━━━╯`;

  const cardPayload = { text: caption };

  if (result.thumbnail) {
    const thumbBuffer = await getSafeJpegThumb(result.thumbnail);
    if (thumbBuffer) {
      cardPayload.contextInfo = {
        externalAdReply: {
          title: cleanTitle,
          body: artist,
          mediaType: 1,
          thumbnail: thumbBuffer,
          renderLargerThumbnail: true,
          showAdAttribution: false,
          sourceUrl: songUrl,
        },
      };
    }
  }

  try {
    await sock.sendMessage(jid, cardPayload, { quoted: quotedData });
  } catch (err) {
    await sock.sendMessage(jid, { text: caption }, { quoted: quotedData }).catch(() => {});
  }

  const ext = path.extname(result.path) || ".m4a";
  await sock.sendMessage(
    jid,
    {
      audio: fs.readFileSync(result.path),
      mimetype: ext === ".mp3" ? "audio/mpeg" : "audio/mp4",
      ptt: false,
      fileName: `${cleanTitle}${ext}`,
    },
    { quoted: quotedData }
  );
}

// ==========================================
// 1. SONG COMMAND (YOUTUBE & INSTAGRAM AUDIO)
// ==========================================
Module(
  {
    pattern: "song ?(.*)",
    fromMe: fromMe,
    desc: "Search YouTube or download audio directly from YouTube or Instagram",
    usage: ".song <query or link>",
    use: "download",
  },
  async (message, match) => {
    let input = match[1] || message.reply_message?.text;
    if (!input) {
      return await message.sendReply(
        "_Please provide a search query, YouTube link, or Instagram link!_\n_Example: .song faded or reply to an Instagram link with .song_"
      );
    }

    const sock = message.client || message;
    const isInsta = /(?:instagram\.com\/(?:p|reel|tv|reels)\/)/i.test(input);
    const isYtUrl = /(?:youtu\.be\/|youtube\.com)/i.test(input);

    // INSTAGRAM AUDIO DOWNLOAD
    if (isInsta) {
      const urlMatch = input.match(/\bhttps?:\/\/\S+/gi);
      const url = urlMatch ? urlMatch[0] : input;

      let downloadMsg;
      let audioPath;
      try {
        downloadMsg = await message.sendReply("_🎵 Downloading audio from Instagram, please wait..._");
        const result = await downloadInstaAudio(url);
        audioPath = result.path;

        await sendInlineSong(sock, message.jid, result, message.data, url);

        if (downloadMsg && downloadMsg.key) {
          await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
        }
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      } catch (err) {
        console.error("Instagram audio download error:", err);
        if (downloadMsg) {
          await message.edit("_Failed to download Instagram audio! Ensure the post/reel is public._", message.jid, downloadMsg.key);
        } else {
          await message.sendReply("_Download failed. Please check the Instagram link._");
        }
        if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      }
      return;
    }

    // YOUTUBE LINK AUDIO DOWNLOAD
    if (isYtUrl) {
      const urlMatch = input.match(/\bhttps?:\/\/\S+/gi);
      const url = urlMatch ? urlMatch[0] : input;

      let downloadMsg;
      let audioPath;
      try {
        downloadMsg = await message.sendReply("_🎵 Downloading audio, please wait..._");
        const result = await downloadAudio(url);
        audioPath = result.path;

        await sendInlineSong(sock, message.jid, result, message.data, url);

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

    // YOUTUBE SEARCH
    try {
      const searchMsg = await message.sendReply("_Searching YouTube..._");
      const results = await searchYoutube(input, 10);

      if (!results || results.length === 0) {
        return await message.edit("_No results found!_", message.jid, searchMsg.key);
      }

      let resultText = "╭───〔 ⚡ *OGGY-MD SEARCH* ⚡ 〕───\n";
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

// ============================================================
// 2. INSTA COMMAND (DOWNLOADS ALL SLIDES / CAROUSEL & VIDEOS)
// ============================================================
Module(
  {
    pattern: "insta ?(.*)",
    fromMe: fromMe,
    desc: "Download all photos and videos from Instagram post or carousel",
    usage: ".insta <link>",
    use: "download",
  },
  async (message, match) => {
    let input = match[1] || message.reply_message?.text;
    if (!input) return await message.sendReply("_Please provide an Instagram link!_");

    const urlMatch = input.match(/\bhttps?:\/\/\S+/gi);
    if (!urlMatch) return await message.sendReply("_Invalid link provided!_");
    const cleanUrl = urlMatch[0].split("?")[0].replace(/\/+$/, "");

    const sock = message.client || message;
    let waitMsg;

    try {
      waitMsg = await message.sendReply("_⏳ Fetching Instagram media (all slides)..._");
      const res = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(cleanUrl)}`, { timeout: 20000 });
      const mediaList = res.data?.data;

      if (!mediaList || (Array.isArray(mediaList) && mediaList.length === 0)) {
        return await message.edit("_No media found! Please make sure the account is public._", message.jid, waitMsg.key);
      }

      const items = Array.isArray(mediaList) ? mediaList : [mediaList];
      const validItems = items.filter(m => m.type !== "audio" && !m.url?.endsWith(".mp3"));

      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        const itemUrl = item.url;
        const caption = `_*Instagram Media (${i + 1}/${validItems.length})*_\n_By: OGGY-MD_`;

        if (item.type === "video" || itemUrl.includes(".mp4")) {
          await sock.sendMessage(message.jid, { video: { url: itemUrl }, caption }, { quoted: message.data });
        } else {
          await sock.sendMessage(message.jid, { image: { url: itemUrl }, caption }, { quoted: message.data });
        }
      }

      if (waitMsg && waitMsg.key) {
        await sock.sendMessage(message.jid, { delete: waitMsg.key }).catch(() => {});
      }
    } catch (e) {
      console.error("Insta download error:", e);
      if (waitMsg) await message.edit("_Failed to download Instagram media!_", message.jid, waitMsg.key);
      else await message.sendReply("_Failed to download Instagram media!_");
    }
  }
);

// ==========================================
// 3. YTS COMMAND
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
// 4. YTV COMMAND
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
// 5. VIDEO COMMAND
// ==========================================
Module(
  {
    pattern: "video ?(.*)",
    fromMe: fromMe,
    desc: "Download YouTube video at best quality",
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
          caption: `_*${result.title}*_\n\n_By: OGGY-MD_`,
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
// 6. YTA COMMAND
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
      downloadMsg = await message.sendReply("_Downloading audio as document..._");
      const result = await downloadAudio(url);
      audioPath = result.path;

      const cleanTitle = (result.title || "YouTube Audio").replace(/[\\/:*?"<>|]/g, "").substring(0, 50).trim();

      await sock.sendMessage(
        message.jid,
        {
          document: fs.readFileSync(audioPath),
          fileName: `${cleanTitle}.mp3`,
          mimetype: "audio/mp4",
          caption: `_*${cleanTitle}*_`,
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
// 7. PLAY COMMAND
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
      const isUrl = /(?:youtu\.be\/|youtube\.com)/i.test(input);

      if (!isUrl) {
        downloadMsg = await message.sendReply("_Searching..._");
        const results = await searchYoutube(input, 1);
        if (!results || results.length === 0) {
          return await message.edit("_No results found!_", message.jid, downloadMsg.key);
        }
        targetUrl = results[0].url;
      }

      if (!downloadMsg) downloadMsg = await message.sendReply("_Downloading audio..._");
      else await message.edit("_Downloading audio..._", message.jid, downloadMsg.key);

      const result = await downloadAudio(targetUrl);
      audioPath = result.path;

      await sendInlineSong(sock, message.jid, result, message.data, targetUrl);

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
// 8. INTERACTIVE TEXT LISTENER
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

    // STEP A: SELECTION FROM .song
    if (repliedText.includes("OGGY-MD SEARCH") || (repliedText.includes("YouTube Search Results") && repliedText.includes("to download audio"))) {
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
          result.thumbnail = selectedVideo.thumbnail || result.thumbnail;
          result.uploader = selectedVideo.channel?.name || result.uploader;
          result.duration = selectedVideo.duration || result.duration;

          await sendInlineSong(sock, message.jid, result, message.data, selectedVideo.url);

          if (downloadMsg && downloadMsg.key) {
            await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
          }
          if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
        } catch (err) {
          if (downloadMsg) await message.edit("_Download failed!_", message.jid, downloadMsg.key);
        }
      } catch (error) {
        await message.sendReply("_Failed to process your selection._");
      }
    }
    // STEP B: SELECTION FROM .yts
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
            await sendInlineSong(sock, message.jid, result, message.data, url);

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
                caption: `_*${result.title}*_\n\n_By: OGGY-MD_`,
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
    // STEP D: YTV QUALITY PICKER
    else if (repliedText.includes("Select Video Quality") || (repliedText.includes("OGGY-MD VIDEO") && repliedText.includes("Reply with a number"))) {
      try {
        const idMatch = repliedText.match(/\(([\w-]{11})\)/);
        if (!idMatch) return;

        const url = `https://www.youtube.com/watch?v=${idMatch[1]}`;

        if (selectedNumber === 3) {
          const downloadMsg = await message.sendReply("_Downloading audio..._");
          try {
            const result = await downloadAudio(url);
            const cleanTitle = (result.title || "YouTube Audio").replace(/[\\/:*?"<>|]/g, "").substring(0, 50).trim();

            await sock.sendMessage(
              message.jid,
              {
                document: fs.readFileSync(result.path),
                fileName: `${cleanTitle}.mp3`,
                mimetype: "audio/mp4",
                caption: `_*${cleanTitle}*_`,
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
                caption: `_*${result.title}*_\n\n_Quality: ${quality}_\n_By: OGGY-MD_`,
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
// 9. SPOTIFY COMMAND
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
      result.thumbnail = results[0].thumbnail;
      result.uploader = artist;

      await sendInlineSong(sock, message.jid, result, message.data, url);

      if (downloadMsg && downloadMsg.key) {
        await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
      }
      if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
    } catch (error) {
      if (downloadMsg) await message.edit("_Download failed!_", message.jid, downloadMsg.key);
    }
  }
);
