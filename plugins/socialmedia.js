const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

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

const getBuffer = async (url) => {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    return Buffer.from(res.data, 'binary');
};

async function downloadMedia(url, platform, type) {
    let result = { media: [], caption: "", type: "video", title: "" };

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
        
        // Using robust fallback APIs for Instagram
        try {
            const r = await axios.get(`https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(cleanUrl)}`, { timeout: 8000 });
            if (r.data && r.data.data) {
                result.media = r.data.data.map(item => item.url || item);
                result.caption = "📌 Instagram Media Downloaded";
                if (result.media.length > 0) return result;
            }
        } catch (e) {}

        try {
            const r2 = await axios.get(`https://api.vreden.my.id/api/igdownload?url=${encodeURIComponent(cleanUrl)}`, { timeout: 8000 });
            if (r2.data && r2.data.result) {
                let d = r2.data.result;
                result.media = d.medias ? d.medias.map(m => m.url) : [d.url];
                result.caption = d.caption || "";
                if (result.media.length > 0) return result;
            }
        } catch (e) {}

        throw new Error("Instagram servers are currently limiting requests. Please try again in a moment.");
    }

    // Universal Downloader for other platforms
    const res = await axios.get(`https://api.siputzx.my.id/api/d/alldl?url=${encodeURIComponent(url)}`);
    if (res.data && res.data.data) {
        let data = res.data.data;
        let mUrl = data.video || data.image || data.url || (data.medias && data.medias[0]?.url);
        if (!mUrl) throw new Error("Could not extract media from link.");
        
        result.media = [mUrl];
        result.caption = data.title || data.caption || "";
        result.type = mUrl.includes('.mp4') ? 'video' : 'image';
        if (type === 'audio' && data.audio) {
            result.media = [data.audio];
            result.type = 'audio';
        }
        return result;
    }

    throw new Error("Download failed for this link.");
}

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

    const waitMsg = await message.sendReply(`⚡ *Downloading from ${platform.toUpperCase()}...*`);

    try {
        const data = await downloadMedia(targetUrl, platform, reqType);
        let captionText = data.caption ? `*Caption:*\n${data.caption.substring(0, 600)}\n\n⚡ *OGGY-MD SYSTEM*` : `⚡ *OGGY-MD SYSTEM*`;

        for (let i = 0; i < data.media.length; i++) {
            let mUrl = data.media[i];
            if (!mUrl) continue;
            
            const mediaBuffer = await getBuffer(mUrl);

            if (reqType === 'audio' || platform === 'spotify' || data.type === 'audio') {
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
            if (mUrl.includes('.mp4') || data.type === 'video') {
                msgObj.video = mediaBuffer;
            } else {
                msgObj.image = mediaBuffer;
            }
            
            if (i === 0) msgObj.caption = captionText;
            await message.client.sendMessage(message.jid, msgObj, { quoted: message.data });
        }

        if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

    } catch (err) {
        await message.sendReply(`❌ *Error:* ${err.message}`);
        if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
    }
  }
);

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
