const { Module } = require("../main");
const fs = require("fs");
const path = require("path");
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

// ============================================================
// LOCAL HIGH-SPEED FFMPEG AUDIO ISOLATION (ZERO API DEPENDENCY)
// ============================================================
async function processAudioSeparation(inputAudioPath) {
  const timestamp = Date.now();
  const vocalPath = path.join("/tmp", `vocals_${timestamp}.mp3`);
  const bgmPath = path.join("/tmp", `bgm_${timestamp}.mp3`);

  // 1. ISOLATE DIALOGUE / VOCALS (Bandpass + Noise Floor Filter)
  await runCmd(
    `ffmpeg -i "${inputAudioPath}" -af "highpass=f=200,lowpass=f=3500,afftdn=nf=-20,dynaudnorm=p=0.9" -b:a 192k "${vocalPath}" -y`
  );

  // 2. ISOLATE BGM / MUSIC (Center-Channel Vocal Removal & Phase Cancellation)
  await runCmd(
    `ffmpeg -i "${inputAudioPath}" -af "stereotools=mlev=0.02,volume=1.5" -b:a 192k "${bgmPath}" -y`
  );

  return {
    vocalPath,
    bgmPath,
  };
}

// ============================================================
// .SPLIT COMMAND
// ============================================================
Module(
  {
    pattern: "split ?(.*)",
    fromMe: fromMe,
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
        `┃\n` +
        `┃ 🎙️ *1. Dialogue / Vocals*\n` +
        `┃ 🎵 *2. BGM / Instrumental*\n` +
        `┃ എന്നിങ്ങനെ 2 ഫയലുകളായി ലഭിക്കും!\n` +
        `╰━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const sock = message.client || message;
    let waitMsg;
    let downloadedPath;
    let separatedFiles = null;

    try {
      waitMsg = await message.sendReply(
        "╭───〔 ⚡ *OGGY-MD AUDIO SPLITTER* 〕───\n│ ⏳ *ഓഡിയോ പ്രോസസ്സ് ചെയ്യുന്നു...*\n│ 🎙️ ഡയലോഗും മ്യൂസികും വേർതിരിക്കുന്നു, കാത്തിരിക്കൂ...\n╰────────────────────────"
      );

      // Download replied audio
      downloadedPath = await message.reply_message.download();

      // Process locally on VPS
      separatedFiles = await processAudioSeparation(downloadedPath);

      // 1. Send Dialogue / Vocals Audio
      if (fs.existsSync(separatedFiles.vocalPath)) {
        await sock.sendMessage(
          message.jid,
          {
            audio: fs.readFileSync(separatedFiles.vocalPath),
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
      }

      // 2. Send Music / BGM Audio
      if (fs.existsSync(separatedFiles.bgmPath)) {
        await sock.sendMessage(
          message.jid,
          {
            audio: fs.readFileSync(separatedFiles.bgmPath),
            mimetype: "audio/mp4",
            ptt: false,
            fileName: "Music_BGM_OGGY-MD.mp3",
            contextInfo: {
              externalAdReply: {
                title: "🎵 Music / BGM Only",
                body: "OGGY-MD • ABHIIXZ",
                mediaType: 1,
                sourceUrl: "https://github.com/JITHUKNR/OGGY-MD",
              },
            },
          },
          { quoted: message.data }
        );
      }

      // Delete waiting message & temp files
      if (waitMsg && waitMsg.key) {
        await sock.sendMessage(message.jid, { delete: waitMsg.key }).catch(() => {});
      }
      if (downloadedPath && fs.existsSync(downloadedPath)) fs.unlinkSync(downloadedPath);
      if (separatedFiles?.vocalPath && fs.existsSync(separatedFiles.vocalPath)) fs.unlinkSync(separatedFiles.vocalPath);
      if (separatedFiles?.bgmPath && fs.existsSync(separatedFiles.bgmPath)) fs.unlinkSync(separatedFiles.bgmPath);
    } catch (error) {
      console.error("Split error:", error);
      if (waitMsg) {
        await message.edit("_❌ പ്രോസസ്സിംഗ് പരാജയപ്പെട്ടു. ദയവായി വീണ്ടും ശ്രമിക്കുക!_", message.jid, waitMsg.key);
      } else {
        await message.sendReply("_❌ എറർ സംഭവിച്ചു. വീണ്ടും ശ്രമിക്കുക!_");
      }
      if (downloadedPath && fs.existsSync(downloadedPath)) fs.unlinkSync(downloadedPath);
      if (separatedFiles?.vocalPath && fs.existsSync(separatedFiles.vocalPath)) fs.unlinkSync(separatedFiles.vocalPath);
      if (separatedFiles?.bgmPath && fs.existsSync(separatedFiles.bgmPath)) fs.unlinkSync(separatedFiles.bgmPath);
    }
  }
);
