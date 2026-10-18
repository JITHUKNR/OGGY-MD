const { Module } = require("../main");
const axios = require("axios");
const config = require("../config");
const fromMe = config.MODE === "public" ? false : true;

// Helper: Form URL Encoded
function toUrlEncoded(obj) {
  return Object.keys(obj)
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]))
    .join("&");
}

// ==========================================
// 1. TRUECALLER SEARCH COMMAND (.true)
// ==========================================
Module(
  {
    pattern: "true ?(.*)",
    fromMe: fromMe,
    desc: "Search caller details via Truecaller",
    usage: ".true <number> or reply to a message with .true",
    use: "search",
  },
  async (message, match) => {
    let num = match[1];

    // If user replies to a message, get number from replied user
    if (!num && message.reply_message) {
      num = message.reply_message.jid ? message.reply_message.jid.split("@")[0] : "";
    }

    if (!num) {
      return await message.sendReply(
        "_*Please provide a phone number!*_\n_Example: .true 9876543210 or reply to someone's message with .true_"
      );
    }

    // Clean number (remove +, spaces, hyphens)
    let cleanNum = num.replace(/[^0-9]/g, "");

    // If 10 digits (Standard Indian format), prefix 91
    if (cleanNum.length === 10) cleanNum = "91" + cleanNum;

    const waitMsg = await message.sendReply("_🔍 Searching Truecaller database..._");

    const apis = [
      `https://api.guruapi.tech/truecaller?number=${cleanNum}`,
      `https://api.siputzx.my.id/api/tools/truecaller?number=${cleanNum}`,
      `https://delirius-apiofc.vercel.app/tools/truecaller?number=${cleanNum}`
    ];

    let resultData = null;

    for (const url of apis) {
      try {
        const res = await axios.get(url, { timeout: 10000 });
        const d = res.data?.data || res.data?.result || res.data;
        if (d && (d.name || d.phones || d.addresses)) {
          resultData = d;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!resultData) {
      return await message.edit("_No details found for this number!_", message.jid, waitMsg.key);
    }

    const name = resultData.name || resultData.fullName || "Unknown";
    const altName = resultData.altName || resultData.phones?.[0]?.carrier || "N/A";
    const carrier = resultData.carrier || resultData.phones?.[0]?.carrier || "N/A";
    const city = resultData.city || resultData.addresses?.[0]?.city || "India";
    const email = resultData.email || resultData.internetAddresses?.[0]?.id || "N/A";
    const spam = resultData.spamScore ? `⚠️ Spam (${resultData.spamScore} reports)` : "✅ Safe";

    let replyText = `╭───〔 *TRUECALLER SEARCH* 〕───\n`;
    replyText += `│ 👤 *Name:* ${name}\n`;
    replyText += `│ 📞 *Number:* +${cleanNum}\n`;
    replyText += `│ 🏢 *Carrier:* ${carrier}\n`;
    replyText += `│ 📍 *Location:* ${city}\n`;
    replyText += `│ 📧 *Email:* ${email}\n`;
    replyText += `│ 🛡️ *Status:* ${spam}\n`;
    replyText += `╰────────────────────────`;

    await message.edit(replyText, message.jid, waitMsg.key);
  }
);

// ==========================================
// 2. DISPOSABLE TEMP-MAIL (.tempmail & .checkmail)
// ==========================================
Module(
  {
    pattern: "tempmail ?(.*)",
    fromMe: fromMe,
    desc: "Generate disposable temporary email",
    usage: ".tempmail",
    use: "utility",
  },
  async (message) => {
    try {
      const waitMsg = await message.sendReply("_Creating temporary email..._");
      const res = await axios.get(
        "https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1",
        { timeout: 8000 }
      );

      const email = res.data?.[0];
      if (!email) throw new Error("Failed to generate");

      let text = `╭───〔 *TEMPORARY EMAIL* 〕───\n`;
      text += `│ 📧 *Email Address:*\n`;
      text += `│ \`${email}\`\n│\n`;
      text += `│ 💡 _To check incoming OTPs / Emails:_\n`;
      text += `│ Send: *.checkmail ${email}*\n`;
      text += `╰────────────────────────`;

      await message.edit(text, message.jid, waitMsg.key);
    } catch (err) {
      await message.sendReply("_Failed to generate temp mail. Please try again!_");
    }
  }
);

Module(
  {
    pattern: "checkmail ?(.*)",
    fromMe: fromMe,
    desc: "Check tempmail inbox for OTPs and messages",
    usage: ".checkmail <temp email>",
    use: "utility",
  },
  async (message, match) => {
    let email = match[1] || message.reply_message?.text;
    if (email && email.includes("`")) email = email.replace(/`/g, "").trim();

    if (!email || !email.includes("@")) {
      return await message.sendReply("_Please provide the temporary email!_\n_Example: .checkmail abc@1secmail.com_");
    }

    const [login, domain] = email.split("@");

    try {
      const waitMsg = await message.sendReply("_Checking mailbox..._");
      const res = await axios.get(
        `https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`,
        { timeout: 10000 }
      );

      const msgs = res.data;
      if (!Array.isArray(msgs) || msgs.length === 0) {
        return await message.edit("_📭 Mailbox is empty! No emails or OTPs received yet._", message.jid, waitMsg.key);
      }

      // Fetch the latest message content
      const latest = msgs[0];
      const mailRes = await axios.get(
        `https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${latest.id}`,
        { timeout: 10000 }
      );

      const mailData = mailRes.data;
      const cleanBody = (mailData.textBody || mailData.body || "")
        .replace(/<[^>]*>?/gm, "")
        .trim()
        .substring(0, 1500);

      let reply = `╭───〔 *NEW EMAIL RECEIVED* 〕───\n`;
      reply += `│ 👤 *From:* ${mailData.from}\n`;
      reply += `│ 📌 *Subject:* ${mailData.subject}\n`;
      reply += `│ 📅 *Date:* ${mailData.date}\n`;
      reply += `╰────────────────────────\n\n`;
      reply += `*Content:*\n${cleanBody}`;

      await message.edit(reply, message.jid, waitMsg.key);
    } catch (err) {
      await message.sendReply("_Failed to fetch emails. Please verify the address and try again._");
    }
  }
);

// ==========================================
// 3. OCR - IMAGE TO TEXT (.ocr)
// ==========================================
Module(
  {
    pattern: "ocr ?(.*)",
    fromMe: fromMe,
    desc: "Extract text from an image",
    usage: "Reply to an image with .ocr",
    use: "utility",
  },
  async (message) => {
    if (!message.reply_message || (!message.reply_message.image && !message.reply_message.message?.imageMessage)) {
      return await message.sendReply("_Please reply to an image with .ocr to extract text!_");
    }

    let waitMsg;
    try {
      waitMsg = await message.sendReply("_🔍 Reading text from image..._");
      const imageBuffer = await message.reply_message.download();

      if (!imageBuffer) throw new Error("Could not download image");

      const base64Data = `data:image/jpeg;base64,${imageBuffer.toString("base64")}`;

      const res = await axios.post(
        "https://api.ocr.space/parse/image",
        toUrlEncoded({
          base64Image: base64Data,
          language: "eng",
          apikey: "helloworld",
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 25000,
        }
      );

      const parsedText = res.data?.ParsedResults?.[0]?.ParsedText?.trim();

      if (!parsedText) {
        return await message.edit("_No readable text found in this image!_", message.jid, waitMsg.key);
      }

      let reply = `╭───〔 *OCR EXTRACTED TEXT* 〕───\n\n`;
      reply += `${parsedText}\n\n`;
      reply += `╰────────────────────────`;

      await message.edit(reply, message.jid, waitMsg.key);
    } catch (err) {
      console.error("OCR Error:", err.message);
      if (waitMsg) await message.edit("_Failed to process image OCR. Try with a clearer picture._", message.jid, waitMsg.key);
      else await message.sendReply("_Failed to process OCR._");
    }
  }
);

// ==========================================
// 4. READ - VOICE NOTE / AUDIO TO TEXT (.read)
// ==========================================
Module(
  {
    pattern: "read ?(.*)",
    fromMe: fromMe,
    desc: "Transcribe voice note or audio to text",
    usage: "Reply to a voice note with .read",
    use: "utility",
  },
  async (message) => {
    if (!message.reply_message || (!message.reply_message.audio && !message.reply_message.message?.audioMessage)) {
      return await message.sendReply("_Please reply to a voice note or audio with .read!_");
    }

    let waitMsg;
    try {
      waitMsg = await message.sendReply("_🎙️ Listening and converting audio to text..._");
      const audioBuffer = await message.reply_message.download();

      if (!audioBuffer) throw new Error("Could not download audio");

      // Transcribe using public speech-to-text Whisper endpoint
      const res = await axios.post(
        "https://api.siputzx.my.id/api/ai/whisper",
        audioBuffer,
        {
          headers: { "Content-Type": "audio/ogg" },
          timeout: 30000,
        }
      );

      const transcript = res.data?.data || res.data?.result || res.data?.text;

      if (!transcript) {
        return await message.edit("_Could not understand the audio or speech was unclear!_", message.jid, waitMsg.key);
      }

      let reply = `╭───〔 *VOICE TRANSCRIPTION* 〕───\n\n`;
      reply += `"${transcript.trim()}"\n\n`;
      reply += `╰────────────────────────`;

      await message.edit(reply, message.jid, waitMsg.key);
    } catch (err) {
      console.error("Read command error:", err.message);
      if (waitMsg) await message.edit("_Voice recognition server is busy. Please try again!_", message.jid, waitMsg.key);
      else await message.sendReply("_Failed to transcribe audio._");
    }
  }
);
