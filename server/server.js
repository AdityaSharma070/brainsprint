require("dotenv").config();
const express = require("express");
const path = require("path");
const multer = require("multer");
const { pdfToText } = require("pdf-to-text");
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
  quiz: [{ question: String, options: [String], correctIndex: Number, explanation: String }],
  createdAt: { type: Date, default: Date.now }
});

const Deck = mongoose.model("Deck", deckSchema);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "client")));

function buildPrompt(source, difficulty, cardCount, quizCount, fromFile) {
  return (
    "Create study material at " + difficulty + " difficulty level.\n" +
    "Return only valid JSON in exactly this shape:\n" +
    '{"flashcards":[{"question":"...","answer":"..."}],' +
    '"quiz":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}\n' +
    "Give " + cardCount + " flashcards and " + quizCount + " quiz questions. Keep flashcard answers short. " +
    "Each quiz question has exactly 4 options and correctIndex is the position (0 to 3) of the right one. " +
    "The explanation is one or two sentences saying why that answer is correct.\n" +
    (fromFile ? "Base everything only on the text below.\n" : "") +
    "\nTopic or text:\n" + source
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
          abortSignal: AbortSignal.timeout(40000)
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

function readUpload(req, res, next) {
  upload.single("file")(req, res, function (err) {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "That file is bigger than 5 MB." : "Could not read the upload.";
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

// async function getSourceText(req) {
//   if (!req.file) {
//     return (req.body.topic || "").trim();
//   }

//   const name = req.file.originalname.toLowerCase();

//     if (name.endsWith(".pdf")) {
//     const fresh = Buffer.alloc(req.file.buffer.length);
//     req.file.buffer.copy(fresh);
//     console.log("pdf bytes:", req.file.size, "offset:", req.file.buffer.byteOffset);
//     const parsed = await pdfParse(fresh);
//     return parsed.text;
//   }
//   if (name.endsWith(".txt")) {
//     return req.file.buffer.toString("utf8");
//   }

//   throw new Error("BAD_TYPE");
// }


async function getSourceText(req) {
  if (!req.file) {
    return (req.body.topic || "").trim();
  }

  const name = req.file.originalname.toLowerCase();

  if (name.endsWith(".pdf")) {
    console.log("Processing PDF bytes securely via pdf-to-text:", req.file.size);
    
    // Convert the buffer to text using a Promise wrapper
    return new Promise((resolve, reject) => {
      pdfToText(req.file.buffer, (err, text) => {
        if (err) {
          console.error("PDF Parsing failed:", err.message);
          return reject(new Error("BAD_TYPE"));
        }
        resolve(text);
      });
    });
  }
  
  if (name.endsWith(".txt")) {
    return req.file.buffer.toString("utf8");
  }

  throw new Error("BAD_TYPE");
}


app.post("/api/generate", readUpload, async function (req, res) {
  const difficulty = ["easy", "medium", "hard"].includes(req.body.difficulty) ? req.body.difficulty : "medium";
  const cardCount = [5, 10, 15].includes(Number(req.body.count)) ? Number(req.body.count) : 5;
  const quizCount = Math.min(cardCount, 10);
  const fromFile = Boolean(req.file);

  let source = "";

  try {
    source = await getSourceText(req);
  } catch (err) {
    const msg = err.message === "BAD_TYPE" ? "Only PDF or TXT files are supported." : "Could not read that file.";
    console.log("file read failed:", err.message);
    return res.status(400).json({ error: msg });
  }

  source = source.replace(/\s+/g, " ").trim();

  if (source === "") {
    const msg = fromFile
      ? "No readable text found in that file. Scanned PDFs are not supported."
      : "Please send a topic.";
    return res.status(400).json({ error: msg });
  }

  if (fromFile) {
    source = source.slice(0, 12000);
  } else if (source.length > 4000) {
    return res.status(400).json({ error: "That text is too long, try a shorter one." });
  }

  try {
    const text = await askGemini(buildPrompt(source, difficulty, cardCount, quizCount, fromFile));
    const raw = text.replace(/```json|```/g, "").trim();
    const data = JSON.parse(raw);

    if (!Array.isArray(data.flashcards) || !Array.isArray(data.quiz)) {
      throw new Error("Unexpected shape from AI");
    }

    data.quiz = data.quiz.filter(function (q) {
      return (
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        Number.isInteger(q.correctIndex) &&
        q.correctIndex >= 0 &&
        q.correctIndex < 4
      );
    });

    if (data.flashcards.length === 0 || data.quiz.length === 0) {
      throw new Error("AI returned empty sets");
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