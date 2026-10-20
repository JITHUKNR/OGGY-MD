const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");
const isFromMe = botConfig.MODE === "public" ? false : true;

// 1. Pinterest short links (pin.it) ഒറിജിനൽ ഡെസ്ക്ടോപ്പ് ലിങ്കിലേക്ക് മാറ്റുന്നു
async function expandPinUrl(url) {
  try {
    const res = await axios.get(url, {
      maxRedirects: 10,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      timeout: 10000,
    });
    return res.request?.res?.responseUrl || url;
  } catch (e) {
    return url;
  }
}

// 2. ഇമേജുകളുടെ ക്വാളിറ്റി ഒട്ടും കുറയാതെ 100% ഒറിജിനൽ റെസല്യൂഷൻ (Full HD / 4K) ആക്കുന്നു
function enhanceImageUrl(url) {
  if (!url || typeof url !== "string") return url;
  return url.replace(/\/(236x|474x|564x|736x)\//i, "/originals/");
}

// 3. VPS 403 Forbidden ബ്ലോക്ക് മറികടന്ന് ഫയൽ ഹൈ ക്വാളിറ്റി ബഫറായി ഡൗൺലോഡ് ചെയ്യുന്നു
async function getMediaBuffer(url) {
  // Method A: Direct Mobile Header
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "okhttp/4.9.2",
        Accept: "*/*",
      },
      timeout: 25000,
    });
    if (res.data && res.data.length > 1000) {
      return Buffer.from(res.data);
    }
  } catch (e) {}

  // Method B: Cloudflare Edge Proxy Bypass
  try {
    const pUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
    const res = await axios.get(pUrl, {
      responseType: "arraybuffer",
      timeout: 35000,
    });
    if (res.data && res.data.length > 1000) {
      return Buffer.from(res.data);
    }
  } catch (e) {}

  // Method C: Alternate Web Proxy Bypass
  try {
    const altUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
    const res = await axios.get(altUrl, {
      responseType: "arraybuffer",
      timeout: 35000,
    });
    if (res.data && res.data.length > 1000) {
      return Buffer.from(res.data);
    }
  } catch (e) {}

  return null;
}

// 4. Multi-Source Pinterest Scraper Engine
async function fetchPinterestMedia(targetUrl) {
  const apis = [
    `https://api.siputzx.my.id/api/d/pinterest?url=${encodeURIComponent(targetUrl)}`,
    `https://bk9.fun/download/pinterest?url=${encodeURIComponent(targetUrl)}`,
    `https://api.davidcyriltech.my.id/download/pinterest?url=${encodeURIComponent(targetUrl)}`,
    `https://api.vreden.web.id/api/pinterest?url=${encodeURIComponent(targetUrl)}`,
  ];

  for (const api of apis) {
    try {
      const res = await axios.get(api, { timeout: 12000 });
      const d = res.data;

      let videoUrl = d?.data?.video_url || d?.result?.video || d?.BK9?.video || null;
      let imageUrl = d?.data?.image_url || d?.data?.url || d?.result?.image || d?.BK9?.image || d?.BK9 || d?.result?.url || null;
      let title = d?.data?.title || d?.result?.title || d?.BK9?.title || "Pinterest Media";

      if (videoUrl && typeof videoUrl === "string" && videoUrl.startsWith("http")) {
        return { type: "video", url: videoUrl, title };
      }

      if (imageUrl && typeof imageUrl === "string" && imageUrl.startsWith("http")) {
        const isActuallyVideo = imageUrl.includes(".mp4") || imageUrl.includes("/videos/");
        return {
          type: isActuallyVideo ? "video" : "image",
          url: isActuallyVideo ? imageUrl : enhanceImageUrl(imageUrl),
          title,
        };
      }
    } catch (e) {
      continue;
    }
  }

  return null;
}

Module(
  {
    pattern: "pinterest ?(.*)",
    fromMe: isFromMe,
    desc: "Smart High-Quality Pinterest Downloader",
    usage: ".pinterest link",
    use: "download",
  },
  async (message, match) => {
    let input = match[1] || (message.reply_message ? message.reply_message.text : "");
    input = input ? input.trim() : "";

    if (!input) {
      return await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD PINTEREST* 〕━━━╮\n` +
        `┃ ❓ *Missing Link!*\n` +
        `┃ 📌 Provide a Pinterest post, video, or pin link.\n` +
        `┃ 📝 *Example:* \`.pinterest https://pin.it/...\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const matchedLinks = input.match(/\bhttps?:\/\/\S+/gi);
    if (!matchedLinks) {
      return await message.sendReply("_❌ Please provide a valid Pinterest URL!_");
    }

    let targetUrl = matchedLinks[0];
    let downloadMsg;

    try {
      // Animated Progress Bar - Step 1
      downloadMsg = await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
        `┃ 📥 *Fetching Pinterest Media...*\n` +
        `┃ ▰▰▱▱▱▱▱▱ 25%\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );

      // Short link expand
      if (targetUrl.includes("pin.it")) {
        targetUrl = await expandPinUrl(targetUrl);
      }

      const mediaData = await fetchPinterestMedia(targetUrl);

      if (!mediaData || !mediaData.url) {
        if (downloadMsg) {
          await message.edit(
            `╭━━━〔 ❌ *OGGY-MD ERROR* 〕━━━╮\n` +
            `┃ Failed to fetch Pinterest media!\n` +
            `┃ Ensure the pin is public and valid.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`,
            message.jid,
            downloadMsg.key
          );
        }
        return;
      }

      // Animated Progress Bar - Step 2
      if (downloadMsg && downloadMsg.key) {
        await message.edit(
          `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
          `┃ 🚀 *Downloading Original HD Media...*\n` +
          `┃ ▰▰▰▰▰▰▰▱ 85%\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`,
          message.jid,
          downloadMsg.key
        ).catch(() => {});
      }

      // Buffer download with proxy bypass
      const mediaBuffer = await getMediaBuffer(mediaData.url);

      if (!mediaBuffer) {
        if (downloadMsg) {
          await message.edit("_❌ Failed to download high-resolution media!_", message.jid, downloadMsg.key);
        } else {
          await message.sendReply("_❌ Failed to download high-resolution media!_");
        }
        return;
      }

      const quotedMessage = message.reply_message ? message.quoted : message.data;
      const isVideo = mediaData.type === "video";

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
        `┃ 📌 *Title:* ${mediaData.title}\n` +
        `┃ ⚡ *Quality:* Original HD\n` +
        `┃ ✨ *Status:* Downloaded\n` +
        `┃ 🏷️ *Downloaded by WETFLAX*\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`;

      // വാട്സാപ്പിലേക്ക് ഫുൾ ക്വാളിറ്റിയിൽ അയക്കുന്നു
      await message.sendMessage(mediaBuffer, isVideo ? "video" : "image", {
        caption: captionText,
        quoted: quotedMessage,
        mimetype: isVideo ? "video/mp4" : "image/jpeg",
      });

      // പ്രോഗ്രസ് ബാർ സന്ദേശം നീക്കം ചെയ്യുന്നു
      if (downloadMsg && downloadMsg.key) {
        const sock = message.client || message;
        await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
      }
    } catch (err) {
      console.error("Pinterest Plugin Error:", err?.message || err);
      if (downloadMsg) {
        await message.edit("_❌ Something went wrong, please try again!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_❌ Something went wrong, please try again!_");
      }
    }
  }
);
