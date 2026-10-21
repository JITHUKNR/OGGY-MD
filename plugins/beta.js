const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// പാട്ടുകൾ ഹൈ-സ്പീഡ് CDN വഴി എടുക്കുന്ന ഫംഗ്ഷൻ (തടസ്സമില്ലാത്ത എഞ്ചിനുകൾ)
async function fetchSongFast(query) {
  // എഞ്ചിൻ 1: JioSaavn പ്രൈമറി സെർവർ (320kbps ഒറിജിനൽ ക്വാളിറ്റി + എച്ച്ഡി പോസ്റ്റർ)
  try {
    const res1 = await axios.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}`,
      { timeout: 8000 }
    );
    const results = res1.data?.data?.results || res1.data?.results || [];
    if (results.length > 0) {
      const s = results[0];
      // ഡൗൺലോഡ് ലിങ്കുകൾ വേർതിരിക്കുന്നു (link അല്ലെങ്കിൽ url)
      const dlList = s.downloadUrl || [];
      const dlObj =
        dlList.find((d) => d.quality === "320kbps") ||
        dlList.find((d) => d.quality === "160kbps") ||
        dlList[dlList.length - 1];

      const audioLink = dlObj?.url || dlObj?.link || s.media_url;

      const imgList = s.image || [];
      const imgObj =
        imgList.find((i) => i.quality === "500x500") ||
        imgList[imgList.length - 1];

      const thumbLink = imgObj?.url || imgObj?.link || "https://i.imgur.com/8QZ9Q8w.jpeg";

      if (audioLink) {
        return {
          title: s.name ? s.name.replace(/&quot;/g, '"').replace(/&#039;/g, "'") : query,
          author: s.primaryArtists || s.album?.name || "Oggy-MD Music",
          duration: s.duration ? `${Math.floor(s.duration / 60)}:${(s.duration % 60).toString().padStart(2, "0")}` : "3:30",
          thumbnail: thumbLink,
          url: s.url || "https://jiosaavn.com",
          audioUrl: audioLink
        };
      }
    }
  } catch (e) {}

  // എഞ്ചിൻ 2: JioSaavn ബാക്ക്-അപ്പ് മിറർ
  try {
    const res2 = await axios.get(
      `https://jio-saavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(query)}`,
      { timeout: 8000 }
    );
    const results = res2.data?.data?.results || res2.data?.results || [];
    if (results.length > 0) {
      const s = results[0];
      const dlList = s.downloadUrl || [];
      const dlObj = dlList.find((d) => d.quality === "320kbps") || dlList[dlList.length - 1];
      const audioLink = dlObj?.url || dlObj?.link || s.media_url;

      if (audioLink) {
        return {
          title: s.name || query,
          author: s.primaryArtists || "Oggy-MD Music",
          duration: s.duration || "3:30",
          thumbnail: s.image?.[s.image.length - 1]?.url || "https://i.imgur.com/8QZ9Q8w.jpeg",
          url: s.url || "https://jiosaavn.com",
          audioUrl: audioLink
        };
      }
    }
  } catch (e) {}

  // എഞ്ചിൻ 3: Delirius ലൈവ് API (യൂട്യൂബ് ബാക്ക്-അപ്പ്)
  try {
    const res3 = await axios.get(
      `https://delirius-apiofc.vercel.app/download/ytplay?query=${encodeURIComponent(query)}`,
      { timeout: 12000 }
    );
    const d = res3.data?.data;
    const dlLink = d?.download?.url || d?.url;
    if (d && dlLink) {
      return {
        title: d.title || query,
        author: d.author?.name || d.author || "YouTube Music",
        duration: d.duration || d.timestamp || "3:30",
        thumbnail: d.image || d.thumbnail || "https://i.imgur.com/8QZ9Q8w.jpeg",
        url: d.url || "https://youtube.com",
        audioUrl: dlLink
      };
    }
  } catch (e) {}

  return null;
}

// കമാൻഡ്: tsong
Module(
  {
    pattern: "[.]?tsong ?(.*)",
    fromMe: isFromMe,
    desc: "Fast music downloader with verified CDN",
    usage: "tsong <song name>",
    use: "beta",
  },
  async (message, match) => {
    const query = match[1] ? match[1].trim() : null;

    if (!query) {
      return await message.sendReply(
        `╭━━━〔 🎵 *OGGY-MD MUSIC* 〕━━━╮\n` +
        `┃ ⚠️ പാട്ടിന്റെ പേര് നൽകുക!\n` +
        `┃\n` +
        `┃ 💡 *ഉദാഹരണം:* \`tsong malare\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply(`_🔎 "${query}" തിരയുന്നു... അല്പം കാത്തിരിക്കൂ..._`);

    try {
      const song = await fetchSongFast(query);

      if (!song || !song.audioUrl) {
        return await message.sendReply("_❌ പാട്ട് കണ്ടെത്താനായില്ല! മറ്റൊരു പേര് നൽകി നോക്കുക._");
      }

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

      // ഓഡിയോ അയക്കുന്നു (പോസ്റ്റർ കാർഡ് സഹിതം)
      try {
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
      } catch (adError) {
        // കാർഡിൽ പ്രശ്നം വന്നാൽ നേരിട്ട് ഓഡിയോ അയക്കുന്നു
        await message.client.sendMessage(
          message.jid,
          {
            audio: { url: song.audioUrl },
            mimetype: "audio/mp4",
            fileName: `${song.title}.mp3`
          },
          { quoted: message.data }
        );
      }

      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }

    } catch (err) {
      await message.sendReply(`_⚠️ ഡൗൺലോഡ് പരാജയപ്പെട്ടു: ${err.message}_`);
    }
  }
);
