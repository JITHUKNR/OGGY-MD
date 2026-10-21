const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// VPS ബ്ലോക്കുകൾ മറികടക്കാനുള്ള ബ്രൗസർ ഹെഡ്ഡറുകൾ
const reqConfig = {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*"
  },
  timeout: 12000
};

// പാട്ടുകൾ എടുക്കുന്ന ഫംഗ്ഷൻ (4 ലൈവ് മിററുകൾ സഹിതം)
async function getSongAudio(query) {
  // മിറർ 1: saavn.me (മലയാളം പാട്ടുകൾ 1 സെക്കൻഡിൽ അതിവേഗം ലഭിക്കാൻ)
  try {
    const res1 = await axios.get(
      `https://saavn.me/api/search/songs?query=${encodeURIComponent(query)}`,
      reqConfig
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

  // മിറർ 2: saavn.dev ബാക്ക്-അപ്പ്
  try {
    const res2 = await axios.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}`,
      reqConfig
    );
    const results = res2.data?.data?.results;
    if (results && results.length > 0) {
      const s = results[0];
      const dlObj =
        s.downloadUrl?.find((d) => d.quality === "320kbps") ||
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

  // മിറർ 3: YouTube Play ഡയറക്റ്റ് സ്ട്രീം
  try {
    const res3 = await axios.get(
      `https://api.siputzx.my.id/api/d/ytplay?query=${encodeURIComponent(query)}`,
      reqConfig
    );
    const data = res3.data?.data;
    const dlLink = data?.download || data?.dl || data?.url;
    if (data && dlLink) {
      return {
        title: data.title || query,
        author: data.channel || data.author || "YouTube Music",
        duration: data.duration || "N/A",
        thumbnail: data.thumbnail || "https://i.imgur.com/8QZ9Q8w.jpeg",
        url: data.url || "https://youtube.com",
        audioUrl: dlLink
      };
    }
  } catch (e) {}

  // മിറർ 4: Delirius YouTube
  try {
    const res4 = await axios.get(
      `https://delirius-apiofc.vercel.app/download/ytplay?query=${encodeURIComponent(query)}`,
      reqConfig
    );
    const d = res4.data?.data;
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

// കമാൻഡ്: tsong (കുത്തുണ്ടെങ്കിലും ഇല്ലെങ്കിലും വലിയ/ചെറിയ അക്ഷരത്തിലും പ്രവർത്തിക്കും)
Module(
  {
    pattern: "[.]?tsong ?(.*)",
    fromMe: isFromMe,
    desc: "Fast music downloader with thumbnail banner card",
    usage: "tsong <song name>",
    use: "beta",
  },
  async (message, match) => {
    const query = match[1] ? match[1].trim() : null;

    if (!query) {
      return await message.sendReply(
        `╭━━━〔 🎵 *OGGY-MD MUSIC* 〕━━━╮\n` +
        `┃ ⚠️ ഒരു പാട്ടിന്റെ പേര് നൽകുക!\n` +
        `┃\n` +
        `┃ 💡 *ഉദാഹരണം:* \`tsong malare\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply(`_🔎 "${query}" തിരയുന്നു... അല്പം കാത്തിരിക്കൂ..._`);

    try {
      const song = await getSongAudio(query);

      if (!song || !song.audioUrl) {
        return await message.sendReply("_❌ പാട്ട് കണ്ടെത്താൻ കഴിഞ്ഞില്ല! പേര് ശരിയാണോ എന്ന് പരിശോധിക്കുക._");
      }

      // ഇൻലൈൻ ആൽബം കാർഡ്
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

      // ഓഡിയോ അയക്കുന്നു
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

      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }

    } catch (err) {
      await message.sendReply("_⚠️ ഓഡിയോ അയക്കുന്നതിൽ പ്രശ്നം സംഭവിച്ചു! വീണ്ടും ശ്രമിക്കുക._");
    }
  }
);
