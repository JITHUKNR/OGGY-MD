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

// Clean ?si= and shorts from url
function cleanYtUrl(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  return match && match[1] ? `https://www.youtube.com/watch?v=${match[1]}` : url;
}

// -----------------------------------------------------------------
// 1. FAST API ENGINES (Tries first for 5-sec speed)
// -----------------------------------------------------------------
async function fetchFastAudio(youtubeUrl) {
  try {
    const res1 = await axios.get(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(youtubeUrl)}`, { timeout: 8000 });
    if (res1.data?.data?.dl && res1.data.data.dl.startsWith('http')) return { audioUrl: res1.data.data.dl, title: res1.data.data.title || 'YouTube Audio' };
  } catch (e) {}

  try {
    const res2 = await axios.post('https://cobalt-api.kwiatekm.me/', { url: youtubeUrl, downloadMode: 'audio', audioFormat: 'mp3' }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 8000 });
    if (res2.data?.url) return { audioUrl: res2.data.url, title: 'YouTube Audio' };
  } catch (e) {}
  
  throw new Error('APIs failed');
}

async function fetchFastVideo(youtubeUrl) {
  try {
    const res1 = await axios.post('https://cobalt-api.kwiatekm.me/', { url: youtubeUrl, videoQuality: '720', downloadMode: 'auto' }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 9000 });
    if (res1.data?.url) return { videoUrl: res1.data.url, title: 'YouTube Video' };
  } catch (e) {}

  try {
    const res2 = await axios.get(`https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(youtubeUrl)}`, { timeout: 9000 });
    if (res2.data?.data?.dl) return { videoUrl: res2.data.data.dl, title: res2.data.data.title || 'YouTube Video' };
  } catch (e) {}

  throw new Error('APIs failed');
}

// -----------------------------------------------------------------
// 2. BULLETPROOF LOCAL FALLBACK ENGINES (Runs if APIs fail)
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

// -----------------------------------------------------------------
// 3. SMART HELPER CARD
// -----------------------------------------------------------------
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

// ==========================================
// 4. MAIN PROCESSOR FUNCTIONS
// ==========================================
async function processAudioRequest(message, targetUrl, waitMsg) {
  const cleanUrl = cleanYtUrl(targetUrl);
  let localPath = null;
  let mediaTitle = "song";
  let onlineUrl = null;

  try {
    // 1. Try Fast APIs First
    const apiData = await fetchFastAudio(cleanUrl);
    onlineUrl = apiData.audioUrl;
    mediaTitle = apiData.title;
  } catch (apiErr) {
    // 2. Fallback to robust yt-dlp if API fails
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
// 5. COMMANDS
// ==========================================
Module(
  {
    pattern: "^[.]?(song|play|yta)\\s*(.*)$",
    fromMe: isFromMe,
    desc: "Download high quality audio from YouTube",
    usage: "song <query or link>",
    use: "download",
  },
  async (message, match) => {
    let query = match[2] ? match[2].trim() : '';

    if (!query && message.reply_message?.text) {
      const matchUrl = message.reply_message.text.match(YT_REGEX);
      if (matchUrl) query = matchUrl[0];
    }

    if (!query) {
      return await message.sendReply(
        `⚡ *OGGY-MD* • ᴍᴜꜱɪᴄ ᴇɴɢɪɴᴇ\n\n✦ *Status:* Missing Input\n✦ *Usage:* \`song <name or link>\`\n\n💡 _You can also simply reply 'song' to any YouTube link!_`
      );
    }

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

    // SEARCH
    const searchWait = await message.sendReply(`🔎 *Searching for "${query}"... Please wait...*`);
    try {
      const sRes = await axios.get(`https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(query)}`, { timeout: 8000 });
      const items = sRes.data?.data || [];
      if (!items || items.length === 0) return await message.sendReply(`❌ Could not find any results for *"${query}"*.`);
      
      const topItems = items.slice(0, 10);
      ytSearchSessions[message.jid] = { results: topItems, timestamp: Date.now() };

      let listText = `⚡ *OGGY-MD • YOUTUBE SEARCH*\n◆ *Query:* _${query}_\n\n`;
      topItems.forEach((item, index) => {
        listText += `*${index + 1}. ${item.title}*\n   ⏱️ ${item.timestamp || 'N/A'} • 👁️ ${item.views || 'N/A'} • 👤 _${item.author?.name || 'Artist'}_\n\n`;
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
    pattern: "^[.]?(video|ytv|mp4)\\s*(.*)$",
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

// ============================================================
// 6. INTERACTIVE SMART LISTENER
// ============================================================
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

    // B. SMART HELPER AND REPLY HANDLER
    if (message.reply_message && message.reply_message.text) {
      const replyUrlMatch = message.reply_message.text.match(YT_REGEX);
      if (replyUrlMatch) {
        const targetUrl = replyUrlMatch[0];

        // 1. Reply with 'song'
        if (['song', 'audio', 'mp3', 'yta', '.song', '.audio', '.mp3'].includes(cleanLower)) {
          const waitMsg = await message.sendReply('⚡ *Downloading audio from link...*');
          try {
            await processAudioRequest(message, targetUrl, waitMsg);
            if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
          } catch (e) {
            await message.sendReply('❌ *Failed to download audio!*');
            if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
          }
          return;
        }

        // 2. Reply with 'video'
        if (['video', 'mp4', 'ytv', '.video', '.mp4'].includes(cleanLower)) {
          const waitMsg = await message.sendReply('⚡ *Downloading video from link...*');
          try {
            await processVideoRequest(message, targetUrl, waitMsg);
            if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
          } catch (e) {
            await message.sendReply('❌ *Failed to download video!*');
            if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
          }
          return;
        }

        // 3. User types something confusing
        if (['download', 'down', 'dl', 'link', 'help', 'what', 'how'].some(k => cleanLower === k)) {
          return await message.sendReply(getSmartHelperCard(targetUrl));
        }
      }
    }
  }
);
