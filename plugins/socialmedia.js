const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

let scraper = null;
try {
    scraper = require("ruhend-scraper");
} catch (e) {
    console.log("ruhend-scraper not installed, using APIs only.");
}

const isFromMe = botConfig.MODE === "public" ? false : true;

// --- PLATFORM DETECTORS ---
const YT_REGEX = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)/i;
const IG_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)/i;
const FB_REGEX = /(?:https?:\/\/)?(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch|fb\.com|fb\.gg)/i;
const TW_REGEX = /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter\.com|x\.com)/i;
const TK_REGEX = /(?:https?:\/\/)?(?:www\.|vt\.|vm\.)?(?:tiktok\.com)/i;
const SP_REGEX = /(?:https?:\/\/)?(?:open\.)?(?:spotify\.com)/i;
const PT_REGEX = /(?:https?:\/\/)?(?:www\.|in\.)?(?:pinterest\.com|pin\.it)/i;
const SC_REGEX = /(?:https?:\/\/)?(?:www\.|t\.)?(?:snapchat\.com)/i;

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

const extractUrl = (text) => {
    if (!text) return null;
    const match = text.match(URL_REGEX);
    return match ? match[0] : null;
};

const getPlatform = (url) => {
    if (YT_REGEX.test(url)) return 'youtube';
    if (IG_REGEX.test(url)) return 'instagram';
    if (FB_REGEX.test(url)) return 'facebook';
    if (TW_REGEX.test(url)) return 'twitter';
    if (TK_REGEX.test(url)) return 'tiktok';
    if (SP_REGEX.test(url)) return 'spotify';
    if (PT_REGEX.test(url)) return 'pinterest';
    if (SC_REGEX.test(url)) return 'snapchat';
    return 'unknown';
};

// Clean Instagram URLs to avoid tracking blocks
const cleanIgUrl = (url) => {
    try {
        const u = new URL(url);
        return `${u.origin}${u.pathname}`;
    } catch (e) {
        return url.split('?')[0];
    }
};

// --- MEDIA BUFFER & TYPE DETECTOR ---
async function fetchMediaBuffer(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 25000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Referer': 'https://www.instagram.com/'
        }
    });
    const contentType = res.headers['content-type'] || '';
    const isImage = contentType.includes('image') || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url);
    return {
        buffer: Buffer.from(res.data),
        type: isImage ? 'image' : 'video'
    };
}

// --- MULTI-ENGINE EXTRACTOR ---
async function downloadMedia(url, platform, reqType) {
    let mediaList = [];
    let caption = "";
    let title = "";

    // 1. YOUTUBE (Working API-FAA Engine)
    if (platform === 'youtube') {
        if (reqType === 'audio') {
            const res = await axios.get(`https://api-faa.my.id/faa/ytmp3?url=${encodeURIComponent(url)}`, { timeout: 15000 });
            if (!res.data?.status) throw new Error("YouTube Audio API failed");
            return { media: [res.data.result.mp3], title: res.data.result.title, isDirectAudio: true };
        } else {
            const res = await axios.get(`https://api-faa.my.id/faa/ytmp4?url=${encodeURIComponent(url)}`, { timeout: 15000 });
            if (!res.data?.status) throw new Error("YouTube Video API failed");
            return { media: [res.data.result.download_url], title: res.data.result.title, isDirectVideo: true };
        }
    }

    // 2. INSTAGRAM (Direct Scraper + 4 Fallbacks)
    if (platform === 'instagram') {
        const cleanUrl = cleanIgUrl(url);

        // Engine A: Direct Local Scraper (ruhend-scraper)
        if (scraper && scraper.igdl) {
            try {
                const res = await scraper.igdl(cleanUrl);
                const data = res.data || res;
                if (Array.isArray(data) && data.length > 0) {
                    const uniqueUrls = [...new Set(data.map(m => m.url).filter(Boolean))];
                    if (uniqueUrls.length > 0) return { media: uniqueUrls, caption: "📸 Instagram Media" };
                }
            } catch (e) {}
        }

        // Engine B: API-FAA Instagram
        try {
            const res = await axios.get(`https://api-faa.my.id/faa/igdl?url=${encodeURIComponent(cleanUrl)}`, { timeout: 10000 });
            const d = res.data?.result || res.data?.data;
            if (d) {
                if (Array.isArray(d)) mediaList = d.map(x => x.url || x);
                else if (d.url) mediaList = Array.isArray(d.url) ? d.url : [d.url];
                caption = d.caption || d.title || "";
                if (mediaList.length > 0) return { media: [...new Set(mediaList)], caption };
            }
        } catch (e) {}

        // Engine C: Widipe API
        try {
            const res = await axios.get(`https://widipe.com/download/igdl?url=${encodeURIComponent(cleanUrl)}`, { timeout: 10000 });
            const d = res.data?.result;
            if (Array.isArray(d) && d.length > 0) {
                mediaList = d.map(x => x.url).filter(Boolean);
                if (mediaList.length > 0) return { media: [...new Set(mediaList)], caption: "📸 Instagram Media" };
            }
        } catch (e) {}

        // Engine D: BK9 API
        try {
            const res = await axios.get(`https://bk9.fun/download/instagram?url=${encodeURIComponent(cleanUrl)}`, { timeout: 10000 });
            const d = res.data?.BK9;
            if (Array.isArray(d) && d.length > 0) {
                mediaList = d.map(x => x.url).filter(Boolean);
                if (mediaList.length > 0) return { media: [...new Set(mediaList)], caption: "📸 Instagram Media" };
            }
        } catch (e) {}

        throw new Error("Instagram link could not be fetched. Make sure you ran 'npm install ruhend-scraper' and the post is public.");
    }

    // 3. FACEBOOK (Direct Scraper + 3 Fallbacks)
    if (platform === 'facebook') {
        if (scraper && scraper.fbdl) {
            try {
                const res = await scraper.fbdl(url);
                const data = res.data || res;
                if (Array.isArray(data) && data.length > 0) {
                    return { media: [data[0].url], caption: "🔵 Facebook Video" };
                }
            } catch (e) {}
        }

        try {
            const res = await axios.get(`https://api-faa.my.id/faa/fbdl?url=${encodeURIComponent(url)}`, { timeout: 10000 });
            const d = res.data?.result || res.data?.data;
            const vUrl = d?.hd || d?.sd || d?.url || (Array.isArray(d) ? d[0]?.url : null);
            if (vUrl) return { media: [vUrl], caption: d?.title || "🔵 Facebook Video" };
        } catch (e) {}

        try {
            const res = await axios.get(`https://widipe.com/download/fbdl?url=${encodeURIComponent(url)}`, { timeout: 10000 });
            const d = res.data?.result;
            const vUrl = d?.hd || d?.sd || d?.url;
            if (vUrl) return { media: [vUrl], caption: d?.title || "🔵 Facebook Video" };
        } catch (e) {}

        throw new Error("Facebook video download failed. Check if the video is public.");
    }

    // 4. TIKTOK
    if (platform === 'tiktok') {
        if (scraper && scraper.ttdl) {
            try {
                const res = await scraper.ttdl(url);
                if (res && (res.video || res.audio)) {
                    return {
                        media: [reqType === 'audio' && res.audio ? res.audio : res.video],
                        caption: res.title || "🎵 TikTok Media",
                        isDirectAudio: reqType === 'audio'
                    };
                }
            } catch (e) {}
        }

        try {
            const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, { timeout: 10000 });
            const d = res.data?.data;
            if (d) {
                if (reqType === 'audio' && d.music) return { media: [d.music], title: d.title, isDirectAudio: true };
                if (d.images && d.images.length > 0) return { media: d.images, caption: d.title || "" };
                if (d.play) return { media: [d.play], caption: d.title || "" };
            }
        } catch (e) {}

        throw new Error("TikTok download failed.");
    }

    // 5. TWITTER / X
    if (platform === 'twitter') {
        try {
            const cleanTw = url.replace(/(twitter\.com|x\.com)/i, "api.vxtwitter.com");
            const res = await axios.get(cleanTw, { timeout: 10000 });
            if (res.data && res.data.media_extended && res.data.media_extended.length > 0) {
                return {
                    media: res.data.media_extended.map(m => m.url),
                    caption: res.data.text || "🐦 X / Twitter Media"
                };
            }
        } catch (e) {}
        throw new Error("Twitter/X download failed.");
    }

    // 6. PINTEREST & OTHER PLATFORMS
    try {
        const res = await axios.get(`https://bk9.fun/download/alldownload?url=${encodeURIComponent(url)}`, { timeout: 12000 });
        const d = res.data?.BK9;
        const mUrl = d?.high || d?.low || d?.url || (d?.medias && d.medias[0]?.url);
        if (mUrl) return { media: [mUrl], caption: d?.title || `🌐 Downloaded Media` };
    } catch (e) {}

    throw new Error(`Could not extract media from ${platform}.`);
}

// --- CORE EXECUTION FUNCTION ---
async function executeDownload(message, cmd, targetUrl) {
    const platform = getPlatform(targetUrl);
    if (platform === 'unknown') {
        return await message.sendReply("❌ *Invalid Link!* Supported: YouTube, Instagram, Facebook, TikTok, X, Pinterest.");
    }

    let reqType = 'video';
    if (['song', 'play', 'mp3', 'audio', 'yta'].includes(cmd)) reqType = 'audio';
    if (['photo', 'pic', 'image'].includes(cmd)) reqType = 'image';

    const waitMsg = await message.sendReply(`⚡ *Downloading ${platform.toUpperCase()} ${reqType}...*`);

    try {
        const data = await downloadMedia(targetUrl, platform, reqType);
        if (!data.media || data.media.length === 0) throw new Error("No media found in link.");

        const captionText = data.caption
            ? `📝 *Caption:* ${data.caption.substring(0, 600)}\n\n⚡ *OGGY-MD SYSTEM*`
            : data.title
            ? `🎬 *${data.title}*\n\n⚡ *OGGY-MD SYSTEM*`
            : `⚡ *OGGY-MD SYSTEM*`;

        // Direct YouTube / TikTok URL handling
        if (data.isDirectAudio) {
            await message.client.sendMessage(message.jid, {
                audio: { url: data.media[0] },
                mimetype: "audio/mpeg",
                fileName: `${data.title || 'audio'}.mp3`
            }, { quoted: message.data });
            if (waitMsg?.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
            return;
        }

        if (data.isDirectVideo) {
            await message.client.sendMessage(message.jid, {
                video: { url: data.media[0] },
                caption: captionText
            }, { quoted: message.data });
            if (waitMsg?.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
            return;
        }

        // Buffer-based handling for Instagram, Facebook, Carousels, and Audio Extraction
        for (let i = 0; i < data.media.length; i++) {
            const mUrl = data.media[i];
            if (!mUrl) continue;

            const { buffer, type } = await fetchMediaBuffer(mUrl);

            // If user requested SONG/AUDIO from Instagram Reel or FB Video
            if (reqType === 'audio') {
                if (type === 'image') {
                    throw new Error("This link is a Photo post and does not contain audio!");
                }
                await message.client.sendMessage(message.jid, {
                    audio: buffer,
                    mimetype: 'audio/mp4',
                    ptt: false
                }, { quoted: message.data });
                break; // Only send audio from the first video
            }

            // Send Video or Photo (Supports Full Carousel Slide Download)
            let msgObj = {};
            if (type === 'image') {
                msgObj.image = buffer;
            } else {
                msgObj.video = buffer;
            }

            if (i === 0) msgObj.caption = captionText;
            await message.client.sendMessage(message.jid, msgObj, { quoted: message.data });
        }

        if (waitMsg?.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

    } catch (err) {
        await message.sendReply(`❌ *Error:* ${err.message}`);
        if (waitMsg?.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
    }
}

// --- 1. COMMAND HANDLER (.song, .video, .photo, .ig, .fb) ---
Module(
    {
        pattern: "^[.]?(song|video|photo|play|mp3|mp4|pic|ig|insta|fb|tiktok|all)(?:\\s+(.*))?$",
        fromMe: isFromMe,
        desc: "All-in-One Social Media Downloader",
        usage: ".song / .video / .photo <link>",
        use: "download",
    },
    async (message, match) => {
        const cmd = match[1].toLowerCase();
        let query = match[2] ? match[2].trim() : '';

        if (!query && message.reply_message?.text) {
            query = message.reply_message.text.trim();
        }

        const targetUrl = extractUrl(query);

        // If no URL is given and user typed .song <song name>, search YouTube
        if (!targetUrl && ['song', 'play', 'mp3'].includes(cmd) && query) {
            const waitMsg = await message.sendReply(`🔎 *Searching YouTube for "${query}"...*`);
            try {
                const res = await axios.get(`https://api-faa.my.id/faa/ytplay?query=${encodeURIComponent(query)}`, { timeout: 15000 });
                if (!res.data?.status) throw new Error("Song not found");
                await message.client.sendMessage(message.jid, {
                    audio: { url: res.data.result.mp3 },
                    mimetype: "audio/mpeg",
                    fileName: `${res.data.result.title}.mp3`
                }, { quoted: message.data });
                if (waitMsg?.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
            } catch (e) {
                await message.sendReply(`❌ *Search failed:* Could not download "${query}".`);
                if (waitMsg?.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
            }
            return;
        }

        if (!targetUrl) {
            return await message.sendReply(
                `╭━━━〔 🌐 *OGGY-MD DOWNLOADER* 〕━━━╮\n` +
                `┃ 📌 *Reply to any link with:*\n` +
                `┃ • \`song\` - For Audio/MP3\n` +
                `┃ • \`video\` - For Video/MP4\n` +
                `┃ • \`photo\` - For Images/Slides\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
            );
        }

        await executeDownload(message, cmd, targetUrl);
    }
);

// --- 2. DIRECT REPLY HANDLER (Works even without dot prefix) ---
Module({ on: 'text', fromMe: isFromMe }, async (message) => {
    if (!message.jid || !message.reply_message?.text) return;
    const rawText = (message.text || message.message || '').trim().toLowerCase();

    // Only trigger if user replies with plain word (without dot, since Module 1 handles dot commands)
    if (['song', 'video', 'photo', 'mp3', 'mp4', 'pic', 'all', 'audio'].includes(rawText)) {
        const targetUrl = extractUrl(message.reply_message.text);
        if (targetUrl && getPlatform(targetUrl) !== 'unknown') {
            await executeDownload(message, rawText, targetUrl);
        }
    }
});
