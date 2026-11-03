const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

let scraper = null;
try {
    scraper = require("ruhend-scraper");
} catch (e) {}

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

// --- Helper: Extract Reply Text Safely in Raganork ---
const getReplyText = (message) => {
    if (!message.reply_message) return "";
    return (
        message.reply_message.text ||
        message.reply_message.message ||
        message.reply_message.caption ||
        message.reply_message?.data?.message?.conversation ||
        message.reply_message?.data?.message?.extendedTextMessage?.text ||
        ""
    );
};

// --- Helper: Resolve Facebook / Share Redirect Links ---
async function resolveRedirectUrl(url) {
    try {
        const res = await axios.get(url, {
            maxRedirects: 5,
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        });
        return res.request?.res?.responseUrl || url;
    } catch (e) {
        return e.request?.res?.responseUrl || url;
    }
}

// --- Helper: Clean Instagram URLs ---
const cleanIgUrl = (url) => {
    try {
        const u = new URL(url);
        return `${u.origin}${u.pathname}`;
    } catch (e) {
        return url.split('?')[0];
    }
};

// --- Helper: Clean YouTube URLs ---
const cleanYtUrl = (url) => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/);
    return match && match[1] ? `https://www.youtube.com/watch?v=${match[1]}` : url;
};

// --- Buffer Downloader ---
async function fetchMediaBuffer(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 45000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': '*/*'
        }
    });
    const contentType = res.headers['content-type'] || '';
    if (contentType.includes('text/html') || res.data.byteLength < 1000) {
        throw new Error("Invalid media stream");
    }
    const isImage = contentType.includes('image') || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url);
    return {
        buffer: Buffer.from(res.data),
        type: isImage ? 'image' : 'video'
    };
}

// --- Cobalt Universal Engine (Works for IG, FB, YT, TikTok, X) ---
async function tryCobaltInstances(targetUrl, isAudio) {
    const instances = [
        "https://cobalt-api.kwiatekmiki.com",
        "https://cobalt.api.timelessnesses.me",
        "https://api.cobalt.blackcat.sweeux.org"
    ];

    for (const instance of instances) {
        try {
            const res = await axios.post(instance, {
                url: targetUrl,
                downloadMode: isAudio ? "audio" : "auto",
                videoQuality: "720"
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 10000
            });

            if (res.data?.url) {
                return { media: [res.data.url], caption: "" };
            }
            if (res.data?.picker && Array.isArray(res.data.picker)) {
                return { media: res.data.picker.map(p => p.url).filter(Boolean), caption: "" };
            }
        } catch (e) {}
    }
    return null;
}

// --- MAIN MULTI-ENGINE DOWNLOADER ---
async function downloadMedia(url, platform, reqType) {
    const isAudio = reqType === 'audio';

    // 1. YOUTUBE (Avoid IP-locked googlevideo links by using CDN-tunneled APIs)
    if (platform === 'youtube') {
        const cleanUrl = cleanYtUrl(url);

        // Try Cobalt first
        const cob = await tryCobaltInstances(cleanUrl, isAudio);
        if (cob) return cob;

        if (isAudio) {
            // Engine 1: FAA Audio (Works reliably via their proxy)
            try {
                const res = await axios.get(`https://api-faa.my.id/faa/ytmp3?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
                if (res.data?.result?.mp3) return { media: [res.data.result.mp3], title: res.data.result.title };
            } catch (e) {}

            // Engine 2: Agatz Audio
            try {
                const res = await axios.get(`https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
                const dl = res.data?.data?.downloadUrl || res.data?.data?.url;
                if (dl) return { media: [dl], title: res.data?.data?.title };
            } catch (e) {}
        } else {
            // Video Engine 1: Agatz YTMP4 (CDN link, not IP locked)
            try {
                const res = await axios.get(`https://api.agatz.xyz/api/ytmp4?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
                const dl = res.data?.data?.downloadUrl || res.data?.data?.url;
                if (dl && !dl.includes('googlevideo.com')) return { media: [dl], title: res.data?.data?.title };
            } catch (e) {}

            // Video Engine 2: Delirius YTMP4
            try {
                const res = await axios.get(`https://delirius-apiofc.vercel.app/download/ytmp4?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
                const dl = res.data?.data?.download?.url;
                if (dl) return { media: [dl], title: res.data?.data?.title };
            } catch (e) {}

            // Video Engine 3: Siputzx YTMP4
            try {
                const res = await axios.get(`https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
                const dl = res.data?.data?.dl;
                if (dl) return { media: [dl], title: res.data?.data?.title };
            } catch (e) {}
        }

        throw new Error("YouTube server busy. Please try again.");
    }

    // 2. INSTAGRAM
    if (platform === 'instagram') {
        const cleanUrl = cleanIgUrl(url);

        // Try Cobalt
        const cob = await tryCobaltInstances(cleanUrl, isAudio);
        if (cob) return cob;

        // Try Local Ruhend Scraper
        if (scraper && scraper.igdl) {
            try {
                const res = await scraper.igdl(cleanUrl);
                const data = res.data || res;
                if (Array.isArray(data) && data.length > 0) {
                    const urls = [...new Set(data.map(m => m.url).filter(Boolean))];
                    if (urls.length > 0) return { media: urls, caption: "📸 Instagram Media" };
                }
            } catch (e) {}
        }

        // Try Delirius IG API
        try {
            const res = await axios.get(`https://delirius-apiofc.vercel.app/download/instagram?url=${encodeURIComponent(cleanUrl)}`, { timeout: 12000 });
            const d = res.data?.data;
            if (Array.isArray(d) && d.length > 0) {
                return { media: d.map(x => x.url).filter(Boolean), caption: "📸 Instagram Media" };
            }
        } catch (e) {}

        // Try Agatz IG API
        try {
            const res = await axios.get(`https://api.agatz.xyz/api/instagram?url=${encodeURIComponent(cleanUrl)}`, { timeout: 12000 });
            const d = res.data?.data;
            if (Array.isArray(d) && d.length > 0) {
                return { media: d.map(x => x.url || x).filter(Boolean), caption: "📸 Instagram Media" };
            }
        } catch (e) {}

        throw new Error("Could not extract Instagram link.");
    }

    // 3. FACEBOOK (Resolves /share/r/ links first!)
    if (platform === 'facebook') {
        const resolvedUrl = await resolveRedirectUrl(url);

        // Try Cobalt
        const cob = await tryCobaltInstances(resolvedUrl, isAudio);
        if (cob) return cob;

        // Try Local Ruhend Scraper with resolved URL
        if (scraper && scraper.fbdl) {
            try {
                const res = await scraper.fbdl(resolvedUrl);
                const data = res.data || res;
                if (Array.isArray(data) && data.length > 0) {
                    return { media: [data[0].url], caption: "🔵 Facebook Video" };
                }
            } catch (e) {}
        }

        // Try Delirius FB API
        try {
            const res = await axios.get(`https://delirius-apiofc.vercel.app/download/facebook?url=${encodeURIComponent(resolvedUrl)}`, { timeout: 12000 });
            const urls = res.data?.urls;
            if (Array.isArray(urls) && urls.length > 0) {
                const bestUrl = urls[0].hd || urls[0].sd || urls[0].url;
                if (bestUrl) return { media: [bestUrl], caption: res.data?.title || "🔵 Facebook Video" };
            }
        } catch (e) {}

        // Try Agatz FB API
        try {
            const res = await axios.get(`https://api.agatz.xyz/api/facebook?url=${encodeURIComponent(resolvedUrl)}`, { timeout: 12000 });
            const d = res.data?.data;
            const bestUrl = d?.hd || d?.sd || d?.url;
            if (bestUrl) return { media: [bestUrl], caption: d?.title || "🔵 Facebook Video" };
        } catch (e) {}

        throw new Error("Facebook download failed. Ensure the video is public.");
    }

    // 4. TIKTOK
    if (platform === 'tiktok') {
        try {
            const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, { timeout: 12000 });
            const d = res.data?.data;
            if (d) {
                if (isAudio && d.music) return { media: [d.music], title: d.title };
                if (d.images && d.images.length > 0) return { media: d.images, caption: d.title || "" };
                if (d.play) return { media: [d.play], caption: d.title || "" };
            }
        } catch (e) {}
        throw new Error("TikTok download failed.");
    }

    // 5. TWITTER / X
    if (platform === 'twitter') {
        const cleanTw = url.split('?')[0].replace(/(twitter\.com|x\.com)/i, "api.vxtwitter.com");
        const res = await axios.get(cleanTw, { timeout: 10000 });
        if (res.data?.media_extended?.length > 0) {
            return {
                media: res.data.media_extended.map(m => m.url),
                caption: res.data.text || "🐦 X Media"
            };
        }
        throw new Error("Twitter/X download failed.");
    }

    // 6. OTHER PLATFORMS (Pinterest, Threads, Snapchat)
    const cob = await tryCobaltInstances(url, isAudio);
    if (cob) return cob;

    throw new Error(`Could not extract media from ${platform}.`);
}

// --- SINGLE UNIFIED COMMAND MODULE (No duplicate listeners!) ---
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

        // Safely extract link from replied message if not provided directly
        if (!query) {
            query = getReplyText(message).trim();
        }

        const targetUrl = extractUrl(query);

        // If user typed .song <song name> without a link, search YouTube
        if (!targetUrl && ['song', 'play', 'mp3'].includes(cmd) && query) {
            const waitMsg = await message.sendReply(`🔎 *Searching YouTube for "${query}"...*`);
            try {
                const res = await axios.get(`https://api-faa.my.id/faa/ytplay?query=${encodeURIComponent(query)}`, { timeout: 15000 });
                if (!res.data?.result?.mp3) throw new Error("Song not found");
                const { buffer } = await fetchMediaBuffer(res.data.result.mp3);
                await message.client.sendMessage(message.jid, {
                    audio: buffer,
                    mimetype: "audio/mpeg",
                    fileName: `${res.data.result.title || 'song'}.mp3`
                }, { quoted: message.data });
                if (waitMsg?.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
            } catch (e) {
                await message.sendReply(`❌ *Search failed:* Try sending a direct link.`);
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

        const platform = getPlatform(targetUrl);
        if (platform === 'unknown') {
            return await message.sendReply("❌ *Unsupported link!* Try YouTube, Instagram, Facebook, TikTok, or X.");
        }

        let reqType = 'video';
        if (['song', 'play', 'mp3', 'audio'].includes(cmd)) reqType = 'audio';
        if (['photo', 'pic', 'image'].includes(cmd)) reqType = 'image';

        const waitMsg = await message.sendReply(`⚡ *Downloading ${platform.toUpperCase()} ${reqType}...*`);

        try {
            const data = await downloadMedia(targetUrl, platform, reqType);
            if (!data.media || data.media.length === 0) throw new Error("No media found.");

            const captionText = data.caption
                ? `📝 ${data.caption.substring(0, 600)}\n\n⚡ *OGGY-MD SYSTEM*`
                : data.title
                ? `🎬 *${data.title}*\n\n⚡ *OGGY-MD SYSTEM*`
                : `⚡ *OGGY-MD SYSTEM*`;

            for (let i = 0; i < data.media.length; i++) {
                const mUrl = data.media[i];
                if (!mUrl) continue;

                // Always download into buffer on VPS first so Baileys never crashes on IP-locked streams
                const { buffer, type } = await fetchMediaBuffer(mUrl);

                if (reqType === 'audio') {
                    await message.client.sendMessage(message.jid, {
                        audio: buffer,
                        mimetype: 'audio/mp4',
                        ptt: false
                    }, { quoted: message.data });
                    break;
                }

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
);
