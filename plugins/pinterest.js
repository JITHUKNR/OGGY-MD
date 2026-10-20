const { Module } = require("../main");
const { pinterestDl, pinterestSearch } = require("./utils");
const botConfig = require("../config");
const axios = require("axios");
const isFromMe = botConfig.MODE === "public" ? false : true;

// 1. ഫോട്ടോകളുടെ ക്വാളിറ്റി ഒട്ടും കുറയാതെ ഒറിജിനൽ റെസല്യൂഷൻ (Full HD / 4K) ആക്കാൻ
function getHdImageUrl(url) {
  if (!url || typeof url !== "string") return url;
  return url.replace(/\/(236x|474x|564x|736x)\//gi, "/originals/");
}

// 2. ഇമേജുകൾ 403 Forbidden ഇല്ലാതെ ഒറിജിനൽ ക്വാളിറ്റിയിൽ ഡൗൺലോഡ് ചെയ്യാൻ
async function fetchImageBuffer(url) {
  const hdUrl = getHdImageUrl(url);
  // Method A: Cloudflare Weserv Proxy (100% safe from 403 block)
  try {
    const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(hdUrl)}&output=jpg&q=100`;
    const res = await axios.get(proxyUrl, { responseType: "arraybuffer", timeout: 25000 });
    if (res.data && res.data.length > 500) {
      return Buffer.from(res.data);
    }
  } catch (e) {}

  // Method B: Direct Fetch without Referer
  try {
    const res = await axios.get(hdUrl, {
      responseType: "arraybuffer",
      headers: { "User-Agent": "okhttp/4.9.2" },
      timeout: 20000
    });
    if (res.data && res.data.length > 500) {
      return Buffer.from(res.data);
    }
  } catch (e) {}

  return null;
}

// 3. വീഡിയോകൾ 403 Forbidden ബ്ലോക്ക് ഇല്ലാതെ ബഫറായി എടുക്കാൻ
async function fetchVideoBuffer(url) {
  // Method A: Direct fetch without Referer
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      timeout: 45000
    });
    if (res.data && res.data.length > 1000) {
      return Buffer.from(res.data);
    }
  } catch (e) {}

  // Method B: Edge Proxy bypass
  try {
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
    const res = await axios.get(proxyUrl, { responseType: "arraybuffer", timeout: 45000 });
    if (res.data && res.data.length > 1000) {
      return Buffer.from(res.data);
    }
  } catch (e) {}

  return null;
}

Module(
  {
    pattern: "pinterest ?(.*)",
    fromMe: isFromMe,
    desc: "Smart High-Quality Pinterest Downloader",
    usage: ".pinterest link or query",
    use: "download",
  },
  async (message, match) => {
    let input = match[1] || (message.reply_message ? message.reply_message.text : "");
    input = input ? input.trim() : "";

    if (!input || input === "g") {
      return await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD PINTEREST* 〕━━━╮\n` +
        `┃ ❓ *Missing Input!*\n` +
        `┃ 📌 Provide a Pinterest link or search term.\n` +
        `┃ 📝 *Example:* \`.pinterest https://pin.it/...\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    // A. LINK DOWNLOAD (Videos & Photos)
    if (/\bhttps?:\/\/\S+/gi.test(input)) {
      const targetUrl = input.match(/\bhttps?:\/\/\S+/gi)[0];
      const quotedMessage = message.reply_message ? message.quoted : message.data;

      // Animated Progress Bar - Step 1
      const downloadMsg = await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
        `┃ 📥 *Fetching Pinterest Media...*\n` +
        `┃ ▰▰▱▱▱▱▱▱ 25%\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );

      let mediaUrl = null;

      // 1. ബോട്ടിന്റെ സ്വന്തം pinterestDl വഴി ലിങ്ക് എടുക്കുന്നു
      try {
        const pRes = await pinterestDl(targetUrl);
        if (pRes && pRes.result) {
          mediaUrl = pRes.result;
        }
      } catch (e) {}

      // 2. ബാക്ക്-അപ്പ് API-കൾ
      if (!mediaUrl) {
        const apis = [
          `https://api.siputzx.my.id/api/d/pinterest?url=${encodeURIComponent(targetUrl)}`,
          `https://bk9.fun/download/pinterest?url=${encodeURIComponent(targetUrl)}`,
          `https://api.davidcyriltech.my.id/download/pinterest?url=${encodeURIComponent(targetUrl)}`
        ];
        for (const api of apis) {
          try {
            const res = await axios.get(api, { timeout: 12000 });
            const d = res.data;
            const found = d?.data?.video_url || d?.data?.image_url || d?.data?.url || d?.BK9 || d?.result?.download_url || d?.result?.url || d?.result;
            if (found && typeof found === "string" && found.startsWith("http")) {
              mediaUrl = found;
              break;
            }
          } catch (e) {}
        }
      }

      if (!mediaUrl) {
        if (downloadMsg) {
          await message.edit(
            `╭━━━〔 ❌ *OGGY-MD ERROR* 〕━━━╮\n` +
            `┃ Failed to fetch Pinterest media!\n` +
            `┃ Ensure the pin link is valid.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`,
            message.jid,
            downloadMsg.key
          );
        }
        return;
      }

      const isVideo = mediaUrl.includes(".mp4") || mediaUrl.includes("/videos/");

      // Animated Progress Bar - Step 2
      if (downloadMsg && downloadMsg.key) {
        await message.edit(
          `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
          `┃ 🚀 *Downloading Original HD ${isVideo ? "Video" : "Photo"}...*\n` +
          `┃ ▰▰▰▰▰▰▰▱ 85%\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`,
          message.jid,
          downloadMsg.key
        ).catch(() => {});
      }

      // 3. മീഡിയ ബഫർ ഡൗൺലോഡ് ചെയ്യുന്നു
      let mediaBuffer = isVideo ? await fetchVideoBuffer(mediaUrl) : await fetchImageBuffer(mediaUrl);

      if (!mediaBuffer) {
        if (downloadMsg) {
          await message.edit("_❌ Failed to download high-resolution media!_", message.jid, downloadMsg.key);
        } else {
          await message.sendReply("_❌ Failed to download high-resolution media!_");
        }
        return;
      }

      // Animated Progress Bar - Step 3 (Completed)
      if (downloadMsg && downloadMsg.key) {
        await message.edit(
          `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
          `┃ ✨ *Uploading to WhatsApp...*\n` +
          `┃ ▰▰▰▰▰▰▰▰ 100%\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`,
          message.jid,
          downloadMsg.key
        ).catch(() => {});
      }

      const captionText =
        `╭━━━〔 ⚡ *OGGY-MD PINTEREST* 〕━━━╮\n` +
        `┃ 📸 *Type:* ${isVideo ? "HD Video" : "HD Photo"}\n` +
        `┃ ⚡ *Quality:* Original (No Loss)\n` +
        `┃ ✨ *Status:* Completed\n` +
        `┃ 🏷️ *Downloaded by WETFLAX*\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`;

      // 4. വാട്സാപ്പിലേക്ക് അയക്കുന്നു
      await message.sendMessage(
        mediaBuffer,
        isVideo ? "video" : "image",
        {
          quoted: quotedMessage,
          caption: captionText,
          mimetype: isVideo ? "video/mp4" : "image/jpeg"
        }
      );

      if (downloadMsg && downloadMsg.key) {
        const sock = message.client || message;
        await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
      }
    } 
    // B. SEARCH QUERY (.pinterest search_term)
    else {
      let desiredCount = parseInt(input.split(",")[1]) || 5;
      let searchQuery = input.split(",")[0] || input;
      try {
        const res = await pinterestSearch(searchQuery, desiredCount);
        if (!res || !res.status || !Array.isArray(res.result)) {
          return await message.sendReply("_No results found for this query_");
        }
        const searchResults = res.result;
        const toDownload = Math.min(desiredCount, searchResults.length);
        await message.sendReply(`_Downloading ${toDownload} results for ${searchQuery} from Pinterest_`);

        for (const url of searchResults.slice(0, toDownload)) {
          try {
            const imgBuf = await fetchImageBuffer(url);
            if (imgBuf) {
              await message.sendMessage(imgBuf, "image", { caption: `*Downloaded by WETFLAX*` });
            }
          } catch (e) {}
        }
      } catch (err) {
        return await message.sendReply("_Server error while searching Pinterest_");
      }
    }
  }
);
