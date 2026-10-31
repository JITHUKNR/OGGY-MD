const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const isFromMe = botConfig.MODE === "public" ? false : true;
const ytSearchSessions = {};

// YouTube regex
const YT_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

// VPS Cookies for yt-dlp fallback
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

// -----------------------------------------------------------------
// 1. ULTRA-FAST PARALLEL AUDIO ENGINE (Takes 1-3 seconds)
// -----------------------------------------------------------------
async function fetchFastAudio(youtubeUrl) {
  // Fire all APIs at the EXACT SAME TIME. The fastest one wins!
  const p1 = axios.get(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(youtubeUrl)}`, { timeout: 8000 }).then(r => {
    if (r.data?.data?.dl && r.data.data.dl.startsWith('http')) return { audioUrl: r.data.data.dl, title: r.data.data.title || 'YouTube Audio' };
    throw new Error('P1 Failed');
  });

  const p2 = axios.post('https://cobalt-api.kwiatekm.me/', { url: youtubeUrl, downloadMode: 'audio', audioFormat: 'mp3' }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 8000 }).then(r => {
    if (r.data?.url) return { audioUrl: r.data.url, title: 'YouTube Audio' };
    throw new Error('P2 Failed');
  });

  const p3 = axios.get(`https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`, { timeout: 8000 }).then(r => {
    if (r.data?.url) return { audioUrl: r.data.url, title: r.data.title || 'YouTube Audio' };
    throw new Error('P3 Failed');
  });

  try {
    return await Promise.any([p1, p2, p3]);
  } catch (e) {
    throw new Error('All fast APIs failed');
  }
}

// -----------------------------------------------------------------
// 2. ULTRA-FAST PARALLEL VIDEO ENGINE (Takes 1-4 seconds)
// -----------------------------------------------------------------
async function fetchFastVideo(youtubeUrl) {
  const p1 = axios.post('https://cobalt-api.kwiatekm.me/', { url: youtubeUrl, videoQuality: '720', downloadMode: 'auto' }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 9000 }).then(r => {
    if (r.data?.url) return { videoUrl: r.data.url, title: 'YouTube Video' };
    throw new Error('P1 Failed');
  });

  const p2 = axios.get(`https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(youtubeUrl)}`, { timeout: 9000 }).then(r => {
    if (r.data?.data?.dl) return { videoUrl: r.data.data.dl, title: r.data.data.title || 'YouTube Video' };
    throw new Error('P2 Failed');
  });

  const p3 = axios.get(`https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`, { timeout: 9000 }).then(r => {
    if (r.data?.url) return { videoUrl: r.data.url, title: r.data.title || 'YouTube Video' };
    throw new Error('P3 Failed');
  });

  try {
    return await Promise.any([p1, p2, p3]);
  } catch (e) {
    throw new Error('All fast APIs failed');
  }
}

// -----------------------------------------------------------------
// 3. BULLETPROOF LOCAL FALLBACK ENGINES
// -----------------------------------------------------------------
async function downloadLocalAudio(url) {
  const timestamp = Date.now();
  let title = "YouTube Audio";
  try {
    const meta = await runCmd(`yt-dlp ${YT_FLAGS} --print "%(title)s" --no-playlist "${url}"`);
    if (meta) title = meta.split("\n")[0].trim();
  } catch (e) { title = `audio_${timestamp}`; }

  const outTemplate = path.join("/tmp", `yt_raw_${timestamp}.%(ext)s`);
  const m4aPath = path.join("/tmp", `yt_final_${timestamp}.m4a`);

  await runCmd(`yt-dlp ${YT_FLAGS} -f "ba/b" --no-playlist -o "${outTemplate}" "${url}" --force-overwrites`);
  const files = fs.readdirSync("/tmp").filter((f) => f.startsWith(`yt_raw_${timestamp}`));
  if (files.length === 0) throw new Error("Fallback failed");

  const rawPath = path.join("/tmp", files[0]);
  await runCmd(`ffmpeg -i "${rawPath}" -vn -c:a aac -b:a 192k "${m4aPath}" -y`);
  try { fs.unlinkSync(rawPath); } catch (e) {}

  return { path: m4aPath, title };
}

async function downloadLocalVideo(url) {
  const timestamp = Date.now();
  let title = "YouTube Video";
  try {
    const t = await runCmd(`yt-dlp ${YT_FLAGS} --print "%(title)s" --no-playlist "${url}"`);
    if (t) title = t.split("\n")[0].trim();
  } catch (e) { title = `video_${timestamp}`; }

  const outTemplate = path.join("/tmp", `yt_vid_${timestamp}.%(ext)s`);
  const formatSelector = `b[height<=720][ext=mp4]/bv*[height<=720][ext=mp4]+ba*[ext=m4a]/b[height<=720]/bv*+ba/b`;
  
  await runCmd(`yt-dlp ${YT_FLAGS} -f "${formatSelector}" --merge-output-format mp4 --no-playlist -o "${outTemplate}" "${url}" --force-overwrites`);
  const files = fs.readdirSync("/tmp").filter((f) => f.startsWith(`yt_vid_${timestamp}`));
  if (files.length === 0) throw new Error("Fallback failed");

  return { path: path.join("/tmp", files[0]), title };
}

function getSmartHelperCard(youtubeUrl) {
  return (
    `╭━━━〔 ⚡ *OGGY-MD SMART HELPER* 〕━━━╮\n` +
    `┃\n` +
    `┃ 💡 *I detected a YouTube Link!*\n` +
    `┃ To download media from this link, please\n` +
    `┃ reply to it using one of these commands:\n` +
    `┃\n` +
    `┃ 🎵 *To download Audio/MP3:*\n` +
    `┃ 👉 Reply to the link with: \`song\`\n` +
    `┃\n` +
    `┃ 🎬 *To download Video/MP4:*\n` +
    `┃ 👉 Reply to the link with: \`video\`\n` +
    `┃\n` +
    `┃ 📌 *Pro Tip:*\n` +
    `┃ Just swipe the link and type \`song\` or \`video\`!\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
  );
}

// -----------------------------------------------------------------
// 4. MAIN PROCESSOR FUNCTIONS
// -----------------------------------------------------------------
async function processAudioRequest(message, targetUrl, waitMsg) {
  const cleanUrl = cleanYtUrl(targetUrl);
  let localPath = null;
  let mediaTitle = "song";
  let onlineUrl = null;

  try {
    const apiData = await fetchFastAudio(cleanUrl);
    onlineUrl = apiData.audioUrl;
    mediaTitle = apiData.title;
  } catch (apiErr) {
    try {
      if (waitMsg && waitMsg.key) await message.edit('⚡ *Using backup engine, downloading...*', message.jid, waitMsg.key);
      const localData = await downloadLocalAudio(cleanUrl);
      localPath = localData.path;
      mediaTitle = localData.title;
    } catch (localErr) {
      throw new Error("Both API and Local Fallback failed.");
    }
  }

  const cleanName = (mediaTitle || 'song').replace(/[\\/:*?"<>|]/g, "").substring(0, 50).trim();
  
  if (localPath) {
    await message.client.sendMessage(message.jid, { audio: fs.readFileSync(localPath), mimetype: 'audio/mp4', fileName: `${cleanName}.m4a` }, { quoted: message.data });
    try { fs.unlinkSync(localPath); } catch (e) {}
  } else {
    await message.client.sendMessage(message.jid, { audio: { url: onlineUrl }, mimetype: 'audio/mp4', fileName: `${cleanName}.m4a` }, { quoted: message.data });
  }
}

async function processVideoRequest(message, targetUrl, waitMsg) {
  const cleanUrl = cleanYtUrl(targetUrl);
  let localPath = null;
  let mediaTitle = "video";
  let onlineUrl = null;

  try {
    const apiData = await fetchFastVideo(cleanUrl);
    onlineUrl = apiData.videoUrl;
    mediaTitle = apiData.title;
  } catch (apiErr) {
    try {
      if (waitMsg && waitMsg.key) await message.edit('⚡ *Using backup engine, downloading...*', message.jid, waitMsg.key);
      const localData = await downloadLocalVideo(cleanUrl);
      localPath = localData.path;
      mediaTitle = localData.title;
    } catch (localErr) {
      throw new Error("Both API and Local Fallback failed.");
    }
  }

  if (localPath) {
    await message.client.sendMessage(message.jid, { video: fs.readFileSync(localPath), caption: `🎬 *${mediaTitle}*\n\n⚡ *Downloaded by OGGY-MD*` }, { quoted: message.data });
    try { fs.unlinkSync(localPath); } catch (e) {}
  } else {
    await message.client.sendMessage(message.jid, { video: { url: onlineUrl }, caption: `🎬 *${mediaTitle}*\n\n⚡ *Downloaded by OGGY-MD*` }, { quoted: message.data });
  }
}

// ==========================================
// 5. UNIFIED COMMANDS (Zero Double Triggers)
// ==========================================
Module(
  {
    pattern: "^[.]?(song|play|yta)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download high quality audio from YouTube",
    usage: "song <query or link>",
    use: "download",
  },
  async (message, match) => {
    let query = match[2] ? match[2].trim() : '';

    // If they just replied to a link, grab it directly!
    if (!query && message.reply_message?.text) {
      const matchUrl = message.reply_message.text.match(YT_REGEX);
      if (matchUrl) query = matchUrl[0];
    }

    // IF STILL NO QUERY: Show the "Missing Input" guide ONLY here
    if (!query) {
      return await message.sendReply(
        `⚡ *OGGY-MD* • ᴍᴜꜱɪᴄ ᴇɴɢɪɴᴇ\n\n✦ *Status:* Missing Input\n✦ *Usage:* \`song <name or link>\`\n\n💡 _You can also simply reply 'song' to any YouTube link!_`
      );
    }

    // Is it a direct link?
    const isDirectLink = query.match(YT_REGEX);
    if (isDirectLink) {
      const waitMsg = await message.sendReply('⚡ *Fetching high-quality audio... Please wait...*');
      try {
        await processAudioRequest(message, isDirectLink[0], waitMsg);
        if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      } catch (err) {
        await message.sendReply('❌ *Download failed!* Please check if the link is valid and public.');
        if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
      return;
    }

    // Else it's a Search Query
    const searchWait = await message.sendReply(`🔎 *Searching for "${query}"... Please wait...*`);
    try {
      const sRes = await axios.get(`https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(query)}`, { timeout: 8000 });
      const items = sRes.data?.data || [];
      if (!items || items.length === 0) return await message.sendReply(`❌ Could not find any results for *"${query}"*.`);
      
      const topItems = items.slice(0, 10);
      ytSearchSessions[message.jid] = { results: topItems, timestamp: Date.now() };

      let listText = `⚡ *OGGY-MD • YOUTUBE SEARCH*\n◆ *Query:* _${query}_\n\n`;
      topItems.forEach((item, index) => {
        listText += `*${index + 1}. ${item.title}*\n   ⏱️ ${item.timestamp || 'N/A'} • 👁️ ${formatViews(item.views)} • 👤 _${item.author?.name || 'Artist'}_\n\n`;
      });
      listText += `💡 *Reply to this message with a number (1-10) to download the audio.*`;

      if (searchWait && searchWait.key) await message.client.sendMessage(message.jid, { delete: searchWait.key });
      await message.sendReply(listText);
    } catch (searchErr) {
      await message.sendReply('❌ Search failed. Please try again later.');
    }
  }
);

Module(
  {
    pattern: "^[.]?(video|ytv|mp4)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download YouTube video in MP4",
    usage: "video <link or reply to link>",
    use: "download",
  },
  async (message, match) => {
    let query = match[2] ? match[2].trim() : '';

    if (!query && message.reply_message?.text) {
      const matchUrl = message.reply_message.text.match(YT_REGEX);
      if (matchUrl) query = matchUrl[0];
    }

    if (!query) {
      return await message.sendReply(`╭━━━〔 🎬 *VIDEO DOWNLOADER* 〕━━━╮\n┃ ⚠️ Please provide a YouTube link or\n┃ reply to a link with \`video\`!\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`);
    }
    
    const isDirectLink = query.match(YT_REGEX);
    if(!isDirectLink) return await message.sendReply(`❌ Please provide a valid YouTube link for video download.`);

    const waitMsg = await message.sendReply('⚡ *Downloading video... Please wait...*');
    try {
      await processVideoRequest(message, isDirectLink[0], waitMsg);
      if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
    } catch (e) {
      await message.sendReply('❌ *Video download failed!* Please check the link.');
      if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
    }
  }
);

// -------------------------------------------------------------
// 6. SMART LISTENER (Handles ONLY Search Numbers & Helpers)
// -------------------------------------------------------------
Module(
  {
    on: 'text'
  },
  async (message) => {
    if (!message.jid) return;
    const rawText = (message.text || message.message || '').trim();
    const cleanLower = rawText.toLowerCase();

    // A. NUMBER CHOICE FOR YOUTUBE SEARCH LIST
    const isReplyToList = message.reply_message && (message.reply_message.text?.includes('OGGY-MD • YOUTUBE SEARCH') || message.reply_message.text?.includes('Reply to this message with a number'));
    const pickedNumber = parseInt(rawText, 10);

    if (isReplyToList && !isNaN(pickedNumber) && pickedNumber >= 1 && pickedNumber <= 10) {
      const session = ytSearchSessions[message.jid];
      if (!session || !session.results) return await message.sendReply('⚠️ *Session Expired:* Please search again.');
      const selectedTrack = session.results[pickedNumber - 1];
      if (!selectedTrack) return await message.sendReply('⚠️ *Invalid Choice:* Please select a valid number.');

      const waitMsg = await message.sendReply(`⚡ *Downloading [${pickedNumber}] "${selectedTrack.title}"...*`);
      try {
        await processAudioRequest(message, selectedTrack.url, waitMsg);
        if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      } catch (err) {
        await message.sendReply(`❌ *Download failed:* The track might be unavailable.`);
        if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
      return;
    }

    // B. SMART HELPER (Shows guide if someone types "help", "download", etc. to a link)
    if (message.reply_message && message.reply_message.text) {
      const replyUrlMatch = message.reply_message.text.match(YT_REGEX);
      if (replyUrlMatch) {
        if (['download', 'down', 'dl', 'link', 'help', 'what', 'how'].some(k => cleanLower === k)) {
          return await message.sendReply(getSmartHelperCard(replyUrlMatch[0]));
        }
      }
    }
  }
);

function formatViews(views) {
  if (!views) return 'N/A';
  if (views >= 1000000) return (views / 1000000).toFixed(1) + "M";
  if (views >= 1000) return (views / 1000).toFixed(1) + "K";
  return views.toString();
}
