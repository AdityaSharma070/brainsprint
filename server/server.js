require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const port = process.env.PORT || 3000;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

mongoose
  .connect(process.env.MONGO_URI)
  .then(function () {
    console.log("database connected");
  })
  .catch(function (err) {
    console.log("database error:", err.message);
  });

const deckSchema = new mongoose.Schema({
  topic: String,
  flashcards: [{ question: String, answer: String }],
  quiz: [{ question: String, options: [String], correctIndex: Number }],
  createdAt: { type: Date, default: Date.now }
});

const Deck = mongoose.model("Deck", deckSchema);

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "client")));

function buildPrompt(topic) {
  return (
    "Create study material for the topic or text below.\n" +
    "Return only valid JSON in exactly this shape:\n" +
    '{"flashcards":[{"question":"...","answer":"..."}],' +
    '"quiz":[{"question":"...","options":["...","...","...","..."],"correctIndex":0}]}\n' +
    "Give 6 flashcards and 5 quiz questions. Keep answers short. " +
    "Each quiz question has exactly 4 options and correctIndex is the position (0 to 3) of the right one.\n\n" +
    "Topic or text:\n" + topic
  );
}

const modelList = (
  process.env.GEMINI_MODELS || "gemini-flash-lite-latest,gemini-flash-latest,gemini-3.5-flash"
).split(",");

async function askGemini(prompt) {
  let lastError;

  for (const model of modelList) {
    try {
      const response = await ai.models.generateContent({
        model: model.trim(),
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          abortSignal: AbortSignal.timeout(25000)
        }
      });
      console.log("answered by", model);
      return response.text;
    } catch (err) {
      console.log(model, "failed:", err.message.slice(0, 100));
      lastError = err;
    }
  }

  throw lastError;
}

app.post("/api/generate", async function (req, res) {
  const topic = (req.body.topic || "").trim();

  if (topic === "") {
    return res.status(400).json({ error: "Please send a topic." });
  }
  if (topic.length > 4000) {
    return res.status(400).json({ error: "That text is too long, try a shorter one." });
  }

  try {
    const text = await askGemini(buildPrompt(topic));
    const raw = text.replace(/```json|```/g, "").trim();
    const data = JSON.parse(raw);

    if (!Array.isArray(data.flashcards) || !Array.isArray(data.quiz)) {
      throw new Error("Unexpected shape from AI");
    }

    res.json(data);
  } catch (err) {
    console.log("generate failed:", err.message);
    res.status(500).json({ error: "Could not generate cards right now. Try again." });
  }
});

app.post("/api/decks", async function (req, res) {
  const { topic, flashcards, quiz } = req.body;

  if (!topic || !Array.isArray(flashcards) || !Array.isArray(quiz)) {
    return res.status(400).json({ error: "That deck looks incomplete." });
  }

  try {
    const deck = await Deck.create({ topic, flashcards, quiz });
    res.json({ id: deck._id });
  } catch (err) {
    console.log("save failed:", err.message);
    res.status(500).json({ error: "Could not save the deck." });
  }
});

app.get("/api/decks", async function (req, res) {
  try {
    const decks = await Deck.find({}, "topic createdAt").sort({ createdAt: -1 }).limit(20);
    res.json(decks);
  } catch (err) {
    res.status(500).json({ error: "Could not load saved decks." });
  }
});

app.get("/api/decks/:id", async function (req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Bad deck id." });
  }

  try {
    const deck = await Deck.findById(req.params.id);
    if (!deck) {
      return res.status(404).json({ error: "Deck not found." });
    }
    res.json(deck);
  } catch (err) {
    res.status(500).json({ error: "Could not load that deck." });
  }
});

app.delete("/api/decks/:id", async function (req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Bad deck id." });
  }

  try {
    await Deck.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Could not delete the deck." });
  }
});

app.listen(port, function () {
  console.log("Running on http://localhost:" + port);
});