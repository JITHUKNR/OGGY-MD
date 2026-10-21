const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const isFromMe = botConfig.MODE === "public" ? false : true;

// ഗ്രൂപ്പുകളിലെ ആക്ടീവ് ഗെയിം ട്രാക്ക് ചെയ്യാൻ (ക്ലാഷ് വരാതിരിക്കാൻ)
const activeGame = {};
let scores = {};

// പോയിന്റ് സിസ്റ്റം (പഴയ സ്കോറുകൾ നഷ്ടപ്പെടാതെ quiz_scores.json-ൽ തന്നെ സൂക്ഷിക്കുന്നു)
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

// ------------------- ഡാറ്റാബേസുകൾ -------------------

// 1. ക്വിസ് ബാക്ക്-അപ്പ് ചോദ്യങ്ങൾ
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

// ഇന്റർനെറ്റ് സ്ലോ ആയാൽ ഉപയോഗിക്കാനുള്ള ബാക്ക്-അപ്പുകൾ
const backupEmojiMovies = [
  { emoji: "👑 + 🗡️", name: "കിരീടം", aliases: ["kireedam", "കിരീടം"] },
  { emoji: "👻 + 🏰", name: "മണിച്ചിത്രത്താഴ്", aliases: ["manichitrathazhu", "മണിച്ചിത്രത്താഴ്"] },
  { emoji: "⚡ + 🦸‍♂️", name: "മിന്നൽ മുരളി", aliases: ["minnal murali", "മിന്നൽ മുരളി"] },
  { emoji: "🐐 + 🏜️", name: "ആടുജീവിതം", aliases: ["aadujeevitham", "the goat life", "ആടുജീവിതം"] },
  { emoji: "🦁 + 🌲", name: "പുലിമുരുകൻ", aliases: ["pulimurugan", "പുലിമുരുകൻ"] },
  { emoji: "🔥 + 🕶️", name: "ലൂസിഫർ", aliases: ["lucifer", "ലൂസിഫർ"] },
  { emoji: "☕ + 🦋", name: "പ്രേമം", aliases: ["premam", "പ്രേമം"] },
  { emoji: "🥊 + 🧑‍🦱", name: "തല്ലുമാല", aliases: ["thallumaala", "thallumala", "തല്ലുമാല"] },
  { emoji: "🚗 + 🪪", name: "ഡ്രൈവിംഗ് ലൈസൻസ്", aliases: ["driving licence", "driving license", "ഡ്രൈവിംഗ് ലൈസൻസ്"] }
];

const backupTruths = [
  "നിങ്ങളുടെ ജീവിതത്തിൽ ആരോടും പറയാത്ത ഏറ്റവും വലിയ രഹസ്യം എന്താണ്?",
  "ഈ ഗ്രൂപ്പിൽ ഏറ്റവും കൂടുതൽ ക്രഷ് തോന്നിയിട്ടുള്ളത് ആരോടാണ്?",
  "ജീവിതത്തിൽ ഏറ്റവും കൂടുതൽ നാണക്കേട് തോന്നിയ ഒരു സംഭവം പറയൂ?",
  "നിങ്ങൾ അവസാനം പറഞ്ഞ കള്ളം എന്തായിരുന്നു?",
  "ഫോണിൽ ഏറ്റവും കൂടുതൽ സമയം ചാറ്റ് ചെയ്യുന്നത് ആരോടാണ്?",
  "നിങ്ങൾക്ക് ഏറ്റവും കൂടുതൽ ദേഷ്യം വരാറുള്ളത് ആരുടെ പെരുമാറ്റത്തിലാണ്?"
];

const backupDares = [
  "ഗ്രൂപ്പിൽ ഒരു പാട്ട് പാടി 20 സെക്കൻഡ് വോയ്സ് നോട്ട് ഇടുക!",
  "നിങ്ങളുടെ ഫോണിലെ അവസാനമായി എടുത്ത ഫോട്ടോ ഗ്രൂപ്പിൽ അയക്കുക!",
  "അടുത്ത 1 മണിക്കൂർ നേരത്തേക്ക് നിങ്ങളുടെ പ്രൊഫൈൽ നെയിം 'പൊട്ടൻ' എന്ന് മാറ്റുക!",
  "ഈ ഗ്രൂപ്പിലെ ഏതെങ്കിലും ഒരാളെ മെൻഷൻ ചെയ്ത് ഒരു കിടിലൻ ഡയലോഗ് അടിക്കുക!",
  "ഏറ്റവും കോമഡിയായ ഒരു സെൽഫി എടുത്ത് ഇപ്പോൾ തന്നെ ഗ്രൂപ്പിൽ അയക്കുക!"
];

// Pollinations AI വഴി പുതിയ മലയാള സിനിമയും ഇമോജികളും ഉണ്ടാക്കാൻ
async function getSmartEmojiMovie() {
  const seed = `${Date.now()}_${Math.floor(Math.random() * 999999)}`;
  const prompt = `Pick 1 famous Malayalam movie and create 2 to 4 clue emojis for an emoji movie guessing game. Return strictly pure JSON with keys: "name" (official movie title in Malayalam), "emoji" (string of emojis separated with +, e.g. "👑 + 🗡️"), and "aliases" (array containing movie name in Malayalam and lowercase English transliterations, e.g. ["kireedam", "കിരീടം"]). No markdown.`;

  try {
    const res = await axios.get(
      `https://text.pollinations.ai/${encodeURIComponent(prompt)}?seed=${seed}&model=openai&json=true`,
      { timeout: 8000 }
    );
    let raw = res.data;
    if (typeof raw === "string") {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) raw = JSON.parse(m[0]);
    }
    if (raw && raw.name && raw.emoji && Array.isArray(raw.aliases) && raw.aliases.length > 0) {
      const cleanAliases = raw.aliases.map((a) => a.toLowerCase().trim());
      cleanAliases.push(raw.name.toLowerCase().trim());
      return {
        name: raw.name.trim(),
        emoji: raw.emoji.trim(),
        aliases: cleanAliases
      };
    }
  } catch (e) {}

  return backupEmojiMovies[Math.floor(Math.random() * backupEmojiMovies.length)];
}

// Pollinations AI വഴി ട്രൂത്ത് ചോദ്യങ്ങൾ ഉണ്ടാക്കാൻ
async function getSmartTruth() {
  const seed = `${Date.now()}_${Math.floor(Math.random() * 999999)}`;
  const prompt = `Generate 1 fun, juicy, slightly embarrassing or deep Truth question in Malayalam language for a WhatsApp friend group party game. Return strictly pure JSON with key: "text". No markdown.`;
  try {
    const res = await axios.get(
      `https://text.pollinations.ai/${encodeURIComponent(prompt)}?seed=${seed}&model=openai&json=true`,
      { timeout: 7000 }
    );
    let raw = res.data;
    if (typeof raw === "string") {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) raw = JSON.parse(m[0]);
    }
    if (raw && raw.text) return raw.text.trim();
  } catch (e) {}
  return backupTruths[Math.floor(Math.random() * backupTruths.length)];
}

// Pollinations AI വഴി ഡെയർ ടാസ്കുകൾ ഉണ്ടാക്കാൻ
async function getSmartDare() {
  const seed = `${Date.now()}_${Math.floor(Math.random() * 999999)}`;
  const prompt = `Generate 1 hilarious, bold, daring party task in Malayalam language to do inside a WhatsApp group (like voice note singing, funny selfie, status update, mimicry). Return strictly pure JSON with key: "text". No markdown.`;
  try {
    const res = await axios.get(
      `https://text.pollinations.ai/${encodeURIComponent(prompt)}?seed=${seed}&model=openai&json=true`,
      { timeout: 7000 }
    );
    let raw = res.data;
    if (typeof raw === "string") {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) raw = JSON.parse(m[0]);
    }
    if (raw && raw.text) return raw.text.trim();
  } catch (e) {}
  return backupDares[Math.floor(Math.random() * backupDares.length)];
}

// ചോദിച്ച ചോദ്യങ്ങൾ സ്ഥിരമായി ഫയലിൽ സൂക്ഷിക്കാൻ (റീസ്റ്റാർട്ട് ആയാലും ഓർത്തു വെക്കും)
const HISTORY_FILE = path.join(__dirname, "../quiz_history.json");
let quizHistory = [];

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      quizHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    }
  } catch (e) {
    quizHistory = [];
  }
}
loadHistory();

function isAlreadyAsked(qText) {
  if (!qText) return true;
  const clean = qText.replace(/[^a-zA-Z0-9\u0D00-\u0D7F]/g, "").trim().toLowerCase();
  return quizHistory.some((item) => item.replace(/[^a-zA-Z0-9\u0D00-\u0D7F]/g, "").trim().toLowerCase() === clean);
}

function recordQuestion(qText) {
  try {
    quizHistory.push(qText.trim());
    if (quizHistory.length > 500) quizHistory.shift(); // 500 ചോദ്യങ്ങൾ വരെ ഓർത്തു വെക്കും
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(quizHistory, null, 2));
  } catch (e) {}
}

// ലോകത്തിലെ സകല വൈവിധ്യമാർന്ന വിഷയങ്ങൾ
const globalQuizTopics = [
  "Malayalam Cinema evergreen hits, Mohanlal, Mammootty and famous dialogues",
  "World Football, FIFA World Cup, Champions League, Messi and Ronaldo",
  "Cricket records, IPL, Sachin Tendulkar, MS Dhoni and Virat Kohli",
  "World History, Empires, World War II and Ancient Wonders",
  "Human Body anatomy, Medical science and Biology facts",
  "Space, Planets, NASA, ISRO Chandrayaan and Black Holes",
  "World Geography, Countries, Capitals, Oceans and Mount Everest",
  "Anime, Naruto, Dragon Ball Z, One Piece and Manga",
  "Marvel Cinematic Universe, Avengers, DC Batman and Superheroes",
  "Technology, Smartphones, Artificial Intelligence and Inventions",
  "Kerala history, Vallathol, Rivers, Festivals and General Knowledge",
  "Underwater marine life, Animals and Nature facts"
];

// വിപുലീകരിച്ച ബാക്ക്-അപ്പ് ശേഖരം (30-ലധികം പുതിയ ചോദ്യങ്ങൾ)
const richBackupPool = [
  { q: "കേരളത്തിലെ ആദ്യത്തെ മുഖ്യമന്ത്രി ആരാണ്?", options: ["A) ഇ.എം.എസ്", "B) പട്ടം താണുപിള്ള", "C) സി. അച്യുതമേനോൻ", "D) ആർ. ശങ്കർ"], a: "A", cat: "കേരള ചരിത്രം" },
  { q: "സൗരയൂഥത്തിലെ ഏറ്റവും വലിയ ഗ്രഹം ഏതാണ്?", options: ["A) ചൊവ്വ", "B) വ്യാഴം", "C) ശനി", "D) ശുക്രൻ"], a: "B", cat: "ശാസ്ത്രം" },
  { q: "ലോകകപ്പ് ഫുട്ബോൾ ചരിത്രത്തിൽ ഏറ്റവും കൂടുതൽ തവണ കിരീടം നേടിയ രാജ്യം?", options: ["A) അർജന്റീന", "B) ഫ്രാൻസ്", "C) ബ്രസീൽ", "D) ജർമ്മനി"], a: "C", cat: "സ്പോർട്സ്" },
  { q: "'മണിച്ചിത്രത്താഴ്' സിനിമയിലെ നാഗവല്ലിക്ക് ശബ്ദം നൽകിയത് ആര്?", options: ["A) ശോഭന", "B) ഭാഗ്യലക്ഷ്മി", "C) ദുർഗ്ഗ", "D) ആനന്ദവല്ലി"], a: "B", cat: "സിനിമ" },
  { q: "മനുഷ്യശരീരത്തിലെ ഏറ്റവും വലിയ ആന്തരിക അവയവം ഏതാണ്?", options: ["A) ഹൃദയം", "B) കരൾ", "C) വൃക്ക", "D) ശ്വാസകോശം"], a: "B", cat: "ശാസ്ത്രം" },
  { q: "ക്രിക്കറ്റ് ലോകകപ്പ് 2011-ൽ ഇന്ത്യക്ക് നേടിക്കൊടുത്ത ക്യാപ്റ്റൻ ആര്?", options: ["A) സച്ചിൻ", "B) എം.എസ്. ധോണി", "C) വിരാട് കോലി", "D) സൗരവ് ഗാംഗുലി"], a: "B", cat: "സ്പോർട്സ്" },
  { q: "ലോകത്തിലെ ഏറ്റവും ഉയരം കൂടിയ കൊടുമുടി ഏതാണ്?", options: ["A) കെ2", "B) എവറസ്റ്റ്", "C) കാഞ്ചൻജംഗ", "D) ആനമുടി"], a: "B", cat: "ഭൂമിശാസ്ത്രം" },
  { q: "ഇന്ത്യയുടെ ആദ്യത്തെ കൃത്രിമോപഗ്രഹം ഏതാണ്?", options: ["A) ഭാസ്കര", "B) ആര്യഭട്ട", "C) രോഹിണി", "D) ഇൻസാറ്റ്"], a: "B", cat: "ശാസ്ത്രം" },
  { q: "കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി ഏതാണ്?", options: ["A) ഭാരതപ്പുഴ", "B) പെരിയാർ", "C) പമ്പ", "D) ചാലിയാർ"], a: "B", cat: "ഭൂമിശാസ്ത്രം" },
  { q: "ടെലിഫോൺ കണ്ടുപിടിച്ചത് ആരാണ്?", options: ["A) തോമസ് ആൽവ എഡിസൺ", "B) അലക്സാണ്ടർ ഗ്രഹാം ബെൽ", "C) ഐസക് ന്യൂട്ടൺ", "D) ഗലീലിയോ"], a: "B", cat: "ശാസ്ത്രം" },
  { q: "മലയാള സിനിമയിലെ ആദ്യത്തെ ശബ്ദ ചിത്രം ഏതാണ്?", options: ["A) വിഗതകുമാരൻ", "B) ബാലൻ", "C) നീലക്കുയിൽ", "D) നിർമ്മല"], a: "B", cat: "സിനിമ" },
  { q: "'സന്ദേശം' സിനിമയുടെ തിരക്കഥ രചിച്ചത് ആര്?", options: ["A) സത്യൻ അന്തിക്കാട്", "B) ശ്രീനിവാസൻ", "C) പ്രിയദർശൻ", "D) ഫാസിൽ"], a: "B", cat: "സിനിമ" },
  { q: "ലോകത്തിലെ ഏറ്റവും ചെറിയ പക്ഷി ഏതാണ്?", options: ["A) തത്ത", "B) ഹമ്മിങ് ബേർഡ്", "C) കുരുവി", "D) പ്രാവ്"], a: "B", cat: "പ്രകൃതി" },
  { q: "ഏറ്റവും കൂടുതൽ ഉപഗ്രഹങ്ങളുള്ള ഗ്രഹം ഏതാണ്?", options: ["A) വ്യാഴം", "B) ശനി", "C) ചൊവ്വ", "D) യുറാനസ്"], a: "B", cat: "ജ്യോതിശാസ്ത്രം" },
  { q: "ഇന്ത്യയിലെ ഏറ്റവും ഉയരം കൂടിയ അണക്കെട്ട് ഏതാണ്?", options: ["A) ഇടുക്കി", "B) തെഹ്രി", "C) ഭക്ര നങ്കൽ", "D) സർദാർ സരോവർ"], a: "B", cat: "ഭൂമിശാസ്ത്രം" },
  { q: "ആധുനിക കമ്പ്യൂട്ടറിന്റെ പിതാവ് എന്നറിയപ്പെടുന്നത് ആര്?", options: ["A) ചാൾസ് ബാബേജ്", "B) അലൻ ട്യൂറിങ്", "C) ബിൽ ഗേറ്റ്സ്", "D) സ്റ്റീവ് ജോബ്സ്"], a: "B", cat: "സാങ്കേതികം" },
  { q: "ലോകത്തിലെ ഏറ്റവും വലിയ സമുദ്രം ഏതാണ്?", options: ["A) അറ്റ്ലാന്റിക്", "B) ശാന്തസമുദ്രം (പസഫിക്)", "C) ഇന്ത്യൻ മഹാസമുദ്രം", "D) ആർട്ടിക്"], a: "B", cat: "ഭൂമിശാസ്ത്രം" },
  { q: "രക്തത്തിൽ ഓക്സിജൻ എത്തിക്കുന്ന ഘടകം ഏതാണ്?", options: ["A) പ്ലേറ്റ്‌ലെറ്റ്", "B) ഹീമോഗ്ലോബിൻ", "C) പ്ലാസ്മ", "D) ശ്വേതരക്താണുക്കൾ"], a: "B", cat: "ആരോഗ്യം" },
  { q: "'അവഞ്ചേഴ്സ്' സിനിമയിൽ അയൺമാൻ കഥാപാത്രത്തെ ചെയ്തത് ആര്?", options: ["A) ക്രിസ് ഇവാൻ", "B) റോബർട്ട് ഡൗണി ജൂനിയർ", "C) ക്രിസ് ഹെംസ്‌വർത്ത്", "D) ടോം ഹോളണ്ട്"], a: "B", cat: "ഹോളിവുഡ്" },
  { q: "കേരളത്തിൽ സൈലന്റ് വാലി ദേശീയോദ്യാനം ഏത് ജില്ലയിലാണ്?", options: ["A) ഇടുക്കി", "B) പാലക്കാട്", "C) വയനാട്", "D) കണ്ണൂർ"], a: "B", cat: "കേരളം" },
  { q: "മനുഷ്യ ശരീരത്തിലെ ഏറ്റവും ചെറിയ അസ്ഥി ഏതാണ്?", options: ["A) ഫീമർ", "B) സ്റ്റേപിസ് (ചെവിയിൽ)", "C) ടിബിയ", "D) റേഡിയസ്"], a: "B", cat: "ശാസ്ത്രം" }
];

// ഒരിക്കലും ആവർത്തിക്കാത്ത സ്മാർട്ട് ചോദ്യം ഉണ്ടാക്കുന്ന ഫംഗ്ഷൻ (ഡബിൾ ട്രൈ + സേഫ് പാർസിംഗ്)
async function getSmartQuizQuestion() {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const randomCategory = globalQuizTopics[Math.floor(Math.random() * globalQuizTopics.length)];
    const randomSeed = `${Date.now()}_${Math.floor(Math.random() * 9999999)}`;
    const prompt = `You are a trivia master. Generate 1 brand-new unique trivia question in Malayalam language about "${randomCategory}". Provide 4 multiple-choice options in Malayalam labeled A, B, C, D and provide the single correct option letter. Format response strictly as JSON with keys: "q" (question string in Malayalam), "options" (array of 4 Malayalam strings like ["A) ...", "B) ...", "C) ...", "D) ..."]), "a" (single uppercase letter "A", "B", "C", or "D"), and "cat" (category in Malayalam). Do not output markdown, provide pure JSON only.`;

    try {
      const res = await axios.get(
        `https://text.pollinations.ai/${encodeURIComponent(prompt)}?seed=${randomSeed}&model=openai&json=true`,
        { timeout: 9000 }
      );

      let raw = res.data;
      if (typeof raw === "string") {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) raw = JSON.parse(jsonMatch[0]);
      }

      if (raw && raw.q && Array.isArray(raw.options) && raw.options.length === 4 && raw.a) {
        const qText = raw.q.trim();
        if (!isAlreadyAsked(qText)) {
          recordQuestion(qText);
          return {
            q: qText,
            options: raw.options,
            a: raw.a.trim().toUpperCase()[0],
            cat: raw.cat || randomCategory
          };
        }
      }
    } catch (e) {}
  }

  // AI ലഭ്യമായില്ലെങ്കിൽ ചോദിക്കാത്ത ബാക്ക്-അപ്പ് ചോദ്യം നൽകുന്നു
  const unused = richBackupPool.filter((item) => !isAlreadyAsked(item.q));
  const chosen = unused.length > 0 ? unused[Math.floor(Math.random() * unused.length)] : richBackupPool[Math.floor(Math.random() * richBackupPool.length)];
  recordQuestion(chosen.q);
  return chosen;
}

// ------------------- ഗെയിംസ് ഹെൽപ്പ് മെനു (.games) -------------------
Module(
  {
    pattern: "games ?(.*)",
    fromMe: isFromMe,
    desc: "Lists all fun games available in the bot",
    usage: ".games",
    use: "game",
  },
  async (message) => {
    const helpMenu =
      `╭━━━〔 🎮 *OGGY-MD GAME HUB* 〕━━━╮\n\n` +
      `┃ 1️⃣ *മലയാളം ക്വിസ് (AI Trivia)*\n` +
      `┃ • കമാൻഡ്: \`.quiz\`\n` +
      `┃ • വ്യത്യസ്ത വിഷയങ്ങളിലെ ചോദ്യങ്ങൾ വരും.\n` +
      `┃ • റിപ്ലൈ ആയി *A, B, C, അല്ലെങ്കിൽ D* അയക്കുക.\n` +
      `┃ ⚠️ *ശ്രദ്ധിക്കുക: ഒരാൾക്ക് ഒരൊറ്റ തവണ മാത്രമേ ഉത്തരം നൽകാൻ അവസരമുള്ളൂ!*\n\n` +
      `┃ 2️⃣ *സ്പീഡ് മാത്സ് ചലഞ്ച് (Speed Math)*\n` +
      `┃ • കമാൻഡ്: \`.math\`\n` +
      `┃ • വേഗത്തിൽ കണക്ക് കൂട്ടി നമ്പർ ടൈപ്പ് ചെയ്യുക.\n\n` +
      `┃ 3️⃣ *ഇമോജി സിനിമ (Emoji Movie)*\n` +
      `┃ • കമാൻഡ്: \`.emoji\`\n` +
      `┃ • ഇമോജികൾ കണ്ട് സിനിമയുടെ പേര് കണ്ടെത്തുക.\n\n` +
      `┃ 4️⃣ *അക്ഷരക്കൂട്ടം (Word Scramble)*\n` +
      `┃ • കമാൻഡ്: \`.scramble\`\n` +
      `┃ • മാറിമറിഞ്ഞ അക്ഷരങ്ങൾ നേരെയാക്കി വാക്ക് പറയുക.\n\n` +
      `┃ 5️⃣ *നമ്പർ കണ്ടുപിടിക്കൽ (Number Guess)*\n` +
      `┃ • കമാൻഡ്: \`.guess\`\n` +
      `┃ • ബോട്ട് വിചാരിച്ച 1 മുതൽ 100 വരെയുള്ള നമ്പർ കണ്ടെത്തുക.\n\n` +
      `┃ 6️⃣ *Tic-Tac-Toe (X-O കളി)*\n` +
      `┃ • കമാൻഡ്: \`.ttt @user\`\n` +
      `┃ • ഗ്രൂപ്പിലെ കൂട്ടുകാരെ ചലഞ്ച് ചെയ്ത് കളിക്കുക.\n\n` +
      `┃ 7️⃣ *ട്രൂത്ത് ഓർ ഡെയർ (Truth / Dare)*\n` +
      `┃ • കമാൻഡ്: \`.truth\` അല്ലെങ്കിൽ \`.dare\`\n\n` +
      `┃ 🏆 *സ്കോർ ബോർഡും റീസെറ്റും:*\n` +
      `┃ • \`.leaderboard\` - ഗ്രൂപ്പിലെ ടോപ്പ് സ്കോറർമാർ.\n` +
      `┃ • \`.resetquiz\` - സ്കോർ സീറോ ആക്കാൻ (അഡ്മിൻ/ഓണർ).\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯`;

    await message.sendReply(helpMenu);
  }
);

// ------------------- 1. മലയാളം ക്വിസ് (.quiz) -------------------
Module(
  {
    pattern: "quiz ?(.*)",
    fromMe: isFromMe,
    desc: "Starts an AI-powered Malayalam trivia quiz",
    usage: ".quiz",
    use: "game",
  },
  async (message) => {
    if (activeGame[message.jid]) {
      return await message.sendReply(`*_⚠️ നിലവിൽ ഈ ഗ്രൂപ്പിൽ ഒരു ${activeGame[message.jid].type} ഗെയിം നടക്കുന്നുണ്ട്! അത് കഴിയട്ടെ._*`);
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
      `┃ 🔒 *ഓരോരുത്തർക്കും ഒരു അവസരം മാത്രം!*\n` +
      `┃ 💡 *ഉത്തരം നൽകാൻ ഈ മെസ്സേജിന് റിപ്ലൈ ആയി A, B, C, അല്ലെങ്കിൽ D എന്ന് അയക്കുക!*\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯`;

    if (waitMsg && waitMsg.key) {
      await message.edit(quizText, message.jid, waitMsg.key);
    } else {
      await message.sendReply(quizText);
    }

    activeGame[message.jid] = {
      type: "quiz",
      ans: item.a.toUpperCase(),
      attempted: [], // ഒരു തവണ മാത്രം ഉത്തരം നൽകാൻ ലോക്ക് ചെയ്യുന്നു
      timer: setTimeout(async () => {
        if (activeGame[message.jid] && activeGame[message.jid].type === "quiz") {
          await message.sendReply(
            `╭━━━〔 ⌛ *സമയം കഴിഞ്ഞു!* 〕━━━╮\n` +
            `┃ ആരും ശരിയുത്തരം നൽകിയില്ല!\n` +
            `┃ ✅ *ശരിയുത്തരം:* ${activeGame[message.jid].ans}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`
          );
          delete activeGame[message.jid];
        }
      }, 60000),
    };
  }
);

// ------------------- പുതിയ ഗെയിം: സ്പീഡ് മാത്സ് (.math) -------------------
Module(
  {
    pattern: "math ?(.*)",
    fromMe: isFromMe,
    desc: "Speed Math calculation challenge",
    usage: ".math",
    use: "game",
  },
  async (message) => {
    if (activeGame[message.jid]) {
      return await message.sendReply(`*_⚠️ നിലവിൽ ഈ ഗ്രൂപ്പിൽ ഒരു ${activeGame[message.jid].type} ഗെയിം നടക്കുന്നുണ്ട്! അത് കഴിയട്ടെ._*`);
    }

    const n1 = Math.floor(Math.random() * 50) + 10;
    const n2 = Math.floor(Math.random() * 40) + 5;
    const ops = ["+", "-", "*"];
    const op = ops[Math.floor(Math.random() * ops.length)];

    let ans = 0;
    if (op === "+") ans = n1 + n2;
    if (op === "-") ans = n1 - n2;
    if (op === "*") {
      const small1 = Math.floor(Math.random() * 15) + 2;
      const small2 = Math.floor(Math.random() * 12) + 2;
      ans = small1 * small2;
      return setupMathGame(message, `${small1} × ${small2}`, ans);
    }

    setupMathGame(message, `${n1} ${op} ${n2}`, ans);
  }
);

async function setupMathGame(message, equation, ans) {
  const mathText =
    `╭━━━〔 🧮 *SPEED MATH* 〕━━━╮\n` +
    `┃ വേഗത്തിൽ കണക്കുകൂട്ടി ഉത്തരം പറയൂ!\n` +
    `┃\n` +
    `┃ ❓ *ചോദ്യം:*  *${equation} = ?*\n` +
    `┃\n` +
    `┃ ⏳ *സമയം:* 30 സെക്കൻഡ്\n` +
    `┃ 💡 *ഉത്തരം നേരിട്ട് നമ്പറായി അയക്കുക!*\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━╯`;

  await message.sendReply(mathText);

  activeGame[message.jid] = {
    type: "math",
    ans: ans.toString(),
    timer: setTimeout(async () => {
      if (activeGame[message.jid] && activeGame[message.jid].type === "math") {
        await message.sendReply(
          `╭━━━〔 ⌛ *സമയം കഴിഞ്ഞു!* 〕━━━╮\n` +
          `┃ ആരും ശരിയുത്തരം നൽകിയില്ല!\n` +
          `┃ ✅ *ശരിയുത്തരം:* ${ans}\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`
        );
        delete activeGame[message.jid];
      }
    }, 30000),
  };
}

// ------------------- 2. AI ഇമോജി സിനിമ (.emoji) -------------------
Module(
  {
    pattern: "emoji ?(.*)",
    fromMe: isFromMe,
    desc: "Starts an AI-powered Malayalam Emoji Movie game",
    usage: ".emoji",
    use: "game",
  },
  async (message) => {
    if (activeGame[message.jid]) {
      return await message.sendReply(`*_⚠️ നിലവിൽ ഈ ഗ്രൂപ്പിൽ ഒരു ${activeGame[message.jid].type} ഗെയിം നടക്കുന്നുണ്ട്! അത് കഴിയട്ടെ._*`);
    }

    const waitMsg = await message.sendReply("_⏳ പുതിയ സിനിമ തയ്യാറാക്കുന്നു..._");
    const item = await getSmartEmojiMovie();

    const emojiText =
      `╭━━━〔 🎬 *GUESS THE MOVIE* 〕━━━╮\n` +
      `┃\n` +
      `┃     ${item.emoji}\n` +
      `┃\n` +
      `┃ 💡 *ഇമോജികൾ കണ്ട് സിനിമയുടെ പേര് പറയൂ!*\n` +
      `┃ ⏳ *സമയം:* 60 സെക്കൻഡ്\n` +
      `┃ 💬 *ഈ മെസ്സേജിന് റിപ്ലൈ ആയി സിനിമയുടെ പേര് അയക്കുക!*\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯`;

    if (waitMsg && waitMsg.key) {
      await message.edit(emojiText, message.jid, waitMsg.key);
    } else {
      await message.sendReply(emojiText);
    }

    activeGame[message.jid] = {
      type: "emoji",
      data: item,
      timer: setTimeout(async () => {
        if (activeGame[message.jid] && activeGame[message.jid].type === "emoji") {
          await message.sendReply(
            `╭━━━〔 ⌛ *സമയം കഴിഞ്ഞു!* 〕━━━╮\n` +
            `┃ ആർക്കും സിനിമ കണ്ടെത്താൻ കഴിഞ്ഞില്ല!\n` +
            `┃ 🎬 *ശരിയായ സിനിമ:* *${item.name}*\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`
          );
          delete activeGame[message.jid];
        }
      }, 60000),
    };
  }
);

// വാക്കിന്റെ അക്ഷരങ്ങൾ തെറ്റാതെ സ്വയം മാറ്റിമറിക്കുന്ന ഫംഗ്ഷൻ (Auto-Shuffle)
function autoShuffleLetters(word) {
  const letters = word.toUpperCase().split("");
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  const res = letters.join(" ");
  if (res === word.toUpperCase().split("").join(" ")) {
    return letters.reverse().join(" ");
  }
  return res;
}

// AI ലഭ്യമല്ലെങ്കിൽ ഉപയോഗിക്കാൻ തെറ്റില്ലാത്ത ബാക്ക്-അപ്പ് ഇംഗ്ലീഷ് വാക്കുകൾ
const fallbackScrambleWords = [
  { word: "football", hint: "Popular World Sport" },
  { word: "elephant", hint: "Large Wild Animal" },
  { word: "whatsapp", hint: "Instant Messaging App" },
  { word: "airplane", hint: "Flying Air Vehicle" },
  { word: "keyboard", hint: "Computer Typing Hardware" },
  { word: "chocolate", hint: "Sweet Loved by Everyone" },
  { word: "sunflower", hint: "Bright Yellow Flower" },
  { word: "hospital", hint: "Place for Medical Care" },
  { word: "diamond", hint: "Precious Shiny Gem" },
  { word: "avengers", hint: "Marvel Superhero Movie" }
];

// Pollinations AI വഴി എപ്പോഴും പുതിയ ഇംഗ്ലീഷ് വാക്ക് എടുക്കുന്ന ഫംഗ്ഷൻ
async function getSmartScrambleWord() {
  const seed = `${Date.now()}_${Math.floor(Math.random() * 999999)}`;
  const prompt = `Generate 1 familiar, single English word (5 to 8 letters, alphabets only) and 1 short hint for a scramble word game. Return strictly as JSON with keys: "word" (lowercase) and "hint". No markdown.`;

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
    if (raw && raw.word && raw.hint) {
      const cleanWord = raw.word.trim().toLowerCase().replace(/[^a-z]/g, "");
      if (cleanWord.length >= 4 && cleanWord.length <= 8) {
        return {
          word: cleanWord,
          scrambled: autoShuffleLetters(cleanWord),
          hint: raw.hint.trim()
        };
      }
    }
  } catch (e) {}

  const fb = fallbackScrambleWords[Math.floor(Math.random() * fallbackScrambleWords.length)];
  return {
    word: fb.word,
    scrambled: autoShuffleLetters(fb.word),
    hint: fb.hint
  };
}

// ------------------- 3. AI അക്ഷരക്കൂട്ടം (.scramble) -------------------
Module(
  {
    pattern: "scramble ?(.*)",
    fromMe: isFromMe,
    desc: "Starts an AI-powered English Word Scramble game",
    usage: ".scramble",
    use: "game",
  },
  async (message) => {
    if (activeGame[message.jid]) {
      return await message.sendReply(`*_⚠️ നിലവിൽ ഈ ഗ്രൂപ്പിൽ ഒരു ${activeGame[message.jid].type} ഗെയിം നടക്കുന്നുണ്ട്! അത് കഴിയട്ടെ._*`);
    }

    const waitMsg = await message.sendReply("_⏳ പുതിയ വാക്ക് തയ്യാറാക്കുന്നു..._");
    const item = await getSmartScrambleWord();

    const scrambleText =
      `╭━━━〔 🔤 *WORD SCRAMBLE* 〕━━━╮\n` +
      `┃\n` +
      `┃ 🧩 *Letters:*  *${item.scrambled}*\n` +
      `┃ 💡 *Hint:* ${item.hint}\n` +
      `┃\n` +
      `┃ ⏳ *സമയം:* 60 സെക്കൻഡ്\n` +
      `┃ 💬 *ശരിയായ വാക്ക് ഇംഗ്ലീഷിൽ റിപ്ലൈ ആയി അയക്കുക!*\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯`;

    if (waitMsg && waitMsg.key) {
      await message.edit(scrambleText, message.jid, waitMsg.key);
    } else {
      await message.sendReply(scrambleText);
    }

    activeGame[message.jid] = {
      type: "scramble",
      word: item.word,
      timer: setTimeout(async () => {
        if (activeGame[message.jid] && activeGame[message.jid].type === "scramble") {
          await message.sendReply(
            `╭━━━〔 ⌛ *സമയം കഴിഞ്ഞു!* 〕━━━╮\n` +
            `┃ ആരും ശരിയുത്തരം നൽകിയില്ല!\n` +
            `┃ ✅ *ശരിയായ വാക്ക്:* *${item.word}*\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`
          );
          delete activeGame[message.jid];
        }
      }, 60000),
    };
  }
);

// ------------------- 4. നമ്പർ കണ്ടുപിടിക്കൽ (.guess) -------------------
Module(
  {
    pattern: "guess ?(.*)",
    fromMe: isFromMe,
    desc: "Guess the secret number between 1 and 100",
    usage: ".guess",
    use: "game",
  },
  async (message) => {
    if (activeGame[message.jid]) {
      return await message.sendReply(`*_⚠️ നിലവിൽ ഈ ഗ്രൂപ്പിൽ ഒരു ${activeGame[message.jid].type} ഗെയിം നടക്കുന്നുണ്ട്! അത് കഴിയട്ടെ._*`);
    }

    const secretNum = Math.floor(Math.random() * 100) + 1;

    const guessText =
      `╭━━━〔 🔢 *NUMBER GUESS* 〕━━━╮\n` +
      `┃ ബോട്ട് 1 മുതൽ 100 വരെയുള്ള ഒരു നമ്പർ\n` +
      `┃ മനസ്സിൽ വിചാരിച്ചിട്ടുണ്ട്!\n` +
      `┃\n` +
      `┃ 💡 നമ്പറുകൾ അയക്കൂ, ബോട്ട് ഹിന്റുകൾ തരും!\n` +
      `┃ ⏳ *സമയം:* 60 സെക്കൻഡ്\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯`;

    await message.sendReply(guessText);

    activeGame[message.jid] = {
      type: "guess",
      num: secretNum,
      attempts: 0,
      timer: setTimeout(async () => {
        if (activeGame[message.jid] && activeGame[message.jid].type === "guess") {
          await message.sendReply(
            `╭━━━〔 ⌛ *സമയം കഴിഞ്ഞു!* 〕━━━╮\n` +
            `┃ ആരും നമ്പർ കണ്ടുപിടിച്ചില്ല!\n` +
            `┃ 🔢 *ശരിയായ നമ്പർ:* ${secretNum}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`
          );
          delete activeGame[message.jid];
        }
      }, 60000),
    };
  }
);

// ------------------- 5. Tic-Tac-Toe (.ttt @user) -------------------
function renderBoard(b) {
  return (
    `  ${b[0]} ┃ ${b[1]} ┃ ${b[2]} \n` +
    `  ━━━╋━━━╋━━━\n` +
    `  ${b[3]} ┃ ${b[4]} ┃ ${b[5]} \n` +
    `  ━━━╋━━━╋━━━\n` +
    `  ${b[6]} ┃ ${b[7]} ┃ ${b[8]} `
  );
}

function checkWin(b) {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (let w of wins) {
    if (b[w[0]] !== "1️⃣" && b[w[0]] !== "2️⃣" && b[w[0]] !== "3️⃣" &&
        b[w[0]] !== "4️⃣" && b[w[0]] !== "5️⃣" && b[w[0]] !== "6️⃣" &&
        b[w[0]] !== "7️⃣" && b[w[0]] !== "8️⃣" && b[w[0]] !== "9️⃣" &&
        b[w[0]] === b[w[1]] && b[w[1]] === b[w[2]]) {
      return b[w[0]];
    }
  }
  return null;
}

Module(
  {
    pattern: "ttt ?(.*)",
    fromMe: isFromMe,
    desc: "Starts Tic-Tac-Toe with a mentioned user",
    usage: ".ttt @user",
    use: "game",
  },
  async (message, match) => {
    if (activeGame[message.jid]) {
      return await message.sendReply(`*_⚠️ നിലവിൽ ഈ ഗ്രൂപ്പിൽ ഒരു ${activeGame[message.jid].type} ഗെയിം നടക്കുന്നുണ്ട്! അത് കഴിയട്ടെ._*`);
    }

    const opponent = message.mention && message.mention[0] ? message.mention[0] : (match[1] ? match[1].replace(/[^0-9]/g, "") + "@s.whatsapp.net" : null);
    const sender = message.sender || message.data?.participant || message.jid;

    if (!opponent || opponent === sender) {
      return await message.sendReply("_കളിക്കാൻ ഗ്രൂപ്പിലുള്ള ഒരാളെ മെൻഷൻ ചെയ്യുക! ഉദാ: .ttt @user_");
    }

    const board = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"];

    activeGame[message.jid] = {
      type: "ttt",
      p1: sender, // ❌
      p2: opponent, // ⭕
      turn: sender,
      board: board,
      moves: 0,
      timer: setTimeout(async () => {
        if (activeGame[message.jid] && activeGame[message.jid].type === "ttt") {
          await message.sendReply("_⌛ സമയപരിധി കഴിഞ്ഞതിനാൽ Tic-Tac-Toe കളി റദ്ദാക്കി!_");
          delete activeGame[message.jid];
        }
      }, 90000),
    };

    const tttText =
      `╭━━━〔 ⭕ *TIC-TAC-TOE* ❌ 〕━━━╮\n\n` +
      `${renderBoard(board)}\n\n` +
      `┃ ❌ : @${sender.split("@")[0]}\n` +
      `┃ ⭕ : @${opponent.split("@")[0]}\n` +
      `┃\n` +
      `┃ 👉 *ആദ്യ ഊഴം:* @${sender.split("@")[0]} (❌)\n` +
      `┃ 💡 *കളിക്കാൻ 1 മുതൽ 9 വരെയുള്ള നമ്പർ അയക്കുക!*\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯`;

    await message.client.sendMessage(message.jid, {
      text: tttText,
      mentions: [sender, opponent],
    }, { quoted: message.data });
  }
);

// ------------------- 6. AI ട്രൂത്ത് ഓർ ഡെയർ (.truth / .dare) -------------------
Module(
  {
    pattern: "truth ?(.*)",
    fromMe: isFromMe,
    desc: "Generates an AI Truth question",
    usage: ".truth",
    use: "game",
  },
  async (message) => {
    const waitMsg = await message.sendReply("_🤫 ചോദ്യം തയ്യാറാക്കുന്നു..._");
    const t = await getSmartTruth();
    const text =
      `╭━━━〔 🤫 *TRUTH QUESTION* 〕━━━╮\n` +
      `┃ ${t}\n` +
      `┃\n` +
      `┃ 💬 *സത്യം മാത്രം തുറന്നുപറയുക! 😉*\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯`;

    if (waitMsg && waitMsg.key) {
      await message.edit(text, message.jid, waitMsg.key);
    } else {
      await message.sendReply(text);
    }
  }
);

Module(
  {
    pattern: "dare ?(.*)",
    fromMe: isFromMe,
    desc: "Generates an AI Daring task",
    usage: ".dare",
    use: "game",
  },
  async (message) => {
    const waitMsg = await message.sendReply("_🔥 ടാസ്ക് തയ്യാറാക്കുന്നു..._");
    const d = await getSmartDare();
    const text =
      `╭━━━〔 🔥 *DARE TASK* 〕━━━╮\n` +
      `┃ ${d}\n` +
      `┃\n` +
      `┃ ⚡ *ധൈര്യമുണ്ടെങ്കിൽ ചെയ്തു കാണിക്കൂ! 😈*\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯`;

    if (waitMsg && waitMsg.key) {
      await message.edit(text, message.jid, waitMsg.key);
    } else {
      await message.sendReply(text);
    }
  }
);

// ------------------- മെസ്സേജുകൾ തനിയെ ചെക്ക് ചെയ്യുന്ന ലിസണർ -------------------
Module(
  {
    on: "text",
  },
  async (message) => {
    if (!message.jid || !activeGame[message.jid]) return;

    const current = activeGame[message.jid];
    const rawText = (message.text || message.message || "").trim();
    const cleanText = rawText.toLowerCase();
    const senderJid = message.sender || message.data?.participant || message.jid;
    const senderNum = senderJid.split("@")[0];

    // 1. ക്വിസ് ഉത്തരം ചെക്ക് ചെയ്യൽ (സിംഗിൾ അറ്റെംപ്റ്റ് ലോക്ക് സഹിതം)
    if (current.type === "quiz") {
      const isReply = message.reply_message && (
        message.reply_message.text?.includes("OGGY-MD QUIZ") ||
        message.reply_message.text?.includes("ചോദ്യം")
      );
      let selectedOption = null;
      if (isReply) {
        const m = rawText.toUpperCase().match(/^[A-D]/);
        if (m) selectedOption = m[0];
      } else if (["A", "B", "C", "D"].includes(rawText.toUpperCase())) {
        selectedOption = rawText.toUpperCase();
      }

      if (selectedOption) {
        // ഇതിനകം ഉത്തരം നൽകിയയാളാണെങ്കിൽ ബ്ലോക്ക് ചെയ്യുന്നു
        if (current.attempted.includes(senderJid)) {
          return await message.sendReply(`_⚠️ @${senderNum}, നിങ്ങൾ ഇതിനകം ഉത്തരം തിരഞ്ഞെടുത്തതാണ്! ഒരു ചോദ്യത്തിന് ഒരു അവസരം മാത്രം._`, { mentions: [senderJid] });
        }

        current.attempted.push(senderJid);

        if (selectedOption === current.ans) {
          clearTimeout(current.timer);
          delete activeGame[message.jid];
          const totalPoints = addScore(message.jid, senderJid, 10);
          const winMsg =
            `╭━━━〔 🎉 *ശരിയുത്തരം!* 〕━━━╮\n` +
            `┃ 👤 *വിജയി:* @${senderNum}\n` +
            `┃ ✅ *ഉത്തരം:* ${selectedOption}\n` +
            `┃ 🏆 *പോയിന്റ്:* +10\n` +
            `┃ 📊 *ആകെ സ്കോർ:* ${totalPoints} Pts\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`;
          await message.client.sendMessage(message.jid, { text: winMsg, mentions: [senderJid] }, { quoted: message.data });
        } else {
          await message.client.sendMessage(
            message.jid,
            { text: `_❌ തെറ്റായ ഉത്തരം (@${senderNum})! നിങ്ങളുടെ അവസരം കഴിഞ്ഞു._`, mentions: [senderJid] },
            { quoted: message.data }
          );
        }
      }
    }

    // 1.1 മാത്സ് ഗെയിം ഉത്തരം ചെക്ക് ചെയ്യൽ
    else if (current.type === "math") {
      if (rawText === current.ans) {
        clearTimeout(current.timer);
        delete activeGame[message.jid];
        const totalPoints = addScore(message.jid, senderJid, 10);
        const winMsg =
          `╭━━━〔 🧮 *കണക്ക് ശരിയാണ്!* 〕━━━╮\n` +
          `┃ 👤 *വിജയി:* @${senderNum}\n` +
          `┃ ✅ *ഉത്തരം:* ${current.ans}\n` +
          `┃ 🏆 *പോയിന്റ്:* +10\n` +
          `┃ 📊 *ആകെ സ്കോർ:* ${totalPoints} Pts\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`;
        await message.client.sendMessage(message.jid, { text: winMsg, mentions: [senderJid] }, { quoted: message.data });
      }
    }

    // 2. ഇമോജി സിനിമ ഉത്തരം ചെക്ക് ചെയ്യൽ
    else if (current.type === "emoji") {
      const match = current.data.aliases.some((alias) => cleanText.includes(alias.toLowerCase()));
      if (match) {
        clearTimeout(current.timer);
        delete activeGame[message.jid];
        const totalPoints = addScore(message.jid, senderJid, 10);
        const winMsg =
          `╭━━━〔 🎬 *കണ്ടുപിടിച്ചു!* 〕━━━╮\n` +
          `┃ 👤 *വിജയി:* @${senderNum}\n` +
          `┃ 🍿 *സിനിമ:* ${current.data.name}\n` +
          `┃ 🏆 *പോയിന്റ്:* +10\n` +
          `┃ 📊 *ആകെ സ്കോർ:* ${totalPoints} Pts\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`;
        await message.client.sendMessage(message.jid, { text: winMsg, mentions: [senderJid] }, { quoted: message.data });
      }
    }

    // 3. അക്ഷരക്കൂട്ടം ഉത്തരം ചെക്ക് ചെയ്യൽ
    else if (current.type === "scramble") {
      if (cleanText === current.word.toLowerCase()) {
        clearTimeout(current.timer);
        delete activeGame[message.jid];
        const totalPoints = addScore(message.jid, senderJid, 10);
        const winMsg =
          `╭━━━〔 🧩 *ശരിയുത്തരം!* 〕━━━╮\n` +
          `┃ 👤 *വിജയി:* @${senderNum}\n` +
          `┃ 🔤 *വാക്ക്:* ${current.word}\n` +
          `┃ 🏆 *പോയിന്റ്:* +10\n` +
          `┃ 📊 *ആകെ സ്കോർ:* ${totalPoints} Pts\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`;
        await message.client.sendMessage(message.jid, { text: winMsg, mentions: [senderJid] }, { quoted: message.data });
      }
    }

    // 4. നമ്പർ ഗസ്സ് ചെക്ക് ചെയ്യൽ
    else if (current.type === "guess") {
      const guessed = parseInt(rawText);
      if (!isNaN(guessed)) {
        current.attempts++;
        if (guessed === current.num) {
          clearTimeout(current.timer);
          delete activeGame[message.jid];
          const totalPoints = addScore(message.jid, senderJid, 10);
          const winMsg =
            `╭━━━〔 🎯 *നമ്പർ കണ്ടുപിടിച്ചു!* 〕━━━╮\n` +
            `┃ 👤 *വിജയി:* @${senderNum}\n` +
            `┃ 🔢 *നമ്പർ:* ${guessed}\n` +
            `┃ ⚡ *ശ്രമങ്ങൾ:* ${current.attempts}\n` +
            `┃ 🏆 *പോയിന്റ്:* +10\n` +
            `┃ 📊 *ആകെ സ്കോർ:* ${totalPoints} Pts\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`;
          await message.client.sendMessage(message.jid, { text: winMsg, mentions: [senderJid] }, { quoted: message.data });
        } else if (guessed < current.num) {
          await message.sendReply(`_📈 നമ്പർ ${guessed}-നേക്കാൾ *കൂടുതലാണ്*!_`);
        } else {
          await message.sendReply(`_📉 നമ്പർ ${guessed}-നേക്കാൾ *കുറവാണ്*!_`);
        }
      }
    }

    // 5. Tic-Tac-Toe നീക്കങ്ങൾ
    else if (current.type === "ttt") {
      if (senderJid !== current.turn) return;
      const move = parseInt(rawText);
      if (isNaN(move) || move < 1 || move > 9) return;

      const idx = move - 1;
      if (current.board[idx] === "❌" || current.board[idx] === "⭕") {
        return await message.sendReply("_⚠️ ആ കളം നേരത്തെ എടുത്തതാണ്! മറ്റൊരു നമ്പർ നൽകുക._");
      }

      const symbol = current.turn === current.p1 ? "❌" : "⭕";
      current.board[idx] = symbol;
      current.moves++;

      const winnerSymbol = checkWin(current.board);
      if (winnerSymbol) {
        clearTimeout(current.timer);
        delete activeGame[message.jid];
        const winnerJid = current.turn;
        const totalPoints = addScore(message.jid, winnerJid, 15);
        const winText =
          `╭━━━〔 🏆 *VICTORY!* 〕━━━╮\n\n` +
          `${renderBoard(current.board)}\n\n` +
          `┃ 👤 *വിജയി:* @${winnerJid.split("@")[0]} (${symbol})\n` +
          `┃ 🏆 *പോയിന്റ്:* +15\n` +
          `┃ 📊 *ആകെ സ്കോർ:* ${totalPoints} Pts\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`;
        return await message.client.sendMessage(message.jid, { text: winText, mentions: [winnerJid] }, { quoted: message.data });
      }

      if (current.moves === 9) {
        clearTimeout(current.timer);
        delete activeGame[message.jid];
        return await message.sendReply(
          `╭━━━〔 🤝 *DRAW!* 〕━━━╮\n\n` +
          `${renderBoard(current.board)}\n\n` +
          `┃ കളി സമനിലയിൽ അവസാനിച്ചു!\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`
        );
      }

      // അടുത്തയാളുടെ ടേൺ
      current.turn = current.turn === current.p1 ? current.p2 : current.p1;
      const nextSymbol = current.turn === current.p1 ? "❌" : "⭕";
      const nextText =
        `${renderBoard(current.board)}\n\n` +
        `👉 *അടുത്ത ഊഴം:* @${current.turn.split("@")[0]} (${nextSymbol})\n` +
        `💡 *1 മുതൽ 9 വരെയുള്ള നമ്പർ അയക്കുക!*`;

      await message.client.sendMessage(message.jid, {
        text: nextText,
        mentions: [current.turn],
      }, { quoted: message.data });
    }
  }
);

// ------------------- ബാക്ക്-അപ്പ് കമാൻഡ് (.ans A) -------------------
Module(
  {
    pattern: "ans ?(.*)",
    fromMe: isFromMe,
    desc: "Submit answer for quiz",
    usage: ".ans A",
    use: "game",
  },
  async (message, match) => {
    if (!activeGame[message.jid] || activeGame[message.jid].type !== "quiz") return;
    let inputAns = match[1] ? match[1].trim().toUpperCase() : "";
    if (inputAns && ["A", "B", "C", "D"].includes(inputAns[0])) {
      const current = activeGame[message.jid];
      if (inputAns[0] === current.ans) {
        clearTimeout(current.timer);
        delete activeGame[message.jid];
        const senderJid = message.sender || message.data?.participant || message.jid;
        const totalPoints = addScore(message.jid, senderJid, 10);
        const winMsg =
          `╭━━━〔 🎉 *ശരിയുത്തരം!* 〕━━━╮\n` +
          `┃ 👤 *വിജയി:* @${senderJid.split("@")[0]}\n` +
          `┃ ✅ *ഉത്തരം:* ${inputAns[0]}\n` +
          `┃ 🏆 *പോയിന്റ്:* +10\n` +
          `┃ 📊 *ആകെ സ്കോർ:* ${totalPoints} Pts\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`;
        await message.client.sendMessage(message.jid, { text: winMsg, mentions: [senderJid] }, { quoted: message.data });
      } else {
        await message.sendReply("_❌ തെറ്റായ ഉത്തരം! വീണ്ടും ശ്രമിക്കൂ..._");
      }
    }
  }
);

// ------------------- ഗ്രൂപ്പ് ലീഡർബോർഡ് (.leaderboard) -------------------
Module(
  {
    pattern: "leaderboard ?(.*)",
    fromMe: isFromMe,
    desc: "Shows Group Quiz & Games Leaderboard",
    usage: ".leaderboard",
    use: "game",
  },
  async (message) => {
    const chatScores = (typeof scores[message.jid] === "object" && scores[message.jid] !== null) ? scores[message.jid] : {};
    const sorted = Object.entries(chatScores).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (!sorted.length) {
      return await message.sendReply("_ഈ ഗ്രൂപ്പിൽ ഇതുവരെ ആരും ഗെയിമുകളിൽ പോയിന്റ് നേടിയിട്ടില്ല!_");
    }

    const medals = ["🥇", "🥈", "🥉", "🎖️", "🎖️"];
    let text = `╭━━━〔 🏆 *GAME LEADERBOARD* 〕━━━╮\n`;
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

// ------------------- പോയിന്റ് റീസെറ്റ് (.resetquiz) -------------------
Module(
  {
    pattern: "resetquiz ?(.*)",
    fromMe: isFromMe,
    desc: "Resets games scores (Group Admin or Bot Owner)",
    usage: ".resetquiz",
    use: "game",
  },
  async (message) => {
    const isGroup = message.jid.endsWith("@g.us");
    const senderJid = message.sender || message.data?.participant || message.jid;
    const senderNum = senderJid.split("@")[0];
    const isOwner = message.fromMe || (botConfig.SUDO && botConfig.SUDO.includes(senderNum));

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

      delete scores[message.jid];
      try {
        fs.writeFileSync(SCORE_FILE, JSON.stringify(scores, null, 2));
      } catch (e) {}

      return await message.sendReply(
        `╭━━━〔 🔄 *GAMES RESET* 〕━━━╮\n` +
        `┃ ✅ ഈ ഗ്രൂപ്പിലെ മുഴുവൻ അംഗങ്ങളുടെയും\n` +
        `┃ ഗെയിം പോയിന്റുകൾ പൂജ്യമായി (0) റീസെറ്റ് ചെയ്തു!\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    } else {
      if (!isOwner) {
        return await message.sendReply("_⚠️ എല്ലാ ഗ്രൂപ്പുകളിലെയും സ്കോറുകൾ റീസെറ്റ് ചെയ്യാൻ ബോട്ട് ഓണർക്ക് മാത്രമേ അനുവാദമുള്ളൂ!_");
      }

      scores = {};
      try {
        fs.writeFileSync(SCORE_FILE, JSON.stringify({}, null, 2));
      } catch (e) {}

      return await message.sendReply(
        `╭━━━〔 🌐 *GLOBAL GAMES RESET* 〕━━━╮\n` +
        `┃ ✅ എല്ലാ ഗ്രൂപ്പുകളിലെയും മുഴുവൻ ഗെയിം\n` +
        `┃ സ്കോറുകളും പൂർണ്ണമായി പൂജ്യമായി (0) റീസെറ്റ് ചെയ്തു!\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }
  }
);
