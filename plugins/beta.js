const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// ലൈവ് മ്യൂസിക് എഞ്ചിൻ (ബ്ലോക്കുകൾ ഇല്ലാത്ത 3 എഞ്ചിനുകൾ)
async function fetchSong(query) {
  let errLogs = [];

  // എഞ്ചിൻ 1: Vreden YT-Play (ഹൈ-സ്പീഡ് യൂട്യൂബ് സ്ട്രീം)
  try {
    const r1 = await axios.get(
      `https://api.vreden.web.id/api/ytplay?query=${encodeURIComponent(query)}`,
      { timeout: 15000 }
    );
    const res = r1.data?.result;
    const dl = res?.download?.url || res?.url;
    if (res && dl) {
      return {
        title: res.metadata?.title || res.title || query,
        author: res.metadata?.author?.name || res.author || "YouTube Music",
        duration: res.metadata?.duration?.timestamp || res.duration || "N/A",
        thumbnail: res.metadata?.thumbnail || res.thumbnail || "https://i.imgur.com/8QZ9Q8w.jpeg",
        url: res.metadata?.url || "https://youtube.com",
        audioUrl: dl
      };
    }
  } catch (e) {
    errLogs.push(`Eng1: ${e.message}`);
  }

  // എഞ്ചിൻ 2: Agatz Direct Engine
  try {
    const r2 = await axios.get(
      `https://api.agatz.xyz/api/ytplay?message=${encodeURIComponent(query)}`,
      { timeout: 15000 }
    );
    const d = r2.data?.data;
    const dl = d?.downloadUrl || d?.url;
    if (d && dl) {
      return {
        title: d.title || query,
        author: d.channel || d.author || "YouTube Music",
        duration: d.duration || "3:30",
        thumbnail: d.thumbnail || "https://i.imgur.com/8QZ9Q8w.jpeg",
        url: d.url || "https://youtube.com",
        audioUrl: dl
      };
    }
  } catch (e) {
    errLogs.push(`Eng2: ${e.message}`);
  }

  // എഞ്ചിൻ 3: Dhamz Engine
  try {
    const r3 = await axios.get(
      `https://api.dhamzxploit.my.id/api/ytplay?query=${encodeURIComponent(query)}`,
      { timeout: 15000 }
    );
    const d3 = r3.data?.result;
    const dl = d3?.download?.url || d3?.url;
    if (d3 && dl) {
      return {
        title: d3.title || query,
        author: d3.author || "Oggy-MD",
        duration: d3.duration || "N/A",
        thumbnail: d3.thumbnail || "https://i.imgur.com/8QZ9Q8w.jpeg",
        url: d3.url || "https://youtube.com",
        audioUrl: dl
      };
    }
  } catch (e) {
    errLogs.push(`Eng3: ${e.message}`);
  }

  // എല്ലാം പരാജയപ്പെട്ടാൽ വന്ന കൃത്യമായ എറർ വ്യക്തമാക്കുന്നു
  throw new Error(errLogs.join(" | "));
}

// കമാൻഡ്: tsong
Module(
  {
    pattern: "[.]?tsong ?(.*)",
    fromMe: isFromMe,
    desc: "Plays music with album card",
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
      const song = await fetchSong(query);

      // ഇൻലൈൻ ആൽബം കാർഡ് ഡിസൈൻ
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
      await message.sendReply(`_⚠️ ഡൗൺലോഡ് പരാജയപ്പെട്ടു: ${err.message}_`);
    }
  }
);
