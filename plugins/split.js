const { Module } = require("../main");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error) return reject(stderr || error.message);
      resolve(stdout ? stdout.trim() : "");
    });
  });
}

// 100% LOCAL FFMPEG SEPARATION (FAST & RELIABLE)
async function processAudioSeparation(inputAudioPath) {
  const timestamp = Date.now();
  const vocalPath = path.join("/tmp", `vocals_${timestamp}.mp3`);
  const bgmPath = path.join("/tmp", `bgm_${timestamp}.mp3`);

  // 1. Isolate Human Dialogue / Vocals
  await runCmd(
    `ffmpeg -i "${inputAudioPath}" -af "highpass=f=200,lowpass=f=3500,afftdn=nf=-20,dynaudnorm=p=0.9" -b:a 192k "${vocalPath}" -y`
  );

  // 2. Isolate Background Music / BGM
  await runCmd(
    `ffmpeg -i "${inputAudioPath}" -af "stereotools=mlev=0.02,volume=1.5" -b:a 192k "${bgmPath}" -y`
  );

  return { vocalPath, bgmPath };
}

Module(
  {
    pattern: "split ?(.*)",
    fromMe: false,
    desc: "Separate dialogue and music/BGM from mixed audio locally",
    usage: "Reply to audio with .split",
    use: "audio",
  },
  async (message) => {
    if (!message.reply_message || (!message.reply_message.audio && !message.reply_message.video)) {
      return await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD AUDIO SPLIT* ⚡ 〕━━━╮\n` +
        `┃ ⚠️ *ഉപയോഗിക്കേണ്ട വിധം:*\n` +
        `┃ ഡയലോഗും പാട്ടും ഉള്ള ഓഡിയോയിലേക്ക്\n` +
        `┃ Reply ആയി \`.split\` എന്ന് അയക്കുക.\n` +
        `╰━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const sock = message.client || message;
    let waitMsg;
    let inputPath = path.join("/tmp", `input_${Date.now()}.mp3`);
    let separatedFiles = null;

    try {
      waitMsg = await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD SPLITTER* 〕───\n│ ⏳ *ഓഡിയോ പ്രോസസ്സ് ചെയ്യുന്നു...*\n│ 🎙️ ഡയലോഗും മ്യൂസികും വേർതിരിക്കുന്നു...\n╰────────────────────────"
      );

      // Download audio safely
      const downloaded = await message.reply_message.download();
      if (Buffer.isBuffer(downloaded)) {
        fs.writeFileSync(inputPath, downloaded);
      } else if (typeof downloaded === "string" && fs.existsSync(downloaded)) {
        fs.copyFileSync(downloaded, inputPath);
      } else {
        throw new Error("Download failed");
      }

      // Process separation locally via FFmpeg
      separatedFiles = await processAudioSeparation(inputPath);

      // 1. Send Dialogue Only (Clean MP3)
      if (fs.existsSync(separatedFiles.vocalPath)) {
        await sock.sendMessage(
          message.jid,
          {
            audio: fs.readFileSync(separatedFiles.vocalPath),
            mimetype: "audio/mp4",
            ptt: false,
            fileName: "Dialogue_Vocals.mp3",
          },
          { quoted: message.data }
        );
      }

      // 2. Send Music/BGM Only (Clean MP3)
      if (fs.existsSync(separatedFiles.bgmPath)) {
        await sock.sendMessage(
          message.jid,
          {
            audio: fs.readFileSync(separatedFiles.bgmPath),
            mimetype: "audio/mp4",
            ptt: false,
            fileName: "Music_BGM.mp3",
          },
          { quoted: message.data }
        );
      }

      // Edit wait message instead of deleting
      if (waitMsg && waitMsg.key) {
        await message.edit("╭───〔 ⚡ *OGGY-MD SPLITTER* 〕───\n│ ✅ *വിജയകരമായി വേർതിരിച്ചു!*\n│ 🎙️ 1. Dialogue / Vocals\n│ 🎵 2. BGM / Instrumental\n╰────────────────────────", message.jid, waitMsg.key);
      }

      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (separatedFiles?.vocalPath && fs.existsSync(separatedFiles.vocalPath)) fs.unlinkSync(separatedFiles.vocalPath);
      if (separatedFiles?.bgmPath && fs.existsSync(separatedFiles.bgmPath)) fs.unlinkSync(separatedFiles.bgmPath);
    } catch (error) {
      console.error("Split error:", error);
      if (waitMsg) {
        await message.edit("_❌ പ്രോസസ്സ് ചെയ്യാൻ സാധിച്ചില്ല. വീണ്ടും ശ്രമിക്കുക!_", message.jid, waitMsg.key);
      } else {
        await message.sendReply("_❌ എറർ സംഭവിച്ചു. വീണ്ടും ശ്രമിക്കുക!_");
      }
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (separatedFiles?.vocalPath && fs.existsSync(separatedFiles.vocalPath)) fs.unlinkSync(separatedFiles.vocalPath);
      if (separatedFiles?.bgmPath && fs.existsSync(separatedFiles.bgmPath)) fs.unlinkSync(separatedFiles.bgmPath);
    }
  }
);
