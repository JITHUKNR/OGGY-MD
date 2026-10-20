const { Module } = require("../main");
const {
  downloadGram,
  tiktok,
  igStalk,
  fb,
} = require("./utils");
const botConfig = require("../config");
const axios = require("axios");
const isFromMe = botConfig.MODE === "public" ? false : true;

async function checkRedirect(url) {
  let split_url = url.split("/");
  if (split_url.includes("share")) {
    let res = await axios.get(url);
    return res.request.res.responseUrl;
  }
  return url;
}

// Media type detector (Prevents images from being sent as corrupted videos)
async function getMediaType(url) {
  if (/\.(mp4|mkv|mov)(\?|$)/i.test(url)) return "video";
  if (/\.(jpg|jpeg|png|webp|heic)(\?|$)/i.test(url)) return "image";
  try {
    const head = await axios.head(url, { timeout: 5000 });
    const type = head.headers["content-type"] || "";
    if (type.includes("video")) return "video";
    if (type.includes("image")) return "image";
  } catch (e) {}
  if (url.includes("mp4") || url.includes("video")) return "video";
  return "image";
}

// Multi-Source Instagram Extractor: Full Carousel & Reel Support
async function getInstagramMedia(url) {
  const cleanUrl = url.split("?")[0].replace(/\/+$/, "");
  let results = [];

  // METHOD 1: High-Performance Multi-Item Carousel APIs
  const apis = [
    `https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(cleanUrl)}`,
    `https://bk9.fun/download/instagram?url=${encodeURIComponent(cleanUrl)}`,
    `https://api.vreden.web.id/api/igdownload?url=${encodeURIComponent(cleanUrl)}`,
    `https://api.davidcyriltech.my.id/download/instagram?url=${encodeURIComponent(cleanUrl)}`
  ];

  for (const api of apis) {
    try {
      const resp = await axios.get(api, { timeout: 12000 });
      let items = [];
      const d = resp.data;

      if (Array.isArray(d?.data)) items = d.data;
      else if (Array.isArray(d?.BK9)) items = d.BK9;
      else if (Array.isArray(d?.result)) items = d.result;
      else if (Array.isArray(d?.urls)) items = d.urls;
      else if (d?.url) items = [d.url];

      if (items && items.length > 0) {
        const extracted = items
          .map((i) => (typeof i === "string" ? i : (i.url || i.download_url || i.video || i.image)))
          .filter(Boolean);

        if (extracted.length > results.length) {
          results = extracted;
        }
        // If multiple carousel slides found, prioritize immediately
        if (results.length > 1) break;
      }
    } catch (err) {
      continue;
    }
  }

  // METHOD 2: Native downloadGram fallback if APIs return nothing
  if (!results.length && typeof downloadGram === "function") {
    try {
      const res = await downloadGram(cleanUrl + "/");
      if (Array.isArray(res) && res.length > 0) {
        results = res;
      }
    } catch (e) {}
  }

  return results;
}

Module(
  {
    pattern: "insta ?(.*)",
    fromMe: isFromMe,
    desc: "Instagram post/reel/carousel downloader",
    usage: "insta link(s)",
    use: "download",
  },
  async (message, match) => {
    let mediaLinks = match[1] || message.reply_message?.text;
    if (!mediaLinks || mediaLinks.startsWith("ll")) {
      return await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD INSTA* 〕━━━╮\n` +
        `┃ ❓ *Missing Link!*\n` +
        `┃ 📌 Provide an Instagram post or reel link.\n` +
        `┃ 📝 *Example:* \`.insta https://instagram.com/...\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const allUrls = mediaLinks.match(/\bhttps?:\/\/\S+/gi) || [];
    if (!allUrls.length) {
      return await message.sendReply("_❌ Please provide a valid Instagram URL!_");
    }

    let targetUrl = allUrls[0];
    targetUrl = await checkRedirect(targetUrl);

    if (!targetUrl.includes("instagram.com")) {
      return await message.sendReply("_❌ Need a valid Instagram link!_");
    }

    let downloadMsg;
    try {
      // Animated Progress Bar - Step 1
      downloadMsg = await message.sendReply(
        `╭━━━〔 ⚡ *OGGY-MD* 〕━━━╮\n` +
        `┃ 📥 *Fetching Instagram Media...*\n` +
        `┃ ▰▰▱▱▱▱▱▱ 25%\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );

      const mediaUrls = await getInstagramMedia(targetUrl);

      if (!mediaUrls || !mediaUrls.length) {
        if (downloadMsg) {
          await message.edit(
            `╭━━━〔 ❌ *OGGY-MD ERROR* 〕━━━╮\n` +
            `┃ Failed to fetch Instagram media!\n` +
            `┃ Ensure the post is public and accessible.\n` +
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
          `┃ 🚀 *Uploading Media (${mediaUrls.length} Items)...*\n` +
          `┃ ▰▰▰▰▰▰▰▰ 100%\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`,
          message.jid,
          downloadMsg.key
        ).catch(() => {});
      }

      const quotedMessage = message.reply_message ? message.quoted : message.data;

      // CASE A: Single Media Item (Reel or Single Photo)
      if (mediaUrls.length === 1) {
        const url = mediaUrls[0];
        const type = await getMediaType(url);
        await message.sendMessage(
          { url },
          type,
          {
            caption: `╭━━━〔 ⚡ *OGGY-MD INSTA* 〕━━━╮\n┃ ✨ *Status:* Downloaded\n┃ 👤 *Source:* Instagram\n╰━━━━━━━━━━━━━━━━━━━━━╯`,
            quoted: quotedMessage,
          }
        );
      } 
      // CASE B: Multi-Item Carousel (All Slides 1 to N)
      else {
        for (let i = 0; i < mediaUrls.length; i++) {
          const u = mediaUrls[i];
          const type = await getMediaType(u);
          await message.sendMessage(
            { url: u },
            type,
            {
              caption: `╭━━━〔 ⚡ *OGGY-MD INSTA* 〕━━━╮\n┃ 📸 *Slide:* ${i + 1} of ${mediaUrls.length}\n┃ ⚡ *Status:* Completed\n╰━━━━━━━━━━━━━━━━━━━━━╯`,
              quoted: quotedMessage,
            }
          );
          // 1-second pause to prevent WhatsApp message rate-limiting
          if (i < mediaUrls.length - 1) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      if (downloadMsg && downloadMsg.key) {
        const sock = message.client || message;
        await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
      }
    } catch (err) {
      console.error("Insta error:", err?.message || err);
      if (downloadMsg) {
        await message.edit("_❌ Something went wrong, please try again!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_❌ Something went wrong, please try again!_");
      }
    }
  }
);

Module(
  {
    pattern: "fb ?(.*)",
    fromMe: isFromMe,
    desc: "Facebook video downloader",
    usage: "fb link or reply to a link",
    use: "download",
  },
  async (message, match) => {
    let videoLink = !message.reply_message?.message
      ? match[1]
      : message.reply_message.message;

    if (/\bhttps?:\/\/\S+/gi.test(videoLink)) {
      videoLink = videoLink.match(/\bhttps?:\/\/\S+/gi)[0];
    }
    if (!videoLink) return await message.sendReply("_Need facebook link_");
    try {
      const { url } = await fb(videoLink);
      return await message.sendReply({ url }, "video");
    } catch (e) {
      console.error("Facebook download error:", e.message);
      return await message.sendReply(
        "_Something went wrong, Please try again!_"
      );
    }
  }
);

Module(
  {
    pattern: "ig ?(.*)",
    fromMe: isFromMe,
    desc: "Gets account info from instagram",
    usage: "ig username",
    excludeFromCommands: true,
    use: "search",
  },
  async (message, match) => {
    if (!match[1]) return await message.sendReply("_Need Instagram username!_");

    if (match[1].startsWith("https") && match[1].includes("instagram")) {
      const usernameRegex = /instagram\.com\/([^/?]+)/i;
      const usernameMatch = match[1].match(usernameRegex);
      match[1] = usernameMatch && usernameMatch[1];
    }

    try {
      var accountInfo = await igStalk(encodeURIComponent(match[1]));
    } catch {
      return await message.sendReply("_Server busy!_");
    }

    await message.sendMessage({ url: accountInfo.profile_pic }, "image", {
      caption: `_*Name:*_ ${accountInfo.full_name}\n_*Followers:*_ ${
        accountInfo.followers
      }\n_*Following:*_ ${accountInfo.following}\n_*Bio:*_ ${
        accountInfo.bio
      }\n_*Private account:*_ ${
        accountInfo.is_private ? "Yes" : "No"
      } \n_*Posts:*_ ${accountInfo.posts}`,
      quoted: message.data,
    });
  }
);

Module(
  {
    pattern: "story ?(.*)",
    fromMe: isFromMe,
    desc: "Instagram stories downloader",
    usage: ".story username or link",
    use: "download",
  },
  async (message, match) => {
    let userIdentifier =
      match[1] !== "" ? match[1] : message.reply_message.text;

    if (
      userIdentifier &&
      (userIdentifier.includes("/reel/") ||
        userIdentifier.includes("/tv/") ||
        userIdentifier.includes("/p/"))
    )
      return;
    if (!userIdentifier)
      return await message.sendReply("_Need an Instagram username or link!_");

    userIdentifier = !/\bhttps?:\/\/\S+/gi.test(userIdentifier)
      ? `https://instagram.com/stories/${userIdentifier}/`
      : userIdentifier.match(/\bhttps?:\/\/\S+/gi)[0];

    try {
      var storyData = await downloadGram(userIdentifier);
    } catch {
      return await message.sendReply("*_Sorry, server error_*");
    }
    if (!storyData || !storyData.length)
      return await message.sendReply("*_Not found!_*");
    if (storyData.length === 1)
      return await message.sendReply(
        { url: storyData[0] },
        /\.(jpg|jpeg|png|webp)(\?|$)/i.test(storyData[0]) ? "image" : "video"
      );
    userIdentifier = userIdentifier
      .replace("https://instagram.com/stories/", "")
      .split("/")[0];
    let albumObject = storyData.map((storyMediaUrl) => {
      return /\.(jpg|jpeg|png|webp)(\?|$)/i.test(storyMediaUrl)
        ? { image: storyMediaUrl }
        : { video: storyMediaUrl };
    });
    albumObject[0].caption = `_Stories from ${userIdentifier}_`;
    return await message.client.albumMessage(
      message.jid,
      albumObject,
      message.data
    );
  }
);

Module(
  {
    pattern: "tiktok ?(.*)",
    fromMe: isFromMe,
    desc: "TikTok video downloader",
    usage: ".tiktok reply or link",
    use: "download",
  },
  async (message, match) => {
    let videoLink = match[1] !== "" ? match[1] : message.reply_message.text;
    if (!videoLink) return await message.sendReply("_Need a TikTok URL_");
    videoLink = videoLink.match(/\bhttps?:\/\/\S+/gi)[0];
    let downloadResult;
    try {
      downloadResult = await tiktok(videoLink);
      await message.sendReply(downloadResult, "video");
    } catch (error) {
      return await message.sendReply(
        "_Something went wrong, Please try again!_"
      );
    }
  }
);
