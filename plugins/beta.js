const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// ആക്ടീവ് പോൾ ക്വിസുകൾ ട്രാക്ക് ചെയ്യാൻ
const activePollQuiz = {};

// പോൾ ക്വിസ് വിഷയങ്ങൾ
const pollQuizTopics = [
  "Malayalam Cinema evergreen superhits and dialogues",
  "World Football, Messi, Ronaldo, World Cup records",
  "Cricket IPL, Dhoni, Kohli, World Cup moments",
  "World History, Wonders and Ancient Civilizations",
  "Human Body facts, Biology and Medicine",
  "Space, NASA, ISRO Chandrayaan and Solar System",
  "Kerala History, Rivers, Festivals and Culture",
  "Technology, Smartphones, AI and Inventions"
];

// ഇന്റർനെറ്റ് സ്ലോ ആയാൽ ഉപയോഗിക്കാനുള്ള ബാക്ക്-അപ്പ് ചോദ്യങ്ങൾ
const backupPollPool = [
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
    q: "'മണിച്ചിത്രത്താഴ്' സിനിമയിലെ നാഗവല്ലിക്ക് ശബ്ദം നൽകിയത് ആര്?",
    options: ["ഭാഗ്യലക്ഷ്മി", "ശോഭന", "ദുർഗ്ഗ", "ആനന്ദവല്ലി"],
    correct: "ഭാഗ്യലക്ഷ്മി",
    cat: "സിനിമ"
  },
  {
    q: "ലോകത്തിലെ ഏറ്റവും ഉയരം കൂടിയ കൊടുമുടി ഏതാണ്?",
    options: ["എവറസ്റ്റ്", "കെ2", "കാഞ്ചൻജംഗ", "ആനമുടി"],
    correct: "എവറസ്റ്റ്",
    cat: "ഭൂമിശാസ്ത്രം"
  },
  {
    q: "മനുഷ്യ ശരീരത്തിലെ ഏറ്റവും വലിയ ആന്തരിക അവയവം ഏതാണ്?",
    options: ["കരൾ", "ഹൃദയം", "വൃക്ക", "ശ്വാസകോശം"],
    correct: "കരൾ",
    cat: "ആരോഗ്യം"
  }
];

// ഓപ്ഷനുകൾ തനിയെ ഷഫിൾ ചെയ്യുന്ന ഫംഗ്ഷൻ (തുല്യ സാധ്യത ഉറപ്പാക്കാൻ)
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// AI വഴി പുതിയ ചോദ്യവും ഓപ്ഷനുകളും ഉണ്ടാക്കുന്ന ഫംഗ്ഷൻ
async function getSmartPollQuestion() {
  const randomCategory = pollQuizTopics[Math.floor(Math.random() * pollQuizTopics.length)];
  const randomSeed = `${Date.now()}_${Math.floor(Math.random() * 999999)}`;
  const prompt = `Create 1 unique trivia question in Malayalam about "${randomCategory}". Provide strictly 4 short multiple-choice options in Malayalam (each max 3-4 words, NO A) B) C) prefixes) and clearly state which exact option string is the correct answer. Format strictly as pure JSON with keys: "q" (question string in Malayalam), "options" (array of 4 Malayalam strings), "correct" (exact string matching one of the 4 options), and "cat" (category name in Malayalam). No markdown.`;

  try {
    const res = await axios.get(
      `https://text.pollinations.ai/${encodeURIComponent(prompt)}?seed=${randomSeed}&model=openai&json=true`,
      { timeout: 9000 }
    );

    let raw = res.data;
    if (typeof raw === "string") {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) raw = JSON.parse(match[0]);
    }

    if (raw && raw.q && Array.isArray(raw.options) && raw.options.length === 4 && raw.correct) {
      const cleanOptions = raw.options.map((opt) => opt.replace(/^[A-D]\)\s*/i, "").trim());
      const cleanCorrect = raw.correct.replace(/^[A-D]\)\s*/i, "").trim();

      return {
        q: raw.q.trim(),
        options: shuffleArray(cleanOptions),
        correct: cleanCorrect,
        cat: raw.cat || randomCategory
      };
    }
  } catch (e) {}

  const fallback = backupPollPool[Math.floor(Math.random() * backupPollPool.length)];
  return {
    q: fallback.q,
    options: shuffleArray(fallback.options),
    correct: fallback.correct,
    cat: fallback.cat
  };
}

// കമാൻഡ്: pquiz (കുത്തുണ്ടെങ്കിലും ഇല്ലെങ്കിലും പ്രവർത്തിക്കും)
Module(
  {
    pattern: "[.]?pquiz ?(.*)",
    fromMe: isFromMe,
    desc: "Starts an interactive one-tap WhatsApp Poll Quiz",
    usage: "pquiz",
    use: "beta",
  },
  async (message) => {
    if (activePollQuiz[message.jid]) {
      return await message.sendReply(`*_⚠️ നിലവിൽ ഈ ഗ്രൂപ്പിൽ ഒരു Poll Quiz നടക്കുന്നുണ്ട്! സമയം കഴിയട്ടെ._*`);
    }

    const waitMsg = await message.sendReply("_⏳ പുതിയ Poll Quiz തയ്യാറാക്കുന്നു..._");
    const item = await getSmartPollQuestion();

    if (waitMsg && waitMsg.key) {
      await message.client.sendMessage(message.jid, { delete: waitMsg.key });
    }

    // WhatsApp ഒഫീഷ്യൽ Poll മെസ്സേജ് അയക്കുന്നു
    const pollMessage = await message.client.sendMessage(message.jid, {
      poll: {
        name: `⚡ OGGY-MD POLL QUIZ ⚡\n\n❓ ${item.q}\n🏷️ വിഷയം: ${item.cat}\n\n⏱️ സമയം: 45 സെക്കൻഡ് (താഴെ ശരിയായ ഉത്തരം ടിക്ക് ചെയ്യൂ!)`,
        values: item.options,
        selectableCount: 1, // ഒരാൾക്ക് ഒരു ഓപ്ഷൻ മാത്രം ടിക്ക് ചെയ്യാൻ
      },
    });

    activePollQuiz[message.jid] = {
      q: item.q,
      correct: item.correct,
      pollKey: pollMessage.key,
      timer: setTimeout(async () => {
        if (activePollQuiz[message.jid]) {
          const finishedGame = activePollQuiz[message.jid];
          delete activePollQuiz[message.jid];

          const resultText =
            `╭━━━〔 ⌛ *സമയം കഴിഞ്ഞു!* 〕━━━╮\n` +
            `┃ ❓ *ചോദ്യം:* ${finishedGame.q}\n` +
            `┃\n` +
            `┃ ✅ *ശരിയുത്തരം:* *${finishedGame.correct}*\n` +
            `┃\n` +
            `┃ 💡 പോളിൽ ഈ ഓപ്ഷൻ ടിക്ക് ചെയ്തവർക്ക് അഭിനന്ദനങ്ങൾ! 👏\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`;

          await message.client.sendMessage(
            message.jid,
            { text: resultText },
            { quoted: finishedGame.pollKey ? { key: finishedGame.pollKey, message: { pollCreationMessage: {} } } : message.data }
          );
        }
      }, 45000), // 45 സെക്കൻഡ് വോട്ടിംഗ് സമയം
    };
  }
);
