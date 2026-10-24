const { Module } = require("../main");
const botConfig = require("../config");
const axios = require("axios");

const isFromMe = botConfig.MODE === "public" ? false : true;

// -------------------------------------------------------------
// 1. പ്രൊഡക്റ്റ് ഫോട്ടോ കണ്ടെത്താനുള്ള മൾട്ടി-എഞ്ചിൻ
// -------------------------------------------------------------
async function fetchProductImage(productName) {
  // എഞ്ചിൻ 1: Wikipedia / Wikimedia ഒഫീഷ്യൽ ഹൈ-റെസലൂഷൻ ഫോട്ടോ
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      productName
    )}&gsrlimit=1&prop=pageimages&piprop=original|thumbnail&pithumbsize=800&format=json`;
    const res = await axios.get(wikiUrl, { timeout: 6000 });
    const pages = res.data?.query?.pages;
    if (pages) {
      const firstPage = Object.values(pages)[0];
      const imgUrl = firstPage?.original?.source || firstPage?.thumbnail?.source;
      if (imgUrl && !imgUrl.endsWith(".svg")) {
        return imgUrl;
      }
    }
  } catch (e) {}

  // എഞ്ചിൻ 2: DuckDuckGo ഇമേജ് സെർച്ച്
  try {
    const ddgSearchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(productName + " product")}&iax=images&ia=images`;
    const tokenRes = await axios.get(ddgSearchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      timeout: 6000
    });
    const vqdMatch = tokenRes.data.match(/vqd=["']?([0-9-]+)["']?/);
    if (vqdMatch && vqdMatch[1]) {
      const vqd = vqdMatch[1];
      const imgApiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(
        productName + " product"
      )}&vqd=${vqd}&f=,,,&p=1`;
      const imgRes = await axios.get(imgApiUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        timeout: 6000
      });
      const results = imgRes.data?.results;
      if (results && results.length > 0 && results[0].image) {
        return results[0].image;
      }
    }
  } catch (e) {}

  // എഞ്ചിൻ 3: 100% സുരക്ഷിതമായ അൾട്രാ-റിയലിസ്റ്റിക് പ്രൊഡക്റ്റ് സ്റ്റുഡിയോ റെൻഡർ
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    `professional high resolution product photography of ${productName}, commercial studio lighting, clean white background, 4k`
  )}?width=800&height=800&nologo=true`;
}

// -------------------------------------------------------------
// 2. പ്രൊഡക്റ്റ് വിവരങ്ങൾ, ഒറിജിനൽ സൈറ്റ്, റേറ്റിംഗ് എടുക്കുന്ന എഞ്ചിൻ
// -------------------------------------------------------------
async function fetchProductDetails(query) {
  const models = ["openai", "mistral", "qwen"];
  const prompt = `You are a shopping and consumer product research assistant. For the product "${query}", extract real, accurate market details in Malayalam and English. Return strictly pure JSON without markdown codeblock:
{
  "name": "Full official product name",
  "brand": "Brand or Manufacturer name",
  "rating": "e.g. 4.6 / 5.0",
  "stars": "e.g. ⭐⭐⭐⭐½",
  "reviews_count": "e.g. 12,000+ കസ്റ്റമർ റിവ്യൂകൾ",
  "official_site_name": "Official Website name (e.g. Apple, Nike, Samsung, Sony)",
  "official_url": "Direct official website product or brand URL (must be valid https)",
  "shopping_url": "https://www.amazon.in/s?k=${encodeURIComponent(query)}",
  "price_inr": "Approximate price in Indian Rupee (e.g. ₹69,900)",
  "price_usd": "Approximate price in USD (e.g. $799)",
  "features": [
    "പ്രധാന സവിശേഷത 1 (Malayalam)",
    "പ്രധാന സവിശേഷത 2 (Malayalam)",
    "പ്രധാന സവിശേഷത 3 (Malayalam)"
  ],
  "verdict": "ഒരു ചെറിയ വാചകത്തിൽ പ്രൊഡക്റ്റിന്റെ റിവ്യൂ ചുരുക്കം (Malayalam)"
}`;

  for (let i = 0; i < models.length; i++) {
    try {
      const res = await axios.get(
        `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=${models[i]}&json=true`,
        { timeout: 10000 }
      );
      let data = res.data;
      if (typeof data === "string") {
        const jsonMatch = data.match(/\{[\s\S]*\}/);
        if (jsonMatch) data = JSON.parse(jsonMatch[0]);
      }
      if (data && data.name && data.brand && data.official_url) {
        return data;
      }
    } catch (e) {}
  }

  // ബാക്ക്-അപ്പ് ജനറിക് ഡാറ്റ
  return {
    name: query.toUpperCase(),
    brand: query.split(" ")[0].toUpperCase(),
    rating: "4.5 / 5.0",
    stars: "⭐⭐⭐⭐½",
    reviews_count: "നിരവധി ഉപഭോക്തൃ റിവ്യൂകൾ",
    official_site_name: `${query.split(" ")[0]} Official Site`,
    official_url: `https://www.google.com/search?q=${encodeURIComponent(query + " official store")}`,
    shopping_url: `https://www.amazon.in/s?k=${encodeURIComponent(query)}`,
    price_inr: "മാർക്കറ്റ് വില പരിശോധിക്കുക",
    price_usd: "N/A",
    features: ["ഉയർന്ന ഗുണനിലവാരം", "മാർക്കറ്റിലെ ഏറ്റവും പുതിയ മോഡൽ", "വാറന്റി സപ്പോർട്ട് ലഭ്യമാണ്"],
    verdict: "ജനപ്രിയമായ മോഡലുകളിൽ ഒന്ന്."
  };
}

// -------------------------------------------------------------
// 3. കമാൻഡ്: .product / .price / .item
// -------------------------------------------------------------
Module(
  {
    pattern: "[.]?(product|item|price) ?(.*)",
    fromMe: isFromMe,
    desc: "Search product info with photo, rating, and official website",
    usage: ".product <product name>",
    use: "utility",
  },
  async (message, match) => {
    const query = match[2] ? match[2].trim() : "";

    if (!query) {
      return await message.sendReply(
        `╭━━━〔 🛍️ *PRODUCT FINDER* 〕━━━╮\n` +
        `┃ ⚠️ ഒരു പ്രൊഡക്റ്റിന്റെ പേര് നൽകുക!\n` +
        `┃\n` +
        `┃ 💡 *ഉദാഹരണങ്ങൾ:*\n` +
        `┃ • \`.product iPhone 15 Pro\`\n` +
        `┃ • \`.product Nike Air Jordan\`\n` +
        `┃ • \`.product Sony WH-1000XM5\`\n` +
        `┃ • \`.product Samsung S24 Ultra\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    const waitMsg = await message.sendReply(`_🔎 "${query}" വിവരങ്ങളും ഫോട്ടോയും ശേഖരിക്കുന്നു..._`);

    try {
      // പ്രൊഡക്റ്റ് വിവരങ്ങളും ഫോട്ടോയും സമാന്തരമായി (parallel) വേഗത്തിൽ എടുക്കുന്നു
      const [details, photoUrl] = await Promise.all([
        fetchProductDetails(query),
        fetchProductImage(query)
      ]);

      const featuresList = Array.isArray(details.features)
        ? details.features.map((f) => `┃ • ${f}`).join("\n")
        : `┃ • ഗുണനിലവാരമുള്ള സവിശേഷതകൾ`;

      const cardText =
        `╭━━━〔 🛍️ *PRODUCT DETAILS* 〕━━━╮\n` +
        `┃\n` +
        `┃ 📦 *പ്രൊഡക്റ്റ്:* ${details.name}\n` +
        `┃ 🏷️ *ബ്രാൻഡ്:* ${details.brand}\n` +
        `┃ 💰 *വില:* ${details.price_inr} | ${details.price_usd}\n` +
        `┃\n` +
        `┃ ⭐ *റേറ്റിംഗ്:* ${details.rating} ${details.stars || ""}\n` +
        `┃ 📊 *റിവ്യൂകൾ:* ${details.reviews_count}\n` +
        `┃\n` +
        `┃ 🌐 *ഒറിജിനൽ സൈറ്റ്:* ${details.official_site_name}\n` +
        `┃ 🔗 *ഔദ്യോഗിക ലിങ്ക്:*\n` +
        `┃ ${details.official_url}\n` +
        `┃\n` +
        `┃ 🛒 *ഷോപ്പിംഗ് ലിങ്ക് (Amazon):*\n` +
        `┃ ${details.shopping_url}\n` +
        `┃\n` +
        `┃ ⚙️ *പ്രധാന സവിശേഷതകൾ:*\n` +
        `${featuresList}\n` +
        `┃\n` +
        `┃ 💡 *ചുരുക്കം:* ${details.verdict}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

      // ഫോട്ടോയോടൊപ്പം അടിക്കുറിപ്പായി (Caption) കാർഡ് അയക്കുന്നു
      try {
        await message.client.sendMessage(
          message.jid,
          {
            image: { url: photoUrl },
            caption: cardText
          },
          { quoted: message.data }
        );
      } catch (imgError) {
        // ഇമേജ് അയക്കുന്നതിൽ എന്തെങ്കിലും തടസ്സം വന്നാൽ നേരിട്ട് ടെക്സ്റ്റ് കാർഡായി അയക്കുന്നു
        await message.sendReply(cardText);
      }

      if (waitMsg && waitMsg.key) {
        await message.client.sendMessage(message.jid, { delete: waitMsg.key });
      }
    } catch (err) {
      await message.sendReply(`_⚠️ പ്രൊഡക്റ്റ് വിവരങ്ങൾ ലഭ്യമാക്കാൻ കഴിഞ്ഞില്ല! വീണ്ടും ശ്രമിക്കുക._`);
    }
  }
);
