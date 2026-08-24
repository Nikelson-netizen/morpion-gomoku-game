// script.js (UI + jeu) - utilise aiWorker.js (IA dans un Web Worker)

const board = document.getElementById("board");
const resetButton = document.getElementById("reset");
const status = document.getElementById("status");

const modeSelect = document.getElementById("mode");
const aiSelect = document.getElementById("aiLevel");
const firstPlayerSelect = document.getElementById("firstPlayer");

const playerNameInput = document.getElementById("playerName");
const goOnlineButton = document.getElementById("goOnline");
const onlineInfo = document.getElementById("onlineInfo");
const onlinePlayersBox = document.getElementById("onlinePlayers");
const publicMatchesBox = document.getElementById("publicMatches");

const placeSound = new Audio("sounds/click.mp3");
placeSound.preload = "auto";

function playPlaceSound() {
  placeSound.currentTime = 0;
  placeSound.play().catch(() => {});
}

const size = 15;
const N = size * size;
const grid = Array(N).fill(null);

const AI_PLAYER = "white";
const HUMAN_PLAYER = "black";

let currentPlayer = "black";
let lastWinner = null;
let gameOver = false;
let cells = [];

let socket = null;
let isOnlineRegistered = false;
let myPlayerName = "";
let onlinePlayers = [];
let publicMatches = [];

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

function inBounds(r, c) { return r >= 0 && r < size && c >= 0 && c < size; }
function idxOf(r, c) { return r * size + c; }
function rcOf(i) { return [Math.floor(i / size), i % size]; }

// ----------------- WORKER -----------------
let worker = null;
let jobId = 0;

function initWorker() {
  try {
    if (worker) worker.terminate();

    worker = new Worker("./aiWorker.js");

    worker.onerror = (e) => {
  console.error("❌ Worker error message:", e.message);
  console.error("📄 file:", e.filename, "line:", e.lineno, "col:", e.colno);
  console.error("🔎 full event:", e);
  console.warn("Le worker IA a échoué. Voir la console.");
};

    worker.onmessage = (e) => {
      const msg = e.data;
      console.log("📩 worker:", msg);

      if (msg.type === "inited") {
        console.log("✅ worker ready");
        if (modeSelect.value === "ai" && firstPlayerSelect.value === "ai") {
          maybePlayAI();
        }
      }

      if (msg.type === "move") {
        if (msg.jobId !== jobId) return;
        handleAIMove(msg.move);
      }
    };

    worker.postMessage({ type: "init", size, ai: AI_PLAYER, human: HUMAN_PLAYER });
  } catch (e) {
    console.error("❌ Worker blocked (file://). Use Live Server.", e);
    worker = null;
    status.textContent = "⚠️ IA bloquée : ouvre avec Live Server";
  }
}

// ----------------- BOARD UI -----------------
function buildBoard() {
  board.innerHTML = "";
  cells = [];

  for (let i = 0; i < N; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.index = i;
    board.appendChild(cell);
    cells.push(cell);
    cell.addEventListener("click", () => handleMove(i));
  }
}

// ----------------- VISUALS (garde ton CSS) -----------------
function placeStoneVisual(i, player) {
  const cell = cells[i];

  document.querySelectorAll(".cell.last-move")
    .forEach(c => c.classList.remove("last-move"));

  cell.classList.add("placing");
  cell.classList.remove("black", "white");
  cell.classList.add(player);
  cell.classList.add("last-move");

  setTimeout(() => cell.classList.remove("placing"), 200);
}

// ----------------- WIN DETECTION -----------------
function collectLine(row, col, dr, dc, player) {
  const indices = [];
  let r = row, c = col;

  while (inBounds(r - dr, c - dc) && grid[idxOf(r - dr, c - dc)] === player) {
    r -= dr; c -= dc;
  }
  while (inBounds(r, c) && grid[idxOf(r, c)] === player) {
    indices.push(idxOf(r, c));
    r += dr; c += dc;
  }
  return indices;
}

function getWinningLine(index) {
  const player = grid[index];
  if (!player) return null;

  const [row, col] = rcOf(index);
  for (const [dr, dc] of DIRS) {
    const line = collectLine(row, col, dr, dc, player);
    if (line.length >= 5) return line.slice(0, 5);
  }
  return null;
}

// ----------------- GAME FLOW -----------------
function handleMove(i) {
  if (gameOver) return;
  if (grid[i]) return;

  // en mode IA : empêcher clic pendant tour IA
  if (modeSelect.value === "ai" && currentPlayer === AI_PLAYER) return;

  grid[i] = currentPlayer;
placeStoneVisual(i, currentPlayer);

playPlaceSound(); // 🔊 son quand un pion est posé

  const line = getWinningLine(i);
  if (line) {
    gameOver = true;
    line.forEach(idx => cells[idx].classList.add("winner"));
    status.textContent = `🎉 Winner: ${currentPlayer === "black" ? "Black" : "White"}`;
    return;
  }

  currentPlayer = currentPlayer === "black" ? "white" : "black";
  document.body.classList.toggle("white-turn", currentPlayer === "white");

  if (modeSelect.value === "ai" && currentPlayer === AI_PLAYER) {
    status.textContent = "Turn: AI";
  } else {
    status.textContent = `Turn : ${currentPlayer === "black" ? "black" : "White"}`;
  }

  maybePlayAI();
}

function handleAIMove(i) {
  if (gameOver) return;
  if (modeSelect.value !== "ai") return;
  if (currentPlayer !== AI_PLAYER) return;
  if (i == null || grid[i]) return;

  grid[i] = currentPlayer;
placeStoneVisual(i, currentPlayer);

playPlaceSound(); // 🔊 son quand un pion est posé

  const line = getWinningLine(i);
  if (line) {
    gameOver = true;
    line.forEach(idx => cells[idx].classList.add("winner"));
    status.textContent = "🎉 Winner : AI (White)";
    return;
  }

  currentPlayer = HUMAN_PLAYER;
  document.body.classList.toggle("white-turn", false);
  status.textContent = "Turn : Black";
}

function maybePlayAI() {
  console.log("🤖 maybePlayAI appelé");

  if (!worker) return;
  
  if (gameOver) return;
  if (modeSelect.value !== "ai") return;
  if (currentPlayer !== AI_PLAYER) return;

  jobId++;
  const level = Number(aiSelect.value || 3);

  const thinkMs = ({
    1: 120,
    2: 200,
    3: 320,
    4: 450,
    5: 650, // plus fort
  }[level] || 320);

  // envoie l'état actuel au worker
  worker.postMessage({
    type: "think",
    jobId,
    grid,
    ai: AI_PLAYER,
    human: HUMAN_PLAYER,
    level,
    thinkMs
  });
}
function initOnlineUI() {
  onlinePlayersBox.innerHTML = "No players online";
  publicMatchesBox.innerHTML = "No public matches";
  onlineInfo.textContent = 'Enter your name and click "Go Online" to appear online.';
}

function renderOnlinePlayers(players) {
  onlinePlayers = Array.isArray(players) ? players : [];

  if (!onlinePlayers.length) {
    onlinePlayersBox.innerHTML = "No players online";
    return;
  }

  onlinePlayersBox.innerHTML = "";

  for (const player of onlinePlayers) {
    const row = document.createElement("div");
    row.className = "player-row";

    const label = document.createElement("span");

    let text = player.name || "Unknown";
    if (player.status === "playing") text += " — In Game";
    else text += " — Available";

    label.textContent = text;

    const btn = document.createElement("button");
    btn.className = "online-btn";
    btn.textContent = "Play";

    if (player.status === "playing" || player.isMe) {
      btn.disabled = true;
    }

    btn.addEventListener("click", () => {
      if (!socket) return;
      socket.emit("invitePlayer", { targetId: player.id });
    });

    row.appendChild(label);
    row.appendChild(btn);
    onlinePlayersBox.appendChild(row);
  }
}

function renderPublicMatches(matches) {
  publicMatches = Array.isArray(matches) ? matches : [];

  if (!publicMatches.length) {
    publicMatchesBox.innerHTML = "No public matches";
    return;
  }

  publicMatchesBox.innerHTML = "";

  for (const match of publicMatches) {
    const row = document.createElement("div");
    row.className = "match-row";

    const label = document.createElement("span");
    label.textContent = `${match.blackName || "Black"} vs ${match.whiteName || "White"}`;

    const btn = document.createElement("button");
    btn.className = "online-btn";
    btn.textContent = "Watch";
    btn.disabled = true; // on l'activera plus tard

    row.appendChild(label);
    row.appendChild(btn);
    publicMatchesBox.appendChild(row);
  }
}
function initSocket() {
  if (typeof io === "undefined") {
    console.warn("Socket.IO not loaded yet.");
    return;
  }

  socket = io();

  socket.on("connect", () => {
    console.log("✅ Connected to server:", socket.id);
  });

  socket.on("onlinePlayers", (players) => {
    renderOnlinePlayers(players);
  });

  socket.on("publicMatches", (matches) => {
    renderPublicMatches(matches);
  });

  socket.on("inviteSent", (data) => {
    console.log("Invite sent:", data);
  });

  socket.on("errorMessage", (message) => {
    alert(message);
  });
}

// ----------------- RESET -----------------
function resetGame() {
  grid.fill(null);
  gameOver = false;
  document.body.classList.remove("white-turn");
  buildBoard();

  if (modeSelect.value === "ai" && firstPlayerSelect.value === "ai") {
    currentPlayer = AI_PLAYER;
    status.textContent = "Turn : IA";
    maybePlayAI();
  } else {
    currentPlayer = "black";
    status.textContent = "Turn : Black";
  }
}

resetButton.addEventListener("click", resetGame);
modeSelect.addEventListener("change", resetGame);
firstPlayerSelect.addEventListener("change", resetGame);


goOnlineButton.addEventListener("click", () => {
  const mode = modeSelect.value;
  const name = playerNameInput.value.trim();

  if (mode !== "online") {
    alert('Please select "Online Multiplayer" mode first.');
    return;
  }

  if (!name) {
    alert("Please enter your name before going online.");
    return;
  }

  if (!socket) {
    alert("Online server is not ready yet.");
    return;
  }

  myPlayerName = name;
  isOnlineRegistered = true;

  socket.emit("registerOnlinePlayer", { name });

  onlineInfo.textContent = `You are online as ${name}.`;
});


document.addEventListener("DOMContentLoaded", () => {
  initWorker();
  initSocket();
  resetGame();
});
