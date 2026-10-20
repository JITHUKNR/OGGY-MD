const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// 1. ഇൻസ്റ്റാഗ്രാം ഡാറ്റ എടുക്കുന്ന സ്മാർട്ട് ഫംഗ്ഷൻ (3 ബാക്ക്-അപ്പ് API സഹിതം)
async function fetchInstagramProfile(username) {
  // API 1
  try {
    const res1 = await axios.get(`https://api.siputzx.my.id/api/stalk/instagram?username=${encodeURIComponent(username)}`, { timeout: 8000 });
    if (res1.data && res1.data.status && res1.data.data) {
      const u = res1.data.data;
      return {
        name: u.fullName || u.name || username,
        username: u.username || username,
        bio: u.bio || u.biography || "No Bio",
        followers: u.followers || u.follower_count || 0,
        following: u.following || u.following_count || 0,
        posts: u.posts || u.media_count || 0,
        isPrivate: u.is_private ? "🔒 പ്രൈവറ്റ്" : "🌐 പബ്ലിക്",
        isVerified: u.is_verified ? "✅ ഉണ്ട് (Blue Tick)" : "❌ ഇല്ല",
        photo: u.profilePicUrl || u.photo_profile || u.avatar
      };
    }
  } catch (e) {}

  // API 2
  try {
    const res2 = await axios.get(`https://widipe.com/stalk/ig?username=${encodeURIComponent(username)}`, { timeout: 8000 });
    if (res2.data && res2.data.result) {
      const u = res2.data.result;
      return {
        name: u.fullName || username,
        username: u.username || username,
        bio: u.bio || "No Bio",
        followers: u.followers || 0,
        following: u.following || 0,
        posts: u.posts || 0,
        isPrivate: u.is_private ? "🔒 പ്രൈവറ്റ്" : "🌐 പബ്ലിക്",
        isVerified: u.is_verified ? "✅ ഉണ്ട്" : "❌ ഇല്ല",
        photo: u.profilePic || u.photo
      };
    }
  } catch (e) {}

  // API 3
  try {
    const res3 = await axios.get(`https://api.agatz.xyz/api/igstalk?username=${encodeURIComponent(username)}`, { timeout: 8000 });
    if (res3.data && res3.data.data) {
      const u = res3.data.data;
      return {
        name: u.fullname || username,
        username: u.username || username,
        bio: u.bio || "No Bio",
        followers: u.followers || 0,
        following: u.following || 0,
        posts: u.post || 0,
        isPrivate: u.is_private ? "🔒 പ്രൈവറ്റ്" : "🌐 പബ്ലിക്",
        isVerified: u.is_verified ? "✅ ഉണ്ട്" : "❌ ഇല്ല",
        photo: u.avatar || u.profile_pic
      };
    }
  } catch (e) {}

  return null;
}

// 2. കമാൻഡ്: .ig അല്ലെങ്കിൽ .igstalk
Module(
  {
    pattern: "(?:ig|igstalk) ?(.*)",
    fromMe: isFromMe,
    desc: "Fetches Instagram Profile Details and DP",
    usage: ".ig <username>",
    use: "search",
  },
  async (message, match) => {
    let raw = match[1] ? match[1].trim() : "";

    // ലിങ്ക് ആയോ @ ചേർത്തോ അയച്ചാൽ യൂസർനെയിം മാത്രം ഫിൽട്ടർ ചെയ്യുന്നു
    let username = raw
      .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
      .replace(/^@/, "")
      .replace(/\/.*$/, "")
      .trim();

    if (!username) {
      return await message.sendReply(
        `╭━━━〔 📸 *INSTAGRAM PROFILE* 〕━━━╮\n` +
        `┃ ⚠️ ഒരു യൂസർനെയിം നൽകുക!\n` +
        `┃\n` +
        `┃ 💡 *ഉദാഹരണം:*\n` +
        `┃ • \`.ig cristiano\`\n` +
        `┃ • \`.igstalk messi\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply("_⏳ വിവരങ്ങൾ ശേഖരിക്കുന്നു..._");

    try {
      const data = await fetchInstagramProfile(username);

      if (!data) {
        return await message.sendReply(`_❌ @${username} എന്ന പ്രൊഫൈൽ കണ്ടെത്താൻ കഴിഞ്ഞില്ല! യൂസർനെയിം ശരിയാണോ എന്ന് പരിശോധിക്കുക._`);
      }

      const captionText =
        `╭━━━〔 📸 *INSTAGRAM PROFILE* 〕━━━╮\n` +
        `┃\n` +
        `┃ 👤 *പേര്:* ${data.name}\n` +
        `┃ 🆔 *യൂസർനെയിം:* @${data.username}\n` +
        `┃ 👥 *ഫോളോവേഴ്സ്:* ${Number(data.followers).toLocaleString()}\n` +
        `┃ 🫂 *ഫോളോവിംഗ്:* ${Number(data.following).toLocaleString()}\n` +
        `┃ 📸 *പോസ്റ്റുകൾ:* ${Number(data.posts).toLocaleString()}\n` +
        `┃ 🛡️ *അക്കൗണ്ട്:* ${data.isPrivate}\n` +
        `┃ 🌟 *ബ്ലൂ ടിക്ക്:* ${data.isVerified}\n` +
        `┃\n` +
        `┃ 📝 *ബയോ:*\n` +
        `┃ ${data.bio.trim()}\n` +
        `┃\n` +
        `┃ 🔗 *ലിങ്ക്:* https://instagram.com/${data.username}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`;

      if (data.photo) {
        await message.client.sendMessage(
          message.jid,
          {
            image: { url: data.photo },
            caption: captionText
          },
          { quoted: message.data }
        );
      } else {
        await message.sendReply(captionText);
      }

    } catch (err) {
      await message.sendReply("_⚠️ പ്രൊഫൈൽ എടുക്കുന്നതിൽ തടസ്സം നേരിട്ടു! അല്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക._");
    }
  }
);
