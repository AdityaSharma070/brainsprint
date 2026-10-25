const topicInput = document.getElementById("topicInput");
const generateBtn = document.getElementById("generateBtn");
const loader = document.getElementById("loader");
const message = document.getElementById("message");
const cardGrid = document.getElementById("cardGrid");
const quizSection = document.getElementById("quizSection");
const quizBox = document.getElementById("quizBox");
const submitQuiz = document.getElementById("submitQuiz");
const scoreText = document.getElementById("scoreText");
const saveBtn = document.getElementById("saveBtn");
const savedList = document.getElementById("savedList");
const difficultySelect = document.getElementById("difficulty");
const cardCountSelect = document.getElementById("cardCount");
const fileInput = document.getElementById("fileInput");
const fileName = document.getElementById("fileName");
const clearFile = document.getElementById("clearFile");

let currentQuiz = [];
let lastDeck = null;
let selectedFile = null;

fileInput.addEventListener("change", function () {
  const file = fileInput.files[0];

  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    message.textContent = "That file is bigger than 5 MB.";
    fileInput.value = "";
    return;
  }

  message.textContent = "";
  selectedFile = file;
  fileName.textContent = file.name;
  clearFile.classList.remove("hidden");
});

clearFile.addEventListener("click", function () {
  selectedFile = null;
  fileInput.value = "";
  fileName.textContent = "";
  clearFile.classList.add("hidden");
});

function renderCards(cards) {
  cardGrid.innerHTML = "";

  cards.forEach(function (item) {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML =
      '<div class="card-inner">' +
        '<div class="card-front"></div>' +
        '<div class="card-back"></div>' +
      '</div>';

    card.querySelector(".card-front").textContent = item.question;
    card.querySelector(".card-back").textContent = item.answer;

    card.addEventListener("click", function () {
      card.classList.toggle("flipped");
    });

    cardGrid.appendChild(card);
  });
}

function renderQuiz(questions) {
  currentQuiz = questions;
  quizBox.innerHTML = "";
  scoreText.textContent = "";
  submitQuiz.disabled = false;

  questions.forEach(function (q, qIndex) {
    const block = document.createElement("div");
    block.className = "question-block";

    const title = document.createElement("p");
    title.textContent = (qIndex + 1) + ". " + q.question;
    block.appendChild(title);

    q.options.forEach(function (optionText, optIndex) {
      const label = document.createElement("label");
      label.className = "option";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "q" + qIndex;
      radio.value = optIndex;

      label.appendChild(radio);
      label.appendChild(document.createTextNode(optionText));
      block.appendChild(label);
    });

    quizBox.appendChild(block);
  });

  quizSection.classList.remove("hidden");
}

function checkAnswers() {
  let correct = 0;
  const blocks = quizBox.querySelectorAll(".question-block");

  currentQuiz.forEach(function (q, qIndex) {
    const options = blocks[qIndex].querySelectorAll(".option");
    const chosen = quizBox.querySelector('input[name="q' + qIndex + '"]:checked');

    options[q.correctIndex].classList.add("correct");

    if (chosen && Number(chosen.value) === q.correctIndex) {
      correct++;
    } else if (chosen) {
      options[Number(chosen.value)].classList.add("wrong");
    }

    if (q.explanation) {
      const note = document.createElement("p");
      note.className = "explanation";
      note.textContent = "Why: " + q.explanation;
      blocks[qIndex].appendChild(note);
    }
  });

  const score = Math.round((correct / currentQuiz.length) * 100);
  scoreText.textContent = "Your score: " + score + " / 100 (" + correct + " of " + currentQuiz.length + " correct)";
  submitQuiz.disabled = true;
}

async function loadSaved() {
  try {
    const res = await fetch("/api/decks");
    const decks = await res.json();
    savedList.innerHTML = "";

    if (!res.ok || decks.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "Nothing saved yet.";
      savedList.appendChild(empty);
      return;
    }

    decks.forEach(function (deck) {
      const li = document.createElement("li");

      const openBtn = document.createElement("button");
      openBtn.className = "open-btn";
      openBtn.textContent = deck.topic + "  -  " + new Date(deck.createdAt).toLocaleDateString();
      openBtn.addEventListener("click", function () {
        openDeck(deck._id);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", function () {
        deleteDeck(deck._id);
      });

      li.appendChild(openBtn);
      li.appendChild(deleteBtn);
      savedList.appendChild(li);
    });
  } catch (err) {
    savedList.textContent = "Could not load saved decks.";
  }
}

async function openDeck(id) {
  const res = await fetch("/api/decks/" + id);
  const deck = await res.json();

  if (!res.ok) {
    message.textContent = deck.error || "Could not open that deck.";
    return;
  }

  message.textContent = "";
  renderCards(deck.flashcards);
  renderQuiz(deck.quiz);
  lastDeck = null;
  saveBtn.classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteDeck(id) {
  await fetch("/api/decks/" + id, { method: "DELETE" });
  loadSaved();
}

saveBtn.addEventListener("click", async function () {
  if (!lastDeck) return;

  saveBtn.disabled = true;

  try {
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lastDeck)
    });
    if (!res.ok) throw new Error("save failed");

    saveBtn.textContent = "Saved";
    loadSaved();
  } catch (err) {
    saveBtn.disabled = false;
    message.textContent = "Could not save the deck.";
  }
});

submitQuiz.addEventListener("click", checkAnswers);

generateBtn.addEventListener("click", async function () {
  const topic = topicInput.value.trim();

  if (topic === "" && !selectedFile) {
    message.textContent = "Enter a topic or upload a file first.";
    return;
  }

  message.textContent = "";
  loader.classList.remove("hidden");
  generateBtn.disabled = true;
  cardGrid.innerHTML = "";
  quizSection.classList.add("hidden");
  saveBtn.classList.add("hidden");

  const formData = new FormData();
  formData.append("topic", topic);
  formData.append("difficulty", difficultySelect.value);
  formData.append("count", cardCountSelect.value);
  if (selectedFile) {
    formData.append("file", selectedFile);
  }

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      body: formData
    });
    const data = await res.json();

    if (!res.ok) {
      message.textContent = data.error || "Something went wrong.";
    } else {
      renderCards(data.flashcards);
      renderQuiz(data.quiz);

      const deckTitle = selectedFile ? selectedFile.name : topic;
      lastDeck = { topic: deckTitle, flashcards: data.flashcards, quiz: data.quiz };
      saveBtn.textContent = "Save this deck";
      saveBtn.disabled = false;
      saveBtn.classList.remove("hidden");
    }
  } catch (err) {
    message.textContent = "Could not reach the server.";
  }

  loader.classList.add("hidden");
  generateBtn.disabled = false;
});

loadSaved();