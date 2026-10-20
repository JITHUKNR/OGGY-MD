const { Module } = require("../main");
const axios = require("axios");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const { addExif } = require("./utils");
const { getTempPath } = require("../core/helpers");
const config = require("../config");

// Paste your BotFather Telegram Bot Token here
const TELEGRAM_BOT_TOKEN = "8720214215:AAE_dbCU82VAUWBFIOLBY4s0X9ksCWNtmOE";

// Helper function to convert downloaded image/video into WhatsApp sticker WebP
const convertToSticker = (inputPath, isAnimated = false) => {
  return new Promise((resolve, reject) => {
    const outputPath = getTempPath(`tg_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`);
    let command = ffmpeg(inputPath).outputOptions(["-y"]);

    if (isAnimated) {
      command
        .videoFilters([
          "scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease",
          "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0",
          "fps=15"
        ])
        .outputOptions([
          "-vcodec", "libwebp",
          "-pix_fmt", "yuva420p",
          "-lossless", "0",
          "-compression_level", "6",
          "-q:v", "80",
          "-loop", "0",
          "-preset", "picture",
          "-an",
          "-vsync", "0"
        ]);
    } else {
      command
        .videoFilters([
          "scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease",
          "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0"
        ])
        .outputOptions([
          "-vcodec", "libwebp",
          "-pix_fmt", "yuva420p",
          "-lossless", "1",
          "-qscale", "95",
          "-preset", "drawing"
        ]);
    }

    command
      .save(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err));
  });
};

Module(
  {
    pattern: "tgsticker ?(.*)",
    use: "utility",
    desc: "Converts a Telegram sticker pack to WhatsApp stickers.",
  },
  async (message, match) => {
    if (!match[1]) {
      return await message.send("_Please provide a Telegram sticker pack URL or name!_\n_Example: .tgsticker MY NAME https://t.me/addstickers/animals_");
    }

    let input = match[1].trim();
    let tgUrlMatch = input.match(/https?:\/\/t\.me\/addstickers\/[a-zA-Z0-9_]+/);
    
    let packName = "";
    let customName = "";

    if (tgUrlMatch) {
      const fullUrl = tgUrlMatch[0];
      packName = fullUrl.split("t.me/addstickers/")[1].split("/")[0].split("?")[0].trim();
      customName = input.replace(fullUrl, "").trim();
    } else {
      let parts = input.split(/\s+/);
      packName = parts[parts.length - 1].trim();
      if (parts.length > 1) {
        customName = parts.slice(0, parts.length - 1).join(" ").trim();
      }
    }

    if (!packName) {
      return await message.send("_Could not detect the sticker pack link or name!_");
    }

    let STICKER_DATA = config.STICKER_DATA;
    let pack = (STICKER_DATA && STICKER_DATA.includes(";")) ? STICKER_DATA.split(";")[0] : message.senderName;
    let author = (STICKER_DATA && STICKER_DATA.includes(";")) ? STICKER_DATA.split(";")[1] : "";

    if (customName) {
      if (customName.includes(";")) {
        let nameParts = customName.split(";");
        pack = nameParts[0].trim();
        author = nameParts[1].trim();
      } else {
        pack = customName;
        author = ""; // Clears second name so only the custom name appears
      }
    }

    var exif = {
      author: author,
      packname: pack,
      categories: (STICKER_DATA && STICKER_DATA.split(";")[2]) || "😂",
      android: "https://github.com/souravkl11/Raganork-md/",
      ios: "https://github.com/souravkl11/Raganork-md/",
    };

    const waitMsg = await message.send(`_Fetching Telegram sticker pack: ${packName}..._`);

    try {
      const setUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getStickerSet?name=${encodeURIComponent(packName)}`;
      const setRes = await axios.get(setUrl);

      if (!setRes.data || !setRes.data.ok || !setRes.data.result) {
        return await message.send("_Failed to find sticker pack! Please check the link or pack name._");
      }

      const stickerSet = setRes.data.result;
      const stickers = stickerSet.stickers || [];

      if (stickers.length === 0) {
        return await message.send("_No stickers found in this pack!_");
      }

      await message.send(`_Found ${stickers.length} stickers. Starting conversion with pack name: "${pack}"..._`);

      for (let i = 0; i < stickers.length; i++) {
        const stk = stickers[i];
        const isVideo = !!(stk.is_video);
        const isAnimated = !!(stk.is_animated);

        if (isAnimated) {
          continue;
        }

        try {
          const fileInfoUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${stk.file_id}`;
          const fileInfoRes = await axios.get(fileInfoUrl);

          if (!fileInfoRes.data || !fileInfoRes.data.ok) continue;

          const filePathOnServer = fileInfoRes.data.result.file_path;
          const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePathOnServer}`;

          const extension = filePathOnServer.split(".").pop();
          const localInputPath = getTempPath(`tg_dl_${Date.now()}.${extension}`);

          const response = await axios({
            url: downloadUrl,
            method: "GET",
            responseType: "arraybuffer",
          });

          fs.writeFileSync(localInputPath, Buffer.from(response.data));

          const convertedSticker = await convertToSticker(localInputPath, isVideo);
          const exifFile = await addExif(convertedSticker, exif);

          await message.sendMessage(
            fs.readFileSync(exifFile),
            "sticker",
            { quoted: message.data }
          );

          try {
            if (fs.existsSync(localInputPath)) fs.unlinkSync(localInputPath);
            if (fs.existsSync(convertedSticker)) fs.unlinkSync(convertedSticker);
            if (fs.existsSync(exifFile)) fs.unlinkSync(exifFile);
          } catch (e) {}

          await new Promise((resolve) => setTimeout(resolve, 1500));
        } catch (itemErr) {
          console.error(`Error processing sticker ${i + 1}:`, itemErr.message);
        }
      }

      await message.send(`_Completed sending all stickers from "${pack}"!_`);
    } catch (error) {
      console.error("TG Sticker fetch error:", error);
      await message.send("_An error occurred while fetching the Telegram sticker pack._");
    }
  }
);
