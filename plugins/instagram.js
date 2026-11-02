const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// Instagram Link Regex
const IG_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|tv|stories|audio)\/([a-zA-Z0-9_-]+)/i;

// Function to check if media is video or image
async function getMediaType(url) {
    try {
        const res = await axios.head(url, { timeout: 3000 });
        const cType = res.headers['content-type'] || '';
        if (cType.includes('video')) return 'video';
        if (cType.includes('image')) return 'image';
    } catch (e) {}
    
    const cleanUrl = url.split('?')[0].toLowerCase();
    if (cleanUrl.endsWith('.mp4') || cleanUrl.includes('/v/')) return 'video';
    return 'image';
}

// Advanced API Fetcher for Instagram
async function fetchInstaData(url) {
    let media = [];
    let caption = "";

    // Try API 1 (Siputzx)
    try {
        const res = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(url)}`, { timeout: 10000 });
        if (res.data && res.data.data) {
            let data = res.data.data;
            if (Array.isArray(data)) {
                media = data.map(item => item.url || item);
            } else if (data.url) {
                media = [data.url];
            }
            if (res.data.caption) caption = res.data.caption;
            if (media.length > 0) return { media, caption };
        }
    } catch (e) {}

    // Try API 2 (Vreden Fallback)
    try {
        const res = await axios.get(`https://api.vreden.my.id/api/igdownload?url=${encodeURIComponent(url)}`, { timeout: 10000 });
        if (res.data && res.data.result) {
            let data = res.data.result;
            if (data.medias && Array.isArray(data.medias)) {
                media = data.medias.map(m => m.url);
            } else if (Array.isArray(data)) {
                media = data.map(m => m.url || m);
            }
            if (data.caption || data.title) caption = data.caption || data.title;
            if (media.length > 0) return { media, caption };
        }
    } catch (e) {}

    throw new Error("API Blocked or Invalid Link");
}

// 1. STANDALONE COMMAND (.ig <link>)
Module(
    {
        pattern: "^[.]?(ig|insta|reel|igdl)(?:\\s+(.*))?$",
        fromMe: isFromMe,
        desc: "Download Instagram Reels, Posts, and Carousel Slides",
        usage: "ig <link>",
        use: "download",
    },
    async (message, match) => {
        let query = match[2] ? match[2].trim() : '';
        if (!query && message.reply_message?.text) {
            const matchUrl = message.reply_message.text.match(IG_REGEX);
            if (matchUrl) query = matchUrl[0];
        }

        if (!query || !query.match(IG_REGEX)) {
            return await message.sendReply("❌ *Usage:* `.ig <Instagram Link>`\n✨ _Supports Reels, Posts, and Carousel (Slide) Photos!_");
        }

        const waitMsg = await message.sendReply("⚡ *Fetching Instagram Media... Please wait...*");

        try {
            const data = await fetchInstaData(query);
            let captionText = data.caption ? `*Caption:*\n${data.caption.substring(0, 700)}...\n\n⚡ *OGGY-MD SYSTEM*` : `⚡ *OGGY-MD SYSTEM*`;

            for (let i = 0; i < data.media.length; i++) {
                let mUrl = data.media[i];
                let type = await getMediaType(mUrl);
                let msgObj = {};

                if (type === 'video') msgObj.video = { url: mUrl };
                else msgObj.image = { url: mUrl };

                // Add caption only to the first image/video in the carousel
                if (i === 0) msgObj.caption = captionText;

                await message.client.sendMessage(message.jid, msgObj, { quoted: message.data });
            }

            if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

        } catch (err) {
            await message.sendReply("❌ *Download failed!* Make sure the account is public and the link is valid.");
            if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
        }
    }
);

// 2. SMART HELPER & REPLY HANDLER (Song, Video, Photo, All)
Module(
    { on: 'text' },
    async (message) => {
        if (!message.jid) return;
        const text = (message.text || message.message || '').trim().toLowerCase();
        
        let targetUrl = null;
        
        // Check if user is replying to a message containing an IG link
        if (message.reply_message && message.reply_message.text) {
            const match = message.reply_message.text.match(IG_REGEX);
            if (match) targetUrl = match[0];
        } else {
            // Or if the message itself is just an IG link (Show Smart Helper Menu)
            const match = text.match(IG_REGEX);
            if (match && text === match[0].toLowerCase()) {
                return await message.sendReply(
                    `╭━━━〔 ⚡ *IG SMART HELPER* 〕━━━╮\n` +
                    `┃\n` +
                    `┃ 💡 *Instagram Link Detected!*\n` +
                    `┃ Reply to this message with:\n` +
                    `┃\n` +
                    `┃ 🎵 \`song\` - Extract Audio\n` +
                    `┃ 🎬 \`video\` - Download Video\n` +
                    `┃ 📸 \`photo\` - Download Pictures\n` +
                    `┃ 🚀 \`all\` - Download Carousel (Slide)\n` +
                    `┃\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
                );
            }
        }

        if (!targetUrl) return;

        const isSong = ['song', 'audio', 'mp3'].includes(text);
        const isVideo = ['video', 'mp4', 'reel'].includes(text);
        const isPhoto = ['photo', 'pic', 'image', 'all'].includes(text);

        // Process only if the user replied with a valid trigger word
        if (isSong || isVideo || isPhoto) {
            const waitMsg = await message.sendReply("⚡ *Processing your request... Please wait...*");
            
            try {
                const data = await fetchInstaData(targetUrl);
                let captionText = data.caption ? `*Caption:*\n${data.caption.substring(0, 700)}...\n\n⚡ *OGGY-MD SYSTEM*` : `⚡ *OGGY-MD SYSTEM*`;

                for (let i = 0; i < data.media.length; i++) {
                    let mUrl = data.media[i];
                    let type = await getMediaType(mUrl);

                    // If user wants SONG (Extract Audio)
                    if (isSong) {
                        if (i === 0) {
                            await message.client.sendMessage(message.jid, {
                                audio: { url: mUrl },
                                mimetype: 'audio/mp4',
                                ptt: false
                            }, { quoted: message.data });
                        }
                        continue; // Skip the rest for audio requests
                    }

                    // For Video or Photo/Carousel
                    let msgObj = {};
                    if (type === 'video') msgObj.video = { url: mUrl };
                    else msgObj.image = { url: mUrl };

                    if (i === 0) msgObj.caption = captionText;

                    await message.client.sendMessage(message.jid, msgObj, { quoted: message.data });
                }
                
                if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

            } catch (err) {
                await message.sendReply(`❌ *Action failed!* Make sure the account is public.`);
                if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
            }
        }
    }
);
