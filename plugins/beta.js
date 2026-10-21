'use strict';

const { Module } = require('../main');
const botConfig = require('../config');
const axios = require('axios');

const isFromMe = botConfig.MODE === 'public' ? false : true;

const MAX_QUERY_LENGTH = 200;
const TIMEOUT_MS = 25000;

// വാട്സ്ആപ്പ് ബ്ലോക്ക് ചെയ്യാത്ത യഥാർത്ഥ മ്യൂസിക് എഞ്ചിൻ
async function getAuthorizedAudio(query) {
  // എഞ്ചിൻ 1: JioSaavn 320kbps ഒറിജിനൽ CDN (അതിവേഗം + ഒരിക്കലും ബ്ലോക്കാവാത്ത CDN)
  try {
    const res1 = await axios.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}`,
      { timeout: 8000 }
    );
    const results = res1.data?.data?.results || res1.data?.results || [];
    if (results.length > 0) {
      const s = results[0];
      const dlList = s.downloadUrl || [];
      const dlObj =
        dlList.find((d) => d.quality === '320kbps') ||
        dlList.find((d) => d.quality === '160kbps') ||
        dlList[dlList.length - 1];

      const imgList = s.image || [];
      const imgObj =
        imgList.find((i) => i.quality === '500x500') ||
        imgList[imgList.length - 1];

      const audioUrl = dlObj?.url || dlObj?.link;
      if (audioUrl) {
        return {
          title: s.name ? s.name.replace(/&quot;/g, '"').replace(/&#039;/g, "'") : query,
          artist: s.primaryArtists || s.album?.name || 'Oggy-MD Music',
          duration: s.duration ? `${Math.floor(s.duration / 60)}:${(s.duration % 60).toString().padStart(2, '0')}` : '3:30',
          thumbnail: imgObj?.url || 'https://i.imgur.com/8QZ9Q8w.jpeg',
          url: s.url || 'https://jiosaavn.com',
          audioUrl: audioUrl
        };
      }
    }
  } catch (e) {}

  // എഞ്ചിൻ 2: YouTube Search + YTMP3 ബാക്ക്-അപ്പ്
  try {
    const ytSearch = await axios.get(
      `https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(query)}`,
      { timeout: 8000 }
    );
    const firstVideo = ytSearch.data?.data?.[0];
    if (firstVideo && firstVideo.url) {
      const dlRes = await axios.get(
        `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(firstVideo.url)}`,
        { timeout: 12000 }
      );
      const audioUrl = dlRes.data?.data?.dl;
      if (audioUrl) {
        return {
          title: firstVideo.title || query,
          artist: firstVideo.author?.name || 'YouTube Music',
          duration: firstVideo.timestamp || 'N/A',
          thumbnail: firstVideo.thumbnail || 'https://i.imgur.com/8QZ9Q8w.jpeg',
          url: firstVideo.url,
          audioUrl: audioUrl
        };
      }
    }
  } catch (e) {}

  throw new Error('All music providers failed to fetch the audio.');
}

function cleanText(value, maxLength = 150) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatFilename(title) {
  const safe = cleanText(title, 100)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim();

  return `${safe || 'song'}.mp3`;
}

// കമാൻഡ്: tsong (കുത്തുണ്ടെങ്കിലും ഇല്ലെങ്കിലും പ്രവർത്തിക്കും)
Module({
  pattern: '^[.]?tsong\\s*(.*)$',
  fromMe: isFromMe,
  desc: 'Search and send music audio with interactive card',
  usage: 'tsong <song name>',
  use: 'beta'
}, async (message, match) => {
  let statusMessage;

  try {
    const query = cleanText(
      Array.isArray(match) ? match[1] : match,
      MAX_QUERY_LENGTH
    );

    if (!query) {
      await message.sendReply('💡 *ഉപയോഗിക്കേണ്ട വിധം:* `tsong <പാട്ടിന്റെ പേര്>`\n*ഉദാഹരണം:* `tsong malare`');
      return;
    }

    statusMessage = await message.sendReply(
      `🔎 *"${query}"* തിരയുന്നു... അല്പം കാത്തിരിക്കൂ...`
    );

    const song = await Promise.race([
      getAuthorizedAudio(query),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Music search timed out')),
          TIMEOUT_MS
        );
      })
    ]);

    if (!song || !validHttpsUrl(song.audioUrl)) {
      throw new Error('Provider returned invalid song information');
    }

    const title = cleanText(song.title, 150);
    const artist = cleanText(song.artist || 'Oggy-MD Music', 100);
    const duration = cleanText(song.duration || '3:30', 30);

    // ആൽബം കാർഡ് ഡിസൈൻ (externalAdReply)
    const contextInfo = {
      externalAdReply: {
        title: title,
        body: `🎙️ ${artist} • ⏱️ ${duration}`,
        mediaType: 2,
        renderLargerThumbnail: true,
        thumbnailUrl: song.thumbnail,
        sourceUrl: song.url
      }
    };

    // ഓഡിയോ അയക്കുന്നു
    await message.client.sendMessage(
      message.jid,
      {
        audio: { url: song.audioUrl },
        mimetype: 'audio/mp4',
        fileName: formatFilename(title),
        contextInfo: contextInfo
      },
      { quoted: message.data }
    );

  } catch (error) {
    console.error('[SONG PLUGIN]', error.message);
    try {
      await message.sendReply(
        '❌ പാട്ട് കണ്ടെത്താനോ ഡൗൺലോഡ് ചെയ്യാനോ കഴിഞ്ഞില്ല! പേര് ശരിയാണോ എന്ന് പരിശോധിക്കുക.'
      );
    } catch (replyError) {}
  } finally {
    if (statusMessage) {
      try {
        const key = statusMessage.key || statusMessage.data?.key;
        if (key) {
          await message.client.sendMessage(message.jid, {
            delete: key
          });
        }
      } catch (deleteError) {}
    }
  }
});
