const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const isFromMe = botConfig.MODE === "public" ? false : true;

// ഗ്രൂപ്പുകളിലെ ആക്ടീവ് റിയാക്ഷൻ ക്വിസുകൾ സൂക്ഷിക്കാൻ
const activeReactionQuiz = {};

// പോയിന്റ് സിസ്റ്റം (quiz_scores.json)
const SCORE_FILE = path.join(__dirname, "../quiz_scores.json");
let scores = {};

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

// ബാക്ക്-അപ്പ് ചോദ്യ ശേഖരം
const backupQuestions = [
  {
    q: "കേരളത്തിലെ ആദ്യത്തെ മുഖ്യമന്ത്രി ആരാണ്?",
    options: ["ഇ.എം.എസ്", "പട്ടം താണുപിള്ള", "സി. അച്യുതമേനോൻ", "ആർ. ശങ്കർ"],
    correct: "ഇ.എം.എസ്",
    cat: "കേരള ചരിത്രം"
  },
  {
    q: "സൗരയൂഥത്തിലെ ഏറ്റവും വലിയ ഗ്രഹം ഏതാണ്?",
    options: ["വ്യാഴം", "ചൊവ്വ", "ശനി", "ശുക്രൻ"],
    correct: "വ്യാഴം",
    cat: "ശാസ്ത്രം"
  },
  {
    q: "ലോകകപ്പ് ഫുട്ബോൾ ഏറ്റവും കൂടുതൽ തവണ നേടിയ രാജ്യം?",
    options: ["ബ്രസീൽ", "അർജന്റീന", "ഫ്രാൻസ്", "ജർമ്മനി"],
    correct: "ബ്രസീൽ",
    cat: "സ്പോർട്സ്"
  },
  {
    q: "ലോകത്തിലെ ഏറ്റവും ഉയരം കൂടിയ കൊടുമുടി ഏതാണ്?",
    options: ["എവറസ്റ്റ്", "കെ2", "കാഞ്ചൻജംഗ", "ആനമുടി"],
    correct: "എവറസ്റ്റ്",
    cat: "ഭൂമിശാസ്ത്രം"
  },
  {
    q: "'മണിച്ചിത്രത്താഴ്' സിനിമയിലെ നാഗവല്ലിക്ക് ശബ്ദം നൽകിയത് ആര്?",
    options: ["ഭാഗ്യലക്ഷ്മി", "ശോഭന", "ദുർഗ്ഗ", "ആനന്ദവല്ലി"],
    correct: "ഭാഗ്യലക്ഷ്മി",
    cat: "സിനിമ"
  }
];

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// AI വഴി ചോദ്യങ്ങൾ ഉണ്ടാക്കുന്ന ഫംഗ്ഷൻ (ഓപ്ഷനുകൾ തനിയെ ഷഫിൾ ചെയ്യും)
async function getReactionQuestion() {
  const topics = [
    "Malayalam Cinema",
    "World Football and Sports",
    "Science and Universe",
    "World Wonders and Geography",
    "Human Body and Biology"
  ];
  const randomTopic = topics[Math.floor(Math.random() * topics.length)];
  const seed = `${Date.now()}_${Math.floor(Math.random() * 999999)}`;
  const prompt = `Create 1 unique trivia question in Malayalam language about "${randomTopic}". Provide 4 short options in Malayalam (NO letter prefixes like A, B, C) and indicate the correct answer string. Return strictly pure JSON with keys: "q", "options" (array of 4 Malayalam strings), "correct" (exact string of correct option), and "cat". No markdown.`;

  try {
    const res = await axios.get(
      `https://text.pollinations.ai/${encodeURIComponent(prompt)}?seed=${seed}&model=openai&json=true`,
      { timeout: 8000 }
    );
    let raw = res.data;
    if (typeof raw === "string") {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) raw = JSON.parse(match[0]);
    }
    if (raw && raw.q && Array.isArray(raw.options) && raw.options.length === 4 && raw.correct) {
      const cleanOpts = raw.options.map((o) => o.replace(/^[A-D1-4]\)\s*/i, "").trim());
      const cleanCorrect = raw.correct.replace(/^[A-D1-4]\)\s*/i, "").trim();
      return {
        q: raw.q.trim(),
        options: shuffleArray(cleanOpts),
        correct: cleanCorrect,
        cat: raw.cat || randomTopic
      };
    }
  } catch (e) {}

  const fb = backupQuestions[Math.floor(Math.random() * backupQuestions.length)];
  return {
    q: fb.q,
    options: shuffleArray(fb.options),
    correct: fb.correct,
    cat: fb.cat
  };
}

// ഇമോജികളെ നമ്പറുകളാക്കി മാറ്റുന്ന മാപ്പിംഗ്
const emojiMap = {
  "1️⃣": 0, "1": 0, "🇦": 0, "a": 0,
  "2️⃣": 1, "2": 1, "🇧": 1, "b": 1,
  "3️⃣": 2, "3": 2, "🇨": 2, "c": 2,
  "4️⃣": 3, "4": 3, "🇩": 3, "d": 3
};

// ഇമോജി റിയാക്ഷനുകൾ തത്സമയം നിരീക്ഷിക്കുന്ന ലിസണർ
function attachReactionListener(client) {
  if (client._rquizListenerReady) return;
  client._rquizListenerReady = true;

  client.ev.on("messages.reaction", async (reactions) => {
    try {
      for (const r of reactions) {
        const targetMsgId = r.key?.id;
        const chatJid = r.key?.remoteJid;
        const rawReaction = r.reaction?.text || r.text;

        if (!targetMsgId || !chatJid || !rawReaction || !activeReactionQuiz[chatJid]) continue;

        const game = activeReactionQuiz[chatJid];
        if (game.msgId !== targetMsgId) continue;

        const senderJid = r.key.participant || r.participant || r.key.remoteJid;
        const senderNum = senderJid.split("@")[0];

        // ഇതിനകം ടാപ്പ് ചെയ്ത ആളാണെങ്കിൽ മാറ്റി കുത്താൻ അനുവദിക്കില്ല
        if (game.lockedUsers[senderJid]) continue;

        const cleanReaction = rawReaction.trim().toLowerCase();
        const selectedIndex = emojiMap[cleanReaction];

        if (selectedIndex === undefined || selectedIndex < 0 || selectedIndex > 3) continue;

        // ആദ്യ ശ്രമം ലോക്ക് ചെയ്യുന്നു
        const userChoice = game.options[selectedIndex];
        game.lockedUsers[senderJid] = userChoice;

        // ഉത്തരം ശരിയാണെങ്കിൽ ഉടനടി വിജയിയെ പ്രഖ്യാപിക്കുന്നു
        if (userChoice === game.correct) {
          clearTimeout(game.timer);
          delete activeReactionQuiz[chatJid];

          const totalPts = addScore(chatJid, senderJid, 10);
          const winMsg =
            `╭━━━〔 🎉 *ശരിയുത്തരം!* 〕━━━╮\n` +
            `┃ 👤 *വിജയി:* @${senderNum}\n` +
            `┃ ✅ *ഉത്തരം:* ${userChoice}\n` +
            `┃ 🏆 *പോയിന്റ്:* +10\n` +
            `┃ 📊 *ആകെ സ്കോർ:* ${totalPts} Pts\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`;

          await client.sendMessage(
            chatJid,
            { text: winMsg, mentions: [senderJid] },
            { quoted: { key: game.msgKey, message: { conversation: game.q } } }
          );
          break;
        } else {
          // തെറ്റായ ചോയ്‌സാണെങ്കിൽ വാണിംഗ് നൽകി ബ്ലോക്ക് ചെയ്യുന്നു
          const wrongMsg = `_❌ തെറ്റായ ചോയ്‌സ് (@${senderNum})! നിങ്ങളുടെ ആദ്യ ശ്രമം ലോക്ക് ചെയ്തു._`;
          await client.sendMessage(
            chatJid,
            { text: wrongMsg, mentions: [senderJid] },
            { quoted: { key: game.msgKey, message: { conversation: game.q } } }
          );
        }
      }
    } catch (e) {}
  });
}

// കമാൻഡ്: rquiz (കുത്തുണ്ടെങ്കിലും ഇല്ലെങ്കിലും പ്രവർത്തിക്കും)
Module(
  {
    pattern: "[.]?rquiz ?(.*)",
    fromMe: isFromMe,
    desc: "Starts an interactive Tap-to-Answer Emoji Reaction Quiz",
    usage: "rquiz",
    use: "beta",
  },
  async (message) => {
    if (activeReactionQuiz[message.jid]) {
      return await message.sendReply(`*_⚠️ നിലവിൽ ഈ ഗ്രൂപ്പിൽ ഒരു Reaction Quiz നടക്കുന്നുണ്ട്! സമയം കഴിയട്ടെ._*`);
    }

    attachReactionListener(message.client);

    const waitMsg = await message.sendReply("_⏳ പുതിയ Reaction Quiz തയ്യാറാക്കുന്നു..._");
    const item = await getReactionQuestion();

    const quizText =
      `╭━━━〔 ⚡ *OGGY-MD REACTION QUIZ* 〕━━━╮\n` +
      `┃ 🏷️ *വിഷയം:* ${item.cat}\n` +
      `┃ ❓ *ചോദ്യം:*\n` +
      `┃ ${item.q}\n` +
      `┃\n` +
      `┃ 1️⃣ ${item.options[0]}\n` +
      `┃ 2️⃣ ${item.options[1]}\n` +
      `┃ 3️⃣ ${item.options[2]}\n` +
      `┃ 4️⃣ ${item.options[3]}\n` +
      `┃\n` +
      `┃ 💡 *ഉത്തരം നൽകാൻ ഈ മെസ്സേജിൽ അമർത്തിപ്പിടിച്ച്*\n` +
      `┃    *1️⃣, 2️⃣, 3️⃣, അല്ലെങ്കിൽ 4️⃣ റിയാക്ട് ചെയ്യുക!*\n` +
      `┃ 🔒 *ആദ്യം റിയാക്ട് ചെയ്യുന്ന ചോയ്‌സ് ലോക്കാവും!*\n` +
      `┃ ⏳ *സമയം:* 60 സെക്കൻഡ്\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯`;

    let sentMsg;
    if (waitMsg && waitMsg.key) {
      await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      sentMsg = await message.sendReply(quizText);
    } else {
      sentMsg = await message.sendReply(quizText);
    }

    const quizMsgKey = sentMsg.key || sentMsg.data?.key;

    activeReactionQuiz[message.jid] = {
      msgId: quizMsgKey.id,
      msgKey: quizMsgKey,
      q: item.q,
      options: item.options,
      correct: item.correct,
      lockedUsers: {},
      timer: setTimeout(async () => {
        if (activeReactionQuiz[message.jid]) {
          const finishedGame = activeReactionQuiz[message.jid];
          delete activeReactionQuiz[message.jid];

          const timeoutMsg =
            `╭━━━〔 ⌛ *സമയം കഴിഞ്ഞു!* 〕━━━╮\n` +
            `┃ ആരും ശരിയുത്തരം റിയാക്ട് ചെയ്തില്ല!\n` +
            `┃ ✅ *ശരിയുത്തരം:* *${finishedGame.correct}*\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`;

          await message.client.sendMessage(
            message.jid,
            { text: timeoutMsg },
            { quoted: { key: finishedGame.msgKey, message: { conversation: finishedGame.q } } }
          );
        }
      }, 60000),
    };
  }
);
