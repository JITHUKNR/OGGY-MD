const { Module } = require("../main");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const { exec } = require("child_process");

const config = require("../config");
const MODE = config.MODE;
const fromMe = MODE === "public" ? false : true;

function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error) return reject(stderr || error.message);
      resolve(stdout ? stdout.trim() : "");
    });
  });
}

// 1. FREE HIGH-SPEED AI STEM SEPARATION ENGINE (SEPARATES VOCALS & BGM)
async function separateAudio(audioFilePath) {
  const timestamp = Date.now();
  const cleanMp3Path = path.join("/tmp", `input_${timestamp}.mp3`);

  // Convert to clean standard MP3 first using FFmpeg
  await runCmd(`ffmpeg -i "${audioFilePath}" -vn -ar 44100 -ac 2 -b:a 192k "${cleanMp3Path}" -y`);

  try {
    const form = new FormData();
    form.append("file", fs.createReadStream(cleanMp3Path));

    // Upload & Process via High Quality AI Vocal/BGM Splitter API
    const response = await axios.post("https://api.vocalremover.org/api/v1/split", form, {
      headers: { ...form.getHeaders() },
      timeout: 120000,
    });

    try { fs.unlinkSync(cleanMp3Path); } catch (e) {}

    if (response.data && response.data.vocals && response.data.instrumental) {
      return {
        vocalUrl: response.data.vocals,
        musicUrl: response.data.instrumental,
      };
    }
  } catch (apiError) {
    // Fallback to Free Open-Source AI Endpoint
    try {
      const form2 = new FormData();
      form2.append("audio_file", fs.createReadStream(cleanMp3Path));

      const fallbackRes = await axios.post("https://api.music-separation.workers.dev/split", form2, {
        headers: { ...form2.getHeaders() },
        timeout: 120000,
      });

      try { fs.unlinkSync(cleanMp3Path); } catch (e) {}

      if (fallbackRes.data && fallbackRes.data.vocals) {
        return {
          vocalUrl: fallbackRes.data.vocals,
          musicUrl: fallbackRes.data.instrumental || fallbackRes.data.bgm,
        };
      }
    } catch (e) {}
  }

  try { fs.unlinkSync(cleanMp3Path); } catch (e) {}
  throw new Error("Separation failed. Please try with a shorter audio clip!");
}

// ============================================================
// 1. .SPLIT / .SEPARATE COMMAND (DIVIDES INTO 2 AUDIOS)
// ============================================================
Module(
  {
    pattern: "split ?(.*)",
    fromMe: fromMe,
    desc: "Separate dialogue and music/BGM from mixed audio",
    usage: "Reply to audio with .split",
    use: "audio",
  },
  async (message) => {
    if (!message.reply_message || (!message.reply_message.audio && !message.reply_message.video)) {
      return await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD AUDIO SPLIT* ⚡ 〕━━━╮\n` +
        `┃ ⚠️ *ഉപയോഗിക്കേണ്ട വിധം:*\n` +
        `┃ ഡയലോഗും പാട്ടും മിക്സ് ആയ ഒരു ഓഡിയോ\n` +
        `┃ അയച്ച്, അതിലേക്ക് Reply ആയി \`.split\` എന്ന് അടിക്കുക.\n` +
        `┃\n` +
        `┃ 🎙️ *1. Dialogue / Vocals മാത്രം*\n` +
        `┃ 🎵 *2. BGM / Music മാത്രം*\n` +
        `┃ എന്നിങ്ങനെ 2 ഫയലുകളായി ബോട്ട് തരും!\n` +
        `╰━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const sock = message.client || message;
    let waitMsg;
    let downloadedPath;

    try {
      waitMsg = await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD AI SPLITTER* 〕───\n│ ⏳ *ഓഡിയോ വിശകലനം ചെയ്യുന്നു...*\n│ 🤖 AI വഴി ഡയലോഗും മ്യൂസികും വേർതിരിക്കുന്നു, കാത്തിരിക്കൂ...\n╰────────────────────────"
      );

      // Download replied audio
      downloadedPath = await message.reply_message.download();

      // Send to AI for Separation
      const result = await separateAudio(downloadedPath);

      // 1. Send Dialogue Only Audio
      const vocalRes = await axios.get(result.vocalUrl, { responseType: "arraybuffer" });
      await sock.sendMessage(
        message.jid,
        {
          audio: Buffer.from(vocalRes.data),
          mimetype: "audio/mp4",
          ptt: false,
          fileName: "Dialogue_Vocals_OGGY-MD.mp3",
          contextInfo: {
            externalAdReply: {
              title: "🎙️ Dialogue / Vocals Only",
              body: "OGGY-MD • ABHIIXZ",
              mediaType: 1,
              sourceUrl: "https://github.com/JITHUKNR/OGGY-MD",
            },
          },
        },
        { quoted: message.data }
      );

      // 2. Send Music / BGM Only Audio
      const musicRes = await axios.get(result.musicUrl, { responseType: "arraybuffer" });
      await sock.sendMessage(
        message.jid,
        {
          audio: Buffer.from(musicRes.data),
          mimetype: "audio/mp4",
          ptt: false,
          fileName: "Music_BGM_OGGY-MD.mp3",
          contextInfo: {
            externalAdReply: {
              title: "🎵 Music / BGM Only (Instrumental)",
              body: "OGGY-MD • ABHIIXZ",
              mediaType: 1,
              sourceUrl: "https://github.com/JITHUKNR/OGGY-MD",
            },
          },
        },
        { quoted: message.data }
      );

      // Delete wait message
      if (waitMsg && waitMsg.key) {
        await sock.sendMessage(message.jid, { delete: waitMsg.key }).catch(() => {});
      }
      if (fs.existsSync(downloadedPath)) fs.unlinkSync(downloadedPath);
    } catch (error) {
      console.error("Audio split error:", error);
      if (waitMsg) {
        await message.edit("_❌ വേർതിരിക്കാൻ സാധിച്ചില്ല! ഓഡിയോയുടെ ദൈർഘ്യം കുറച്ച് വീണ്ടും ശ്രമിക്കുക._", message.jid, waitMsg.key);
      } else {
        await message.sendReply("_❌ എറർ സംഭവിച്ചു. വീണ്ടും ശ്രമിക്കുക!_");
      }
      if (downloadedPath && fs.existsSync(downloadedPath)) fs.unlinkSync(downloadedPath);
    }
  }
);
        
