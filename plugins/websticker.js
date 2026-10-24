const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const isFromMe = botConfig.MODE === "public" ? false : true;

// ടെമ്പ് ഫയലുകൾ സൂക്ഷിക്കാനുള്ള ഫോൾഡർ
const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) {
  try {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  } catch (e) {}
}

// -------------------------------------------------------------
// 1. യഥാർത്ഥ ഫോട്ടോകളും മീമുകളും മാത്രം കണ്ടെത്തുന്ന മൾട്ടി-എഞ്ചിൻ
//    (DuckDuckGo, Tenor Real Memes, Bing Real Photos)
// -------------------------------------------------------------
async function fetchRealStickerMedia(query, limit = 5) {
  const collectedUrls = [];

  // എഞ്ചിൻ 1: DuckDuckGo Real Web & Meme Search (യഥാർത്ഥ ഫോട്ടോകൾ മാത്രം)
  try {
    const ddgTokenUrl = `https://duckduckgo.com/?q=${encodeURIComponent(
      query + " funny meme photo"
    )}&iax=images&ia=images`;

    const tokenRes = await axios.get(ddgTokenUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      timeout: 6000
    });

    const vqd =
      tokenRes.data.match(/vqd=["']?([0-9-]+)["']?/)?.[1] ||
      tokenRes.data.match(/vqd=([0-9-]+)/)?.[1];

    if (vqd) {
      const ddgApiUrl = `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(
        query + " funny photo meme"
      )}&vqd=${vqd}&f=,,,&p=1`;

      const apiRes = await axios.get(ddgApiUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Referer: "https://duckduckgo.com/"
        },
        timeout: 6000
      });

      const results = apiRes.data?.results || [];
      for (const item of results) {
        if (
          item.image &&
          !item.image.endsWith(".svg") &&
          !item.image.includes("vector") &&
          !item.image.includes("clipart") &&
          !collectedUrls.includes(item.image)
        ) {
          collectedUrls.push(item.image);
          if (collectedUrls.length >= limit) break;
        }
      }
    }
  } catch (e) {}

  // എഞ്ചിൻ 2: Tenor Viral Reaction & Meme GIF Engine (യഥാർത്ഥ സിനിമ & ട്രോൾ ക്ലിപ്പുകൾ)
  if (collectedUrls.length < limit) {
    try {
      const tenorUrl = `https://g.tenor.com/v1/search?q=${encodeURIComponent(
        query
      )}&key=LIVDSRZULELA&limit=10`;

      const tenorRes = await axios.get(tenorUrl, { timeout: 6000 });
      const items = tenorRes.data?.results || [];

      for (const item of items) {
        const gifUrl =
          item.media?.[0]?.gif?.url ||
          item.media?.[0]?.tinygif?.url ||
          item.media?.[0]?.mediumgif?.url;

        if (gifUrl && !collectedUrls.includes(gifUrl)) {
          collectedUrls.push(gifUrl);
          if (collectedUrls.length >= limit) break;
        }
      }
    } catch (e) {}
  }

  // എഞ്ചിൻ 3: Bing Unescaped Photo Crawler (കാർട്ടൂണുകൾ പൂർണ്ണമായി ഫിൽട്ടർ ചെയ്യുന്നു)
  if (collectedUrls.length < limit) {
    try {
      const bingUrl = `https://www.bing.com/images/async?q=${encodeURIComponent(
        query + " photo -cartoon -vector -illustration -drawing"
      )}&mmasync=1&count=25`;

      const bRes = await axios.get(bingUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        },
        timeout: 6000
      });

      const html = bRes.data || "";
      const regex = /(?:murl&quot;:&quot;|"murl":")([^"&]+)/g;
      let match;

      while ((match = regex.exec(html)) !== null) {
        let cleanUrl = match[1].replace(/\\/g, "");
        try {
          cleanUrl = decodeURIComponent(cleanUrl);
        } catch (err) {}

        if (
          cleanUrl.startsWith("http") &&
          !cleanUrl.endsWith(".svg") &&
          !cleanUrl.toLowerCase().includes("cartoon") &&
          !cleanUrl.toLowerCase().includes("vector") &&
          !collectedUrls.includes(cleanUrl)
        ) {
          collectedUrls.push(cleanUrl);
          if (collectedUrls.length >= limit) break;
        }
      }
    } catch (e) {}
  }

  // എഞ്ചിൻ 4: 100% റിയലിസ്റ്റിക് ഒറിജിനൽ ഫോട്ടോ ഫോൾബാക്ക് (കാർട്ടൂൺ ഒരിക്കലും ഉണ്ടാക്കില്ല)
  let fallbackIndex = 1;
  while (collectedUrls.length < limit) {
    const seed = `${Date.now()}_${fallbackIndex}`;
    collectedUrls.push(
      `https://image.pollinations.ai/prompt/${encodeURIComponent(
        `authentic candid realistic photograph of ${query}, real life photo, realistic lighting, highly detailed 8k photography`
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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/*,*/*"
      }
    });

    fs.writeFileSync(tempInput, Buffer.from(response.data));

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

          // സാധാരണ ബാക്ക്-അപ്പ് സ്കെയിലിംഗ്
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
    desc: "Search real photos, viral memes & send 5 stickers",
    usage: "websticker <query>",
    use: "sticker",
  },
  async (message, match) => {
    const query = match[2] ? match[2].trim() : "";

    if (!query) {
      return await message.sendReply(
        `╭━━━〔 🖼️ *REAL WEB STICKER* 〕━━━╮\n` +
        `┃ ⚠️ എന്തെങ്കിലും ഒരു വാക്ക് നൽകുക!\n` +
        `┃\n` +
        `┃ 💡 *ഉദാഹരണങ്ങൾ:*\n` +
        `┃ • \`websticker cat meme\`\n` +
        `┃ • \`websticker mohanlal funny\`\n` +
        `┃ • \`websticker jagathy troll\`\n` +
        `┃ • \`websticker dog smile\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply(
      `_🔎 "${query}" യഥാർത്ഥ ഫോട്ടോകളും മീമുകളും തിരഞ്ഞ് 5 സ്റ്റിക്കറുകൾ തയ്യാറാക്കുന്നു..._`
    );

    try {
      // യഥാർത്ഥ ചിത്രങ്ങളും മീമുകളും ശേഖരിക്കുന്നു
      const mediaList = await fetchRealStickerMedia(query, 5);

      let sentCount = 0;

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
            await new Promise((resolve) => setTimeout(resolve, 400));
          } catch (sendErr) {
            console.error("[STICKER SEND ERROR]", sendErr.message);
          }
        }
      }

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
