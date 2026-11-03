const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// File Platforms Regex
const MF_REGEX = /(?:https?:\/\/)?(?:www\.)?mediafire\.com\/\S+/i;
const MG_REGEX = /(?:https?:\/\/)?mega\.nz\/\S+/i;
const SF_REGEX = /(?:https?:\/\/)?sfile\.[a-z]+\/\S+/i;

const extractUrl = (text) => {
  if (!text) return null;
  let match = text.match(MF_REGEX);
  if (match) return { url: match[0], type: 'mediafire' };
  
  match = text.match(MG_REGEX);
  if (match) return { url: match[0], type: 'mega' };
  
  match = text.match(SF_REGEX);
  if (match) return { url: match[0], type: 'sfile' };
  
  return null;
};

const getReplyText = (message) => {
  if (!message.reply_message) return "";
  return (
    message.reply_message.text ||
    message.reply_message.caption ||
    message.reply_message.message ||
    message.reply_message?.data?.message?.conversation ||
    ""
  );
};

// --- CORE PROCESSOR ---
async function processFile(message, targetData) {
  const waitMsg = await message.sendReply(`⚡ *Fetching file from ${targetData.type.toUpperCase()}...*`);
  
  try {
    let downloadInfo = {};
    const url = targetData.url;

    if (targetData.type === 'mediafire') {
      const { data } = await axios.get(`https://api-faa.my.id/faa/mediafire?url=${encodeURIComponent(url)}`, { timeout: 15000 });
      if (!data.status || !data.result) throw new Error("MediaFire API error");
      downloadInfo = {
        url: data.result.download_url || data.result.url,
        name: data.result.filename || data.result.name || "MediaFire_File",
        mime: data.result.mime ? `application/${data.result.mime}` : "application/octet-stream",
        size: data.result.size || "Unknown"
      };
    } 
    else if (targetData.type === 'mega') {
      const { data } = await axios.get(`https://api.nexray.web.id/downloader/mega?url=${encodeURIComponent(url)}`, { timeout: 20000 });
      if (!data.status || !data.result) throw new Error("Mega API error");
      downloadInfo = {
        url: Array.isArray(data.result.download_url) ? data.result.download_url[0] : data.result.download_url,
        name: data.result.filename || "Mega_File",
        mime: data.result.mimetype || "application/octet-stream",
        size: data.result.filesize || "Unknown"
      };
    } 
    else if (targetData.type === 'sfile') {
      const { data } = await axios.get(`https://api.nexray.web.id/downloader/sfile?url=${encodeURIComponent(url)}`, { timeout: 15000 });
      if (!data.status || !data.result || !data.result.url) throw new Error("Sfile API error");
      downloadInfo = {
        url: data.result.url,
        name: data.result.file_name || "Sfile_File",
        mime: data.result.mimetype === "7ZIP" ? "application/x-7z-compressed" : "application/octet-stream",
        size: data.result.size || "Unknown"
      };
    }

    await message.client.sendMessage(message.jid, {
      document: { url: downloadInfo.url },
      fileName: downloadInfo.name,
      mimetype: downloadInfo.mime,
      caption: `📦 *File Downloaded*\n\n📄 *Name:* ${downloadInfo.name}\n⚖️ *Size:* ${downloadInfo.size}\n🌐 *Platform:* ${targetData.type.toUpperCase()}\n\n⚡ *OGGY-MD SYSTEM*`
    }, { quoted: message.data });

    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });

  } catch (err) {
    await message.sendReply(`❌ *File Download Failed:* ${err.message}`);
    if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
  }
}

// --- 1. COMMAND HANDLER (.file, .dl, .download) ---
Module(
  {
    pattern: "^[.]?(file|dl|download|get)(?:\\s+(.*))?$",
    fromMe: isFromMe,
    desc: "Download Files from MediaFire, Mega, and Sfile",
    use: "download",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();
    let query = match[2] ? match[2].trim() : "";

    if (!query) query = getReplyText(message).trim();
    
    const targetData = extractUrl(query);

    if (!targetData) {
      if (['file', 'dl', 'download'].includes(cmd)) {
        return await message.sendReply(
          `╭━━━〔 📦 *OGGY-MD FILES* 〕━━━╮\n` +
          `┃ 📌 *Supported Platforms:*\n` +
          `┃ • MediaFire\n` +
          `┃ • Mega.nz\n` +
          `┃ • Sfile\n` +
          `┃\n` +
          `┃ 💡 *Usage:* Reply to link with \`file\`\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
        );
      }
      return; 
    }

    await processFile(message, targetData);
  }
);

// --- 2. DIRECT REPLY LISTENER ---
Module({ on: 'text', fromMe: isFromMe }, async (message) => {
  if (!message.jid || !message.reply_message) return;
  const text = (message.text || message.message || "").trim().toLowerCase();
  
  if (['file', 'dl', 'download', 'get'].includes(text)) {
    const targetData = extractUrl(getReplyText(message));
    
    if (targetData) {
      await processFile(message, targetData);
    }
  }
});
