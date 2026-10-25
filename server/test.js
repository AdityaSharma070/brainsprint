require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const candidates = [
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite"
];

async function main() {
  for (const model of candidates) {
    const t = Date.now();
    try {
      const res = await ai.models.generateContent({
        model: model,
        contents: "Say hello in five words."
      });
      console.log("OK  ", model, Date.now() - t, "ms ->", res.text.trim());
    } catch (err) {
      console.log("FAIL", model, err.message.slice(0, 80));
    }
  }
}

main();