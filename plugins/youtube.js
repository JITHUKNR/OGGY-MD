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

// 1. FAST BULLETPROOF YT-DLP AUDIO DOWNLOADER WITH REAL METADATA & FFMPEG CONVERSION
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

  const outTemplate = path.join("/tmp", `yt_raw_${timestamp}.%(ext)s`);
  const m4aPath = path.join("/tmp", `yt_final_${timestamp}.m4a`);

  await runCmd(`yt-dlp ${YT_FLAGS} -f "ba/b" --no-playlist -o "${outTemplate}" "${cleaned}" --force-overwrites`);

  const files = fs.readdirSync("/tmp").filter((f) => f.startsWith(`yt_raw_${timestamp}`));
  if (files.length === 0) throw new Error("Audio download failed");

  const rawPath = path.join("/tmp", files[0]);
  // Convert to clean WhatsApp-compatible AAC Audio
  await runCmd(`ffmpeg -i "${rawPath}" -vn -c:a aac -b:a 192k "${m4aPath}" -y`);
  try { fs.unlinkSync(rawPath); } catch (e) {}

  return {
    path: m4aPath,
    title: title,
    uploader: uploader,
    duration: duration,
    thumbnail: thumbnail,
    url: cleaned,
  };
}

// 2. BULLETPROOF INSTAGRAM REELS AUDIO EXTRACTOR
async function downloadInstaAudio(url) {
  const timestamp = Date.now();
  const cleanUrl = url.split("?")[0].replace(/\/+$/, "");
  let title = "Instagram Audio";
  let uploader = "Instagram Reel";
  let thumbnail = "";

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
  } catch (e) {}

  const outTemplate = path.join("/tmp", `insta_raw_${timestamp}.%(ext)s`);
  const m4aPath = path.join("/tmp", `insta_final_${timestamp}.m4a`);

  await runCmd(
    `yt-dlp --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" -f "ba/b/best" --no-playlist -o "${outTemplate}" "${cleanUrl}/" --force-overwrites`
  );

  const files = fs.readdirSync("/tmp").filter((f) => f.startsWith(`insta_raw_${timestamp}`));
  if (files.length === 0) throw new Error("Instagram audio download failed");

  const rawPath = path.join("/tmp", files[0]);
  await runCmd(`ffmpeg -i "${rawPath}" -vn -c:a aac -b:a 192k "${m4aPath}" -y`);
  try { fs.unlinkSync(rawPath); } catch (e) {}

  return {
    path: m4aPath,
    title: title,
    uploader: uploader,
    duration: "",
    thumbnail: thumbnail,
    url: cleanUrl,
  };
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

// BULLETPROOF YOUTUBE SEARCH ENGINE (USES VPS COOKIES + BACKUP APIS)
async function searchYoutube(query, limit = 10) {
  const cleanQ = query.replace(/["\\]/g, "").trim();

  // METHOD 1: Fast yt-dlp Flat-Playlist Search with Cookies (Never Blocked on VPS)
  try {
    const raw = await runCmd(
      `yt-dlp ${YT_FLAGS} --flat-playlist --no-warnings --print "%(id)s|||%(title)s|||%(duration_string)s|||%(uploader)s|||%(view_count)s" "ytsearch${limit}:${cleanQ}"`
    );
    if (raw) {
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);
      const items = [];
      for (const line of lines) {
        const parts = line.split("|||");
        const id = parts[0]?.trim();
        if (!id) continue;
        const title = parts[1]?.trim() || "YouTube Video";
        const duration = parts[2]?.trim() && parts[2] !== "NA" ? parts[2].trim() : "";
        const uploader = parts[3]?.trim() && parts[3] !== "NA" ? parts[3].trim() : "YouTube";
        const views = parts[4]?.trim() && parts[4] !== "NA" ? parseInt(parts[4]) || 0 : 0;

        items.push({
          title,
          duration,
          views,
          channel: { name: uploader },
          url: `https://www.youtube.com/watch?v=${id}`,
          thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          uploadedAt: "",
        });
      }
      if (items.length > 0) return items;
    }
  } catch (e) {
    console.error("yt-dlp search error:", e);
  }

  // METHOD 2: Free Public YouTube API Fallback
  const fallbackApis = [
    `https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(cleanQ)}`,
    `https://vid.priv.au/api/v1/search?q=${encodeURIComponent(cleanQ)}&type=video`,
    `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(cleanQ)}&type=video`
  ];

  for (const api of fallbackApis) {
    try {
      const res = await axios.get(api, { timeout: 8000 });
      let videos = [];
      if (Array.isArray(res.data?.data)) videos = res.data.data;
      else if (Array.isArray(res.data)) videos = res.data;

      if (videos.length > 0) {
        return videos.slice(0, limit).map((v) => ({
          title: v.title || "YouTube Video",
          duration: v.duration_string || v.timestamp || (v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${v.lengthSeconds % 60}` : ""),
          views: v.views || v.viewCount || 0,
          channel: { name: v.author?.name || v.author || v.channel?.name || "YouTube" },
          url: v.url || `https://www.youtube.com/watch?v=${v.videoId || v.id}`,
          thumbnail: v.thumbnail || (v.videoThumbnails && v.videoThumbnails[0]?.url) || `https://i.ytimg.com/vi/${v.videoId || v.id}/hqdefault.jpg`,
          uploadedAt: v.publishedText || v.uploadedAt || "",
        }));
      }
    } catch (err) {}
  }

  // METHOD 3: Native yt-search npm fallback
  try {
    const yts = require("yt-search");
    const s = await yts(cleanQ);
    if (s.videos && s.videos.length > 0) {
      return s.videos.slice(0, limit).map((v) => ({
        title: v.title,
        duration: v.timestamp,
        views: v.views,
        channel: { name: v.author?.name || "YouTube" },
        url: v.url,
        thumbnail: v.thumbnail,
        uploadedAt: v.ago,
      }));
    }
  } catch (err) {}

  return [];
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
  } catch (e) {
    console.error("Thumbnail conversion error:", e);
  }
  return null;
}

// ADVANCED NEON INLINE PREVIEW CARD & AUDIO DISPATCHER
async function sendInlineSong(sock, jid, result, quotedData, customUrl = "") {
  const cleanTitle = (result.title || "Audio Track").replace(/[\\/:*?"<>|]/g, "").substring(0, 48).trim();
  const artist = result.uploader || result.channel?.name || "Official Artist";
  const songUrl = customUrl || result.url || "https://whatsapp.com";

  // STEP 1: Send Stylish Neon Header Card with Non-Redirecting Thumbnail
  const cardPayload = {
    text: `⚡ *OGGY-MD* • ɴᴇᴏɴ ᴍᴜꜱɪᴄ\n\n🎶 *${cleanTitle}*\n👤 _${artist}_` + (result.duration ? ` • ⏱️ \`${result.duration}\`` : ""),
    contextInfo: {
      externalAdReply: {
        title: cleanTitle,
        body: `👤 ${artist} • ⚡ OGGY-MD`,
        mediaType: 1,
        renderLargerThumbnail: true,
        showAdAttribution: false,
        sourceUrl: "https://whatsapp.com", // തൊട്ടാലും പുറത്തുപോകാതെ സുരക്ഷിതമായി നിൽക്കും
      },
    },
  };

  if (result.thumbnail) {
    const thumbBuffer = await getSafeJpegThumb(result.thumbnail);
    if (thumbBuffer) {
      cardPayload.contextInfo.externalAdReply.thumbnail = thumbBuffer;
    }
  }

  try {
    await sock.sendMessage(jid, cardPayload, { quoted: quotedData });
  } catch (err) {
    await sock.sendMessage(jid, { text: `⚡ *OGGY-MD* • ɴᴇᴏɴ ᴍᴜꜱɪᴄ\n\n🎶 *${cleanTitle}*\n👤 _${artist}_` }, { quoted: quotedData }).catch(() => {});
  }

  // STEP 2: Send Pure WhatsApp-Compliant M4A Audio
  const ext = path.extname(result.path) || ".m4a";
  await sock.sendMessage(
    jid,
    {
      audio: fs.readFileSync(result.path),
      mimetype: "audio/mp4",
      ptt: false,
      fileName: `${cleanTitle}${ext}`,
    },
    { quoted: quotedData }
  );
}

// ==========================================
// 1. SONG COMMAND (HANDLES YOUTUBE & INSTAGRAM)
// ==========================================
Module(
  {
    pattern: "song ?(.*)",
    fromMe: fromMe,
    desc: "Download high quality audio from YouTube or Instagram",
    usage: ".song <query or link>",
    use: "download",
  },
  async (message, match) => {
    let input = match[1] || message.reply_message?.text;
    if (!input) {
      return await message.sendReply(
        `⚡ *OGGY-MD* • ᴍᴜꜱɪᴄ ᴇɴɢɪɴᴇ\n\n` +
        `✦ *Status:* Missing Input\n` +
        `✦ *Usage:* \`.song <name or link>\`\n\n` +
        `◈ *Examples:*\n` +
        `• \`.song Faded Alan Walker\`\n` +
        `• \`.song https://instagram.com/reel/...\``
      );
    }

    const sock = message.client || message;
    const isInstaPost = /(?:instagram\.com\/p\/)/i.test(input);
    const isInstaReel = /(?:instagram\.com\/(?:reel|reels|tv)\/)/i.test(input);
    const isYtUrl = /(?:youtu\.be\/|youtube\.com)/i.test(input);

    // CASE A-1: INSTAGRAM REGULAR POST NOTICE
    if (isInstaPost) {
      return await message.sendReply(
        `⚡ *OGGY-MD* • ᴀʟᴇʀᴛ\n\n` +
        `✦ *Status:* Audio Unavailable\n` +
        `✦ *Reason:* Regular photo posts do not have audio streams.\n` +
        `✦ *Tip:* Use Reel or YouTube links for audio downloads.`
      );
    }

    // CASE A-2: INSTAGRAM REEL AUDIO WITH NEON ANIMATION
    if (isInstaReel) {
      const urlMatch = input.match(/\bhttps?:\/\/\S+/gi);
      const url = urlMatch ? urlMatch[0] : input;

      let downloadMsg;
      let audioPath;
      try {
        downloadMsg = await message.sendReply(
          `⚡ *OGGY-MD* • ɴᴇᴏɴ ᴍᴜꜱɪᴄ\n\n` +
          `✦ ꜰᴇᴛᴄʜɪɴɢ ʀᴇᴇʟ ᴀᴜᴅɪᴏ...\n` +
          `◈ ▰▰▱▱▱▱▱▱ [25%] 💫`
        );

        const result = await downloadInstaAudio(url);
        audioPath = result.path;

        if (downloadMsg && downloadMsg.key) {
          await message.edit(
            `⚡ *OGGY-MD* • ɴᴇᴏɴ ᴍᴜꜱɪᴄ\n\n` +
            `✦ ᴇɴᴄᴏᴅɪɴɢ ʜᴅ ᴀᴜᴅɪᴏ...\n` +
            `◈ ▰▰▰▰▰▱▱▱ [70%] ✨`,
            message.jid,
            downloadMsg.key
          ).catch(() => {});
        }

        if (downloadMsg && downloadMsg.key) {
          await message.edit(
            `⚡ *OGGY-MD* • ɴᴇᴏɴ ᴍᴜꜱɪᴄ\n\n` +
            `✦ ᴜᴘʟᴏᴀᴅɪɴɢ ᴛᴏ ᴄʜᴀᴛ...\n` +
            `◈ ▰▰▰▰▰▰▰▰ [100%] 🚀`,
            message.jid,
            downloadMsg.key
          ).catch(() => {});
        }

        await sendInlineSong(sock, message.jid, result, message.data, url);

        if (downloadMsg && downloadMsg.key) {
          await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
        }
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      } catch (err) {
        console.error("Instagram audio error:", err);
        if (downloadMsg) {
          await message.edit(`✦ *Error:* Failed to download Reel audio. Ensure link is public.`, message.jid, downloadMsg.key);
        } else {
          await message.sendReply(`✦ *Error:* Failed to download Reel audio.`);
        }
        if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      }
      return;
    }

    // CASE B: YOUTUBE DIRECT LINK WITH NEON ANIMATION
    if (isYtUrl) {
      const urlMatch = input.match(/\bhttps?:\/\/\S+/gi);
      const url = urlMatch ? urlMatch[0] : input;

      let downloadMsg;
      let audioPath;
      try {
        downloadMsg = await message.sendReply(
          `⚡ *OGGY-MD* • ɴᴇᴏɴ ᴍᴜꜱɪᴄ\n\n` +
          `✦ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ᴛʀᴀᴄᴋ...\n` +
          `◈ ▰▰▱▱▱▱▱▱ [30%] 💫`
        );
        const result = await downloadAudio(url);
        audioPath = result.path;

        if (downloadMsg && downloadMsg.key) {
          await message.edit(
            `⚡ *OGGY-MD* • ɴᴇᴏɴ ᴍᴜꜱɪᴄ\n\n` +
            `✦ ᴜᴘʟᴏᴀᴅɪɴɢ ᴛᴏ ᴄʜᴀᴛ...\n` +
            `◈ ▰▰▰▰▰▰▰▰ [100%] 🚀`,
            message.jid,
            downloadMsg.key
          ).catch(() => {});
        }

        await sendInlineSong(sock, message.jid, result, message.data, url);

        if (downloadMsg && downloadMsg.key) {
          await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
        }
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      } catch (err) {
        console.error("Song URL error:", err);
        if (downloadMsg) {
          await message.edit(`✦ *Error:* Download failed. Please try again.`, message.jid, downloadMsg.key);
        } else {
          await message.sendReply(`✦ *Error:* Download failed.`);
        }
        if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      }
      return;
    }

    // CASE C: YOUTUBE TEXT SEARCH (CLEAN SELECTION LIST)
    try {
      const searchMsg = await message.sendReply(
        `⚡ *OGGY-MD* • ᴍᴜꜱɪᴄ\n\n` +
        `✦ *Searching YouTube...* 💫`
      );
      const results = await searchYoutube(input, 10);

      if (!results || results.length === 0) {
        return await message.edit(`✦ *Error:* No matching songs found on YouTube!`, message.jid, searchMsg.key);
      }

      let resultText = `⚡ *OGGY-MD* • ʏᴏᴜᴛᴜʙᴇ ꜱᴇᴀʀᴄʜ\n`;
      resultText += `◈ *Query:* _${input}_\n\n`;

      results.forEach((video, index) => {
        resultText += `*${index + 1}.* ${video.title}\n`;
        resultText += `   ⏱️ \`${video.duration}\` • 👁️ \`${formatViews(video.views)}\` • 👤 _${video.channel.name}_\n\n`;
      });

      resultText += `_Reply with a number (1-10) to download audio._`;
      await message.edit(resultText, message.jid, searchMsg.key);
    } catch (error) {
      console.error("Song search error:", error);
      await message.sendReply(`✦ *Error:* YouTube search failed. Please try again.`);
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
      const searchMsg = await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
        `┃ 🔍 *Searching YouTube...*\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
      const results = await searchYoutube(query, 10);

      if (!results || results.length === 0) {
        return await message.edit("_❌ No results found!_", message.jid, searchMsg.key);
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
      await message.sendReply("_❌ Search failed. Please try again later._");
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
      downloadMsg = await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
        `┃ 🎬 *Downloading Video...*\n` +
        `┃ ▰▰▰▱▱▱▱▱ 45%\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
      const result = await downloadVideo(url, "best");
      videoPath = result.path;

      if (downloadMsg && downloadMsg.key) {
        await message.edit(
          `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
          `┃ 🚀 *Uploading Video...*\n` +
          `┃ ▰▰▰▰▰▰▰▰ 100%\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`,
          message.jid,
          downloadMsg.key
        ).catch(() => {});
      }

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
      if (downloadMsg) await message.edit("_❌ Download failed!_", message.jid, downloadMsg.key);
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
      downloadMsg = await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
        `┃ 📄 *Downloading Audio Document...*\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
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
      if (downloadMsg) await message.edit("_❌ Download failed!_", message.jid, downloadMsg.key);
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
      const isUrl = /(?:youtu\.be\/|youtube\.com)/i.test(input);

      if (!isUrl) {
        downloadMsg = await message.sendReply(
          `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
          `┃ 🔍 *Searching for track...*\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`
        );
        const results = await searchYoutube(input, 1);
        if (!results || results.length === 0) {
          return await message.edit("_❌ No results found!_", message.jid, downloadMsg.key);
        }
        targetUrl = results[0].url;
      }

      if (!downloadMsg) {
        downloadMsg = await message.sendReply(
          `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
          `┃ 🎵 *Downloading audio...*\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`
        );
      } else {
        await message.edit(
          `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
          `┃ 🎵 *Downloading audio...*\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`,
          message.jid,
          downloadMsg.key
        );
      }

      const result = await downloadAudio(targetUrl);
      audioPath = result.path;

      await sendInlineSong(sock, message.jid, result, message.data, targetUrl);

      if (downloadMsg && downloadMsg.key) {
        await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
      }
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    } catch (error) {
      console.error("Play error:", error);
      if (downloadMsg) await message.edit("_❌ Download failed!_", message.jid, downloadMsg.key);
      if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }
  }
);

// ============================================================
// 7. INTERACTIVE TEXT LISTENER (SUPPORTS NEON UI & FAST NUMBER REPLY)
// ============================================================
Module(
  {
    on: "text",
    fromMe: fromMe,
  },
  async (message, match) => {
    const numberMatch = message.text?.trim().match(/^\d+$/);
    if (!numberMatch) return;
    const selectedNumber = parseInt(numberMatch[0]);

    if (!message.reply_message) return;

    const repliedText = message.reply_message.text || message.reply_message.message || "";
    if (!repliedText || typeof repliedText !== "string") return;

    const sock = message.client || message;

    // STEP A: SELECTION FROM .song SEARCH LIST
    const isSongList =
      (repliedText.includes("YOUTUBE SEARCH") || repliedText.includes("ʏᴏᴜᴛᴜʙᴇ ꜱᴇᴀʀᴄʜ") || repliedText.includes("OGGY-MD SEARCH")) &&
      (repliedText.includes("download audio") || repliedText.includes("Query:") || repliedText.includes("Results for:"));

    if (isSongList) {
      if (selectedNumber < 1 || selectedNumber > 10) {
        return await message.sendReply("_Please select a valid number between 1 and 10._");
      }

      try {
        let query = "";
        const qMatch = repliedText.match(/Query:\s*_?([^\n_]+)_?/i) || repliedText.match(/Results for:_\s*\*([^\n*]+)\*/i);
        if (qMatch) query = qMatch[1].trim();

        let targetVideo = null;

        // Try getting video from search query results
        if (query) {
          const results = await searchYoutube(query, 10);
          if (results && results[selectedNumber - 1]) {
            targetVideo = results[selectedNumber - 1];
          }
        }

        // Fallback: extract title directly from replied message line
        if (!targetVideo) {
          const lineRegex = new RegExp(`(?:^|\\n)\\s*\\*?${selectedNumber}\\.\\*?\\s*([^\\n]+)`);
          const lineMatch = repliedText.match(lineRegex);
          if (lineMatch) {
            const rawTitle = lineMatch[1].split("|")[0].replace(/[-–]/g, " ").trim();
            const fallbackResults = await searchYoutube(rawTitle, 1);
            if (fallbackResults.length > 0) targetVideo = fallbackResults[0];
          }
        }

        if (!targetVideo) {
          return await message.sendReply("_❌ Could not find the selected track. Please search again._");
        }

        let downloadMsg = await message.sendReply(
          `⚡ *OGGY-MD* • ɴᴇᴏɴ ᴍᴜꜱɪᴄ\n\n` +
          `✦ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ᴛʀᴀᴄᴋ...\n` +
          `◈ ▰▰▰▱▱▱▱▱ [35%] 💫`
        );

        try {
          const result = await downloadAudio(targetVideo.url);
          result.thumbnail = targetVideo.thumbnail || result.thumbnail;
          result.uploader = targetVideo.channel?.name || result.uploader;
          result.duration = targetVideo.duration || result.duration;

          if (downloadMsg && downloadMsg.key) {
            await message.edit(
              `⚡ *OGGY-MD* • ɴᴇᴏɴ ᴍᴜꜱɪᴄ\n\n` +
              `✦ ᴜᴘʟᴏᴀᴅɪɴɢ ᴛᴏ ᴄʜᴀᴛ...\n` +
              `◈ ▰▰▰▰▰▰▰▰ [100%] 🚀`,
              message.jid,
              downloadMsg.key
            ).catch(() => {});
          }

          await sendInlineSong(sock, message.jid, result, message.data, targetVideo.url);

          if (downloadMsg && downloadMsg.key) {
            await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
          }
          if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
        } catch (err) {
          console.error("Selection download error:", err);
          if (downloadMsg) await message.edit(`✦ *Error:* Failed to download selected track.`, message.jid, downloadMsg.key);
        }
      } catch (error) {
        console.error("Interactive song selection error:", error);
        await message.sendReply(`✦ *Error:* Failed to process selection.`);
      }
    }
    // STEP B: SELECTION FROM .yts
    else if (repliedText.includes("see video details") && (repliedText.includes("YOUTUBE SEARCH") || repliedText.includes("OGGY-MD SEARCH"))) {
      if (selectedNumber < 1 || selectedNumber > 10) return;

      try {
        let query = "";
        const qMatch = repliedText.match(/Query:\s*_?([^\n_]+)_?/i) || repliedText.match(/Results for:_\s*\*([^\n*]+)\*/i);
        if (!qMatch) return;
        query = qMatch[1].trim();

        const results = await searchYoutube(query, 10);
        if (!results[selectedNumber - 1]) return;

        const selectedVideo = results[selectedNumber - 1];
        let thumbnailBuffer = null;
        try {
          const res = await axios.get(selectedVideo.thumbnail, { responseType: "arraybuffer", timeout: 7000 });
          thumbnailBuffer = Buffer.from(res.data);
        } catch (e) {}

        let caption = `⚡ *OGGY-MD* • ʏᴏᴜᴛᴜʙᴇ ɪɴꜰᴏ\n\n`;
        caption += `◈ *Title:* ${selectedVideo.title}\n`;
        caption += `◈ *Channel:* ${selectedVideo.channel.name}\n`;
        caption += `◈ *Duration:* \`${selectedVideo.duration}\`\n`;
        caption += `◈ *Views:* \`${formatViews(selectedVideo.views)}\`\n`;
        caption += `◈ *URL:* ${selectedVideo.url}\n\n`;
        caption += `_Reply with:_\n*1.* Audio Track\n*2.* Video Track`;

        if (thumbnailBuffer) {
          await sock.sendMessage(message.jid, { image: thumbnailBuffer, caption }, { quoted: message.data });
        } else {
          await message.sendReply(caption);
        }
      } catch (error) {}
    }
    // STEP C: REPLY 1 (AUDIO) OR 2 (VIDEO) ON CARD
    else if (repliedText.includes("Reply with:") && (repliedText.includes("Audio Track") || repliedText.includes("*1.* Audio"))) {
      if (selectedNumber !== 1 && selectedNumber !== 2) return;

      try {
        const urlMatch = repliedText.match(/(?:URL:\*?\s*|\b)(https?:\/\/\S+)/i);
        if (!urlMatch) return;
        const url = urlMatch[1].trim();

        if (selectedNumber === 1) {
          let downloadMsg = await message.sendReply(
            `⚡ *OGGY-MD* • ɴᴇᴏɴ ᴍᴜꜱɪᴄ\n\n✦ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ᴛʀᴀᴄᴋ... ▰▰▰▱▱▱ [40%]`
          );
          try {
            const result = await downloadAudio(url);
            await sendInlineSong(sock, message.jid, result, message.data, url);
            if (downloadMsg && downloadMsg.key) {
              await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
            }
            if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
          } catch (e) {
            if (downloadMsg) await message.edit(`✦ *Error:* Download failed.`, message.jid, downloadMsg.key);
          }
        } else if (selectedNumber === 2) {
          let downloadMsg = await message.sendReply(
            `⚡ *OGGY-MD* • ᴠɪᴅᴇᴏ\n\n✦ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ᴠɪᴅᴇᴏ... ▰▰▰▱▱▱ [45%]`
          );
          try {
            const result = await downloadVideo(url, "360p");
            await sock.sendMessage(
              message.jid,
              {
                video: fs.readFileSync(result.path),
                caption: `◈ *Title:* ${result.title}\n⚡ *OGGY-MD*`,
                mimetype: "video/mp4",
              },
              { quoted: message.data }
            );
            if (downloadMsg && downloadMsg.key) {
              await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
            }
            if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
          } catch (e) {
            if (downloadMsg) await message.edit(`✦ *Error:* Video download failed.`, message.jid, downloadMsg.key);
          }
        }
      } catch (e) {}
    }
    // STEP D: YTV QUALITY PICKER
    else if (repliedText.includes("OGGY-MD VIDEO") && repliedText.includes("Reply with a number")) {
      try {
        const idMatch = repliedText.match(/\(([\w-]{11})\)/);
        if (!idMatch) return;
        const url = `https://www.youtube.com/watch?v=${idMatch[1]}`;

        if (selectedNumber === 3) {
          const downloadMsg = await message.sendReply(
            `⚡ *OGGY-MD* • ᴀᴜᴅɪᴏ\n\n✦ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ᴀᴜᴅɪᴏ ᴅᴏᴄᴜᴍᴇɴᴛ...`
          );
          try {
            const result = await downloadAudio(url);
            const cleanTitle = (result.title || "YouTube Audio").replace(/[\\/:*?"<>|]/g, "").substring(0, 50).trim();
            await sock.sendMessage(
              message.jid,
              {
                document: fs.readFileSync(result.path),
                fileName: `${cleanTitle}.mp3`,
                mimetype: "audio/mp4",
                caption: `◈ *Title:* ${cleanTitle}`,
              },
              { quoted: message.data }
            );
            if (downloadMsg && downloadMsg.key) {
              await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
            }
            if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
          } catch (e) {
            if (downloadMsg) await message.edit(`✦ *Error:* Download failed.`, message.jid, downloadMsg.key);
          }
        } else {
          const quality = selectedNumber === 2 ? "720p" : "360p";
          const downloadMsg = await message.sendReply(
            `⚡ *OGGY-MD* • ᴠɪᴅᴇᴏ\n\n✦ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ${quality} ᴠɪᴅᴇᴏ...`
          );
          try {
            const result = await downloadVideo(url, quality);
            await sock.sendMessage(
              message.jid,
              {
                video: fs.readFileSync(result.path),
                caption: `◈ *Title:* ${result.title}\n◈ *Quality:* ${quality}\n⚡ *OGGY-MD*`,
                mimetype: "video/mp4",
              },
              { quoted: message.data }
            );
            if (downloadMsg && downloadMsg.key) {
              await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
            }
            if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
          } catch (e) {
            if (downloadMsg) await message.edit(`✦ *Error:* Download failed.`, message.jid, downloadMsg.key);
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
      return await message.sendReply("_Please provide a valid Spotify track link!_");
    }

    const sock = message.client || message;
    let downloadMsg;

    try {
      downloadMsg = await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
        `┃ 🎵 *Fetching Spotify details...*\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
      const spotifyInfo = await spotifyTrack(url);
      const { title, artist } = spotifyInfo;

      await message.edit(
        `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
        `┃ 🎶 *Track:* ${title}\n` +
        `┃ 👤 *Artist:* ${artist}\n` +
        `┃ 📥 *Downloading audio...*\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`,
        message.jid,
        downloadMsg.key
      );

      const results = await searchYoutube(`${title} ${artist}`, 1);

      if (!results || results.length === 0) {
        return await message.edit("_❌ No matching songs found on YouTube!_", message.jid, downloadMsg.key);
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
      if (downloadMsg) await message.edit("_❌ Download failed!_", message.jid, downloadMsg.key);
    }
  }
);
