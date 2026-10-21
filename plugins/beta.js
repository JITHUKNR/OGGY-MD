const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const isFromMe = botConfig.MODE === "public" ? false : true;

// ഗ്രൂപ്പുകളിലെ ആക്ടീവ് പോൾ ക്വിസുകൾ ട്രാക്ക് ചെയ്യാൻ
const activePollQuiz = {};

// പോയിന്റ് സൂക്ഷിക്കാൻ (quiz_scores.json)
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

// ബാക്ക്-അപ്പ് ചോദ്യങ്ങൾ
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
  }
];

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// AI വഴി ചോദ്യം നിർമ്മിക്കുന്ന ഫംഗ്ഷൻ
async function getSmartPollQuestion() {
  const categories = ["Malayalam Cinema", "Football and Sports", "World Wonders", "Space and Science", "Human Body Facts"];
  const randomCat = categories[Math.floor(Math.random() * categories.length)];
  const seed = `${Date.now()}_${Math.floor(Math.random() * 999999)}`;
  const prompt = `Create 1 unique trivia question in Malayalam about "${randomCat}". Provide 4 short options in Malayalam (strictly NO prefixes like A, B, C) and indicate the exact correct option. Return strictly JSON with keys: "q" (Malayalam string), "options" (array of 4 Malayalam strings), "correct" (one of the 4 strings), and "cat" (Malayalam category). No markdown.`;

  try {
    const res = await axios.get(
      `https://text.pollinations.ai/${encodeURIComponent(prompt)}?seed=${seed}&model=openai&json=true`,
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
        cat: raw.cat || randomCat
      };
    }
  } catch (e) {}

  const fb = backupPollPool[Math.floor(Math.random() * backupPollPool.length)];
  return {
    q: fb.q,
    options: shuffleArray(fb.options),
    correct: fb.correct,
    cat: fb.cat
  };
}

// വാട്‌സാപ്പ് എൻക്രിപ്റ്റ് ചെയ്ത പോൾ വോട്ട് ഡീക്രിപ്റ്റ് ചെയ്യുന്ന ഫംഗ്ഷൻ
function decryptVotePayload({ encKey, encPayload, encIv, pollCreatorJid, pollMsgId, pollEncKey, voterJid }) {
  try {
    const encKeyBuff = Buffer.isBuffer(encKey) ? encKey : Buffer.from(encKey, "base64");
    const encPayloadBuff = Buffer.isBuffer(encPayload) ? encPayload : Buffer.from(encPayload, "base64");
    const encIvBuff = Buffer.isBuffer(encIv) ? encIv : Buffer.from(encIv, "base64");
    const pollEncKeyBuff = Buffer.isBuffer(pollEncKey) ? pollEncKey : Buffer.from(pollEncKey, "base64");

    const info = Buffer.concat([
      Buffer.from(pollMsgId),
      Buffer.from([0]),
      Buffer.from(pollCreatorJid),
      Buffer.from([0]),
      Buffer.from(voterJid),
      Buffer.from([0]),
      Buffer.from("Poll Vote"),
      Buffer.from([1])
    ]);

    const key = crypto.hkdfSync("sha256", pollEncKeyBuff, Buffer.alloc(32), info, 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, encIvBuff);
    decipher.setAuthTag(encKeyBuff);
    const decrypted = Buffer.concat([decipher.update(encPayloadBuff), decipher.final()]);
    return decrypted;
  } catch (e) {
    return null;
  }
}

// പോൾ വോട്ടുകൾ തത്സമയം നിരീക്ഷിക്കുന്ന ലിസണർ (Client Event Listener)
function attachPollVoteListener(client) {
  if (client._pollQuizListenerReady) return;
  client._pollQuizListenerReady = true;

  client.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg || !msg.message || !msg.message.pollUpdateMessage) return;

      const pollUpdate = msg.message.pollUpdateMessage;
      const targetPollId = pollUpdate.pollCreationMessageKey?.id;
      const chatJid = msg.key?.remoteJid;

      if (!targetPollId || !chatJid || !activePollQuiz[chatJid]) return;

      const game = activePollQuiz[chatJid];
      if (game.pollId !== targetPollId) return;

      const voterJid = msg.key.participant || msg.participant || msg.key.remoteJid;
      const voterNum = voterJid.split("@")[0];

      // വോട്ട് മാറ്റിക്കുത്തുന്നത് തടയൽ (First-Vote Lock)
      if (game.lockedUsers[voterJid]) {
        return; // ഇതിനകം രേഖപ്പെടുത്തിയതിനാൽ പുതിയ മാറ്റങ്ങൾ തള്ളിക്കളയുന്നു
      }

      // പോൾ വോട്ട് ഡീക്രിപ്റ്റ് ചെയ്യുന്നു
      const decryptedBuff = decryptVotePayload({
        encKey: pollUpdate.vote?.encKey,
        encPayload: pollUpdate.vote?.encPayload,
        encIv: pollUpdate.vote?.encIv,
        pollCreatorJid: game.creatorJid,
        pollMsgId: targetPollId,
        pollEncKey: game.pollSecret,
        voterJid: voterJid
      });

      if (!decryptedBuff) return;

      // യൂസർ തിരഞ്ഞെടുത്ത ഓപ്ഷൻ കണ്ടെത്തുന്നു
      let selectedOption = null;
      for (const optText of game.options) {
        const optHash = crypto.createHash("sha256").update(optText).digest();
        if (decryptedBuff.includes(optHash)) {
          selectedOption = optText;
          break;
        }
      }

      if (!selectedOption) return;

      // ആദ്യ വോട്ട് ലോക്ക് ചെയ്യുന്നു (ഇനി മാറ്റിയാലും പരിഗണിക്കില്ല)
      game.lockedUsers[voterJid] = selectedOption;

      // ഉത്തരം ശരിയാണോ തെറ്റാണോ എന്ന് ഉടനടി മറുപടി നൽകുന്നു
      if (selectedOption === game.correct) {
        const totalPoints = addScore(chatJid, voterJid, 10);
        game.correctVoters.push(voterJid);

        const winReply =
          `╭━━━〔 🎉 *ശരിയുത്തരം!* 〕━━━╮\n` +
          `┃ 👤 *യൂസർ:* @${voterNum}\n` +
          `┃ ✅ *തിരഞ്ഞെടുത്തത്:* ${selectedOption}\n` +
          `┃ 🏆 *പോയിന്റ്:* +10 (${totalPoints} Pts)\n` +
          `┃ 🔒 *നിങ്ങളുടെ വോട്ട് സ്ഥിരീകരിച്ചു!* \n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`;

        await client.sendMessage(
          chatJid,
          { text: winReply, mentions: [voterJid] },
          { quoted: { key: game.pollKey, message: { pollCreationMessage: {} } } }
        );
      } else {
        const wrongReply =
          `╭━━━〔 ❌ *തെറ്റായ ഉത്തരം!* 〕━━━╮\n` +
          `┃ 👤 *യൂസർ:* @${voterNum}\n` +
          `┃ ❌ *നിങ്ങൾ കുത്തിയത്:* ${selectedOption}\n` +
          `┃ 🔒 *നിങ്ങളുടെ ആദ്യ ചോയ്‌സ് ലോക്ക് ചെയ്തു!*\n` +
          `┃ 💡 ഇനി വോട്ട് മാറ്റിയാലും സ്വീകരിക്കില്ല.\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━╯`;

        await client.sendMessage(
          chatJid,
          { text: wrongReply, mentions: [voterJid] },
          { quoted: { key: game.pollKey, message: { pollCreationMessage: {} } } }
        );
      }
    } catch (err) {}
  });
}

// കമാൻഡ്: pquiz (കുത്തുണ്ടെങ്കിലും ഇല്ലെങ്കിലും പ്രവർത്തിക്കും)
Module(
  {
    pattern: "[.]?pquiz ?(.*)",
    fromMe: isFromMe,
    desc: "Starts a Real-Time Smart WhatsApp Poll Quiz with First-Vote Lock",
    usage: "pquiz",
    use: "beta",
  },
  async (message) => {
    if (activePollQuiz[message.jid]) {
      return await message.sendReply(`*_⚠️ നിലവിൽ ഈ ഗ്രൂപ്പിൽ ഒരു Poll Quiz നടക്കുന്നുണ്ട്! സമയം കഴിയട്ടെ._*`);
    }

    // വോട്ട് നിരീക്ഷിക്കുന്ന ലിസണർ സജീവമാക്കുന്നു
    attachPollVoteListener(message.client);

    const waitMsg = await message.sendReply("_⏳ പുതിയ Poll Quiz തയ്യാറാക്കുന്നു..._");
    const item = await getSmartPollQuestion();

    if (waitMsg && waitMsg.key) {
      await message.client.sendMessage(message.jid, { delete: waitMsg.key });
    }

    // വാട്‌സാപ്പ് ഒഫീഷ്യൽ പോൾ അയക്കുന്നു
    const pollMessage = await message.client.sendMessage(message.jid, {
      poll: {
        name: `⚡ OGGY-MD REAL-TIME POLL QUIZ ⚡\n\n❓ ${item.q}\n🏷️ വിഷയം: ${item.cat}\n\n⏱️ സമയം: 45 സെക്കൻഡ്\n🔒 (ശ്രദ്ധിക്കുക: നിങ്ങൾ ആദ്യം കുത്തുന്ന ചോയ്‌സ് മാത്രമേ സ്വീകരിക്കൂ!)`,
        values: item.options,
        selectableCount: 1,
      },
    });

    const pollSecret =
      pollMessage.message?.pollCreationMessage?.messageContextInfo?.messageSecret ||
      pollMessage.message?.messageContextInfo?.messageSecret ||
      pollMessage.message?.pollCreationMessageV3?.messageContextInfo?.messageSecret;

    const creatorJid = pollMessage.key.participant || message.client.user?.id || message.jid;

    activePollQuiz[message.jid] = {
      pollId: pollMessage.key.id,
      pollKey: pollMessage.key,
      pollSecret: pollSecret,
      creatorJid: creatorJid.includes(":") ? creatorJid.split(":")[0] + "@s.whatsapp.net" : creatorJid,
      q: item.q,
      options: item.options,
      correct: item.correct,
      lockedUsers: {}, // ആദ്യ വോട്ട് ലോക്ക് ചെയ്യുന്ന ലിസ്റ്റ്
      correctVoters: [],
      timer: setTimeout(async () => {
        if (activePollQuiz[message.jid]) {
          const finishedGame = activePollQuiz[message.jid];
          delete activePollQuiz[message.jid];

          const totalCorrect = finishedGame.correctVoters.length;
          const finishText =
            `╭━━━〔 ⌛ *പോൾ ക്വിസ് അവസാനിച്ചു!* 〕━━━╮\n` +
            `┃ ❓ *ചോദ്യം:* ${finishedGame.q}\n` +
            `┃\n` +
            `┃ ✅ *ശരിയുത്തരം:* *${finishedGame.correct}*\n` +
            `┃ 👥 *ശരിയുത്തരം നൽകിയവർ:* ${totalCorrect} പേർ\n` +
            `┃ 🏆 അവർക്ക് +10 പോയിന്റ് വീതം നൽകിയിട്ടുണ്ട്!\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯`;

          await message.client.sendMessage(
            message.jid,
            { text: finishText, mentions: finishedGame.correctVoters },
            { quoted: { key: finishedGame.pollKey, message: { pollCreationMessage: {} } } }
          );
        }
      }, 45000),
    };
  }
);
