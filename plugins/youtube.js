const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const isFromMe = botConfig.MODE === "public" ? false : true;

// Temporary session storage for list choices
const ytSearchSessions = {};

// Regex to detect YouTube links
const YT_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

// Regex to detect Instagram links
const INSTA_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com\/(?:p|reel|tv)\/)/i;


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
async function fetchFastVideo(youtubeUrl, quality = '480') {
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
// 3. FAST INSTAGRAM DOWNLOADER (POSTS/REELS/TV)
// -----------------------------------------------------------------
async function fetchInstaMedia(instaUrl) {
    try {
        const res = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(instaUrl)}`, { timeout: 10000 });
        const data = res.data?.data;
        if (data && Array.isArray(data) && data.length > 0) {
            return {
                mediaUrl: data[0].url,
                thumbnail: data[0].thumbnail,
            };
        }
    } catch(e) {}
    
    throw new Error("Instagram download failed.");
}


// -----------------------------------------------------------------
// 4. SMART HELPER CARD FOR UNKNOWN COMMANDS OR MERE LINKS
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
    `┃ 👉 Reply to the link with: \`song\` or \`.song\`\n` +
    `┃    *(Or type: \`.song ${youtubeUrl}\`)*\n` +
    `┃\n` +
    `┃ 🎬 *To download Video/MP4:*\n` +
    `┃ 👉 Reply to the link with: \`video\` or \`.video\`\n` +
    `┃    *(Or type: \`.video ${youtubeUrl}\`)*\n` +
    `┃\n` +
    `┃ 📌 *Pro Tip:*\n` +
    `┃ You don't need the '.' prefix when replying.\n` +
    `┃ Just swipe the link and type \`song\`!\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
  );
}

// ==========================================
// 5. SONG COMMAND (HANDLES YOUTUBE SEARCH & LINKS)
// ==========================================
Module(
  {
    pattern: "^[.]?(song|play|yta)\\s*(.*)$",
    fromMe: isFromMe,
    desc: "Download high quality audio from YouTube",
    usage: ".song <query or link>",
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
        `✦ *Usage:* \`.song <name or link>\`\n\n` +
        `◈ *Examples:*\n` +
        `• \`.song Faded Alan Walker\`\n` +
        `• \`.song https://youtu.be/... \`\n\n`+
        `💡 _You can also simply reply 'song' to any YouTube link!_`
      );
    }

    // Direct YouTube Link Detection
    const isDirectLink = query.match(YT_REGEX);
    
    // Direct Instagram Link Detection (Just a heads up for users)
    const isInstaLink = query.match(INSTA_REGEX);
    if(isInstaLink) {
         return await message.sendReply(`⚡ *OGGY-MD Alert:* To download Instagram media, please use the \`.ig\` or \`.insta\` command!`);
    }

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
// 6. VIDEO COMMAND
// ==========================================
Module(
  {
    pattern: "^[.]?(video|ytv|mp4)\\s*(.*)$",
    fromMe: isFromMe,
    desc: "Download YouTube video in MP4",
    usage: ".video <link or reply to link>",
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
        `┃ reply to a link with \`.video\`!\n` +
        `┃\n` +
        `┃ 💡 *Example:*\n` +
        `┃ \`.video https://youtu.be/... \`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }
    
    const isDirectLink = query.match(YT_REGEX);
    if(!isDirectLink) {
        return await message.sendReply(`❌ Please provide a valid YouTube link for video download.`);
    }

    const waitMsg = await message.sendReply('⚡ *Downloading video... Please wait...*');

    try {
      const vid = await fetchFastVideo(isDirectLink[0], '720'); // Tries 720p first, falls back in API
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

// ==========================================
// 7. INSTAGRAM DOWNLOADER
// ==========================================
Module(
  {
    pattern: "^[.]?(ig|insta|instagram)\\s*(.*)$",
    fromMe: isFromMe,
    desc: "Download Instagram Reels and Posts",
    usage: ".ig <link>",
    use: "download",
  },
  async (message, match) => {
    let query = match[2] ? match[2].trim() : '';

    if (!query && message.reply_message?.text) {
      const matchUrl = message.reply_message.text.match(INSTA_REGEX);
      if (matchUrl) query = matchUrl[0];
    }

    if (!query) {
       return await message.sendReply(`⚡ *OGGY-MD Alert:* Please provide a valid Instagram link. Example: \`.ig https://instagram.com/reel/...\``);
    }
    
    const isDirectLink = query.match(INSTA_REGEX);
    if(!isDirectLink) {
        return await message.sendReply(`❌ Please provide a valid Instagram link.`);
    }

    const waitMsg = await message.sendReply('⚡ *Fetching Instagram media...*');

    try {
      const media = await fetchInstaMedia(isDirectLink[0]);
      
      // Determine if it's video or image based on URL extension (very basic check, siputzx usually returns video)
      if (media.mediaUrl.includes('.mp4')) {
           await message.client.sendMessage(message.jid, { video: { url: media.mediaUrl }, caption: `⚡ *Downloaded by OGGY-MD*` }, { quoted: message.data });
      } else {
           await message.client.sendMessage(message.jid, { image: { url: media.mediaUrl }, caption: `⚡ *Downloaded by OGGY-MD*` }, { quoted: message.data });
      }
      
      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
    } catch (e) {
      await message.sendReply('❌ *Download failed!* Ensure the account is public.');
      if (waitMsg && waitMsg.key) {
          await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
    }
  }
);

// ============================================================
// 8. INTERACTIVE SMART LISTENER (NUMBER CHOICES & CONTEXT REPLIES)
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
        return await message.sendReply('⚠️ *Session Expired:* Please search again using `.song <query>`.');
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
    // B. SMART LINK REPLIES & HELPER
    // ---------------------------------------------------------
    if (message.reply_message && message.reply_message.text) {
      const replyUrlMatch = message.reply_message.text.match(YT_REGEX);

      if (replyUrlMatch) {
        const targetUrl = replyUrlMatch[0];

        // 1. Reply with 'song', 'audio', 'mp3' -> Downloads Audio
        if (['song', 'audio', 'mp3', 'yta', '.song', '.audio', '.mp3'].includes(cleanLower)) {
          const waitMsg = await message.sendReply('⚡ *Downloading audio from link...*');
          try {
            const audio = await fetchFastAudio(targetUrl);
            await message.client.sendMessage(
              message.jid,
              {
                audio: { url: audio.audioUrl },
                mimetype: 'audio/mp4',
                fileName: `${(audio.title || 'song').replace(/[\\/:*?"<>|]/g, "").substring(0, 50).trim()}.m4a`
              },
              { quoted: message.data }
            );
            if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
          } catch (e) {
            await message.sendReply('❌ *Failed to download audio!*');
            if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
          }
          return;
        }

        // 2. Reply with 'video', 'mp4', 'ytv' -> Downloads Video
        if (['video', 'mp4', 'ytv', '.video', '.mp4'].includes(cleanLower)) {
          const waitMsg = await message.sendReply('⚡ *Downloading video from link...*');
          try {
            const vid = await fetchFastVideo(targetUrl, '720');
            await message.client.sendMessage(
              message.jid,
              {
                video: { url: vid.videoUrl },
                caption: `🎬 *${vid.title}*`
              },
              { quoted: message.data }
            );
            if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
          } catch (e) {
            await message.sendReply('❌ *Failed to download video!*');
            if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
          }
          return;
        }

        // 3. User types something confusing -> Show Smart Guide
        if (['download', 'down', 'dl', 'link', 'help', 'what', 'how'].some(k => cleanLower.includes(k))) {
          return await message.sendReply(getSmartHelperCard(targetUrl));
        }
      }
    }

    // ---------------------------------------------------------
    // C. MERE LINK DETECTION (NO COMMAND)
    // ---------------------------------------------------------
    if (!rawText.startsWith('.') && !rawText.startsWith('!')) {
      const soloUrlMatch = rawText.match(YT_REGEX);
      // Only show helper if it's just a link (short message)
      if (soloUrlMatch && rawText.length < 150) {
        // Option to silent it later if it gets annoying, but useful for now
        // return await message.sendReply(getSmartHelperCard(soloUrlMatch[0]));
      }
    }
  }
);
