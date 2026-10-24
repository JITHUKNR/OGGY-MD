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
// 1. മൾട്ടി-പ്ലാറ്റ്‌ഫോം ഇമേജ് & GIF സെർച്ച് എഞ്ചിൻ
//    (Google, Reddit, Pinterest, Tenor, Giphy അഗ്രഗേറ്റർ)
// -------------------------------------------------------------
async function fetchWebStickerMedia(query, limit = 5) {
  const collectedMedia = [];

  // എഞ്ചിൻ 1: ഡക്ക്ഡക്ക്ഗോ & ഗൂഗിൾ ലൈവ് വെബ് ക്രോളർ (Transparent Stickers & Pinterest Pins)
  try {
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(
      query + " sticker transparent png pinterest reddit"
    )}&iax=images&ia=images`;

    const tokenRes = await axios.get(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      },
      timeout: 7000
    });

    const vqdMatch = tokenRes.data.match(/vqd=["']?([0-9-]+)["']?/);
    if (vqdMatch && vqdMatch[1]) {
      const vqd = vqdMatch[1];
      const imgApiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(
        query + " sticker transparent png"
      )}&vqd=${vqd}&f=,,,&p=1`;

      const imgRes = await axios.get(imgApiUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        },
        timeout: 7000
      });

      const results = imgRes.data?.results || [];
      for (const item of results) {
        if (
          item.image &&
          !item.image.includes("lookaside") &&
          !item.image.endsWith(".svg")
        ) {
          collectedMedia.push({
            url: item.image,
            source: item.source || "Google / Web"
          });
          if (collectedMedia.length >= limit) break;
        }
      }
    }
  } catch (e) {}

  // എഞ്ചിൻ 2: Reddit ഒഫീഷ്യൽ ഇമേജ് സെർച്ച് ബാക്ക്-അപ്പ് (Reddit Memes & Stickers)
  if (collectedMedia.length < limit) {
    try {
      const redditUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(
        query + " sticker"
      )}&sort=relevance&limit=15`;

      const redRes = await axios.get(redditUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        },
        timeout: 6000
      });

      const posts = redRes.data?.data?.children || [];
      for (const post of posts) {
        const pUrl = post.data?.url_overridden_by_dest || post.data?.url;
        if (
          pUrl &&
          (pUrl.endsWith(".png") ||
            pUrl.endsWith(".jpg") ||
            pUrl.endsWith(".jpeg") ||
            pUrl.endsWith(".webp") ||
            pUrl.endsWith(".gif"))
        ) {
          if (!collectedMedia.some((m) => m.url === pUrl)) {
            collectedMedia.push({ url: pUrl, source: "Reddit" });
            if (collectedMedia.length >= limit) break;
          }
        }
      }
    } catch (e) {}
  }

  // എഞ്ചിൻ 3: Pinterest Direct Search ബാക്ക്-അപ്പ്
  if (collectedMedia.length < limit) {
    try {
      const pinSearchUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(
        query + " site:pinterest.com sticker aesthetic"
      )}&vqd=4-1&f=,,,&p=1`;

      const pinRes = await axios.get(pinSearchUrl, { timeout: 6000 });
      const pinResults = pinRes.data?.results || [];
      for (const p of pinResults) {
        if (p.image && !collectedMedia.some((m) => m.url === p.image)) {
          collectedMedia.push({ url: p.image, source: "Pinterest" });
          if (collectedMedia.length >= limit) break;
        }
      }
    } catch (e) {}
  }

  // എഞ്ചിൻ 4: ആനിമേഷൻ / GIF ബാക്ക്-അപ്പ് (Tenor & Klipartz)
  if (collectedMedia.length < limit) {
    try {
      const gifUrl = `https://g.tenor.com/v1/search?q=${encodeURIComponent(
        query
      )}&key=LIVDSRZULELA&limit=5`;
      const gifRes = await axios.get(gifUrl, { timeout: 6000 });
      const gResults = gifRes.data?.results || [];
      for (const g of gResults) {
        const gifMedia =
          g.media?.[0]?.gif?.url || g.media?.[0]?.mediumgif?.url;
        if (gifMedia && !collectedMedia.some((m) => m.url === gifMedia)) {
          collectedMedia.push({ url: gifMedia, source: "Tenor / GIF" });
          if (collectedMedia.length >= limit) break;
        }
      }
    } catch (e) {}
  }

  return collectedMedia.slice(0, limit);
}

// -------------------------------------------------------------
// 2. മീഡിയ ഡൗൺലോഡ് ചെയ്ത് 512x512 WebP സ്റ്റിക്കറാക്കി മാറ്റുന്ന എഞ്ചിൻ
// -------------------------------------------------------------
async function convertUrlToStickerBuffer(mediaUrl) {
  const randomId = `${Date.now()}_${Math.floor(Math.random() * 999999)}`;
  const ext = mediaUrl.includes(".gif") ? "gif" : "png";
  const tempInput = path.join(TEMP_DIR, `raw_${randomId}.${ext}`);
  const tempOutput = path.join(TEMP_DIR, `sticker_${randomId}.webp`);

  try {
    const response = await axios({
      method: "GET",
      url: mediaUrl,
      responseType: "arraybuffer",
      timeout: 12000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }
    });

    fs.writeFileSync(tempInput, Buffer.from(response.data));

    // FFmpeg വഴി WhatsApp-ന്റെ കൃത്യമായ 512x512 ട്രാൻസ്പാരന്റ് സ്റ്റിക്കർ ഫോർമാറ്റിലേക്ക് മാറ്റുന്നു
    return await new Promise((resolve, reject) => {
      const isGif = ext === "gif" || mediaUrl.includes(".gif");
      const animSettings = isGif
        ? "-t 4 -r 15 -loop 0 -vsync 0 -pix_fmt yuva420p"
        : "-vframes 1";

      const ffmpegCmd = `ffmpeg -y -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000" ${animSettings} -c:v libwebp -lossless 0 -q:v 70 -preset default -an "${tempOutput}"`;

      exec(ffmpegCmd, (err) => {
        try {
          if (err || !fs.existsSync(tempOutput)) {
            // FFmpeg പരാജയപ്പെട്ടാൽ ഇൻപുട്ട് നേരിട്ട് നൽകാൻ ശ്രമിക്കുന്നു
            if (fs.existsSync(tempInput)) {
              return resolve(fs.readFileSync(tempInput));
            }
            return reject(err || new Error("Sticker conversion failed"));
          }
          const stickerData = fs.readFileSync(tempOutput);
          resolve(stickerData);
        } catch (e) {
          reject(e);
        } finally {
          if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
          if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
        }
      });
    });
  } catch (err) {
    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
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
        `┃ • \`websticker messi goal\`\n` +
        `┃ • \`websticker anime aesthetic\`\n` +
        `┃\n` +
        `┃ 🌐 _Google, Pinterest, Reddit എന്നിവയിൽ നിന്ന്_\n` +
        `┃    _5 ഒറിജിനൽ സ്റ്റിക്കറുകൾ ഓട്ടോമാറ്റിക്കായി അയക്കും!_\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply(
      `_🔎 "${query}" ഗൂഗിൾ, റെഡ്ഡിറ്റ്, Pinterest എന്നിവയിൽ നിന്ന് തിരഞ്ഞ് 5 സ്റ്റിക്കറുകൾ തയ്യാറാക്കുന്നു... കാത്തിരിക്കൂ..._`
    );

    try {
      // 1. മികച്ച 5 മീഡിയ ലിങ്കുകൾ കണ്ടെത്തുന്നു
      const mediaList = await fetchWebStickerMedia(query, 5);

      if (!mediaList || mediaList.length === 0) {
        if (waitMsg && waitMsg.key) {
          await message.client.sendMessage(message.jid, { delete: waitMsg.key });
        }
        return await message.sendReply(
          `_❌ "${query}" എന്ന വിഷയത്തിൽ ചിത്രങ്ങളോ സ്റ്റിക്കറുകളോ കണ്ടെത്താൻ കഴിഞ്ഞില്ല! മറ്റൊരു വാക്ക് നൽകി നോക്കുക._`
        );
      }

      let sentCount = 0;

      // 2. ഓരോ മീഡിയയും ഡൗൺലോഡ് ചെയ്ത് കൺവേർട്ട് ചെയ്ത് തുടരെ സ്റ്റിക്കറായി അയക്കുന്നു
      for (let i = 0; i < mediaList.length; i++) {
        const item = mediaList[i];
        const stickerBuffer = await convertUrlToStickerBuffer(item.url);

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
            // വാട്‌സാപ്പ് സ്പാം ബ്ലോക്ക് വരാതിരിക്കാൻ ചെറിയൊരു ഇടവേള (600ms)
            await new Promise((resolve) => setTimeout(resolve, 600));
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
          `_⚠️ സ്റ്റിക്കർ നിർമ്മിക്കുന്നതിൽ തടസ്സം നേരിട്ടു. ദയവായി അല്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക._`
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
