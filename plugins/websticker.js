const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const isFromMe = botConfig.MODE === "public" ? false : true;

// ടെമ്പ് ഫയലുകൾ താൽക്കാലികമായി സൂക്ഷിക്കാനുള്ള ഫോൾഡർ
const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) {
  try {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  } catch (e) {}
}

// -------------------------------------------------------------
// 1. VPS ബ്ലോക്കാവാത്ത മൾട്ടി-പ്ലാറ്റ്‌ഫോം ഇമേജ് സെർച്ച് എഞ്ചിൻ
//    (Bing Web, Pinterest, Lexica & AI Fallback)
// -------------------------------------------------------------
async function fetchWebStickerMedia(query, limit = 5) {
  const collectedUrls = [];

  // എഞ്ചിൻ 1: Bing Async Crawler (Google, Reddit, Pinterest ചിത്രങ്ങൾ VPS-ൽ ബ്ലോക്കാവാതെ എടുക്കുന്നു)
  try {
    const searchUrl = `https://www.bing.com/images/async?q=${encodeURIComponent(
      query + " sticker transparent png"
    )}&mmasync=1&count=20`;

    const res = await axios.get(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      timeout: 8000
    });

    const html = res.data || "";
    // Bing async HTML-ൽ നിന്നുള്ള യഥാർത്ഥ മീഡിയ ലിങ്കുകൾ ഫിൽട്ടർ ചെയ്യുന്നു
    const regex1 = /murl&quot;:&quot;(https?:\/\/[^&]+)&quot;/g;
    const regex2 = /"murl":"(https?:\/\/[^"]+)"/g;

    let match;
    while ((match = regex1.exec(html)) !== null) {
      const decoded = decodeURIComponent(match[1]);
      if (!collectedUrls.includes(decoded) && !decoded.includes(".svg")) {
        collectedUrls.push(decoded);
        if (collectedUrls.length >= limit) break;
      }
    }

    if (collectedUrls.length < limit) {
      while ((match = regex2.exec(html)) !== null) {
        const decoded = decodeURIComponent(match[1]);
        if (!collectedUrls.includes(decoded) && !decoded.includes(".svg")) {
          collectedUrls.push(decoded);
          if (collectedUrls.length >= limit) break;
        }
      }
    }
  } catch (e) {}

  // എഞ്ചിൻ 2: Pinterest Direct Pins via Bing
  if (collectedUrls.length < limit) {
    try {
      const pinUrl = `https://www.bing.com/images/async?q=${encodeURIComponent(
        query + " site:pinterest.com sticker"
      )}&mmasync=1&count=15`;

      const pinRes = await axios.get(pinUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        },
        timeout: 7000
      });

      const pinHtml = pinRes.data || "";
      const pinRegex = /murl&quot;:&quot;(https?:\/\/[^&]+)&quot;/g;
      let pMatch;
      while ((pMatch = pinRegex.exec(pinHtml)) !== null) {
        const decoded = decodeURIComponent(pMatch[1]);
        if (!collectedUrls.includes(decoded) && !decoded.includes(".svg")) {
          collectedUrls.push(decoded);
          if (collectedUrls.length >= limit) break;
        }
      }
    } catch (e) {}
  }

  // എഞ്ചിൻ 3: Lexica Art HD Graphic Search
  if (collectedUrls.length < limit) {
    try {
      const lexUrl = `https://lexica.art/api/v1/search?q=${encodeURIComponent(
        query + " sticker"
      )}`;
      const lexRes = await axios.get(lexUrl, { timeout: 6000 });
      const images = lexRes.data?.images || [];
      for (const img of images) {
        if (img.src && !collectedUrls.includes(img.src)) {
          collectedUrls.push(img.src);
          if (collectedUrls.length >= limit) break;
        }
      }
    } catch (e) {}
  }

  // എഞ്ചിൻ 4: 100% ഗ്യാരണ്ടീഡ് ഫോൾബാക്ക് (ഒരിക്കലും പരാജയപ്പെടാതിരിക്കാൻ)
  let fallbackIndex = 1;
  while (collectedUrls.length < limit) {
    const seed = `${Date.now()}_${fallbackIndex}`;
    collectedUrls.push(
      `https://image.pollinations.ai/prompt/${encodeURIComponent(
        query + " cute sticker illustration, white border, transparent background, vector cartoon, 4k"
      )}?width=512&height=512&nologo=true&seed=${seed}`
    );
    fallbackIndex++;
  }

  return collectedUrls.slice(0, limit);
}

// -------------------------------------------------------------
// 2. മീഡിയ ഡൗൺലോഡ് ചെയ്ത് 512x512 WebP സ്റ്റിക്കറാക്കി മാറ്റുന്ന എഞ്ചിൻ
// -------------------------------------------------------------
async function convertUrlToStickerBuffer(mediaUrl) {
  const randomId = `${Date.now()}_${Math.floor(Math.random() * 999999)}`;
  const isGif = mediaUrl.includes(".gif");
  const ext = isGif ? "gif" : "png";
  const tempInput = path.join(TEMP_DIR, `raw_${randomId}.${ext}`);
  const tempOutput = path.join(TEMP_DIR, `sticker_${randomId}.webp`);

  try {
    const response = await axios({
      method: "GET",
      url: mediaUrl,
      responseType: "arraybuffer",
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/*,*/*"
      }
    });

    fs.writeFileSync(tempInput, Buffer.from(response.data));

    // FFmpeg വഴി WhatsApp-ന്റെ കൃത്യമായ 512x512 WebP ഫോർമാറ്റിലേക്ക് മാറ്റുന്നു
    return await new Promise((resolve) => {
      const animSettings = isGif
        ? "-t 3 -r 15 -loop 0 -vsync 0 -pix_fmt yuva420p"
        : "-vframes 1";

      const ffmpegCmd = `ffmpeg -y -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000" ${animSettings} -c:v libwebp -lossless 0 -q:v 70 -preset default -an "${tempOutput}"`;

      exec(ffmpegCmd, (err) => {
        try {
          if (!err && fs.existsSync(tempOutput) && fs.statSync(tempOutput).size > 0) {
            const stickerData = fs.readFileSync(tempOutput);
            return resolve(stickerData);
          }

          // സാധാരണ സ്കെയിലിംഗ് ബാക്ക്-അപ്പ് കമാൻഡ്
          const fallbackCmd = `ffmpeg -y -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease" -c:v libwebp -q:v 70 "${tempOutput}"`;
          exec(fallbackCmd, (fbErr) => {
            if (!fbErr && fs.existsSync(tempOutput) && fs.statSync(tempOutput).size > 0) {
              return resolve(fs.readFileSync(tempOutput));
            }
            resolve(null);
          });
        } catch (e) {
          resolve(null);
        } finally {
          if (fs.existsSync(tempInput)) try { fs.unlinkSync(tempInput); } catch (e) {}
          if (fs.existsSync(tempOutput)) try { fs.unlinkSync(tempOutput); } catch (e) {}
        }
      });
    });
  } catch (err) {
    if (fs.existsSync(tempInput)) try { fs.unlinkSync(tempInput); } catch (e) {}
    if (fs.existsSync(tempOutput)) try { fs.unlinkSync(tempOutput); } catch (e) {}
    return null;
  }
}

// -------------------------------------------------------------
// 3. കമാൻഡ്: .websticker / .ws / websticker
// -------------------------------------------------------------
Module(
  {
    pattern: "[.]?(websticker|ws|wsticker) ?(.*)",
    fromMe: isFromMe,
    desc: "Search Google, Pinterest, Reddit & auto-send 5 stickers",
    usage: "websticker <query>",
    use: "sticker",
  },
  async (message, match) => {
    const query = match[2] ? match[2].trim() : "";

    if (!query) {
      return await message.sendReply(
        `╭━━━〔 🎨 *WEB STICKER ENGINE* 〕━━━╮\n` +
        `┃ ⚠️ എന്തെങ്കിലും ഒരു വാക്ക് നൽകുക!\n` +
        `┃\n` +
        `┃ 💡 *ഉദാഹരണങ്ങൾ:*\n` +
        `┃ • \`websticker cat meme\`\n` +
        `┃ • \`websticker mohanlal\`\n` +
        `┃ • \`websticker shinchan funny\`\n` +
        `┃ • \`websticker anime aesthetic\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply(
      `_🔎 "${query}" ഇന്റർനെറ്റിൽ നിന്ന് തിരഞ്ഞ് 5 സ്റ്റിക്കറുകൾ തയ്യാറാക്കുന്നു... കാത്തിരിക്കൂ..._`
    );

    try {
      // 1. മികച്ച 5 മീഡിയ ലിങ്കുകൾ കണ്ടെത്തുന്നു
      const mediaList = await fetchWebStickerMedia(query, 5);

      let sentCount = 0;

      // 2. ഓരോ മീഡിയയും ഡൗൺലോഡ് ചെയ്ത് തുടരെ സ്റ്റിക്കറായി അയക്കുന്നു
      for (let i = 0; i < mediaList.length; i++) {
        const itemUrl = mediaList[i];
        const stickerBuffer = await convertUrlToStickerBuffer(itemUrl);

        if (stickerBuffer && stickerBuffer.length > 0) {
          try {
            await message.client.sendMessage(
              message.jid,
              {
                sticker: stickerBuffer
              },
              { quoted: i === 0 ? message.data : undefined }
            );
            sentCount++;
            // വാട്‌സാപ്പ് സ്പാം നിയന്ത്രണം വരാതിരിക്കാൻ ചെറിയൊരു ഇടവേള (500ms)
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (sendErr) {
            console.error("[STICKER SEND ERROR]", sendErr.message);
          }
        }
      }

      // ലോഡിംഗ് മെസ്സേജ് മായ്ക്കുന്നു
      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }

      if (sentCount === 0) {
        await message.sendReply(
          `_⚠️ സ്റ്റിക്കറുകൾ തയ്യാറാക്കാൻ സാധിച്ചില്ല. വീണ്ടും ശ്രമിക്കുക._`
        );
      }
    } catch (err) {
      console.error("[WEBSTICKER ERROR]", err.message);
      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
      await message.sendReply(
        `_❌ സ്റ്റിക്കറുകൾ ലഭ്യമാക്കാൻ സാധിച്ചില്ല: ${err.message}_`
      );
    }
  }
);
