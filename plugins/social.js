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
    pattern: "pinterest ?(.*)",
    fromMe: isFromMe,
    desc: "Pinterest downloader",
    usage: ".pinterest query or link",
    use: "download",
  },
  async (message, match) => {
    let userQuery = match[1] !== "" ? match[1] : message.reply_message?.text;
    if (userQuery === "g") return;
    if (!userQuery)
      return await message.sendReply("_Need search term or pin video link_");

    // 1. LINK DOWNLOAD
    if (/\bhttps?:\/\/\S+/gi.test(userQuery)) {
      userQuery = userQuery.match(/\bhttps?:\/\/\S+/gi)[0];
      const quotedMessage = message.reply_message ? message.quoted : message.data;
      await message.sendReply("*_Downloading media..._*");

      let mediaUrl = null;
      let isVideo = false;

      // METHOD 1: Multi-Source APIs (Insta പോലെ ഏറ്റവും വിശ്വസനീയമായ വഴികൾ)
      const apis = [
        `https://bk9.fun/download/pinterest?url=${encodeURIComponent(userQuery)}`,
        `https://api.davidcyriltech.my.id/download/pinterest?url=${encodeURIComponent(userQuery)}`,
        `https://api.siputzx.my.id/api/d/pinterest?url=${encodeURIComponent(userQuery)}`,
        `https://api.vreden.web.id/api/pinterest?url=${encodeURIComponent(userQuery)}`
      ];

      for (const api of apis) {
        try {
          const res = await axios.get(api, { timeout: 12000 });
          const d = res.data;
          const found = d?.BK9 || d?.result?.download_url || d?.result?.url || d?.result || d?.data?.video_url || d?.data?.image_url || d?.data?.url;
          if (found && typeof found === "string" && found.startsWith("http")) {
            mediaUrl = found;
            if (mediaUrl.includes(".mp4") || mediaUrl.includes("/videos/") || d?.data?.media_type === "video") {
              isVideo = true;
            }
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // METHOD 2: Bot-ന്റെ സ്വന്തം pinterestDl
      if (!mediaUrl) {
        try {
          const pRes = await pinterestDl(userQuery);
          if (pRes && pRes.result) {
            mediaUrl = pRes.result;
            if (mediaUrl.includes(".mp4") || mediaUrl.includes("/videos/")) isVideo = true;
          }
        } catch (e) {}
      }

      if (!mediaUrl) {
        return await message.sendReply("_Failed to find media link!_");
      }

      // 2. BUFFER DOWNLOAD (VPS 403 Forbidden ബ്ലോക്ക് മറികടക്കാൻ Cloudflare Proxy വഴി)
      let mediaBuffer = null;

      // A: Direct Fetch
      try {
        const directRes = await axios.get(mediaUrl, {
          responseType: "arraybuffer",
          headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
          },
          timeout: 20000
        });
        if (directRes.data && directRes.data.length > 1000) {
          mediaBuffer = Buffer.from(directRes.data);
        }
      } catch (e) {}

      // B: Cloudflare Edge Proxy ബൈപ്പാസ്
      if (!mediaBuffer) {
        try {
          const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(mediaUrl)}`;
          const proxyRes = await axios.get(proxyUrl, {
            responseType: "arraybuffer",
            timeout: 30000
          });
          if (proxyRes.data && proxyRes.data.length > 1000) {
            mediaBuffer = Buffer.from(proxyRes.data);
          }
        } catch (e) {}
      }

      // C: AllOrigins Proxy ബൈപ്പാസ്
      if (!mediaBuffer) {
        try {
          const altProxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(mediaUrl)}`;
          const altRes = await axios.get(altProxy, {
            responseType: "arraybuffer",
            timeout: 30000
          });
          if (altRes.data && altRes.data.length > 1000) {
            mediaBuffer = Buffer.from(altRes.data);
          }
        } catch (e) {}
      }

      if (!mediaBuffer) {
        return await message.sendReply("_Failed to download media!_");
      }

      // 3. SEND MESSAGE
      try {
        await message.sendMessage(
          mediaBuffer,
          isVideo ? "video" : "image",
          {
            quoted: quotedMessage,
            caption: "*Downloaded by WETFLAX*",
            mimetype: isVideo ? "video/mp4" : "image/jpeg"
          }
        );
      } catch (sendErr) {
        console.error("Pinterest send error:", sendErr);
        await message.sendReply("_Failed to send media!_");
      }
    } 
    // 2. SEARCH QUERY
    else {
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

    if (/\bhttps?:\/\/\S+/gi.test(userQuery)) {
      userQuery = userQuery.match(/\bhttps?:\/\/\S+/gi)[0];
      const quotedMessage = message.reply_message ? message.quoted : message.data;
      await message.sendReply("*_Downloading media..._*");

      const fs = require("fs");
      const { exec } = require("child_process");

      let mediaUrl = null;

      // 1. പ്രാഥമികമായി ബോട്ടിന്റെ ഒറിജിനൽ ഹൈ-ക്വാളിറ്റി ലിങ്ക് എടുക്കുന്നു
      try {
        const res = await pinterestDl(userQuery);
        if (res && res.result) mediaUrl = res.result;
      } catch (e) {}

      // 2. ലഭിച്ചില്ലെങ്കിൽ ബാക്ക്-അപ്പ് API
      if (!mediaUrl) {
        try {
          const apiRes = await axios.get(`https://api.siputzx.my.id/api/d/pinterest?url=${encodeURIComponent(userQuery)}`, { timeout: 15000 });
          mediaUrl = apiRes.data?.data?.video_url || apiRes.data?.data?.image_url || apiRes.data?.data?.url;
        } catch (e) {}
      }

      if (!mediaUrl) {
        return await message.sendReply("_Failed to find media link!_");
      }

      const isVideo = mediaUrl.includes(".mp4") || mediaUrl.includes("/videos/");
      const tempPath = `/tmp/pin_${Date.now()}.${isVideo ? "mp4" : "jpg"}`;

      // 3. 403 Forbidden ബ്ലോക്ക് മറികടക്കാൻ ലിനക്സ് curl വഴി ഒറിജിനൽ ക്വാളിറ്റിയിൽ ഡൗൺലോഡ് ചെയ്യുന്നു
      const curlCmd = `curl -s -L -k -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" "${mediaUrl}" -o "${tempPath}"`;

      exec(curlCmd, { timeout: 60000 }, async (curlErr) => {
        if (!curlErr && fs.existsSync(tempPath) && fs.statSync(tempPath).size > 1000) {
          try {
            await message.sendMessage(
              fs.readFileSync(tempPath),
              isVideo ? "video" : "image",
              {
                quoted: quotedMessage,
                caption: "*Downloaded by WETFLAX*",
                mimetype: isVideo ? "video/mp4" : "image/jpeg"
              }
            );
          } catch (sendError) {
            console.error("Pinterest send error:", sendError);
            await message.sendReply("_Failed to send media!_");
          } finally {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          }
        } else {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          return await message.sendReply("_Failed to download media!_");
        }
      });
    }
 else {
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
