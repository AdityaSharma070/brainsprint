const topicInput = document.getElementById("topicInput");
const generateBtn = document.getElementById("generateBtn");
const loader = document.getElementById("loader");
const message = document.getElementById("message");
const cardGrid = document.getElementById("cardGrid");

const sampleCards = [
  { question: "What is an array?", answer: "A collection of items stored at contiguous memory locations." },
  { question: "What is a stack?", answer: "A LIFO structure where the last item added is the first removed." },
  { question: "What is a queue?", answer: "A FIFO structure where the first item added is the first removed." },
  { question: "What is a linked list?", answer: "A chain of nodes where each node points to the next one." },
  { question: "What is a hash table?", answer: "A structure that maps keys to values using a hash function." }
];

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

generateBtn.addEventListener("click", function () {
  const topic = topicInput.value.trim();

  if (topic === "") {
    message.textContent = "Please enter a topic first.";
    return;
  }

  message.textContent = "";
  loader.classList.remove("hidden");
  cardGrid.innerHTML = "";

  setTimeout(function () {
    loader.classList.add("hidden");
    renderCards(sampleCards);
  }, 1000);
});