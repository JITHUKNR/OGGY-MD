const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");
const fs = require("fs");

const isFromMe = botConfig.MODE === "public" ? false : true;

// Temporary session storage for list choices
const ytSearchSessions = {};

// Regex to detect YouTube links
const YT_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

// -----------------------------------------------------------------
// 1. ULTRA-FAST MULTI-ENGINE AUDIO DOWNLOADER (< 10 SECONDS)
// -----------------------------------------------------------------
async function fetchFastAudio(youtubeUrl) {
  // Engine 1: Siputzx Fast YTMP3 CDN
  try {
    const res1 = await axios.get(
      `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(youtubeUrl)}`,
      { timeout: 9000 }
    );
    const dl = res1.data?.data?.dl;
    const title = res1.data?.data?.title || 'Audio Track';
    if (dl && dl.startsWith('http')) {
      return { audioUrl: dl, title };
    }
  } catch (e) {}

  // Engine 2: Cobalt Ultra-Fast Direct Stream API
  try {
    const res2 = await axios.post(
      'https://cobalt-api.kwiatekm.me/',
      {
        url: youtubeUrl,
        downloadMode: 'audio',
        audioFormat: 'mp3'
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 9000
      }
    );
    if (res2.data?.url) {
      return { audioUrl: res2.data.url, title: 'YouTube Audio' };
    }
  } catch (e) {}

  // Engine 3: Ryzendesu High-Speed API
  try {
    const res3 = await axios.get(
      `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`,
      { timeout: 9000 }
    );
    const dl3 = res3.data?.url || res3.data?.link;
    if (dl3) {
      return { audioUrl: dl3, title: res3.data?.title || 'YouTube Audio' };
    }
  } catch (e) {}

  throw new Error('All high-speed download engines failed');
}

// -----------------------------------------------------------------
// 2. ULTRA-FAST MULTI-ENGINE VIDEO DOWNLOADER (MP4)
// -----------------------------------------------------------------
async function fetchFastVideo(youtubeUrl, quality = '720') {
  // Engine 1: Cobalt Direct MP4
  try {
    const res1 = await axios.post(
      'https://cobalt-api.kwiatekm.me/',
      {
        url: youtubeUrl,
        videoQuality: quality,
        downloadMode: 'auto'
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    if (res1.data?.url) {
      return { videoUrl: res1.data.url, title: 'YouTube Video' };
    }
  } catch (e) {}

  // Engine 2: Siputzx Fast YTMP4
  try {
    const res2 = await axios.get(
      `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(youtubeUrl)}`,
      { timeout: 10000 }
    );
    const dl = res2.data?.data?.dl;
    if (dl && dl.startsWith('http')) {
      return { videoUrl: dl, title: res2.data?.data?.title || 'YouTube Video' };
    }
  } catch (e) {}

  throw new Error('All video engines failed');
}

// -----------------------------------------------------------------
// 3. SMART HELPER CARD FOR UNKNOWN COMMANDS
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
    `┃    *(Or type: \`song ${youtubeUrl}\`)*\n` +
    `┃\n` +
    `┃ 🎬 *To download Video/MP4:*\n` +
    `┃ 👉 Reply to the link with: \`video\`\n` +
    `┃    *(Or type: \`video ${youtubeUrl}\`)*\n` +
    `┃\n` +
    `┃ 📌 *Pro Tip:*\n` +
    `┃ Just swipe the link and type \`song\` or \`video\`!\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
  );
}

// ==========================================
// 4. SONG COMMAND (HANDLES YOUTUBE SEARCH & LINKS)
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

    // If no query, check if they replied to a link
    if (!query && message.reply_message?.text) {
      const matchUrl = message.reply_message.text.match(YT_REGEX);
      if (matchUrl) query = matchUrl[0];
    }

    // Still no input? Show the guide
    if (!query) {
      return await message.sendReply(
        `⚡ *OGGY-MD* • ᴍᴜꜱɪᴄ ᴇɴɢɪɴᴇ\n\n` +
        `✦ *Status:* Missing Input\n` +
        `✦ *Usage:* \`song <name or link>\`\n\n` +
        `◈ *Examples:*\n` +
        `• \`song Faded Alan Walker\`\n` +
        `• \`song https://youtu.be/... \`\n\n`+
        `💡 _You can also simply reply 'song' to any YouTube link!_`
      );
    }

    // Direct YouTube Link Detection
    const isDirectLink = query.match(YT_REGEX);

    // CASE A: IT IS A DIRECT LINK
    if (isDirectLink) {
      const waitMsg = await message.sendReply('⚡ *Fetching high-quality audio... Please wait...*');
      try {
        const audio = await fetchFastAudio(isDirectLink[0]);
        await message.client.sendMessage(
          message.jid,
          {
            audio: { url: audio.audioUrl },
            mimetype: 'audio/mp4',
            fileName: `${(audio.title || 'song').replace(/[\\/:*?"<>|]/g, "").substring(0, 50).trim()}.m4a`
          },
          { quoted: message.data }
        );
        if (waitMsg && waitMsg.key) {
          await message.client.sendMessage(message.jid, { delete: waitMsg.key });
        }
      } catch (err) {
        await message.sendReply('❌ *Download failed!* Please check if the link is valid and public.');
        if (waitMsg && waitMsg.key) {
          await message.client.sendMessage(message.jid, { delete: waitMsg.key });
        }
      }
      return;
    }

    // CASE B: IT IS A TEXT SEARCH
    const searchWait = await message.sendReply(`🔎 *Searching for "${query}"... Please wait...*`);

    try {
      const sRes = await axios.get(
        `https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(query)}`,
        { timeout: 8000 }
      );
      const items = sRes.data?.data || [];

      if (!items || items.length === 0) {
        return await message.sendReply(`❌ Could not find any results for *"${query}"*.`);
      }

      const topItems = items.slice(0, 10);
      ytSearchSessions[message.jid] = {
        results: topItems,
        timestamp: Date.now()
      };

      let listText =
        `⚡ *OGGY-MD • YOUTUBE SEARCH*\n` +
        `◆ *Query:* _${query}_\n\n`;

      topItems.forEach((item, index) => {
        listText +=
          `*${index + 1}. ${item.title}*\n` +
          `   ⏱️ ${item.timestamp || 'N/A'} • 👁️ ${item.views || 'N/A'} • 👤 _${item.author?.name || 'Artist'}_\n\n`;
      });

      listText += `💡 *Reply to this message with a number (1-10) to download the audio.*`;

      if (searchWait && searchWait.key) {
        await message.client.sendMessage(message.jid, { delete: searchWait.key });
      }

      await message.sendReply(listText);

    } catch (searchErr) {
      await message.sendReply('❌ Search failed. Please try again later.');
    }
  }
);

// ==========================================
// 5. VIDEO COMMAND
// ==========================================
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
      return await message.sendReply(
        `╭━━━〔 🎬 *VIDEO DOWNLOADER* 〕━━━╮\n` +
        `┃ ⚠️ Please provide a YouTube link or\n` +
        `┃ reply to a link with \`video\`!\n` +
        `┃\n` +
        `┃ 💡 *Example:*\n` +
        `┃ \`video https://youtu.be/... \`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }
    
    const isDirectLink = query.match(YT_REGEX);
    if(!isDirectLink) {
        return await message.sendReply(`❌ Please provide a valid YouTube link for video download.`);
    }

    const waitMsg = await message.sendReply('⚡ *Downloading video... Please wait...*');

    try {
      const vid = await fetchFastVideo(isDirectLink[0], '720'); 
      await message.client.sendMessage(
        message.jid,
        {
          video: { url: vid.videoUrl },
          caption: `🎬 *${vid.title}*\n\n⚡ *Downloaded by OGGY-MD*`
        },
        { quoted: message.data }
      );
      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
    } catch (e) {
      await message.sendReply('❌ *Video download failed!* Please check the link.');
      if (waitMsg && waitMsg.key) {
          await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
    }
  }
);

// ============================================================
// 6. INTERACTIVE SMART LISTENER (NUMBER CHOICES & CONTEXT REPLIES)
// ============================================================
Module(
  {
    on: 'text'
  },
  async (message) => {
    if (!message.jid) return;

    const rawText = (message.text || message.message || '').trim();
    const cleanLower = rawText.toLowerCase();

    // ---------------------------------------------------------
    // A. NUMBER CHOICE FOR YOUTUBE SEARCH LIST
    // ---------------------------------------------------------
    const isReplyToList = message.reply_message && (
      message.reply_message.text?.includes('OGGY-MD • YOUTUBE SEARCH') ||
      message.reply_message.text?.includes('Reply to this message with a number')
    );

    const pickedNumber = parseInt(rawText, 10);

    if (isReplyToList && !isNaN(pickedNumber) && pickedNumber >= 1 && pickedNumber <= 10) {
      const session = ytSearchSessions[message.jid];
      if (!session || !session.results) {
        return await message.sendReply('⚠️ *Session Expired:* Please search again using `song <query>`.');
      }

      const selectedTrack = session.results[pickedNumber - 1];
      if (!selectedTrack) {
        return await message.sendReply('⚠️ *Invalid Choice:* Please select a valid number from the list.');
      }

      const waitMsg = await message.sendReply(
        `⚡ *Downloading [${pickedNumber}] "${selectedTrack.title}"...*\n_Please wait a moment..._`
      );

      try {
        const audio = await fetchFastAudio(selectedTrack.url);

        await message.client.sendMessage(
          message.jid,
          {
            audio: { url: audio.audioUrl },
            mimetype: 'audio/mp4',
            fileName: `${(selectedTrack.title || 'song').replace(/[\\/:*?"<>|]/g, "").substring(0, 50).trim()}.m4a`,
            contextInfo: {
              externalAdReply: {
                title: selectedTrack.title,
                body: `⏱️ ${selectedTrack.timestamp || ''} • 👤 ${selectedTrack.author?.name || 'YouTube'}`,
                mediaType: 2,
                thumbnailUrl: selectedTrack.thumbnail,
                sourceUrl: selectedTrack.url
              }
            }
          },
          { quoted: message.data }
        );

        if (waitMsg && waitMsg.key) {
          await message.client.sendMessage(message.jid, { delete: waitMsg.key });
        }
      } catch (err) {
        await message.sendReply(`❌ *Download failed:* The track might be unavailable. Try another number from the list.`);
         if (waitMsg && waitMsg.key) {
          await message.client.sendMessage(message.jid, { delete: waitMsg.key });
        }
      }
      return;
    }

    // ---------------------------------------------------------
    // B. SMART HELPER FOR CONFUSING WORDS
    // ---------------------------------------------------------
    if (message.reply_message && message.reply_message.text) {
      const replyUrlMatch = message.reply_message.text.match(YT_REGEX);

      if (replyUrlMatch) {
        const targetUrl = replyUrlMatch[0];

        // User types something confusing -> Show Smart Guide (Double trigger fixed: 'song' & 'video' are handled by main modules)
        if (['download', 'down', 'dl', 'link', 'help', 'what', 'how'].some(k => cleanLower === k)) {
          return await message.sendReply(getSmartHelperCard(targetUrl));
        }
      }
    }
  }
);
