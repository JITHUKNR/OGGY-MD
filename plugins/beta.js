'use strict';

const { Module } = require('../main');
const botConfig = require('../config');
const axios = require('axios');

const isFromMe = botConfig.MODE === 'public' ? false : true;

// ലിസ്റ്റ് റിപ്ലൈ സെഷനുകൾ താൽക്കാലികമായി സൂക്ഷിക്കാൻ (1 മുതൽ 10 വരെയുള്ള ചോയ്‌സുകൾക്ക്)
const ytSearchSessions = {};

// യൂട്യൂബ് ലിങ്കുകൾ തിരിച്ചറിയാനുള്ള റെജക്സ്
const YT_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

// -----------------------------------------------------------------
// 1. അതിവേഗ മൾട്ടി-എഞ്ചിൻ ഓഡിയോ ഡൗൺലോഡർ (< 10 സെക്കൻഡ്)
// -----------------------------------------------------------------
async function fetchFastAudio(youtubeUrl) {
  // എഞ്ചിൻ 1: Siputzx Fast YTMP3 CDN
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

  // എഞ്ചിൻ 2: Cobalt Ultra-Fast Direct Stream API
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

  // എഞ്ചിൻ 3: Ryzendesu High-Speed API
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
// 2. അതിവേഗ വീഡിയോ ഡൗൺലോഡർ (MP4)
// -----------------------------------------------------------------
async function fetchFastVideo(youtubeUrl) {
  // എഞ്ചിൻ 1: Cobalt Direct MP4
  try {
    const res1 = await axios.post(
      'https://cobalt-api.kwiatekm.me/',
      {
        url: youtubeUrl,
        videoQuality: '480',
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

  // എഞ്ചിൻ 2: Siputzx Fast YTMP4
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
// 3. തെറ്റായ വാക്കോ ലിങ്കോ വരുമ്പോൾ കാണിക്കേണ്ട സ്മാർട്ട് ഗൈഡ് കാർഡ്
// -----------------------------------------------------------------
function getSmartHelperCard(youtubeUrl) {
  return (
    `╭━━━〔 ⚡ *OGGY-MD YOUTUBE HELPER* 〕━━━╮\n` +
    `┃\n` +
    `┃ 💡 *ഒരു YouTube ലിങ്ക് കണ്ടെത്തിയിട്ടുണ്ട്!*\n` +
    `┃ ഈ വീഡിയോയിൽ നിന്ന് പാട്ടോ വീഡിയോയോ എടുക്കാൻ\n` +
    `┃ താഴെ പറയുന്നതുപോലെ ചെയ്യുക:\n` +
    `┃\n` +
    `┃ 🎵 *പാട്ട് (Audio/MP3) ലഭിക്കാൻ:*\n` +
    `┃ 👉 ലിങ്കിന് റിപ്ലൈ ആയി \`.song\` അല്ലെങ്കിൽ വെറുതെ \`song\` അയക്കുക\n` +
    `┃    *(അല്ലെങ്കിൽ: \`.song ${youtubeUrl}\`)*\n` +
    `┃\n` +
    `┃ 🎬 *വീഡിയോ (Video/MP4) ലഭിക്കാൻ:*\n` +
    `┃ 👉 ലിങ്കിന് റിപ്ലൈ ആയി \`.video\` അല്ലെങ്കിൽ വെറുതെ \`video\` അയക്കുക\n` +
    `┃    *(അല്ലെങ്കിൽ: \`.video ${youtubeUrl}\`)*\n` +
    `┃\n` +
    `┃ 📌 *ഉദാഹരണം:*\n` +
    `┃ ആ മെസ്സേജ് സ്വൈപ്പ് ചെയ്ത് റിപ്ലൈ ആയി \`song\`\n` +
    `┃ എന്ന് മാത്രം ടൈപ്പ് ചെയ്താൽ മതിയാകും!\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
  );
}

// -----------------------------------------------------------------
// 4. പാട്ട് തിരയാനും ഡൗൺലോഡ് ചെയ്യാനുമുള്ള മെയിൻ കമാൻഡ് (.song)
// -----------------------------------------------------------------
Module(
  {
    pattern: '^[.]?(song|play|yta)\\s*(.*)$',
    fromMe: isFromMe,
    desc: 'Ultra fast song downloader and YouTube search',
    usage: 'song <song name or link>',
    use: 'download'
  },
  async (message, match) => {
    let query = match[2] ? match[2].trim() : '';

    // ആരെങ്കിലും ലിങ്കിന് റിപ്ലൈ ആയിട്ടാണ് .song അടിച്ചത് എങ്കിൽ ആ ലിങ്ക് എടുക്കുന്നു
    if (!query && message.reply_message?.text) {
      const matchUrl = message.reply_message.text.match(YT_REGEX);
      if (matchUrl) query = matchUrl[0];
    }

    // വെറുതെ 'song' എന്ന് മാത്രം അടിച്ചാൽ കൃത്യമായ എക്സാമ്പിൾ ഗൈഡ് കാണിക്കുന്നു
    if (!query) {
      const helpMsg =
        `╭━━━〔 🎵 *OGGY-MD SONG GUIDE* 〕━━━╮\n` +
        `┃\n` +
        `┃ ❓ *പാട്ടുകൾ എങ്ങനെ ഡൗൺലോഡ് ചെയ്യാം?*\n` +
        `┃\n` +
        `┃ 1️⃣ *പേര് നൽകി തിരയാൻ:*\n` +
        `┃    \`song safar\`\n` +
        `┃    \`song malare\`\n` +
        `┃\n` +
        `┃ 2️⃣ *ഡയറക്റ്റ് ലിങ്ക് വഴി:*\n` +
        `┃    \`song https://youtu.be/xxxxxx\`\n` +
        `┃\n` +
        `┃ 3️⃣ *റിപ്ലൈ വഴി ഡൗൺലോഡ് ചെയ്യാൻ:*\n` +
        `┃    ഗ്രൂപ്പിലുള്ള ഏതൊരു YouTube ലിങ്കിനും\n` +
        `┃    റിപ്ലൈ ആയി \`song\` എന്ന് മാത്രം അയക്കുക!\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
      return await message.sendReply(helpMsg);
    }

    // ഡയറക്റ്റ് YouTube ലിങ്ക് ആണെങ്കിൽ നേരിട്ട് അതിവേഗം ഡൗൺലോഡ് ചെയ്യുന്നു
    const isDirectLink = query.match(YT_REGEX);
    if (isDirectLink) {
      const waitMsg = await message.sendReply('⚡ *അതിവേഗത്തിൽ പാട്ട് ഡൗൺലോഡ് ചെയ്യുന്നു... അല്പം കാത്തിരിക്കൂ...*');
      try {
        const audio = await fetchFastAudio(isDirectLink[0]);
        await message.client.sendMessage(
          message.jid,
          {
            audio: { url: audio.audioUrl },
            mimetype: 'audio/mp4',
            fileName: `${audio.title || 'song'}.mp3`
          },
          { quoted: message.data }
        );
        if (waitMsg && waitMsg.key) {
          await message.client.sendMessage(message.jid, { delete: waitMsg.key });
        }
      } catch (err) {
        await message.sendReply('❌ പാട്ട് ഡൗൺലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല! ലിങ്ക് ശരിയാണോ എന്ന് പരിശോധിക്കുക.');
      }
      return;
    }

    // പേരാണ് നൽകിയതെങ്കിൽ YouTube-ൽ തിരഞ്ഞ് 1 മുതൽ 10 വരെയുള്ള ലിസ്റ്റ് നൽകുന്നു (നിങ്ങളുടെ ഇഷ്ടപ്പെട്ട സ്റ്റൈൽ)
    const searchWait = await message.sendReply(`🔎 *"${query}" തിരയുന്നു... അല്പം കാത്തിരിക്കൂ...*`);

    try {
      const sRes = await axios.get(
        `https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(query)}`,
        { timeout: 8000 }
      );
      const items = sRes.data?.data || [];

      if (!items || items.length === 0) {
        return await message.sendReply(`❌ *"${query}"* എന്ന പേരിൽ പാട്ടുകൾ കണ്ടെത്താനായില്ല!`);
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

      listText += `💡 *Reply with a number (1-10) to download audio.*\n_(പാട്ട് ഡൗൺലോഡ് ചെയ്യാൻ ഈ മെസ്സേജിന് റിപ്ലൈ ആയി 1 മുതൽ 10 വരെയുള്ള നമ്പർ അയക്കുക)_`;

      if (searchWait && searchWait.key) {
        await message.client.sendMessage(message.jid, { delete: searchWait.key });
      }

      await message.sendReply(listText);

    } catch (searchErr) {
      await message.sendReply('❌ തിരച്ചിൽ പരാജയപ്പെട്ടു. ദയവായി അല്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക.');
    }
  }
);

// -----------------------------------------------------------------
// 5. വീഡിയോ ഡൗൺലോഡർ കമാൻഡ് (.video)
// -----------------------------------------------------------------
Module(
  {
    pattern: '^[.]?(video|ytv|mp4)\\s*(.*)$',
    fromMe: isFromMe,
    desc: 'Download YouTube video in MP4',
    usage: 'video <link or reply to link>',
    use: 'download'
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
        `┃ ⚠️ ഒരു YouTube ലിങ്ക് നൽകുക അല്ലെങ്കിൽ\n` +
        `┃ ലിങ്കിന് റിപ്ലൈ ആയി \`.video\` അയക്കുക!\n` +
        `┃\n` +
        `┃ 💡 *ഉദാഹരണം:*\n` +
        `┃ \`.video https://youtu.be/xxxxxx\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply('⚡ *വീഡിയോ ഡൗൺലോഡ് ചെയ്യുന്നു... അല്പം കാത്തിരിക്കൂ...*');

    try {
      const vid = await fetchFastVideo(query);
      await message.client.sendMessage(
        message.jid,
        {
          video: { url: vid.videoUrl },
          caption: `🎬 *${vid.title}*`
        },
        { quoted: message.data }
      );
      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
    } catch (e) {
      await message.sendReply('❌ വീഡിയോ ഡൗൺലോഡ് ചെയ്യാൻ സാധിച്ചില്ല! ലിങ്ക് പരിശോധിക്കുക.');
    }
  }
);

// -----------------------------------------------------------------
// 6. സ്മാർട്ട് ലിസണർ (നമ്പർ ചോയ്‌സ് + റിപ്ലൈ ഓട്ടോ-ഡിറ്റക്ടർ)
// -----------------------------------------------------------------
Module(
  {
    on: 'text'
  },
  async (message) => {
    if (!message.jid) return;

    const rawText = (message.text || message.message || '').trim();
    const cleanLower = rawText.toLowerCase();

    // ---------------------------------------------------------
    // A. 1 മുതൽ 10 വരെയുള്ള നമ്പർ അയച്ച് പാട്ട് തിരഞ്ഞെടുക്കൽ
    // ---------------------------------------------------------
    const isReply = message.reply_message && (
      message.reply_message.text?.includes('OGGY-MD • YOUTUBE SEARCH') ||
      message.reply_message.text?.includes('Reply with a number')
    );

    const pickedNumber = parseInt(rawText, 10);

    if (isReply && !isNaN(pickedNumber) && pickedNumber >= 1 && pickedNumber <= 10) {
      const session = ytSearchSessions[message.jid];
      if (!session || !session.results) {
        return await message.sendReply('⚠️ ഈ ലിസ്റ്റിന്റെ സമയപരിധി കഴിഞ്ഞു. വീണ്ടും `.song <പേര്>` നൽകുക.');
      }

      const selectedTrack = session.results[pickedNumber - 1];
      if (!selectedTrack) {
        return await message.sendReply('⚠️ നൽകിയ നമ്പർ ലിസ്റ്റിൽ ലഭ്യമല്ല!');
      }

      const waitMsg = await message.sendReply(
        `⚡ *[${pickedNumber}] "${selectedTrack.title}" ഡൗൺലോഡ് ചെയ്യുന്നു...*\n_നിമിഷങ്ങൾക്കകം പാട്ട് ചാറ്റിൽ എത്തും..._`
      );

      try {
        // അതിവേഗ മൾട്ടി-എഞ്ചിൻ ഉപയോഗിക്കുന്നു (ഇനി ഒട്ടും ലാഗ് ഉണ്ടാവില്ല)
        const audio = await fetchFastAudio(selectedTrack.url);

        await message.client.sendMessage(
          message.jid,
          {
            audio: { url: audio.audioUrl },
            mimetype: 'audio/mp4',
            fileName: `${selectedTrack.title || 'song'}.mp3`,
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
        await message.sendReply(`❌ *ഡൗൺലോഡ് പരാജയപ്പെട്ടു:* ഈ ട്രാക്ക് ലഭ്യമല്ല. ലിസ്റ്റിലെ മറ്റൊരു നമ്പർ (2, 3...) പരീക്ഷിക്കുക.`);
      }
      return;
    }

    // ---------------------------------------------------------
    // B. ആരെങ്കിലും ഒരു YouTube ലിങ്കിന് റിപ്ലൈ അയക്കുമ്പോൾ
    // ---------------------------------------------------------
    if (message.reply_message && message.reply_message.text) {
      const replyUrlMatch = message.reply_message.text.match(YT_REGEX);

      if (replyUrlMatch) {
        const targetUrl = replyUrlMatch[0];

        // 1. റിപ്ലൈ ആയി 'song', 'audio', 'mp3', 'പാട്ട്' എന്ന് അടിച്ചാൽ തനിയെ ഡൗൺലോഡ് ചെയ്യുന്നു!
        if (['song', 'audio', 'mp3', 'പാട്ട്', 'yta'].includes(cleanLower)) {
          const waitMsg = await message.sendReply('⚡ *ലിങ്കിൽ നിന്നുള്ള പാട്ട് അതിവേഗം ഡൗൺലോഡ് ചെയ്യുന്നു...*');
          try {
            const audio = await fetchFastAudio(targetUrl);
            await message.client.sendMessage(
              message.jid,
              {
                audio: { url: audio.audioUrl },
                mimetype: 'audio/mp4',
                fileName: `${audio.title || 'song'}.mp3`
              },
              { quoted: message.data }
            );
            if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
          } catch (e) {
            await message.sendReply('❌ പാട്ട് ഡൗൺലോഡ് ചെയ്യാൻ സാധിച്ചില്ല!');
          }
          return;
        }

        // 2. റിപ്ലൈ ആയി 'video', 'mp4', 'വിഡിയോ' എന്ന് അടിച്ചാൽ തനിയെ വീഡിയോ ഡൗൺലോഡ് ചെയ്യുന്നു!
        if (['video', 'mp4', 'വിഡിയോ', 'ytv'].includes(cleanLower)) {
          const waitMsg = await message.sendReply('⚡ *ലിങ്കിൽ നിന്നുള്ള വീഡിയോ ഡൗൺലോഡ് ചെയ്യുന്നു...*');
          try {
            const vid = await fetchFastVideo(targetUrl);
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
            await message.sendReply('❌ വീഡിയോ ഡൗൺലോഡ് ചെയ്യാൻ സാധിച്ചില്ല!');
          }
          return;
        }

        // 3. ഇനി 'download', 'down', 'help' തുടങ്ങിയവയോ മറ്റ് അജ്ഞാത വാക്കുകളോ അടിച്ചാൽ സ്മാർട്ട് ഗൈഡ് കാർഡ് അയക്കുന്നു!
        if (['download', 'down', 'dl', 'link', 'help', 'ഇത്', 'ith'].some(k => cleanLower.includes(k))) {
          return await message.sendReply(getSmartHelperCard(targetUrl));
        }
      }
    }

    // ---------------------------------------------------------
    // C. ആരെങ്കിലും ഗ്രൂപ്പിൽ ഒരു കമാൻഡുമില്ലാതെ വെറും ലിങ്ക് മാത്രം ഇട്ടാൽ
    // ---------------------------------------------------------
    if (!rawText.startsWith('.') && !rawText.startsWith('!')) {
      const soloUrlMatch = rawText.match(YT_REGEX);
      if (soloUrlMatch && rawText.length < 120) {
        // ഉപയോക്താവിന് സഹായകരമായ ഗൈഡ് കാർഡ് കാണിക്കുന്നു
        return await message.sendReply(getSmartHelperCard(soloUrlMatch[0]));
      }
    }
  }
);
