const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// --- PLATFORM DETECTORS ---
const YT_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)/i;
const IG_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)/i;
const FB_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.watch|fb\.com|fb\.gg)/i;
const TW_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)/i;
const TK_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com|vt\.tiktok\.com)/i;
const SP_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:spotify\.com)/i;
const PT_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:pinterest\.com|pin\.it)/i;
const SC_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:snapchat\.com)/i;

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

// --- ADVANCED DOWNLOAD ENGINE ---
async function downloadMedia(url, platform, type) {
    let result = { media: [], caption: "", type: "video", title: "" };

    try {
        if (platform === 'youtube') {
            if (type === 'audio') {
                const res = await axios.get(`https://api-faa.my.id/faa/ytmp3?url=${encodeURIComponent(url)}`);
                return { media: [res.data.result.mp3], type: 'audio', title: res.data.result.title };
            } else {
                const res = await axios.get(`https://api-faa.my.id/faa/ytmp4?url=${encodeURIComponent(url)}`);
                return { media: [res.data.result.download_url], type: 'video', title: res.data.result.title };
            }
        }

        if (platform === 'instagram') {
            const res = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(url)}`);
            let data = res.data.data;
            if (Array.isArray(data)) result.media = data.map(item => item.url || item);
            else if (data.url) result.media = [data.url];
            result.caption = res.data.caption || "";
            result.type = type === 'audio' ? 'audio' : 'mixed'; 
            return result;
        }

        if (platform === 'spotify') {
            const res = await axios.get(`https://api.vreden.my.id/api/spotify?url=${encodeURIComponent(url)}`);
            return { media: [res.data.result.download], type: 'audio', title: res.data.result.title };
        }

        if (platform === 'pinterest') {
            const res = await axios.get(`https://api.siputzx.my.id/api/d/pinterest?url=${encodeURIComponent(url)}`);
            return { media: [res.data.data.url], type: 'image', caption: "📌 Pinterest Download" };
        }

        // Universal Downloader (Facebook, Twitter, TikTok, Snapchat)
        const res = await axios.get(`https://api.siputzx.my.id/api/d/alldl?url=${encodeURIComponent(url)}`);
        if (res.data && res.data.data) {
            let data = res.data.data;
            if (data.video) result.media = [data.video];
            else if (data.image) result.media = [data.image];
            else if (data.url) result.media = [data.url];
            else if (data.medias && data.medias.length > 0) result.media = [data.medias[0].url];
            
            result.caption = res.data.title || res.data.caption || "";
            result.type = (result.media[0] && result.media[0].includes('.mp4')) ? 'video' : 'image';
            if (type === 'audio' && data.audio) {
                result.media = [data.audio];
                result.type = 'audio';
            }
            return result;
        }
    } catch (e) {
        throw new Error("API Blocked or Invalid Link");
    }
    throw new Error("Unsupported Platform");
}

// --- ALL-IN-ONE SMART HANDLER ---
Module(
  {
    pattern: "^[.]?(song|video|photo|play|mp3|mp4|pic)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "All-in-One Social Media Downloader (YT, IG, FB, X, TikTok, Spotify, Pin, Snap)",
    usage: "song/video/photo <link>",
    use: "download",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();
    let query = match[2] ? match[2].trim() : '';
    
    // Check reply message for links if query is empty
    if (!query && message.reply_message?.text) {
        query = message.reply_message.text.trim();
    }
    
    const targetUrl = extractUrl(query);
    if (!targetUrl) {
        return await message.sendReply(
            `╭━━━〔 🌐 *SOCIAL MEDIA JS* 〕━━━╮\n` +
            `┃ ⚠️ *Usage:* \`.${cmd} <link>\`\n` +
            `┃\n` +
            `┃ ✨ *Supported Platforms:*\n` +
            `┃ 🔴 YouTube  📸 Instagram\n` +
            `┃ 🔵 Facebook 🐦 Twitter (X)\n` +
            `┃ 🎵 TikTok   🟢 Spotify\n` +
            `┃ 📌 Pinterest 👻 Snapchat\n` +
            `┃\n` +
            `┃ 💡 _Just reply to any link with song, video, or photo!_\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━╯`
        );
    }

    const platform = getPlatform(targetUrl);
    if (platform === 'unknown') return await message.sendReply("❌ Unsupported link format.");

    let reqType = 'video';
    if (['song', 'play', 'mp3', 'audio'].includes(cmd)) reqType = 'audio';
    if (['photo', 'pic', 'image'].includes(cmd)) reqType = 'image';

    const waitMsg = await message.sendReply(`⚡ *Processing ${platform.toUpperCase()} request... Please wait...*`);

    try {
        const data = await downloadMedia(targetUrl, platform, reqType);
        
        let captionText = data.caption ? `*Caption:*\n${data.caption.substring(0, 700)}...\n\n⚡ *OGGY-MD SYSTEM*` : `⚡ *OGGY-MD SYSTEM*`;
        if (data.title) captionText = `*${data.title}*\n\n⚡ *OGGY-MD SYSTEM*`;

        for (let i = 0; i < data.media.length; i++) {
            let mUrl = data.media[i];
            
            if (reqType === 'audio' || data.type === 'audio') {
                if (i === 0) {
                    await message.client.sendMessage(message.jid, {
                        audio: { url: mUrl },
                        mimetype: 'audio/mpeg',
                        fileName: data.title ? `${data.title}.mp3` : `audio.mp3`
                    }, { quoted: message.data });
                }
                continue;
            }

            let msgObj = {};
            if (mUrl.includes('.mp4') || data.type === 'video') msgObj.video = { url: mUrl };
            else msgObj.image = { url: mUrl };
            
            if (i === 0) msgObj.caption = captionText;

            await message.client.sendMessage(message.jid, msgObj, { quoted: message.data });
        }

        if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

    } catch (err) {
        await message.sendReply(`❌ *Download failed:* Please check if the link is valid and public.`);
        if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
    }
  }
);

// --- SMART REPLY LISTENER ---
Module({ on: 'text' }, async (message) => {
    if (!message.jid) return;
    const text = (message.text || message.message || '').trim().toLowerCase();
    
    if (message.reply_message && message.reply_message.text) {
        const targetUrl = extractUrl(message.reply_message.text);
        if (targetUrl) {
            const platform = getPlatform(targetUrl);
            if (platform !== 'unknown') {
                if (['song', 'video', 'photo', 'all'].includes(text)) {
                    // Force the bot to trigger the command logic
                    message.text = `.${text} ${targetUrl}`;
                    // The core framework will handle the rest based on our command pattern above
                }
            }
        }
    }
});
