const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const isFromMe = botConfig.MODE === "public" ? false : true;

// ആക്ടീവ് ക്വിസ് വിവരങ്ങൾ സൂക്ഷിക്കാൻ
const activeQuiz = {};
let scores = {};

// പോയിന്റ് സിസ്റ്റം (ഗ്രൂപ്പ് അടിസ്ഥാനത്തിൽ)
const SCORE_FILE = path.join(__dirname, "../quiz_scores.json");

function loadScores() {
  try {
    if (fs.existsSync(SCORE_FILE)) {
      scores = JSON.parse(fs.readFileSync(SCORE_FILE, "utf-8"));
    }
  } catch (e) {
    scores = {};
  }
}
loadScores();

function addScore(chatJid, userJid, pts) {
  try {
    if (typeof scores[chatJid] !== "object" || scores[chatJid] === null) {
      scores[chatJid] = {};
    }
    scores[chatJid][userJid] = (scores[chatJid][userJid] || 0) + pts;
    fs.writeFileSync(SCORE_FILE, JSON.stringify(scores, null, 2));
    return scores[chatJid][userJid];
  } catch (e) {
    return pts;
  }
}

// ഇന്റർനെറ്റ് സ്ലോ ആയാൽ ഉപയോഗിക്കാനുള്ള ബാക്ക്-അപ്പ് ചോദ്യങ്ങൾ
const backupQuizList = [
  {
    q: "കേരളത്തിലെ ആദ്യത്തെ മുഖ്യമന്ത്രി ആരാണ്?",
    options: ["A) ഇ.എം.എസ്", "B) പട്ടം താണുപിള്ള", "C) സി. അച്യുതമേനോൻ", "D) ആർ. ശങ്കർ"],
    a: "A",
    cat: "കേരള ചരിത്രം"
  },
  {
    q: "സൗരയൂഥത്തിലെ ഏറ്റവും വലിയ ഗ്രഹം ഏതാണ്?",
    options: ["A) ചൊവ്വ", "B) വ്യാഴം", "C) ശനി", "D) ശുക്രൻ"],
    a: "B",
    cat: "ശാസ്ത്രം"
  },
  {
    q: "ലോകകപ്പ് ഫുട്ബോൾ ചരിത്രത്തിൽ ഏറ്റവും കൂടുതൽ തവണ കിരീടം നേടിയ രാജ്യം?",
    options: ["A) അർജന്റീന", "B) ഫ്രാൻസ്", "C) ബ്രസീൽ", "D) ജർമ്മനി"],
    a: "C",
    cat: "സ്പോർട്സ്"
  },
  {
    q: "'മണിച്ചിത്രത്താഴ്' സിനിമയിലെ നാഗവല്ലിക്ക് ശബ്ദം നൽകിയത് ആര്?",
    options: ["A) ശോഭന", "B) ഭാഗ്യലക്ഷ്മി", "C) ദുർഗ്ഗ", "D) ആനന്ദവല്ലി"],
    a: "B",
    cat: "സിനിമ"
  }
];

// റാൻഡം വിഷയങ്ങൾ
const categories = [
  "Malayalam Cinema",
  "World Football and Sports",
  "World History and Monuments",
  "Science, Space and Universe",
  "Geography and Nature",
  "Anime and Pop Culture",
  "General Knowledge and Inventions",
  "Technology and Gadgets"
];

// Pollinations AI വഴി ചോദ്യം ഉണ്ടാക്കുന്ന ഫംഗ്ഷൻ
async function getSmartQuizQuestion() {
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  const prompt = `Generate 1 unique, fun trivia question in Malayalam language about ${randomCategory}. Provide 4 multiple choice options in Malayalam labeled A, B, C, D and provide the correct option letter. Format response strictly as JSON with keys: "q" (the question string in Malayalam), "options" (array of 4 Malayalam strings like ["A) ...", "B) ...", "C) ...", "D) ..."]), "a" (single correct option letter: "A", "B", "C", or "D"), and "cat" (category name in Malayalam). Do not output markdown, provide pure JSON only.`;

  try {
    const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&json=true`, {
      timeout: 10000
    });
    let raw = res.data;
    if (typeof raw === "string") {
      raw = raw.replace(/```json/gi, "").replace(/```/gi, "").trim();
      raw = JSON.parse(raw);
    }
    if (raw && raw.q && Array.isArray(raw.options) && raw.options.length === 4 && raw.a) {
      return {
        q: raw.q,
        options: raw.options,
        a: raw.a.trim().toUpperCase()[0],
        cat: raw.cat || randomCategory
      };
    }
  } catch (e) {}

  // AI കിട്ടിയില്ലെങ്കിൽ ബാക്ക്-അപ്പിൽ നിന്ന് ഒരെണ്ണം നൽകുന്നു
  return backupQuizList[Math.floor(Math.random() * backupQuizList.length)];
}

// ഉത്തരം പരിശോധിച്ച് പോയിന്റ് നൽകുന്ന ഫംഗ്ഷൻ
async function handleQuizAnswer(message, inputAns) {
  const current = activeQuiz[message.jid];
  if (!current) return;

  if (inputAns === current.ans) {
    clearTimeout(current.timer);
    delete activeQuiz[message.jid];

    const senderJid = message.sender || message.data?.participant || message.jid;
    const totalPoints = addScore(message.jid, senderJid, 10);
    const senderNum = senderJid.split("@")[0];

    const winMsg =
      `╭━━━〔 🎉 *ശരിയുത്തരം!* 〕━━━╮\n` +
      `┃ 👤 *വിജയി:* @${senderNum}\n` +
      `┃ ✅ *ഉത്തരം:* ${inputAns}\n` +
      `┃ 🏆 *പോയിന്റ്:* +10\n` +
      `┃ 📊 *ആകെ സ്കോർ:* ${totalPoints} Pts\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯`;

    await message.client.sendMessage(
      message.jid,
      { text: winMsg, mentions: [senderJid] },
      { quoted: message.data }
    );
  } else {
    await message.sendReply("_❌ തെറ്റായ ഉത്തരം! വീണ്ടും ശ്രമിക്കൂ..._");
  }
}

// 1. ചോദ്യം തുടങ്ങാൻ: .quiz
Module(
  {
    pattern: "quiz ?(.*)",
    fromMe: isFromMe,
    desc: "Starts an AI-powered Malayalam trivia quiz",
    usage: ".quiz",
    use: "game",
  },
  async (message) => {
    if (activeQuiz[message.jid]) {
      return await message.sendReply(
        `╭━━━〔 ⚠️ *ശ്രദ്ധിക്കുക* 〕━━━╮\n` +
        `┃ നിലവിൽ ഒരു ചോദ്യം നിലവിലുണ്ട്!\n` +
        `┃ ആ ചോദ്യത്തിന് റിപ്ലൈ ആയി *A, B, C, അല്ലെങ്കിൽ D* എന്ന് അയക്കൂ.\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply("_⏳ പുതിയ ചോദ്യം തയ്യാറാക്കുന്നു..._");
    const item = await getSmartQuizQuestion();

    const quizText =
      `╭━━━〔 ⚡ *OGGY-MD QUIZ* 〕━━━╮\n` +
      `┃ 🏷️ *വിഷയം:* ${item.cat}\n` +
      `┃ ❓ *ചോദ്യം:*\n` +
      `┃ ${item.q}\n` +
      `┃\n` +
      `┃ 🇦 ${item.options[0]}\n` +
      `┃ 🇧 ${item.options[1]}\n` +
      `┃ 🇨 ${item.options[2]}\n` +
      `┃ 🇩 ${item.options[3]}\n` +
      `┃\n` +
      `┃ ⏳ *സമയം:* 60 സെക്കൻഡ്\n` +
      `┃ 💡 *ഉത്തരം നൽകാൻ ഈ മെസ്സേജിന് റിപ്ലൈ ആയി A, B, C, അല്ലെങ്കിൽ D എന്ന് അയക്കുക!*\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯`;

    if (waitMsg && waitMsg.key) {
      await message.edit(quizText, message.jid, waitMsg.key);
    } else {
      await message.sendReply(quizText);
    }

    activeQuiz[message.jid] = {
      ans: item.a.toUpperCase(),
      timer: setTimeout(async () => {
        if (activeQuiz[message.jid]) {
          await message.sendReply(
            `╭━━━〔 ⌛ *സമയം കഴിഞ്ഞു!* 〕━━━╮\n` +
            `┃ ആരും ശരിയുത്തരം നൽകിയില്ല!\n` +
            `┃ ✅ *ശരിയുത്തരം:* ${activeQuiz[message.jid].ans}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`
          );
          delete activeQuiz[message.jid];
        }
      }, 60000),
    };
  }
);

// 2. ചോദ്യത്തിന് നേരിട്ട് റിപ്ലൈ ആയി (Swipe Reply) A, B, C, D എന്ന് അയക്കുമ്പോൾ ഉത്തരം എടുക്കാൻ
Module(
  {
    on: "text",
  },
  async (message) => {
    if (!message.jid || !activeQuiz[message.jid]) return;

    const rawText = (message.text || message.message || "").trim();
    const text = rawText.toUpperCase();

    const isReplyToQuiz = message.reply_message && (
      message.reply_message.text?.includes("OGGY-MD QUIZ") ||
      message.reply_message.text?.includes("ചോദ്യം")
    );

    let selectedOption = null;

    if (isReplyToQuiz) {
      const match = text.match(/^[A-D]/);
      if (match) selectedOption = match[0];
    } else if (["A", "B", "C", "D"].includes(text)) {
      selectedOption = text;
    }

    if (selectedOption) {
      await handleQuizAnswer(message, selectedOption);
    }
  }
);

// 3. ബാക്ക്-അപ്പ് കമാൻഡ്: .ans A
Module(
  {
    pattern: "ans ?(.*)",
    fromMe: isFromMe,
    desc: "Submit answer for quiz",
    usage: ".ans A",
    use: "game",
  },
  async (message, match) => {
    if (!activeQuiz[message.jid]) return;

    let inputAns = match[1] ? match[1].trim().toUpperCase() : "";
    if (inputAns && ["A", "B", "C", "D"].includes(inputAns[0])) {
      await handleQuizAnswer(message, inputAns[0]);
    }
  }
);

// 4. ഗ്രൂപ്പ് ലീഡർബോർഡ്: .leaderboard
Module(
  {
    pattern: "leaderboard ?(.*)",
    fromMe: isFromMe,
    desc: "Shows Group Quiz Leaderboard",
    usage: ".leaderboard",
    use: "game",
  },
  async (message) => {
    const chatScores = (typeof scores[message.jid] === "object" && scores[message.jid] !== null) ? scores[message.jid] : {};
    const sorted = Object.entries(chatScores).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (!sorted.length) {
      return await message.sendReply("_ഈ ഗ്രൂപ്പിൽ ഇതുവരെ ആരും ക്വിസിൽ പോയിന്റ് നേടിയിട്ടില്ല!_");
    }

    const medals = ["🥇", "🥈", "🥉", "🎖️", "🎖️"];
    let text = `╭━━━〔 🏆 *QUIZ LEADERBOARD* 〕━━━╮\n`;
    const mentions = [];

    sorted.forEach(([jid, pts], idx) => {
      const num = jid.split("@")[0];
      mentions.push(jid);
      text += `┃ ${medals[idx]} *${idx + 1}.* @${num} — *${pts} Pts*\n`;
    });

    text += `╰━━━━━━━━━━━━━━━━━━━━━╯`;
    await message.client.sendMessage(
      message.jid,
      { text, mentions },
      { quoted: message.data }
    );
  }
);

// 5. പോയിന്റ് റീസെറ്റ്: .resetquiz (ഗ്രൂപ്പിൽ അഡ്മിൻ/ഓണർ, DM-ൽ ഗ്ലോബൽ)
Module(
  {
    pattern: "resetquiz ?(.*)",
    fromMe: isFromMe,
    desc: "Resets quiz scores (Group Admin or Bot Owner)",
    usage: ".resetquiz",
    use: "game",
  },
  async (message) => {
    const isGroup = message.jid.endsWith("@g.us");
    const senderJid = message.sender || message.data?.participant || message.jid;
    const senderNum = senderJid.split("@")[0];

    // ബോട്ട് ഓണറാണോ എന്ന് നോക്കുന്നു
    const isOwner = message.fromMe || (botConfig.SUDO && botConfig.SUDO.includes(senderNum));

    // A. ഗ്രൂപ്പിലാണ് കമാൻഡ് അടിക്കുന്നതെങ്കിൽ
    if (isGroup) {
      let isAdmin = false;
      try {
        const groupMeta = await message.client.groupMetadata(message.jid);
        const participant = groupMeta.participants.find((p) => p.id === senderJid);
        if (participant && (participant.admin === "admin" || participant.admin === "superadmin")) {
          isAdmin = true;
        }
      } catch (e) {}

      if (!isAdmin && !isOwner) {
        return await message.sendReply("_⚠️ ഈ ഗ്രൂപ്പിലെ സ്കോർ റീസെറ്റ് ചെയ്യാൻ ഗ്രൂപ്പ് അഡ്മിൻമാർക്കോ ബോട്ട് ഓണർക്കോ മാത്രമേ അനുവാദമുള്ളൂ!_");
      }

      // ആ ഗ്രൂപ്പിലെ പോയിന്റുകൾ മാത്രം റീസെറ്റ് ചെയ്യുന്നു
      delete scores[message.jid];
      try {
        fs.writeFileSync(SCORE_FILE, JSON.stringify(scores, null, 2));
      } catch (e) {}

      return await message.sendReply(
        `╭━━━〔 🔄 *QUIZ RESET* 〕━━━╮\n` +
        `┃ ✅ ഈ ഗ്രൂപ്പിലെ മുഴുവൻ അംഗങ്ങളുടെയും\n` +
        `┃ ക്വിസ് പോയിന്റുകൾ പൂജ്യമായി (0) റീസെറ്റ് ചെയ്തു!\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    } 
    // B. പേഴ്സണൽ ചാറ്റിൽ (DM) ആണ് അടിക്കുന്നതെങ്കിൽ -> ഗ്ലോബൽ റീസെറ്റ്
    else {
      if (!isOwner) {
        return await message.sendReply("_⚠️ എല്ലാ ഗ്രൂപ്പുകളിലെയും സ്കോറുകൾ റീസെറ്റ് ചെയ്യാൻ ബോട്ട് ഓണർക്ക് മാത്രമേ അനുവാദമുള്ളൂ!_");
      }

      scores = {};
      try {
        fs.writeFileSync(SCORE_FILE, JSON.stringify({}, null, 2));
      } catch (e) {}

      return await message.sendReply(
        `╭━━━〔 🌐 *GLOBAL QUIZ RESET* 〕━━━╮\n` +
        `┃ ✅ എല്ലാ ഗ്രൂപ്പുകളിലെയും മുഴുവൻ ക്വിസ്\n` +
        `┃ സ്കോറുകളും പൂർണ്ണമായി പൂജ്യമായി (0) റീസെറ്റ് ചെയ്തു!\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }
  }
);
