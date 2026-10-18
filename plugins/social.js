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

// Hybrid Instagram Extractor: Native bot engine first + fallback APIs
async function getInstagramMedia(url) {
  const cleanUrl = url.split("?")[0].replace(/\/+$/, "") + "/";
  let results = [];

  // 1. Primary: Use bot's built-in downloadGram (reliable for Reels and standard posts)
  if (typeof downloadGram === "function") {
    try {
      const res = await downloadGram(cleanUrl);
      if (Array.isArray(res) && res.length > 0) {
        results = res;
      }
    } catch (e) {
      console.error("downloadGram error:", e.message);
    }
  }

  // 2. Fallback: If native engine fails or is empty, try fast backup APIs
  if (!results.length) {
    const backupApis = [
      `https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(cleanUrl)}`,
      `https://api.davidcyriltech.my.id/download/instagram?url=${encodeURIComponent(cleanUrl)}`,
      `https://widipe.com/download/ytdl?url=${encodeURIComponent(cleanUrl)}`,
      `https://delirius-apiofc.vercel.app/download/instagram?url=${encodeURIComponent(cleanUrl)}`
    ];

    for (const api of backupApis) {
      try {
        const resp = await axios.get(api, { timeout: 12000 });
        let items = [];
        if (Array.isArray(resp.data?.data)) items = resp.data.data;
        else if (Array.isArray(resp.data?.result)) items = resp.data.result;
        else if (Array.isArray(resp.data?.urls)) items = resp.data.urls;
        else if (resp.data?.url) items = [resp.data.url];

        if (items && items.length > 0) {
          results = items
            .map((i) => (typeof i === "string" ? i : (i.url || i.download_url || i.video || i.image)))
            .filter(Boolean);
          if (results.length > 0) break;
        }
      } catch (err) {
        continue;
      }
    }
  }

  return results;
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
      const mediaUrls = await getInstagramMedia(targetUrl);

      if (!mediaUrls || !mediaUrls.length) {
        if (downloadMsg) {
          await message.edit(
            "_Failed to download! Post might be private, restricted, or expired._",
            message.jid,
            downloadMsg.key
          );
        }
        return;
      }

      const quotedMessage = message.reply_message ? message.quoted : message.data;

      // Single item (Reel or single image)
      if (mediaUrls.length === 1) {
        const url = mediaUrls[0];
        const type = await getMediaType(url);
        await message.sendMessage({ url }, type, { quoted: quotedMessage });
      } 
      // Multiple items (Carousel slides)
      else {
        try {
          const albumObject = [];
          for (const u of mediaUrls) {
            const type = await getMediaType(u);
            albumObject.push(type === "video" ? { video: u } : { image: u });
          }
          albumObject[0].caption = `_Download complete! (${mediaUrls.length} items)_`;
          await message.client.albumMessage(message.jid, albumObject, message.data);
        } catch (albumErr) {
          // If albumMessage fails, send each file with a safe 1.2s delay
          for (let i = 0; i < mediaUrls.length; i++) {
            const u = mediaUrls[i];
            const type = await getMediaType(u);
            await message.sendMessage(
              { url: u },
              type,
              {
                caption: `_Slide ${i + 1} of ${mediaUrls.length}_`,
                quoted: quotedMessage,
              }
            );
            if (i < mediaUrls.length - 1) {
              await new Promise((r) => setTimeout(r, 1200));
            }
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
        await message.edit(
          "_Something went wrong, Please try again!_",
          message.jid,
          downloadMsg.key
        );
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
