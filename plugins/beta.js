const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// യൂട്യൂബിൽ നിന്ന് പാട്ടും വിവരങ്ങളും എടുക്കുന്ന ഫംഗ്ഷൻ (ബാക്ക്-അപ്പ് API-കൾ സഹിതം)
async function getSongData(query) {
  // 1. Delirius API
  try {
    const searchRes = await axios.get(
      `https://delirius-apiofc.vercel.app/download/ytsearch?query=${encodeURIComponent(query)}`,
      { timeout: 10000 }
    );
    const item = searchRes.data?.data?.[0];
    if (item && item.url) {
      const dlRes = await axios.get(
        `https://delirius-apiofc.vercel.app/download/ytmp3?url=${encodeURIComponent(item.url)}`,
        { timeout: 15000 }
      );
      const dlData = dlRes.data?.data;
      if (dlData && dlData.download?.url) {
        return {
          title: item.title || "Song",
          author: item.author?.name || "Oggy-MD Music",
          duration: item.timestamp || item.duration || "N/A",
          thumbnail: item.image || item.thumbnail,
          url: item.url,
          audioUrl: dlData.download.url
        };
      }
    }
  } catch (e) {}

  // 2. BK9 API
  try {
    const bkRes = await axios.get(
      `https://bk9.fun/download/ytmp3?url=${encodeURIComponent(query)}`,
      { timeout: 15000 }
    );
    if (bkRes.data?.status && bkRes.data?.BK9) {
      const b = bkRes.data.BK9;
      return {
        title: b.title || query,
        author: b.author || "Oggy-MD Music",
        duration: b.duration || "N/A",
        thumbnail: b.thumbnail || b.image,
        url: b.url || "https://youtube.com",
        audioUrl: b.downloadUrl || b.link
      };
    }
  } catch (e) {}

  // 3. Siputzx API
  try {
    const sipRes = await axios.get(
      `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(query)}`,
      { timeout: 15000 }
    );
    if (sipRes.data?.status && sipRes.data?.data) {
      const s = sipRes.data.data;
      return {
        title: s.title || query,
        author: "Oggy-MD Music",
        duration: "N/A",
        thumbnail: s.thumbnail,
        url: "https://youtube.com",
        audioUrl: s.dl
      };
    }
  } catch (e) {}

  return null;
}

// ബീറ്റാ ടെസ്റ്റ് കമാൻഡ്: .tsong <പാട്ടിന്റെ പേര്>
Module(
  {
    pattern: "tsong ?(.*)",
    fromMe: isFromMe,
    desc: "Beta test: Smart music card downloader with thumbnail banner",
    usage: ".tsong <song name>",
    use: "beta",
  },
  async (message, match) => {
    const query = match[1] ? match[1].trim() : null;

    if (!query) {
      return await message.sendReply(
        `╭━━━〔 🧪 *BETA: MUSIC CARD* 〕━━━╮\n` +
        `┃ ⚠️ ദയവായി പാട്ടിന്റെ പേര് നൽകുക!\n` +
        `┃\n` +
        `┃ 💡 *ഉദാഹരണം:* \`.tsong premam malare\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply(`_🔎 "${query}" തിരയുന്നു... അല്പം കാത്തിരിക്കൂ..._`);

    try {
      const song = await getSongData(query);

      if (!song || !song.audioUrl) {
        return await message.sendReply("_❌ പാട്ട് കണ്ടെത്താനോ ഡൗൺലോഡ് ചെയ്യാനോ കഴിഞ്ഞില്ല! പേര് ശരിയാണോ എന്ന് നോക്കുക._");
      }

      // ഇൻലൈൻ ആൽബം കാർഡ് ഡിസൈൻ (externalAdReply)
      const contextInfo = {
        externalAdReply: {
          title: song.title,
          body: `🎙️ ${song.author} • ⏱️ ${song.duration}`,
          mediaType: 2,
          renderLargerThumbnail: true,
          thumbnailUrl: song.thumbnail,
          sourceUrl: song.url
        }
      };

      // പാട്ട് കാർഡോട് കൂടി അയക്കുന്നു
      await message.client.sendMessage(
        message.jid,
        {
          audio: { url: song.audioUrl },
          mimetype: "audio/mp4",
          fileName: `${song.title}.mp3`,
          contextInfo: contextInfo
        },
        { quoted: message.data }
      );

      // സെർച്ചിംഗ് മെസ്സേജ് ഒഴിവാക്കുന്നു
      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }

    } catch (err) {
      await message.sendReply("_⚠️ പാട്ട് ഡൗൺലോഡ് ചെയ്യുന്നതിൽ പിശക് സംഭവിച്ചു! അല്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക._");
    }
  }
);
