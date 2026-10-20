const { Module } = require("../main");
const botConfig = require("../config");
const fs = require("fs");
const path = require("path");

const isFromMe = botConfig.MODE === "public" ? false : true;

// ആക്ടീവ് ക്വിസ് വിവരങ്ങൾ സൂക്ഷിക്കാൻ
const activeQuiz = {};
let scores = {};

// പോയിന്റ് സിസ്റ്റം
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

function addScore(jid, pts) {
  try {
    scores[jid] = (scores[jid] || 0) + pts;
    fs.writeFileSync(SCORE_FILE, JSON.stringify(scores, null, 2));
    return scores[jid];
  } catch (e) {
    return (scores[jid] || 0) + pts;
  }
}

// ചോദ്യങ്ങളുടെ ശേഖരം
const quizList = [
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
    q: "കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി ഏതാണ്?",
    options: ["A) ഭാരതപ്പുഴ", "B) പെരിയാർ", "C) പമ്പ", "D) ചാലിയാർ"],
    a: "B"
  },
  {
    q: "മോഹൻലാലിന് ആദ്യമായി മികച്ച നടനുള്ള ദേശീയ അവാർഡ് നേടിക്കൊടുത്ത ചിത്രം?",
    options: ["A) കിരീടം", "B) ഭാരതം", "C) വാനപ്രസ്ഥം", "D) സ്ഫടികം"],
    a: "B"
  },
  {
    q: "ലോകകപ്പ് ഫുട്ബോൾ ചരിത്രത്തിൽ ഏറ്റവും കൂടുതൽ തവണ കിരീടം നേടിയ രാജ്യം?",
    options: ["A) അർജന്റീന", "B) ഫ്രാൻസ്", "C) ബ്രസീൽ", "D) ജർമ്മനി"],
    a: "C"
  }
];

// ഉത്തരം പരിശോധിക്കുന്ന കോമൺ ഫംഗ്ഷൻ
async function handleQuizAnswer(message, inputAns) {
  const current = activeQuiz[message.jid];
  if (!current) return;

  if (inputAns === current.ans) {
    clearTimeout(current.timer);
    delete activeQuiz[message.jid];

    const senderJid = message.sender || message.data?.participant || message.jid;
    const totalPoints = addScore(senderJid, 10);
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

// 1. ചോദ്യം വരാൻ: .quiz
Module(
  {
    pattern: "quiz ?(.*)",
    fromMe: isFromMe,
    desc: "Starts a Malayalam trivia quiz",
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

    const item = quizList[Math.floor(Math.random() * quizList.length)];

    const quizText =
      `╭━━━〔 ⚡ *OGGY-MD QUIZ* 〕━━━╮\n` +
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

    await message.sendReply(quizText);

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

    // മെസ്സേജ് ചോദ്യത്തിനുള്ള റിപ്ലൈ ആണോ എന്ന് നോക്കുന്നു
    const isReplyToQuiz = message.reply_message && (
      message.reply_message.text?.includes("OGGY-MD QUIZ") ||
      message.reply_message.text?.includes("ചോദ്യം")
    );

    let selectedOption = null;

    // A) ചോദ്യത്തിന് റിപ്ലൈ ആയി A, B, C, D എന്ന് അയച്ചാൽ
    if (isReplyToQuiz) {
      const match = text.match(/^[A-D]/);
      if (match) selectedOption = match[0];
    }
    // B) റിപ്ലൈ ചെയ്യാതെ ഗ്രൂപ്പിൽ വെറുതെ A, B, C, D എന്ന് അയച്ചാലും സ്വീകരിക്കും
    else if (["A", "B", "C", "D"].includes(text)) {
      selectedOption = text;
    }

    if (selectedOption) {
      await handleQuizAnswer(message, selectedOption);
    }
  }
);

// 3. ആരെങ്കിലും പഴയതുപോലെ .ans A എന്ന് അടിച്ചാലും വർക്ക് ആവാനുള്ള ബാക്ക്-അപ്പ്
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

// 4. ലീഡർബോർഡ്: .leaderboard
Module(
  {
    pattern: "leaderboard ?(.*)",
    fromMe: isFromMe,
    desc: "Shows Quiz Leaderboard",
    usage: ".leaderboard",
    use: "game",
  },
  async (message) => {
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
    await message.client.sendMessage(
      message.jid,
      { text, mentions },
      { quoted: message.data }
    );
  }
);
