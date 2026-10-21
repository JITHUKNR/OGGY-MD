const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// പാട്ടുകൾ ഹൈ-ക്വാളിറ്റിയിൽ എടുക്കുന്ന സ്മാർട്ട് എഞ്ചിൻ (മൾട്ടിപ്പിൾ പ്രൊവൈഡർ)
async function getSongAudio(query) {
  // 1. പ്രൈമറി എഞ്ചിൻ: ഹൈ-സ്പീഡ് മ്യൂസിക് CDN (320kbps ഒറിജിനൽ ഓഡിയോ + എച്ച്ഡി പോസ്റ്റർ)
  try {
    const res1 = await axios.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}`,
      { timeout: 8000 }
    );
    const results = res1.data?.data?.results;
    if (results && results.length > 0) {
      const s = results[0];
      const dlObj =
        s.downloadUrl?.find((d) => d.quality === "320kbps") ||
        s.downloadUrl?.find((d) => d.quality === "160kbps") ||
        s.downloadUrl?.[s.downloadUrl.length - 1];

      const imgObj =
        s.image?.find((i) => i.quality === "500x500") ||
        s.image?.[s.image.length - 1];

      if (dlObj && dlObj.url) {
        return {
          title: s.name ? s.name.replace(/&quot;/g, '"').replace(/&#039;/g, "'") : query,
          author: s.primaryArtists || s.album?.name || "Oggy-MD Music",
          duration: s.duration ? `${Math.floor(s.duration / 60)}:${(s.duration % 60).toString().padStart(2, "0")}` : "3:30",
          thumbnail: imgObj?.url || "https://i.imgur.com/8QZ9Q8w.jpeg",
          url: s.url || "https://jiosaavn.com",
          audioUrl: dlObj.url
        };
      }
    }
  } catch (e) {}

  // 2. ബാക്ക്-അപ്പ് എഞ്ചിൻ: യൂട്യൂബ് ഡൗൺലോഡർ API
  try {
    const res2 = await axios.get(
      `https://delirius-apiofc.vercel.app/download/ytplay?query=${encodeURIComponent(query)}`,
      { timeout: 12000 }
    );
    const d = res2.data?.data;
    const dlLink = d?.download?.url || d?.url;
    if (d && dlLink) {
      return {
        title: d.title || query,
        author: d.author?.name || d.author || "YouTube Music",
        duration: d.duration || d.timestamp || "3:45",
        thumbnail: d.image || d.thumbnail || "https://i.imgur.com/8QZ9Q8w.jpeg",
        url: d.url || "https://youtube.com",
        audioUrl: dlLink
      };
    }
  } catch (e) {}

  // 3. മൂന്നാമത്തെ ബാക്ക്-അപ്പ് എഞ്ചിൻ: BK9 API
  try {
    const res3 = await axios.get(
      `https://bk9.fun/download/ytmp3?url=${encodeURIComponent(query)}`,
      { timeout: 12000 }
    );
    const b = res3.data?.BK9;
    const dlUrl = b?.downloadUrl || b?.link;
    if (b && dlUrl) {
      return {
        title: b.title || query,
        author: b.author || "Oggy-MD",
        duration: b.duration || "N/A",
        thumbnail: b.thumbnail || b.image || "https://i.imgur.com/8QZ9Q8w.jpeg",
        url: b.url || "https://youtube.com",
        audioUrl: dlUrl
      };
    }
  } catch (e) {}

  return null;
}

// കമാൻഡ്: tsong (കുത്തിട്ടോ കുത്തില്ലാതെയോ പ്രവർത്തിക്കും)
Module(
  {
    pattern: "[.]?tsong ?(.*)",
    fromMe: isFromMe,
    desc: "Smart high-speed music downloader with interactive album card",
    usage: "tsong <song name>",
    use: "beta",
  },
  async (message, match) => {
    const query = match[1] ? match[1].trim() : null;

    if (!query) {
      return await message.sendReply(
        `╭━━━〔 🧪 *OGGY-MD MUSIC* 〕━━━╮\n` +
        `┃ ⚠️ ഒരു പാട്ടിന്റെ പേര് നൽകുക!\n` +
        `┃\n` +
        `┃ 💡 *ഉദാഹരണം:* \`tsong premam malare\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply(`_🔎 "${query}" തിരയുന്നു... അല്പം കാത്തിരിക്കൂ..._`);

    try {
      const song = await getSongAudio(query);

      if (!song || !song.audioUrl) {
        return await message.sendReply("_❌ പാട്ട് കണ്ടെത്താനോ ഡൗൺലോഡ് ചെയ്യാനോ കഴിഞ്ഞില്ല! മറ്റൊരു പേര് നൽകി നോക്കുക._");
      }

      // WhatsApp ഇൻലൈൻ മ്യൂസിക് പോസ്റ്റർ കാർഡ് (Spotify / YouTube Music സ്റ്റൈൽ)
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

      // ഓഡിയോ കാർഡോട് കൂടി അയക്കുന്നു
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

      // സെർച്ചിംഗ് മെസ്സേജ് ഡിലീറ്റ് ചെയ്യുന്നു
      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }

    } catch (err) {
      await message.sendReply("_⚠️ പാട്ട് ഡൗൺലോഡ് ചെയ്യുന്നതിൽ പിശക് സംഭവിച്ചു! അല്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക._");
    }
  }
);
