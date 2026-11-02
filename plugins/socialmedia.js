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

// --- SECURE BUFFER FETCHER ---
const getBuffer = async (url) => {
    try {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            }
        });
        return Buffer.from(res.data, 'binary');
    } catch (error) {
        throw new Error("Failed to fetch media buffer. IG might have blocked the link.");
    }
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
            const cleanUrl = url.split('?')[0]; 
            
            // Primary API: Vreden
            try {
                const res = await axios.get(`https://api.vreden.my.id/api/igdownload?url=${encodeURIComponent(cleanUrl)}`, { timeout: 8000 });
                let data = res.data.result;
                if (data.medias && Array.isArray(data.medias)) result.media = data.medias.map(m => m.url);
                else if (Array.isArray(data)) result.media = data.map(m => m.url || m);
                result.caption = data.caption || data.title || "";
                if (result.media.length > 0) return result;
            } catch(e) {}
            
            // Backup API: Siputzx
            try {
                const res2 = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(cleanUrl)}`, { timeout: 8000 });
                let data2 = res2.data.data;
                if (Array.isArray(data2)) result.media = data2.map(item => item.url || item);
                else if (data2.url) result.media = [data2.url];
                result.caption = res2.data.caption || "";
                if (result.media.length > 0) return result;
            } catch(e) {}

            throw new Error("IG APIs Failed to extract link.");
        }

        if (platform === 'spotify') {
            const res = await axios.get(`https://api.vreden.my.id/api/spotify?url=${encodeURIComponent(url)}`);
            return { media: [res.data.result.download], type: 'audio', title: res.data.result.title };
        }

        if (platform === 'pinterest') {
            const res = await axios.get(`https://api.siputzx.my.id/api/d/pinterest?url=${encodeURIComponent(url)}`);
            return { media: [res.data.data.url], type: 'image', caption: "📌 Pinterest Download" };
        }

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
        throw new Error(e.message || "Unsupported or broken link.");
    }
    throw new Error("Platform not supported.");
}

// --- ALL-IN-ONE SMART HANDLER ---
Module(
  {
    pattern: "^[.]?(song|video|photo|play|mp3|mp4|pic)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "All-in-One Social Media Downloader",
    usage: "song/video/photo <link>",
    use: "download",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();
    let query = match[2] ? match[2].trim() : '';
    
    if (!query && message.reply_message?.text) {
        query = message.reply_message.text.trim();
    }
    
    const targetUrl = extractUrl(query);
    if (!targetUrl) return await message.sendReply(`❌ *Usage:* \`.${cmd} <link>\``);

    const platform = getPlatform(targetUrl);
    if (platform === 'unknown') return await message.sendReply("❌ Unsupported link format.");

    let reqType = 'video';
    if (['song', 'play', 'mp3', 'audio'].includes(cmd)) reqType = 'audio';
    if (['photo', 'pic', 'image'].includes(cmd)) reqType = 'image';

    const waitMsg = await message.sendReply(`⚡ *Processing request securely...*`);

    try {
        const data = await downloadMedia(targetUrl, platform, reqType);
        
        let captionText = data.caption ? `*Caption:*\n${data.caption.substring(0, 700)}...\n\n⚡ *OGGY-MD SYSTEM*` : `⚡ *OGGY-MD SYSTEM*`;
        if (data.title) captionText = `*${data.title}*\n\n⚡ *OGGY-MD SYSTEM*`;

        for (let i = 0; i < data.media.length; i++) {
            let mUrl = data.media[i];
            if (!mUrl) continue;
            
            // Bypass security blocks by fetching buffer directly
            const mediaBuffer = await getBuffer(mUrl);

            if (reqType === 'audio' || platform === 'spotify') {
                if (i === 0) {
                    await message.client.sendMessage(message.jid, {
                        audio: mediaBuffer,
                        mimetype: 'audio/mp4',
                        ptt: false
                    }, { quoted: message.data });
                }
                continue;
            }

            let msgObj = {};
            if (mUrl.includes('.mp4') || data.type === 'video') msgObj.video = mediaBuffer;
            else msgObj.image = mediaBuffer;
            
            if (i === 0) msgObj.caption = captionText;

            await message.client.sendMessage(message.jid, msgObj, { quoted: message.data });
        }

        if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

    } catch (err) {
        // Now it will print the EXACT error instead of a generic message
        await message.sendReply(`❌ *Error:* ${err.message}`);
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
                    message.text = `.${text} ${targetUrl}`;
                }
            }
        }
    }
});
