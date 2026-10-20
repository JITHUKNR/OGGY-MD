const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const isFromMe = botConfig.MODE === "public" ? false : true;

// ഗ്രൂപ്പുകളിലെ ആക്ടീവ് ക്വിസുകൾ ട്രാക്ക് ചെയ്യാൻ
const activeQuiz = {};

// പോയിന്റുകൾ സേവ് ചെയ്യാനുള്ള ഫയൽ
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

// ബാക്ക്-അപ്പ് ചോദ്യങ്ങൾ (നെറ്റ്‌വർക്ക് എറർ വന്നാൽ ഉപയോഗിക്കാൻ)
const fallbackQuestions = [
  {
    question: "കേരളത്തിലെ ആദ്യത്തെ മുഖ്യമന്ത്രി ആരാണ്?",
    options: ["A) ഇ.എം.എസ്", "B) പട്ടം താണുപിള്ള", "C) സി. അച്യുതമേനോൻ", "D) ആർ. ശങ്കർ"],
    answer: "A"
  },
  {
    question: "'മണിച്ചിത്രത്താഴ്' സിനിമയിലെ നാഗവല്ലിക്ക് ശബ്ദം നൽകിയത് ആര്?",
    options: ["A) ശോഭന", "B) ഭാഗ്യലക്ഷ്മി", "C) ദുർഗ്ഗ", "D) ആനന്ദവല്ലി"],
    answer: "B"
  },
  {
    question: "മലയാള സിനിമയിലെ ആദ്യത്തെ ശബ്ദ ചിത്രം (Talkie) ഏതാണ്?",
    options: ["A) വിഗതകുമാരൻ", "B) ബാലൻ", "C) ജീവിതനൗക", "D) നീലക്കുയിൽ"],
    answer: "B"
  },
  {
    question: "കേരളത്തിന്റെ ഔദ്യോഗിക പക്ഷി ഏതാണ്?",
    options: ["A) മയിൽ", "B) വേഴാമ്പൽ", "C) കാക്ക", "D) കുയിൽ"],
    answer: "B"
  }
];

// Pollinations AI വഴി ചോദ്യം ഉണ്ടാക്കുന്ന ഫംഗ്ഷൻ
async function generateQuizQuestion() {
  const prompt = "Generate 1 fun and engaging trivia question in Malayalam about Kerala, Malayalam Cinema, or General Knowledge. Give exactly 4 options labeled A, B, C, D and state the correct option letter. Format strictly as JSON with keys: \"question\", \"options\" (array of 4 strings like 'A) ...'), and \"answer\" (single letter 'A', 'B', 'C', or 'D'). Only valid JSON without markdown formatting.";
  try {
    const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&json=true`, { timeout: 15000 });
    let text = res.data;
    if (typeof text === "object") return text;
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(text);
    if (parsed.question && Array.isArray(parsed.options) && parsed.answer) {
      return parsed;
    }
  } catch (e) {}

  // AI കിട്ടിയില്ലെങ്കിൽ ബാക്ക്-അപ്പിൽ നിന്ന് ഒരെണ്ണം എടുക്കുന്നു
  return fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
}

// 1. ക്വിസ് തുടങ്ങാനുള്ള കമാൻഡ് (.quiz)
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
      return await message.sendReply("*_⚠️ ഈ ഗ്രൂപ്പിൽ നിലവിൽ ഒരു ക്വിസ് നടക്കുന്നുണ്ട്! ആദ്യം അതിന് ഉത്തരം നൽകൂ._*");
    }

    const waitMsg = await message.sendReply("_⏳ പുതിയ ചോദ്യം തയ്യാറാക്കുന്നു..._");
    const qData = await generateQuizQuestion();

    const quizText =
      `╭━━━〔 ⚡ *OGGY-MD QUIZ* 〕━━━╮\n` +
      `┃ ❓ *ചോദ്യം:*\n` +
      `┃ ${qData.question}\n` +
      `┃\n` +
      `┃ 🇦 ${qData.options[0]}\n` +
      `┃ 🇧 ${qData.options[1]}\n` +
      `┃ 🇨 ${qData.options[2]}\n` +
      `┃ 🇩 ${qData.options[3]}\n` +
      `┃\n` +
      `┃ ⏳ *സമയം:* 45 സെക്കൻഡ്\n` +
      `┃ 💡 *ഉത്തരം നൽകാൻ A, B, C, അല്ലെങ്കിൽ D എന്ന് അയക്കുക!*\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯`;

    if (waitMsg && waitMsg.key) {
      await message.edit(quizText, message.jid, waitMsg.key);
    } else {
      await message.sendMessage(message.jid, quizText);
    }

    // ക്വിസ് സ്റ്റേറ്റ് സെറ്റ് ചെയ്യുന്നു
    activeQuiz[message.jid] = {
      answer: qData.answer.trim().toUpperCase()[0],
      timer: setTimeout(async () => {
        if (activeQuiz[message.jid]) {
          await message.sendMessage(
            message.jid,
            `╭━━━〔 ⌛ *സമയം കഴിഞ്ഞു!* 〕━━━╮\n` +
            `┃ ആർക്കും ശരിയുത്തരം കണ്ടെത്താൻ കഴിഞ്ഞില്ല!\n` +
            `┃ ✅ *ശരിയുത്തരം:* ${activeQuiz[message.jid].answer}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`
          );
          delete activeQuiz[message.jid];
        }
      }, 45000), // 45 സെക്കൻഡ് ടൈമർ
    };
  }
);

// 2. ഉത്തരങ്ങൾ പരിശോധിച്ച് പോയിന്റ് നൽകുന്ന സിസ്റ്റം
Module(
  {
    on: "text",
    fromMe: false,
  },
  async (message) => {
    if (!message.jid || !activeQuiz[message.jid]) return;

    const userText = message.message ? message.message.trim().toUpperCase() : "";
    
    // യൂസർ A, B, C, D എന്നിവയിലേതെങ്കിലും അയച്ചാൽ ചെക്ക് ചെയ്യുന്നു
    if (["A", "B", "C", "D"].includes(userText)) {
      const current = activeQuiz[message.jid];

      if (userText === current.answer) {
        clearTimeout(current.timer);
        delete activeQuiz[message.jid];

        const senderJid = message.sender || message.data?.participant || message.jid;
        const totalPoints = saveScore(senderJid, 10);
        const senderNum = senderJid.split("@")[0];

        const winMsg =
          `╭━━━〔 🎉 *ശരിയുത്തരം!* 〕━━━╮\n` +
          `┃ 👤 *വിജയി:* @${senderNum}\n` +
          `┃ ✅ *ഉത്തരം:* ${userText}\n` +
          `┃ 🏆 *പോയിന്റ്:* +10\n` +
          `┃ 📊 *ആകെ സ്കോർ:* ${totalPoints} Pts\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`;

        await message.client.sendMessage(message.jid, {
          text: winMsg,
          mentions: [senderJid],
        }, { quoted: message.data });
      }
    }
  }
);

// 3. ലീഡർബോർഡ് കമാൻഡ് (.leaderboard / .rank)
Module(
  {
    pattern: "leaderboard ?(.*)",
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
