const { Module } = require("../main");
const {
  pinterestSearch,
  downloadGram,
  pinterestDl,
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
// Carousel & Reel Bulletproof Instagram Extractor (All Slides Guaranteed)
async function fetchInstagramMedia(rawUrl) {
  const cleanUrl = rawUrl.split("?")[0].replace(/\/+$/, "") + "/";

  // Dedicated multi-slide & carousel API endpoints
  const endpoints = [
    `https://widipe.com/download/igslide?url=${encodeURIComponent(cleanUrl)}`,
    `https://delirius-apiofc.vercel.app/download/instagram?url=${encodeURIComponent(cleanUrl)}`,
    `https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(cleanUrl)}`,
    `https://api.vreden.web.id/api/igdownload?url=${encodeURIComponent(cleanUrl)}`,
    `https://api.davidcyriltech.my.id/download/instagram?url=${encodeURIComponent(cleanUrl)}`
  ];

  let singleFallback = null;

  for (const ep of endpoints) {
    try {
      const res = await axios.get(ep, { timeout: 15000 });
      let items = [];

      if (Array.isArray(res.data?.result)) {
        items = res.data.result;
      } else if (Array.isArray(res.data?.data)) {
        items = res.data.data;
      } else if (Array.isArray(res.data?.urls)) {
        items = res.data.urls;
      } else if (res.data?.data?.carousel_media && Array.isArray(res.data.data.carousel_media)) {
        items = res.data.data.carousel_media;
      } else if (res.data?.url) {
        items = [res.data.url];
      }

      if (items && items.length > 0) {
        const parsed = [];
        for (const item of items) {
          let directUrl = null;
          let isVid = false;

          if (typeof item === "string") {
            directUrl = item;
          } else if (typeof item === "object") {
            directUrl = item.url || item.download_url || item.video || item.image || item.display_url || (item.image_versions2?.candidates?.[0]?.url);
            isVid = item.is_video === true || item.type === "video" || !!item.video_versions;
          }

          if (!directUrl) continue;
          const hasVidExt = /\.(mp4|mkv|mov)(\?|$)/i.test(directUrl);

          parsed.push({
            url: directUrl,
            type: (isVid || hasVidExt) ? "video" : "image"
          });
        }

        // If multiple items (Carousel) found, immediately return all of them!
        if (parsed.length > 1) {
          return parsed;
        }

        // Keep single item as fallback if no API provides full carousel
        if (parsed.length === 1 && !singleFallback) {
          singleFallback = parsed;
        }
      }
    } catch (e) {
      continue;
    }
  }

  if (singleFallback && singleFallback.length > 0) {
    return singleFallback;
  }

  throw new Error("Failed to fetch Instagram media");
}

Module(
  {
    pattern: "insta ?(.*)",
    fromMe: isFromMe,
    desc: "Instagram post/reel/tv/carousel downloader",
    usage: "insta link(s)",
    use: "download",
  },
  async (message, match) => {
    let mediaLinks = match[1] || message.reply_message?.text;
    if (!mediaLinks || mediaLinks.startsWith("ll")) {
      return await message.sendReply("_*Need Instagram link(s)*_");
    }

    const allUrls = mediaLinks.match(/\bhttps?:\/\/\S+/gi) || [];
    if (!allUrls.length) return await message.sendReply("_*Need Instagram link(s)*_");

    let targetUrl = allUrls[0];
    targetUrl = await checkRedirect(targetUrl);

    if (!targetUrl.includes("instagram.com")) {
      return await message.sendReply("_Need a valid Instagram link!_");
    }

    let downloadMsg;
    try {
      downloadMsg = await message.sendReply("_📥 Downloading Instagram media..._");
      const mediaList = await fetchInstagramMedia(targetUrl);

      if (!mediaList || !mediaList.length) {
        if (downloadMsg) await message.edit("_No downloadable media found!_", message.jid, downloadMsg.key);
        return;
      }

      const quotedMessage = message.reply_message ? message.quoted : message.data;

      // Loop through all images/videos with safe delay to prevent WhatsApp rate limits
      for (let i = 0; i < mediaList.length; i++) {
        const item = mediaList[i];
        const caption = mediaList.length > 1 ? `_Slide ${i + 1} of ${mediaList.length}_` : "";

        try {
          if (item.type === "video") {
            await message.sendMessage({ url: item.url }, "video", {
              caption: caption,
              quoted: quotedMessage
            });
          } else {
            await message.sendMessage({ url: item.url }, "image", {
              caption: caption,
              quoted: quotedMessage
            });
          }
        } catch (sendErr) {
          console.error(`Failed to send slide ${i + 1}:`, sendErr.message);
        }

        // 1.5 seconds delay between each photo
        if (i < mediaList.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }

      if (downloadMsg && downloadMsg.key) {
        const sock = message.client || message;
        await sock.sendMessage(message.jid, { delete: downloadMsg.key }).catch(() => {});
      }
    } catch (err) {
      console.error("Insta error:", err?.message || err);
      if (downloadMsg) {
        await message.edit("_Failed to download! Post might be private or link expired._", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Something went wrong, Please try again!_");
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
    pattern: "pinterest ?(.*)",
    fromMe: isFromMe,
    desc: "Pinterest downloader",
    usage: ".pinterest query or link",
    use: "download",
  },
  async (message, match) => {
    let userQuery = match[1] !== "" ? match[1] : message.reply_message.text;
    if (userQuery === "g") return;
    if (!userQuery)
      return await message.sendReply("_Need search term or pin video link_");

    if (/\bhttps?:\/\/\S+/gi.test(userQuery)) {
      userQuery = userQuery.match(/\bhttps?:\/\/\S+/gi)[0];
      let pinterestResult;
      try {
        pinterestResult = await pinterestDl(userQuery);
      } catch (err) {
        console.error("pinterestDl error:", err?.message || err);
        return await message.sendReply("_Server error_");
      }

      if (
        !pinterestResult ||
        !pinterestResult.status ||
        !pinterestResult.result
      )
        return await message.sendReply(
          "_No downloadable media found for this link_"
        );

      const url = pinterestResult.result;
      const quotedMessage = message.reply_message
        ? message.quoted
        : message.data;
      await message.sendMessage({ url }, "video", { quoted: quotedMessage });
    } else {
      let desiredCount = parseInt(userQuery.split(",")[1]) || 5;
      let searchQuery = userQuery.split(",")[0] || userQuery;
      let searchResults;
      try {
        const res = await pinterestSearch(searchQuery, desiredCount);
        if (!res || !res.status || !Array.isArray(res.result)) {
          return await message.sendReply("_No results found for this query_");
        }
        searchResults = res.result;
      } catch (err) {
        console.error("pinterestSearch error:", err?.message || err);
        return await message.sendReply(
          "_Server error while searching Pinterest_"
        );
      }

      const toDownload = Math.min(desiredCount, searchResults.length);
      await message.sendReply(
        `_Downloading ${toDownload} results for ${searchQuery} from Pinterest_`
      );

      const imagesToSend = searchResults
        .slice(0, toDownload)
        .map((url) => ({ image: url }));
      imagesToSend[0].caption = `_Pinterest results for ${searchQuery}_`;
      try {
        await message.client.albumMessage(
          message.jid,
          imagesToSend,
          message.data
        );
      } catch (error) {
        console.log(
          "Album send failed, falling back to individual sends:",
          error
        );
        for (const url of searchResults) {
          try {
            await message.sendMessage({ url }, "image");
          } catch (error) {
            console.error(
              "Error downloading pinterest item:",
              error?.message || error
            );
          }
        }
      }
    }
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
