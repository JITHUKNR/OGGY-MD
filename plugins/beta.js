const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const isFromMe = botConfig.MODE === "public" ? false : true;

// ടെമ്പ് ഫയലുകൾ സൂക്ഷിക്കാനുള്ള ഡയറക്ടറി
const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) {
  try {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  } catch (e) {}
}

// കൺഫെഷൻ സെഷനുകൾ സൂക്ഷിക്കാൻ
const confessionCache = {};

// മീഡിയ ഡൗൺലോഡ് ചെയ്യാനുള്ള യൂണിവേഴ്സൽ ഹെൽപ്പർ
async function downloadMedia(msg) {
  try {
    if (msg.reply_message && typeof msg.reply_message.download === "function") {
      return await msg.reply_message.download();
    }
    if (typeof msg.download === "function") {
      return await msg.download();
    }
    if (msg.client && typeof msg.client.downloadMediaMessage === "function") {
      const target = msg.reply_message?.data || msg.data;
      return await msg.client.downloadMediaMessage(target);
    }
  } catch (e) {}
  return null;
}

// -------------------------------------------------------------
// 1. ANONYMOUS CONFESSION BOX (.confess)
// -------------------------------------------------------------
Module(
  {
    pattern: "[.]?confess ?(.*)",
    fromMe: isFromMe,
    desc: "Send 100% anonymous confessions to groups",
    usage: "confess <group_number> <message> / confess list",
    use: "beta",
  },
  async (message, match) => {
    const isGroup = message.jid.endsWith("@g.us");
    const input = match[1] ? match[1].trim() : "";
    const botNum = (message.client.user?.id || "").split(":")[0].split("@")[0];

    // ഗ്രൂപ്പിലാണ് കമാൻഡ് അടിച്ചതെങ്കിൽ നിർദ്ദേശങ്ങൾ നൽകുന്നു
    if (isGroup) {
      const groupMeta = await message.client.groupMetadata(message.jid).catch(() => null);
      const groupName = groupMeta ? groupMeta.subject : "ഈ ഗ്രൂപ്പ്";
      const helpMsg =
        `╭━━━〔 💌 *ANONYMOUS CONFESSION BOX* 〕━━━╮\n` +
        `┃\n` +
        `┃ 🤫 *${groupName}* ലേക്ക് രഹസ്യമായി എന്തെങ്കിലും\n` +
        `┃    തുറന്നു പറയാൻ (Confession) ആഗ്രഹിക്കുന്നുണ്ടോ?\n` +
        `┃\n` +
        `┃ 💡 *ചെയ്യേണ്ട വിധം:*\n` +
        `┃ 1. ബോട്ടിന്റെ ഇൻബോക്സിൽ (DM) പോവുക\n` +
        `┃ 2. \`.confess list\` എന്ന് അയച്ച് ഗ്രൂപ്പുകൾ കാണുക\n` +
        `┃ 3. \`.confess <നമ്പർ> <രഹസ്യം>\` അയക്കുക!\n` +
        `┃\n` +
        `┃ 🔒 *100% അജ്ഞാതമായിരിക്കും! ആരും അറിയില്ല.*\n` +
        `┃ 🔗 wa.me/${botNum}?text=.confess%20list\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
      return await message.sendReply(helpMsg);
    }

    // ഇൻബോക്സിൽ (DM) ആണെങ്കിൽ:
    if (!input || input.toLowerCase() === "list") {
      try {
        const participating = await message.client.groupFetchAllParticipating();
        const groups = Object.values(participating);

        if (groups.length === 0) {
          return await message.sendReply("_⚠️ ബോട്ട് നിലവിൽ ഗ്രൂപ്പുകളിലൊന്നും അംഗമല്ല!_");
        }

        confessionCache[message.sender] = groups.map((g) => ({ jid: g.id, name: g.subject }));

        let listMsg =
          `╭━━━〔 💌 *കൺഫെഷൻ അയക്കാവുന്ന ഗ്രൂപ്പുകൾ* 〕━━━╮\n` +
          `┃ രഹസ്യം അയക്കേണ്ട ഗ്രൂപ്പിന്റെ നമ്പർ തിരഞ്ഞെടുക്കുക:\n┃\n`;

        groups.forEach((g, idx) => {
          listMsg += `┃ *${idx + 1}.* ${g.subject}\n`;
        });

        listMsg +=
          `┃\n` +
          `┃ 💡 *അയക്കേണ്ട വിധം:*\n` +
          `┃ \`.confess <ഗ്രൂപ്പ് നമ്പർ> <നിങ്ങളുടെ രഹസ്യം>\`\n` +
          `┃ *ഉദാഹരണം:* \`.confess 1 എനിക്ക് ഗ്രൂപ്പിലെ ഒരാളോട് ക്രഷ് ഉണ്ട്\`\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

        return await message.sendReply(listMsg);
      } catch (err) {
        return await message.sendReply("_⚠️ ഗ്രൂപ്പുകളുടെ ലിസ്റ്റ് എടുക്കാൻ സാധിച്ചില്ല!_");
      }
    }

    // രഹസ്യം അയക്കുന്ന പ്രക്രിയ
    const parts = input.split(" ");
    const groupIndex = parseInt(parts[0], 10) - 1;
    const confessionText = parts.slice(1).join(" ").trim();

    const cachedGroups = confessionCache[message.sender];
    if (!cachedGroups || isNaN(groupIndex) || !cachedGroups[groupIndex] || !confessionText) {
      return await message.sendReply(
        `_⚠️ ദയവായി ശരിയായ ഫോർമാറ്റിൽ അയക്കുക!_\n` +
        `ആദ്യം \`.confess list\` അയച്ച് നമ്പർ ഉറപ്പുവരുത്തുക.\n` +
        `*ഉദാഹരണം:* \`.confess 1 നിങ്ങളുടെ സന്ദേശം\``
      );
    }

    const targetGroup = cachedGroups[groupIndex];

    const secretCard =
      `╭━━━〔 💌 *ANONYMOUS CONFESSION* 〕━━━╮\n` +
      `┃\n` +
      `┃ 💬 *രഹസ്യ സന്ദേശം:*\n` +
      `┃ "${confessionText}"\n` +
      `┃\n` +
      `┃ 🕵️‍♂️ *അയച്ചത്:* ആർക്കും അറിയില്ല (100% Secret)\n` +
      `┃ 🤫 *ഇത് ആരായിരിക്കും? ഗ്രൂപ്പിൽ ചർച്ച ചെയ്യൂ!*\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

    try {
      await message.client.sendMessage(targetGroup.jid, { text: secretCard });
      await message.sendReply(
        `╭━━━〔 ✅ *CONFESSION SENT!* 〕━━━╮\n` +
        `┃ നിങ്ങളുടെ സന്ദേശം *"${targetGroup.name}"* എന്ന\n` +
        `┃ ഗ്രൂപ്പിൽ പൂർണ്ണമായും അജ്ഞാതമായി അയച്ചു കഴിഞ്ഞു!\n` +
        `┃ നിങ്ങളുടെ പേരോ നമ്പറോ ഒരിടത്തും പങ്കുവെച്ചിട്ടില്ല.\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━╯`
      );
    } catch (sendErr) {
      await message.sendReply("_❌ സന്ദേശം ഗ്രൂപ്പിലേക്ക് അയക്കാൻ കഴിഞ്ഞില്ല! ബോട്ടിന് ഗ്രൂപ്പിൽ പെർമിഷൻ ഉണ്ടോ എന്ന് ഉറപ്പാക്കുക._");
    }
  }
);

// -------------------------------------------------------------
// 2. SALIM KUMAR / DAMU AI ROAST (.roast / .damu)
// -------------------------------------------------------------
const comedyRoasts = [
  "ദാമൂന്റെ വണ്ടിക്ക് കൈ കാണിച്ചാൽ കിട്ടുന്നത് പണിയല്ല... അവാർഡാണ്! നീ ഒന്നു അടങ്ങിയിരിക്ക്!",
  "എനിക്കിപ്പോ കിട്ടിയേ ഉള്ളൂ... വേറെ ആർക്കെങ്കിലും വേണോ? മിണ്ടാതിരുന്നോണം!",
  "അയ്യോടാ... ആളൊരു പാവമാ, രാവിലെ എണീറ്റ് പല്ലുപോലും തേക്കാതെ വന്നിരിക്കുവാ ഗ്രൂപ്പിൽ തത്വചിന്ത പറയാൻ!",
  "നിന്റെയൊക്കെ ഈ വർത്തമാനം കേൾക്കുമ്പോൾ എനിക്ക് തോന്നും ഇങ്ങേർക്ക് സ്വന്തമായി തലച്ചോർ വല്ലതും ഉണ്ടോ എന്ന്!",
  "ഇത് വലിയ വായിൽ സംസാരിക്കാൻ മാത്രം ഇവിടെ എന്താ ഉണ്ടായത്? ഒരു ഗ്ലാസ് പച്ചവെള്ളം കുടിച്ച് സൈഡിൽ പോയിരിക്ക് മോനേ!",
  "പണി പാളി മക്കളെ പാളി! ഇവനെ ഗ്രൂപ്പിൽ കേറ്റിയത് ആരാടാ? അഡ്മിനെ ഒന്നു വിളിച്ചേ!",
  "ഇത്രയും ആത്മവിശ്വാസം എവിടുന്നു കിട്ടുന്നു ചേട്ടാ? പകുതി ഇവിടെ ഉള്ളവർക്ക് തന്നാൽ ബാക്കിയുള്ളവർ ജീവിച്ചു പോകുമായിരുന്നു!",
  "ഞാൻ മണവാളനാടാ... മണവാളൻ! എന്റെ മുന്നിൽ വന്ന് ഷോ ഇറക്കിയാൽ വെച്ച് കീറും ഞാൻ!",
  "ഇങ്ങേരുടെ മുഖം കണ്ടാൽ തോന്നും പത്താം ക്ലാസ് പരീക്ഷയ്ക്ക് ഹാൾടിക്കറ്റ് കിട്ടാതെ ഇരിക്കുന്നവനാണെന്ന്!",
  "എന്റെ പൊന്നോ... ഈ വാചകമടി കണ്ടിട്ട് നാട് നടുങ്ങി വിറയ്ക്കുവാണല്ലോ! ഒന്നു നിർത്തി പോടാ!"
];

Module(
  {
    pattern: "[.]?(roast|damu) ?(.*)",
    fromMe: isFromMe,
    desc: "Hilarious Malayalam movie comedy roast",
    usage: "roast (reply to someone)",
    use: "beta",
  },
  async (message, match) => {
    let targetText = match[2] ? match[2].trim() : "";
    let targetUser = message.reply_message?.sender || message.mention?.[0];

    if (message.reply_message?.text) {
      targetText = message.reply_message.text;
    }

    const waitMsg = await message.sendReply("_🔥 ദശമൂലം ദാമു വടി വെട്ടുന്നു... കാത്തിരിക്ക്..._");

    let roastOutput = "";

    // AI വഴി റോസ്റ്റ് ഉണ്ടാക്കുന്നു
    try {
      const prompt = `You are iconic Malayalam comedy character Dashamoolam Damu / Salim Kumar. Roast this person or message in Malayalam movie comedy style: "${targetText || 'talking too much in group'}". Make it 2-3 lines of pure hilarious colloquial Malayalam comedy punchlines. No harsh abuse, only pure comedy slang. Pure Malayalam text only.`;
      const res = await axios.get(
        `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai`,
        { timeout: 5000 }
      );
      if (res.data && typeof res.data === "string" && res.data.length > 5) {
        roastOutput = res.data.trim();
      }
    } catch (e) {}

    if (!roastOutput) {
      roastOutput = comedyRoasts[Math.floor(Math.random() * comedyRoasts.length)];
    }

    const targetTag = targetUser ? `@${targetUser.split("@")[0]}` : "";
    const card =
      `╭━━━〔 🎭 *ദശമൂലം ദാമു റോസ്റ്റിംഗ്* 〕━━━╮\n` +
      `┃\n` +
      `┃ ${targetTag ? `${targetTag} നെ നോക്കി ദാമു പറഞ്ഞത്:` : ""}\n` +
      `┃ "${roastOutput}"\n` +
      `┃\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

    if (waitMsg && waitMsg.key) {
      await message.client.sendMessage(message.jid, { delete: waitMsg.key });
    }

    await message.client.sendMessage(
      message.jid,
      { text: card, mentions: targetUser ? [targetUser] : [] },
      { quoted: message.data }
    );
  }
);

// -------------------------------------------------------------
// 3. VOICE CHANGER MAGIC (.vrobot, .vbaby, .vghost, .vfast)
// -------------------------------------------------------------
Module(
  {
    pattern: "[.]?(vrobot|vbaby|vghost|vfast) ?(.*)",
    fromMe: isFromMe,
    desc: "Transforms voice notes with fun audio effects",
    usage: "vrobot / vbaby / vghost / vfast (reply to audio)",
    use: "beta",
  },
  async (message, match) => {
    const cmd = match[1].toLowerCase();

    if (!message.reply_message || (!message.reply_message.audio && !message.reply_message.data?.message?.audioMessage)) {
      return await message.sendReply(
        `╭━━━〔 🎧 *VOICE CHANGER* 〕━━━╮\n` +
        `┃ ⚠️ ഒരു ഓഡിയോയ്ക്കോ വോയ്‌സ് നോട്ടിനോ റിപ്ലൈ നൽകുക!\n` +
        `┃\n` +
        `┃ 🔹 \`.vbaby\` — കുഞ്ഞു ശബ്ദം (Chipmunk)\n` +
        `┃ 🔹 \`.vrobot\` — റോബോട്ടിക് ശബ്ദം\n` +
        `┃ 🔹 \`.vghost\` — ഭീകരമായ ശബ്ദം (Ghost/Reverb)\n` +
        `┃ 🔹 \`.vfast\` — വേഗത കൂടിയ ഓഡിയോ (1.6x)\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply(`_🎛️ ഓഡിയോ ഇഫക്റ്റ് മാറ്റുന്നു... അല്പം കാത്തിരിക്കൂ..._`);

    const audioBuffer = await downloadMedia(message);
    if (!audioBuffer) {
      return await message.sendReply("_❌ ഓഡിയോ ഡൗൺലോഡ് ചെയ്യാൻ സാധിച്ചില്ല!_");
    }

    const randomId = Date.now();
    const inputPath = path.join(TEMP_DIR, `in_${randomId}.mp3`);
    const outputPath = path.join(TEMP_DIR, `out_${randomId}.mp3`);

    fs.writeFileSync(inputPath, audioBuffer);

    let filter = "";
    if (cmd === "vbaby") {
      filter = '-af "asetrate=44100*1.35,atempo=0.74"';
    } else if (cmd === "vrobot") {
      filter = '-af "asetrate=44100*0.85,atempo=1.17,flanger=delay=1.5:depth=2"';
    } else if (cmd === "vghost") {
      filter = '-af "asetrate=44100*0.7,atempo=1.42,aecho=0.8:0.9:1000:0.3"';
    } else if (cmd === "vfast") {
      filter = '-af "atempo=1.65"';
    }

    const ffmpegCmd = `ffmpeg -y -i "${inputPath}" ${filter} -vn -b:a 128k "${outputPath}"`;

    exec(ffmpegCmd, async (err) => {
      try {
        if (err || !fs.existsSync(outputPath)) {
          if (waitMsg && waitMsg.key) await message.client.sendMessage(message.jid, { delete: waitMsg.key });
          return await message.sendReply("_⚠️ ഓഡിയോ പ്രോസസ്സ് ചെയ്യാൻ കഴിഞ്ഞില്ല (FFmpeg ആവശ്യമാണ്)!_");
        }

        const outAudio = fs.readFileSync(outputPath);

        await message.client.sendMessage(
          message.jid,
          { audio: outAudio, mimetype: "audio/mp4", ptt: true },
          { quoted: message.data }
        );

        if (waitMsg && waitMsg.key) {
          await message.client.sendMessage(message.jid, { delete: waitMsg.key });
        }
      } catch (e) {
      } finally {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      }
    });
  }
);

// -------------------------------------------------------------
// 4. MEME GENERATOR (.meme)
// -------------------------------------------------------------
const memeTemplates = ["rollsafe", "doge", "drake", "disastergirl", "buzz", "fry", "fine", "spiderman", "grumpycat", "bad"];

Module(
  {
    pattern: "[.]?meme ?(.*)",
    fromMe: isFromMe,
    desc: "Creates funny meme images with text",
    usage: "meme <top_text> | <bottom_text>",
    use: "beta",
  },
  async (message, match) => {
    const rawText = match[1] ? match[1].trim() : "";
    if (!rawText) {
      return await message.sendReply(
        `╭━━━〔 🖼️ *MEME GENERATOR* 〕━━━╮\n` +
        `┃ ⚠️ മുകളിലും താഴെയും വരേണ്ട വാചകങ്ങൾ നൽകുക!\n` +
        `┃\n` +
        `┃ 💡 *ഉദാഹരണം:*\n` +
        `┃ \`.meme പഠിക്കാൻ ഇരിക്കുമ്പോൾ | ഉറക്കം വരുന്നു\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply("_🎨 മീം തയ്യാറാക്കുന്നു... അല്പം കാത്തിരിക്കൂ..._");

    let topText = rawText;
    let bottomText = "";

    if (rawText.includes("|")) {
      const split = rawText.split("|");
      topText = split[0].trim();
      bottomText = split[1].trim();
    }

    const clean = (str) =>
      encodeURIComponent(
        str
          .replace(/\s+/g, "_")
          .replace(/\?/g, "~q")
          .replace(/%/g, "~p")
          .replace(/#/g, "~h")
          .replace(/\//g, "~s") || "_"
      );

    const chosenTemplate = memeTemplates[Math.floor(Math.random() * memeTemplates.length)];
    const memeUrl = `https://api.memegen.link/images/${chosenTemplate}/${clean(topText)}/${clean(bottomText)}.png`;

    try {
      await message.client.sendMessage(
        message.jid,
        {
          image: { url: memeUrl },
          caption: `╭━━━〔 😂 *OGGY-MD MEME* 〕━━━╮\n┃ 🎭 *ടെംപ്ലേറ്റ്:* ${chosenTemplate}\n╰━━━━━━━━━━━━━━━━━━━━╯`,
        },
        { quoted: message.data }
      );

      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
    } catch (err) {
      await message.sendReply("_⚠️ മീം നിർമ്മിക്കുന്നതിൽ പിശക് സംഭവിച്ചു!_");
    }
  }
);

// -------------------------------------------------------------
// 5. FAKE TWEET MAKER (.tweet)
// -------------------------------------------------------------
Module(
  {
    pattern: "[.]?tweet ?(.*)",
    fromMe: isFromMe,
    desc: "Generates realistic verified Twitter (X) post screenshot",
    usage: "tweet <text> (or reply to someone)",
    use: "beta",
  },
  async (message, match) => {
    let tweetText = match[1] ? match[1].trim() : "";

    let targetUser = message.reply_message?.sender || message.sender;
    const userNumber = targetUser.split("@")[0];

    if (!tweetText && message.reply_message?.text) {
      tweetText = message.reply_message.text;
    }

    if (!tweetText) {
      return await message.sendReply(
        `╭━━━〔 🐦 *FAKE TWEET MAKER* 〕━━━╮\n` +
        `┃ ⚠️ ട്വീറ്റിൽ വരേണ്ട വാചകം നൽകുക!\n` +
        `┃\n` +
        `┃ 💡 *ഉദാഹരണം:*\n` +
        `┃ \`.tweet നാളെ മുതൽ ഞാൻ ഗ്രൂപ്പ് വിടും!\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply("_🐦 ട്വിറ്റർ കാർഡ് നിർമ്മിക്കുന്നു..._");

    let pfpUrl = "https://i.imgur.com/8QZ9Q8w.jpeg";
    try {
      pfpUrl = await message.client.profilePictureUrl(targetUser, "image");
    } catch (e) {}

    const displayName = message.reply_message?.pushName || message.pushName || userNumber;
    const tweetUrl = `https://api.some-random-api.com/canvas/misc/tweet?displayname=${encodeURIComponent(
      displayName
    )}&username=${encodeURIComponent(userNumber)}&avatar=${encodeURIComponent(pfpUrl)}&comment=${encodeURIComponent(
      tweetText
    )}`;

    try {
      await message.client.sendMessage(
        message.jid,
        {
          image: { url: tweetUrl },
          caption: `╭━━━〔 🐦 *VERIFIED TWEET* 〕━━━╮\n┃ 👤 *അക്കൗണ്ട്:* @${userNumber}\n╰━━━━━━━━━━━━━━━━━━━━╯`,
        },
        { quoted: message.data }
      );

      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
    } catch (err) {
      await message.sendReply("_⚠️ ട്വീറ്റ് ഇമേജ് തയ്യാറാക്കാൻ സാധിച്ചില്ല!_");
    }
  }
);
