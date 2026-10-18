const {
  addExif,
  webp2mp4,
  addID3,
  getBuffer,
  uploadToImgbb,
  uploadToCatbox,
} = require("./utils");
const { Module } = require("../main");
let config = require("../config");
let fs = require("fs");

Module(
  {
    pattern: "take ?(.*)",
    use: "edit",
    desc: "Changes sticker/audio pack & author name. Title, artist, thumbnail etc.",
  },
  async (m, match) => {
    if (!m.reply_message)
      return await m.sendMessage("_Reply to an audio or a sticker_");
    var audiomsg = m.reply_message.audio;
    var stickermsg = m.reply_message.sticker;
    var q = await m.reply_message.download();

    if (stickermsg) {
      const defaultPack = config.STICKER_DATA ? config.STICKER_DATA.split(";")[0] : "OGGY-MD";
      const defaultAuthor = config.STICKER_DATA ? config.STICKER_DATA.split(";")[1] : "ABHIIXZ";
      const defaultCat = config.STICKER_DATA ? config.STICKER_DATA.split(";")[2] || "⚡" : "⚡";

      let packname = defaultPack;
      let author = defaultAuthor;

      if (match[1] && match[1].trim() !== "") {
        if (match[1].includes(";")) {
          const parts = match[1].split(";");
          packname = parts[0].trim();
          author = parts[1].trim();
        } else {
          packname = match[1].trim();
          author = "";
        }
      }

      var exif = {
        author: author,
        packname: packname,
        categories: defaultCat,
        android: "https://github.com/JITHUKNR/OGGY-MD/",
        ios: "https://github.com/JITHUKNR/OGGY-MD/",
      };

      return await m.client.sendMessage(
        m.jid,
        { sticker: fs.readFileSync(await addExif(q, exif)) },
        { quoted: m.quoted }
      );
    }

    if (!stickermsg && audiomsg) {
      let inf =
        match[1] !== ""
          ? match[1]
          : config.AUDIO_DATA === "default"
          ? "OGGY-MD;ABHIIXZ;https://i.ibb.co/s98DyMMq/NL-1.png"
          : config.AUDIO_DATA;

      if (config.AUDIO_DATA == "default") {
        await m.sendReply(
          `_Using default audio metadata, use .setvar AUDIO_INFO=title;artist;imageurl to change_`
        );
      }

      let spl = inf.split(";"),
        image = spl[2]
          ? await getBuffer(spl[2])
          : await getBuffer(
              config.BOT_INFO.split(";")?.[2] === "default" || !config.BOT_INFO.split(";")?.[2]
                ? "https://i.ibb.co/s98DyMMq/NL-1.png"
                : config.BOT_INFO.split(";")[2]
            ),
        res = await addID3(
          q,
          spl[0] || "OGGY-MD",
          spl[1] ? spl[1] : (config.AUDIO_DATA.split(";")[1] || "ABHIIXZ"),
          "OGGY-MD Engine",
          image
        );

      await m.client.sendMessage(
        m.jid,
        {
          audio: res,
          mimetype: "audio/mp4",
        },
        {
          quoted: m.quoted,
          ptt: false,
        }
      );
    }

    if (!audiomsg && !stickermsg)
      return await m.client.sendMessage(
        m.jid,
        {
          text: "_Reply to an audio or a sticker_",
        },
        {
          quoted: m.data,
        }
      );
  }
);

Module(
  {
    pattern: "mp4 ?(.*)",
    use: "edit",
    desc: "Converts animated sticker to video",
  },
  async (m, t) => {
    if (m.reply_message.sticker) {
      var q = await m.reply_message.download();
      try {
        var result = await webp2mp4(q, __dirname + "/temp/output.mp4");
      } catch (e) {
        console.log(e);
        return await m.sendReply("*Failed*");
      }
      await m.client.sendMessage(
        m.jid,
        {
          video: {
            url: __dirname + "/temp/output.mp4",
          },
        },
        { quoted: m.quoted }
      );
    } else return await m.sendReply("_Reply to an animated sticker!_");
  }
);

Module(
  {
    pattern: "url ?(.*)",
    desc: "Uploads image to imgbb and sends a url",
    use: "edit",
  },
  async (m, match) => {
    let result;
    if (m.reply_message?.image || m.reply_message?.sticker) {
      let q = await m.reply_message.download();
      result = await uploadToImgbb(q);
      return await m.sendReply(result.url);
    } else if (
      m.reply_message?.video ||
      m.reply_message?.document ||
      m.reply_message?.audio
    ) {
      let q = await m.reply_message.download();
      result = await uploadToCatbox(q);
      return await m.sendReply(result.url);
    }
  }
);
