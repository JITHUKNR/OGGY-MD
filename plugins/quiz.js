const { Module } = require("../main");
const botConfig = require("../config");
const fs = require("fs");
const path = require("path");

const isFromMe = botConfig.MODE === "public" ? false : true;

// ആക്ടീവ് ക്വിസ് ട്രാക്ക് ചെയ്യാൻ
const activeQuiz = {};
const SCORE_FILE = path.join(__dirname, "../quiz_scores.json");

function getScores() {
  try {
    if (!fs.existsSync(SCORE_FILE)) fs.writeFileSync(SCORE_FILE, JSON.stringify({}));
    return JSON.parse(fs.readFileSync(SCORE_FILE, "utf-8"));
  } catch (e) {
    return {};
  }
}

function saveScore(jid, points) {
  try {
    const scores = getScores();
    scores[jid] = (scores[jid] || 0) + points;
    fs.writeFileSync(SCORE_FILE, JSON.stringify(scores, null, 2));
    return scores[jid];
  } catch (e) {
    return 0;
  }
}

// ചോദ്യങ്ങളുടെ ശേഖരം (സ്പോട്ടിൽ ചോദ്യം വരും, ലാഗ് ഉണ്ടാവില്ല)
const quizDatabase = [
  {
    q: "കേരളത്തിലെ ആദ്യത്തെ മുഖ്യമന്ത്രി ആരാണ്?",
    options: ["A) ഇ.എം.എസ്", "B) പട്ടം താണുപിള്ള", "C) സി. അച്യുതമേനോൻ", "D) ആർ. ശങ്കർ"],
    a: "A"
  },
  {
    q: "'മണിച്ചിത്രത്താഴ്' സിനിമയിലെ നാഗവല്ലിക്ക് ശബ്ദം നൽകിയത് ആര്?",
    options: ["A) ശോഭന", "B) ഭാഗ്യലക്ഷ്മി", "C) ദുർഗ്ഗ", "D) ആനന്ദവല്ലി"],
    a: "B"
  },
  {
    q: "മലയാള സിനിമയിലെ ആദ്യത്തെ ശബ്ദ ചിത്രം (Talkie) ഏതാണ്?",
    options: ["A) വിഗതകുമാരൻ", "B) ബാലൻ", "C) ജീവിതനൗക", "D) നീലക്കുയിൽ"],
    a: "B"
  },
  {
    q: "കേരളത്തിന്റെ ഔദ്യോഗിക പക്ഷി ഏതാണ്?",
    options: ["A) മയിൽ", "B) വേഴാമ്പൽ", "C) കാക്ക", "D) കുയിൽ"],
    a: "B"
  },
  {
    q: "'സന്ദേശം' സിനിമ സംവിധാനം ചെയ്തത് ആര്?",
    options: ["A) സത്യൻ അന്തിക്കാട്", "B) പ്രിയദർശൻ", "C) ശ്രീനിവാസൻ", "D) ഫാസിൽ"],
    a: "A"
  },
  {
    q: "കേരളത്തിലെ ഏറ്റവും വലിയ നദി ഏതാണ്?",
    options: ["A) ഭാരതപ്പുഴ", "B) പെരിയാർ", "C) പമ്പ", "D) ചാലിയാർ"],
    a: "B"
  },
  {
    q: "മോഹൻലാലിന് ആദ്യമായി മികച്ച നടനുള്ള ദേശീയ അവാർഡ് നേടിക്കൊടുത്ത ചിത്രം?",
    options: ["A) കിരീടം", "B) ഭാരതം", "C) വാനപ്രസ്ഥം", "D) സ്ഫടികം"],
    a: "B"
  }
];

// 1. ചോദ്യം ചോദിക്കാൻ: .quiz അല്ലെങ്കിൽ . quiz
Module(
  {
    pattern: "\\s*quiz ?(.*)",
    fromMe: isFromMe,
    desc: "Starts a Malayalam trivia quiz",
    usage: ".quiz",
    use: "game",
  },
  async (message) => {
    if (activeQuiz[message.jid]) {
      return await message.sendReply("*_⚠️ ഈ ഗ്രൂപ്പിൽ നിലവിൽ ഒരു ചോദ്യമുണ്ട്! .ans [ഓപ്ഷൻ] എന്ന് അടിച്ച് ഉത്തരം പറയൂ._*");
    }

    const qData = quizDatabase[Math.floor(Math.random() * quizDatabase.length)];

    const quizText =
      `╭━━━〔 ⚡ *OGGY-MD QUIZ* 〕━━━╮\n` +
      `┃ ❓ *ചോദ്യം:*\n` +
      `┃ ${qData.q}\n` +
      `┃\n` +
      `┃ 🇦 ${qData.options[0]}\n` +
      `┃ 🇧 ${qData.options[1]}\n` +
      `┃ 🇨 ${qData.options[2]}\n` +
      `┃ 🇩 ${qData.options[3]}\n` +
      `┃\n` +
      `┃ ⏳ *സമയം:* 60 സെക്കൻഡ്\n` +
      `┃ 💡 *ഉത്തരം നൽകാൻ:* \`.ans A\` *(അല്ലെങ്കിൽ B, C, D)*\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯`;

    await message.sendMessage(message.jid, quizText);

    activeQuiz[message.jid] = {
      answer: qData.a.toUpperCase(),
      timer: setTimeout(async () => {
        if (activeQuiz[message.jid]) {
          await message.sendMessage(
            message.jid,
            `╭━━━〔 ⌛ *സമയം കഴിഞ്ഞു!* 〕━━━╮\n` +
            `┃ ആരും ശരിയുത്തരം നൽകിയില്ല!\n` +
            `┃ ✅ *ശരിയുത്തരം:* ${activeQuiz[message.jid].answer}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`
          );
          delete activeQuiz[message.jid];
        }
      }, 60000),
    };
  }
);

// 2. ഉത്തരം നൽകാൻ: .ans A അല്ലെങ്കിൽ .ans B
Module(
  {
    pattern: "\\s*ans ?(.*)",
    fromMe: isFromMe,
    desc: "Submit answer for quiz",
    usage: ".ans A",
    use: "game",
  },
  async (message, match) => {
    if (!activeQuiz[message.jid]) {
      return await message.sendReply("_ഇവിടെ ഇപ്പോൾ ആക്ടീവ് ക്വിസ് ഒന്നുമില്ല. ചോദ്യം വരാൻ .quiz എന്ന് അയക്കൂ!_");
    }

    let userAns = match[1] ? match[1].trim().toUpperCase() : "";
    if (!userAns) {
      return await message.sendReply("_ഉത്തരം നൽകാൻ ഓപ്ഷൻ കൂടി നൽകുക! ഉദാഹരണത്തിന്: .ans A_");
    }

    const current = activeQuiz[message.jid];

    if (userAns === current.answer) {
      clearTimeout(current.timer);
      delete activeQuiz[message.jid];

      const senderJid = message.sender || message.data?.participant || message.jid;
      const totalPoints = saveScore(senderJid, 10);
      const senderNum = senderJid.split("@")[0];

      const winMsg =
        `╭━━━〔 🎉 *ശരിയുത്തരം!* 〕━━━╮\n` +
        `┃ 👤 *വിജയി:* @${senderNum}\n` +
        `┃ ✅ *ഉത്തരം:* ${userAns}\n` +
        `┃ 🏆 *പോയിന്റ്:* +10\n` +
        `┃ 📊 *ആകെ സ്കോർ:* ${totalPoints} Pts\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`;

      await message.client.sendMessage(message.jid, {
        text: winMsg,
        mentions: [senderJid],
      }, { quoted: message.data });
    } else {
      await message.sendReply("_❌ തെറ്റായ ഉത്തരം! വീണ്ടും ശ്രമിക്കൂ..._");
    }
  }
);

// 3. ലീഡർബോർഡ് കാണാൻ: .leaderboard
Module(
  {
    pattern: "\\s*leaderboard ?(.*)",
    fromMe: isFromMe,
    desc: "Shows Quiz Leaderboard",
    usage: ".leaderboard",
    use: "game",
  },
  async (message) => {
    const scores = getScores();
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (!sorted.length) {
      return await message.sendReply("_ഇതുവരെ ആരും ക്വിസിൽ പോയിന്റ് നേടിയിട്ടില്ല!_");
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
    await message.client.sendMessage(message.jid, { text, mentions }, { quoted: message.data });
  }
);
