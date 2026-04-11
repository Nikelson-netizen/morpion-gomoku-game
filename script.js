const board = document.getElementById("board");
const resetButton = document.getElementById("reset");
const status = document.getElementById("status");

const modeSelect = document.getElementById("mode");
const aiSelect = document.getElementById("aiLevel");
const firstPlayerSelect = document.getElementById("firstPlayer");

const playerNameInput = document.getElementById("playerName");

if (playerNameInput) {
  playerNameInput.value = "";

  playerNameInput.addEventListener("input", () => {
    const typedName = playerNameInput.value.trim();

    if (isChallengeModeActive()) {
      if (typedName) {
        localStorage.setItem("challengePlayerName", typedName);
      } else {
        localStorage.removeItem("challengePlayerName");
      }
    } else {
      if (typedName) {
        localStorage.setItem("playerName", typedName);
      } else {
        localStorage.removeItem("playerName");
      }
    }

    refreshPlayerNames();

    if (!gameOver && modeSelect.value !== "online") {
      if (modeSelect.value === "ai" && currentPlayer === AI_PLAYER) {
        status.textContent = "Turn : AI";
      } else {
        status.textContent = `Turn : ${getPlayerDisplayName(currentPlayer)}`;
      }
    }

    if (scoreText) {
      scoreText.textContent =
        `${currentBlackName} ${matchScore.black} - ${matchScore.white} ${currentWhiteName}`;
    }
  });
}

const goOnlineButton = document.getElementById("goOnline");
const onlineInfo = document.getElementById("onlineInfo");
const onlinePlayersBox = document.getElementById("onlinePlayers");
const publicMatchesBox = document.getElementById("publicMatches");
const scoreText = document.getElementById("scoreText");

const leaveMatchButton = document.getElementById("leaveMatch");
if (leaveMatchButton) {
  if (modeSelect.value !== "online") {
    leaveMatchButton.style.display = "none";
  }

  modeSelect.addEventListener("change", () => {
    if (modeSelect.value === "online") {
      leaveMatchButton.style.display = "inline-block";
    } else {
      leaveMatchButton.style.display = "none";
    }
  });
}

const inviteBox = document.getElementById("inviteBox");
const inviteText = document.getElementById("inviteText");
const acceptInviteButton = document.getElementById("acceptInvite");
const declineInviteButton = document.getElementById("declineInvite");

const chatBox = document.getElementById("chatBox");
const chatHeader = document.getElementById("chatHeader");
const chatContent = document.getElementById("chatContent");
const challengeBtn = document.getElementById("challengeBtn");

const isChallengeMode = localStorage.getItem("challengeMode");
const challengeLevel = localStorage.getItem("challengeLevel");
const challengeFirstPlayer = localStorage.getItem("challengeFirstPlayer");

let challengeSessionActive = false;

function getTypedPlayerName() {
  return playerNameInput ? playerNameInput.value.trim() : "";
}

function isChallengeModeActive() {
  return (
    modeSelect &&
    modeSelect.value === "ai" &&
    status &&
    status.textContent.includes("Challenge Mode")
  );
}

function isChallengeNameMissing() {
  const isChallengePage = window.location.pathname.includes("challenge.html");

  if (!isChallengePage) return false;

  const name = localStorage.getItem("challengePlayerName");
  return !name || !name.trim();
}

function refreshPlayerNames() {
  const typedName = playerNameInput ? playerNameInput.value.trim() : "";

  if (isChallengeModeActive()) {
    const challengeName = localStorage.getItem("challengePlayerName");

    if (challengeName && challengeName.trim()) {
      currentBlackName = challengeName.trim();
    } else {
      currentBlackName = "Black";
    }
  } else {
    if (typedName) {
      currentBlackName = typedName;
    } else {
      currentBlackName = "Black";
    }
  }

  currentWhiteName = "White";
}

function launchChallengeMode() {
  challengeSessionActive = true;

  modeSelect.value = "ai";
  aiSelect.value = challengeLevel || "2";
  firstPlayerSelect.value = challengeFirstPlayer || "human";

  if (playerNameInput) {
    playerNameInput.value = "";
  }

  localStorage.removeItem("challengePlayerName");
  currentBlackName = "Black";
  currentWhiteName = "White";

  resetGame();
  status.textContent = "🔥 Challenge Mode - Enter your name";

  localStorage.removeItem("challengeMode");
  localStorage.removeItem("challengeLevel");
  localStorage.removeItem("challengeFirstPlayer");
}

if (chatBox) {
  chatBox.innerHTML = "Aucun message...";
}

if (chatHeader && chatContent) {
  chatHeader.addEventListener("click", () => {
    const isHidden =
      chatContent.style.display === "none" ||
      getComputedStyle(chatContent).display === "none";

    chatContent.style.display = isHidden ? "block" : "none";
  });
}

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
let myColor = null;
let gameOver = false;
let winningLine = [];
let cells = [];
let isWatching = false;
let watchingMatchId = null;
let winnerAlreadyCounted = false;

let matchScore = {
  black: 0,
  white: 0
};

let socket = null;
let isOnlineRegistered = false;
let myPlayerName = "";
let currentInviteFrom = null;

let pendingInviteTargetId = null;
let pendingInviteTargetName = "";

let onlinePlayers = [];
let publicMatches = [];

let currentBlackName = "Black";
let currentWhiteName = "White";
let lastMoveIndex = null;

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

// ----------------- HELPERS -----------------
function inBounds(r, c) {
  return r >= 0 && r < size && c >= 0 && c < size;
}

function idxOf(r, c) {
  return r * size + c;
}

function rcOf(i) {
  return [Math.floor(i / size), i % size];
}

function getPlayerDisplayName(color) {
  if (color === "black") return currentBlackName || "Black";
  if (color === "white") return currentWhiteName || "White";
  return color;
}

function resetMatchScore() {
  matchScore.black = 0;
  matchScore.white = 0;
  winnerAlreadyCounted = false;

  if (scoreText) {
    scoreText.textContent =
      `${currentBlackName} ${matchScore.black} - ${matchScore.white} ${currentWhiteName}`;
  }
}

function clearWinnerClasses() {
  document.querySelectorAll(".cell.winner").forEach((cell) => {
    cell.classList.remove("winner");
  });
}

function lockBoard() {
  board.classList.add("game-locked");
}

function unlockBoard() {
  board.classList.remove("game-locked");
}

function applyBoardFromServer(serverBoard) {
  if (!cells.length || cells.length !== N) {
    buildBoard();
  }

  clearWinnerClasses();

  document.querySelectorAll(".cell.last-move").forEach((c) => {
    c.classList.remove("last-move");
  });

  for (let i = 0; i < N; i++) {
    const nextValue = serverBoard[i] ?? null;
    grid[i] = nextValue;

    const cell = cells[i];
    if (!cell) continue;

    cell.classList.remove("black", "white", "placing", "winner");

    if (nextValue) {
      cell.classList.add(nextValue);
    }
  }

  if (
    lastMoveIndex !== null &&
    lastMoveIndex >= 0 &&
    lastMoveIndex < N &&
    grid[lastMoveIndex]
  ) {
    if (cells[lastMoveIndex]) {
      cells[lastMoveIndex].classList.add("last-move");
    }
  }
}

function highlightWinningLineFromBoard() {
  clearWinnerClasses();

  for (let i = 0; i < N; i++) {
    if (!grid[i]) continue;

    const line = getWinningLine(i);
    if (line && line.length >= 5) {
      line.forEach((idx) => {
        if (cells[idx]) cells[idx].classList.add("winner");
      });
      return true;
    }
  }

  return false;
}

function showWinner(winnerName) {
  gameOver = true;
  lockBoard();

  highlightWinningLineFromBoard();

  if (!winnerAlreadyCounted) {
    if (winnerName === currentBlackName) {
      matchScore.black++;
    }

    if (winnerName === currentWhiteName) {
      matchScore.white++;
    }

    winnerAlreadyCounted = true;
  }

  if (scoreText) {
    scoreText.textContent =
      `${currentBlackName} ${matchScore.black} - ${matchScore.white} ${currentWhiteName}`;
  }

  status.textContent =
    `🎉 ${winnerName} wins the game! Score: ${currentBlackName} ${matchScore.black} - ${matchScore.white} ${currentWhiteName}`;

  resetButton.textContent = "Play Again";

  const shareContainer = document.getElementById("shareContainer");
  const shareBtn = document.getElementById("shareMatchBtn");

  if (shareContainer) {
    shareContainer.style.display = "block";
  }

  if (shareBtn) {
    shareBtn.onclick = async () => {
      await generateShareImage(winnerName);
    };
  }

  if (challengeBtn) {
    challengeBtn.textContent = "🔥 Challenge Me";
    challengeBtn.style.display = "inline-block";

    const humanWonVsAI =
  challengeSessionActive &&
  modeSelect.value === "ai" &&
  winnerName === getPlayerDisplayName(HUMAN_PLAYER);

    if (humanWonVsAI) {
      challengeBtn.onclick = () => {
        const data = {
          winnerName: getTypedPlayerName() || winnerName,
          aiLevel: aiSelect.value,
          aiStarted: firstPlayerSelect.value === "ai",
          mode: modeSelect.value
        };

        localStorage.setItem("challengeResult", JSON.stringify(data));
        window.location.href = "challenge.html";
      };
    } else {
      challengeBtn.onclick = () => {
        window.location.href = "challenge.html";
      };
    }
  }
}

function updateTurnStatus() {
  if (gameOver) return;

  if (isWatching) {
    status.textContent = `👀 Watching ${currentBlackName} vs ${currentWhiteName}`;
    resetButton.style.display = "none";
    return;
  }

  if (modeSelect.value === "online" && myColor) {
    status.textContent =
      myColor === currentPlayer ? "Your turn" : "Opponent's turn";
    return;
  }

  if (modeSelect.value === "ai" && currentPlayer === AI_PLAYER) {
    status.textContent = "Turn : AI";
    return;
  }

  status.textContent = `Turn : ${getPlayerDisplayName(currentPlayer)}`;
}

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

      if (msg.type === "inited") {
        if (modeSelect.value === "ai" && firstPlayerSelect.value === "ai") {
          maybePlayAI();
        }
      }

      if (msg.type === "move") {
        if (msg.jobId !== jobId) return;
        handleAIMove(msg.move);
      }
    };

    worker.postMessage({
      type: "init",
      size,
      ai: AI_PLAYER,
      human: HUMAN_PLAYER
    });
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

// ----------------- VISUALS -----------------
function placeStoneVisual(i, player) {
  const cell = cells[i];
  if (!cell) return;

  document.querySelectorAll(".cell.last-move").forEach((c) => {
    c.classList.remove("last-move");
  });

  lastMoveIndex = i;

  cell.classList.add("placing");
  cell.classList.remove("black", "white");
  cell.classList.add(player);
  cell.classList.add("last-move");

  setTimeout(() => {
    if (cell) cell.classList.remove("placing");
  }, 200);
}

// ----------------- WIN DETECTION -----------------
function collectLine(row, col, dr, dc, player) {
  const indices = [];
  let r = row;
  let c = col;

  while (inBounds(r - dr, c - dc) && grid[idxOf(r - dr, c - dc)] === player) {
    r -= dr;
    c -= dc;
  }

  while (inBounds(r, c) && grid[idxOf(r, c)] === player) {
    indices.push(idxOf(r, c));
    r += dr;
    c += dc;
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

function checkWinWithLine(player) {
  const directions = [
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 1, dc: 1 },
    { dr: 1, dc: -1 }
  ];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const startIndex = row * size + col;
      if (grid[startIndex] !== player) continue;

      for (const { dr, dc } of directions) {
        const line = [{ row, col, index: startIndex }];

        for (let step = 1; step < 5; step++) {
          const r = row + dr * step;
          const c = col + dc * step;

          if (r < 0 || r >= size || c < 0 || c >= size) break;

          const idx = r * size + c;
          if (grid[idx] !== player) break;

          line.push({ row: r, col: c, index: idx });
        }

        if (line.length === 5) {
          winningLine = line;
          return line;
        }
      }
    }
  }

  return null;
}

// ----------------- CHAT -----------------
let unreadCount = 0;

function sendMessage() {
  const input = document.getElementById("chatInput");
  if (!input || !socket) return;

  const msg = input.value.trim();
  if (!msg) return;

  socket.emit("sendMessage", msg);
  input.value = "";
}

function addChatMessage(name, message) {
  const box = document.getElementById("chatBox");
  const chatContentLocal = document.getElementById("chatContent");

  if (!box) return;

  if (chatContentLocal) {
    chatContentLocal.style.display = "block";
  }

  if (box.textContent.trim() === "Aucun message...") {
    box.innerHTML = "";
  }

  const div = document.createElement("div");
  div.textContent = `${name}: ${message}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ----------------- SHARE -----------------
async function shareMatch(winnerName) {
  const shareUrl = window.location.origin;

  const shareText = `${winnerName} just won on Gomoku 🔥
Match score: ${currentBlackName} ${matchScore.black} - ${matchScore.white} ${currentWhiteName}

Play Gomoku online with real players 🔥
Train your brain and strategy 🧠

Can you beat me? 😏

${shareUrl}`;

  try {
    const imageBlob = await createShareImage(winnerName);

    if (imageBlob) {
      const imageFile = new File([imageBlob], "gomoku-match.png", {
        type: "image/png"
      });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
        await navigator.share({
          title: "Gomoku Online",
          text: shareText,
          url: shareUrl,
          files: [imageFile]
        });
        return;
      }
    }

    if (navigator.share) {
      await navigator.share({
        title: "Gomoku Online",
        text: shareText,
        url: shareUrl
      });
    } else {
      await navigator.clipboard.writeText(shareText);
      alert("Share text copied!");
    }
  } catch (err) {
    console.log("Share cancelled or failed:", err);
  }
}

async function shareMatchImage(winnerName) {
  try {
    const imageBlob = await createShareImage(winnerName);

    if (!imageBlob) return;

    const imageFile = new File([imageBlob], "gomoku-match.png", {
      type: "image/png"
    });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
      await navigator.share({
        title: "Gomoku Match",
        files: [imageFile]
      });
    } else {
      const link = document.createElement("a");
      link.download = "gomoku-match.png";
      link.href = URL.createObjectURL(imageBlob);
      link.click();
      URL.revokeObjectURL(link.href);
    }
  } catch (error) {
    console.error("Share image error:", error);
  }
}

async function createShareImage(winnerName) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = 1080;
  canvas.height = 1350;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";

  ctx.fillStyle = "#111827";
  ctx.font = "bold 64px Arial";
  ctx.fillText("GOMOKU ONLINE", canvas.width / 2, 100);

  ctx.fillStyle = "#2563eb";
  ctx.font = "bold 34px Arial";
  ctx.fillText("Can you beat me? 😈", canvas.width / 2, 160);

  ctx.fillStyle = "#111827";
  ctx.font = "48px Arial";
  ctx.fillText(`Winner: ${winnerName}`, canvas.width / 2, 235);

  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(210, 290, 660, 95);

  ctx.fillStyle = "#6b7280";
  ctx.font = "bold 22px Arial";
  ctx.fillText("MATCH SCORE", canvas.width / 2, 325);

  ctx.fillStyle = "#111827";
  ctx.font = "bold 30px Arial";
  ctx.fillText(
    `${currentBlackName} ${matchScore.black} - ${matchScore.white} ${currentWhiteName}`,
    canvas.width / 2,
    365
  );

  const boardCanvas = await html2canvas(board, {
    backgroundColor: null,
    scale: 2
  });

  ctx.drawImage(boardCanvas, 160, 430, 760, 760);

  ctx.fillStyle = "#6b7280";
  ctx.font = "28px Arial";
  ctx.fillText("Play free online with other players", canvas.width / 2, 1260);

  const link = document.createElement("a");
  link.download = "gomoku-match.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function getShareData(limit = 10) {
  const stones = [];

  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) continue;

    const row = Math.floor(i / size);
    const col = i % size;

    stones.push({
      row,
      col,
      player: grid[i],
      isWinning: winningLine.some((w) => w.index === i)
    });
  }

  const recent = stones.slice(-limit);

  if (recent.length === 0) {
    return {
      stones: [
        { x: 4, y: 3, color: "black", isWinning: false },
        { x: 5, y: 4, color: "white", isWinning: false },
        { x: 5, y: 5, color: "black", isWinning: false },
        { x: 6, y: 6, color: "white", isWinning: false },
        { x: 6, y: 7, color: "black", isWinning: false }
      ],
      winningOverlay: []
    };
  }

  let source = recent;

  if (winningLine.length > 0) {
    const winningIndexes = winningLine.map((w) => w.index);
    const winningStones = stones.filter((s) => winningIndexes.includes(s.row * size + s.col));

    const merged = [...recent];

    winningStones.forEach((ws) => {
      const exists = merged.some((m) => m.row === ws.row && m.col === ws.col);
      if (!exists) merged.push(ws);
    });

    source = merged;
  }

  const minRow = Math.min(...source.map((s) => s.row));
  const maxRow = Math.max(...source.map((s) => s.row));
  const minCol = Math.min(...source.map((s) => s.col));
  const maxCol = Math.max(...source.map((s) => s.col));

  const rowSpan = Math.max(1, maxRow - minRow);
  const colSpan = Math.max(1, maxCol - minCol);
  const span = Math.max(rowSpan, colSpan, 4);

  const mapped = source.map((s) => {
    const x = ((s.col - minCol) / span) * 6 + 2;
    const y = ((s.row - minRow) / span) * 6 + 2;

    return {
      x,
      y,
      color: s.player === "black" ? "black" : "white",
      isWinning: s.isWinning,
      row: s.row,
      col: s.col
    };
  });

  const winningOverlay = mapped.filter((s) => s.isWinning);

  return {
    stones: mapped,
    winningOverlay
  };
}

// ----------------- GAME FLOW -----------------
function handleMove(i) {
  if (isChallengeNameMissing()) {
  status.textContent = "⚠️ Please enter your name from Challenge Me first";
  return;
}

  if (gameOver) return;
  if (grid[i]) return;
  if (isWatching) return;

  if (modeSelect.value === "online") {
    if (!socket) return;
    if (!myColor) return;

    if (currentPlayer !== myColor) {
      alert("Not your turn");
      status.textContent = "Not your turn";

      setTimeout(() => {
        if (modeSelect.value === "online" && myColor && !gameOver) {
          status.textContent =
            myColor === currentPlayer ? "Your turn" : "Opponent's turn";
        }
      }, 2000);

      return;
    }

    socket.emit("playMove", { index: i });
    return;
  }

  if (modeSelect.value === "ai" && currentPlayer === AI_PLAYER) return;

  grid[i] = currentPlayer;
  placeStoneVisual(i, currentPlayer);
  playPlaceSound();

  const line = getWinningLine(i);
  if (line) {
    gameOver = true;
    winningLine = line.map((idx) => {
      const [row, col] = rcOf(idx);
      return { row, col, index: idx };
    });

    lockBoard();
    line.forEach((idx) => cells[idx].classList.add("winner"));

    if (modeSelect.value === "online" && socket) {
  socket.emit("onlineGameWon", { winnerColor: currentPlayer });
} else {
  showWinner(getPlayerDisplayName(currentPlayer));
}

    return;
  }

  currentPlayer = currentPlayer === "black" ? "white" : "black";
  document.body.classList.toggle("white-turn", currentPlayer === "white");
  updateTurnStatus();
  maybePlayAI();
}

function handleAIMove(i) {
  if (gameOver) return;
  if (modeSelect.value !== "ai") return;
  if (currentPlayer !== AI_PLAYER) return;
  if (i == null || grid[i]) return;

  grid[i] = currentPlayer;
  placeStoneVisual(i, currentPlayer);
  playPlaceSound();

  const line = getWinningLine(i);
  if (line) {
    gameOver = true;
    winningLine = line.map((idx) => {
      const [row, col] = rcOf(idx);
      return { row, col, index: idx };
    });

    lockBoard();
    line.forEach((idx) => cells[idx].classList.add("winner"));
    showWinner(getPlayerDisplayName(currentPlayer));
    return;
  }

  currentPlayer = HUMAN_PLAYER;
  document.body.classList.toggle("white-turn", false);
  status.textContent = `Turn : ${currentBlackName}`;
}

function maybePlayAI() {
  if (!worker) return;
  if (gameOver) return;
  if (modeSelect.value !== "ai") return;
  if (currentPlayer !== AI_PLAYER) return;

  jobId++;
  const level = Number(aiSelect.value || 3);

  const thinkMs =
    ({
      1: 120,
      2: 200,
      3: 320,
      4: 450,
      5: 650
    })[level] || 320;

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

// ----------------- ONLINE UI -----------------
function initOnlineUI() {
  if (onlinePlayersBox) onlinePlayersBox.innerHTML = "No players online";
  if (publicMatchesBox) publicMatchesBox.innerHTML = "No public matches";

  const playersStatus = document.getElementById("playersStatus");
  const matchesStatus = document.getElementById("matchesStatus");

  if (onlineInfo) {
    if (modeSelect && modeSelect.value === "online") {
      onlineInfo.textContent = 'Enter your name and click "Find a player" to appear online.';
      if (playersStatus) {
        playersStatus.textContent = 'Enter your name and click "Find a player" to appear online.';
      }
    } else {
      onlineInfo.textContent = 'Select "Online Multiplayer" mode to find players.';
      if (playersStatus) {
        playersStatus.textContent = 'Select "Online Multiplayer" mode to find players.';
      }
    }
  }

  if (matchesStatus) {
    matchesStatus.textContent = "No public matches";
  }
}

function renderOnlinePlayers(players) {
  onlinePlayers = Array.isArray(players) ? players : [];

  const playersStatus = document.getElementById("playersStatus");
if (playersStatus) {
  playersStatus.textContent = onlinePlayers.length
    ? `${onlinePlayers.length} player(s) online`
    : "No players online";
}

  if (!onlinePlayersBox) return;

  if (!onlinePlayers.length) {
    onlinePlayersBox.innerHTML = "No players online";
    return;
  }

  onlinePlayersBox.innerHTML = "";

  for (const player of onlinePlayers) {
    const row = document.createElement("div");
    row.className = "player-row";

    const label = document.createElement("span");
    let text = (player.name || "Unknown") + (player.code ? "#" + player.code : "");

    if (player.status === "playing") text += " — In Game";
    else text += " — Available";

    label.textContent = text;

    const btn = document.createElement("button");
    btn.className = "online-btn";

    if (player.status === "playing" || player.isMe) {
      btn.textContent = "Play";
      btn.disabled = true;
    } else if (player.id === pendingInviteTargetId) {
      btn.textContent = "Sent";
      btn.disabled = true;
      btn.style.opacity = "0.7";
    } else {
      btn.textContent = "Play";
      btn.disabled = false;
    }

    btn.addEventListener("click", () => {
      if (!socket) return;
      if (player.status === "playing" || player.isMe) return;
      if (pendingInviteTargetId) return;

      pendingInviteTargetId = player.id;
      pendingInviteTargetName = player.name || "player";
      if (onlineInfo) {
        onlineInfo.textContent = `Invitation sent to ${pendingInviteTargetName}.`;
      }

      renderOnlinePlayers(onlinePlayers);

      socket.emit("invitePlayer", { targetId: player.id });
    });

    row.appendChild(label);
    row.appendChild(btn);
    onlinePlayersBox.appendChild(row);
  }
}

function renderPublicMatches(matches) {
  const rawMatches = Array.isArray(matches) ? matches : [];

  const uniqueMatches = [];
  const seen = new Set();

  for (const match of rawMatches) {
    if (!match) continue;

    const key = match.id || `${match.blackName || ""}-${match.whiteName || ""}`;
    if (seen.has(key)) continue;

    seen.add(key);
    uniqueMatches.push(match);
  }

  publicMatches = uniqueMatches;

  const matchesStatus = document.getElementById("matchesStatus");
if (matchesStatus) {
  matchesStatus.textContent = publicMatches.length
    ? `${publicMatches.length} public match(es)`
    : "No public matches";
}

  if (!publicMatchesBox) return;

  if (!publicMatches.length) {
    publicMatchesBox.innerHTML = "No public matches";
    return;
  }

  publicMatchesBox.innerHTML = "";

  for (const match of publicMatches) {
    const row = document.createElement("div");
    row.className = "public-match-row";

    const label = document.createElement("span");
    label.textContent =
      `${match.blackName || "Black"} vs ${match.whiteName || "White"} — 👀 ${match.spectatorCount ?? 0} watching`;

    row.appendChild(label);

    if (match.canWatch) {
      const watchBtn = document.createElement("button");
      watchBtn.className = "watch-btn online-btn";

      const thisMatchIsWatched = isWatching && watchingMatchId === match.id;

      if (thisMatchIsWatched) {
        watchBtn.textContent = "Watching";
        watchBtn.disabled = true;
        watchBtn.classList.add("watching");
      } else {
        watchBtn.textContent = "Watch";
        watchBtn.disabled = false;
      }

      watchBtn.addEventListener("click", () => {
        if (!socket) return;

        watchingMatchId = match.id;
        isWatching = true;
        if (leaveMatchButton) leaveMatchButton.textContent = "Leave Watch";

        socket.emit("watchMatch", { matchId: match.id });
        renderPublicMatches(publicMatches);
      });

      row.appendChild(watchBtn);
    }

    publicMatchesBox.appendChild(row);
  }
}

// ----------------- SOCKET -----------------
function initSocket() {
  if (typeof io === "undefined") {
    console.warn("Socket.IO not loaded yet.");
    return;
  }

  socket = io();

  socket.on("connect", () => {
    console.log("✅ Connected to server:", socket.id);
  });

  socket.on("receiveMessage", ({ name, message }) => {
    addChatMessage(name, message);

    const myName = document.getElementById("playerName")?.value?.trim();

    if (name !== myName) {
      unreadCount++;

      const badge = document.getElementById("chatBadge");
      if (badge) {
        badge.style.display = "inline-block";
        badge.textContent = unreadCount;
      }
    }
  });

  socket.on("onlinePlayers", (players) => {
    renderOnlinePlayers(players);
  });

  socket.on("publicMatches", (matches) => {
    renderPublicMatches(matches);
  });

  socket.on("inviteSent", () => {
    if (pendingInviteTargetName && onlineInfo) {
      onlineInfo.textContent = `Invitation sent to ${pendingInviteTargetName}.`;
    }
  });

  socket.on("matchInvite", ({ fromId, fromName }) => {
    currentInviteFrom = fromId;
    if (inviteText) inviteText.textContent = `${fromName} wants to play with you`;
    if (inviteBox) inviteBox.style.display = "block";
  });

  socket.on("errorMessage", (message) => {
    if (
      message === "Invitation declined." ||
      message === "This player is no longer online." ||
      message === "One of the players is already in a game."
    ) {
      pendingInviteTargetId = null;
      pendingInviteTargetName = "";
      renderOnlinePlayers(onlinePlayers);
      if (onlineInfo) onlineInfo.textContent = message;
      return;
    }

    if (message === "Not your turn") {
      alert("Not your turn");
      status.textContent = "Not your turn";

      setTimeout(() => {
        if (modeSelect.value === "online" && myColor && !gameOver) {
          status.textContent =
            myColor === currentPlayer ? "Your turn" : "Opponent's turn";
        }
      }, 2000);

      return;
    }

    status.textContent = message;
  });

  socket.on("watchStart", ({
    matchId,
    board: matchBoard,
    blackName,
    whiteName,
    currentPlayer: watchedCurrentPlayer,
    gameOver: watchedGameOver,
    winnerName
  }) => {
    isWatching = true;
    watchingMatchId = matchId;
    myColor = null;

    currentBlackName = blackName || "Black";
    currentWhiteName = whiteName || "White";
    currentPlayer = watchedCurrentPlayer;
    gameOver = !!watchedGameOver;

    applyBoardFromServer(matchBoard || Array(N).fill(null));

    document.body.classList.add("watching-mode");
    board.classList.add("spectator-board");
    document.body.classList.toggle("white-turn", currentPlayer === "white");

    if (gameOver) {
      lockBoard();
      if (winnerName) showWinner(winnerName);
      return;
    }

    unlockBoard();
    status.textContent = `👀 Watching ${currentBlackName} vs ${currentWhiteName}`;
  });

  socket.on("gameStart", ({
    color,
    opponentName,
    blackName,
    whiteName,
    board: matchBoard,
    currentPlayer: serverCurrentPlayer,
    winnerName
  }) => {
    document.body.classList.remove("watching-mode");
    board.classList.remove("spectator-board");
    isWatching = false;
    watchingMatchId = null;
    unlockBoard();

    pendingInviteTargetId = null;
    pendingInviteTargetName = "";

    myColor = color;
    resetMatchScore();
    currentBlackName = blackName || (color === "black" ? myPlayerName : opponentName || "Black");
    currentWhiteName = whiteName || (color === "white" ? myPlayerName : opponentName || "White");

    currentPlayer = serverCurrentPlayer || "black";
    gameOver = false;
    winningLine = [];
    applyBoardFromServer(matchBoard || Array(N).fill(null));

    document.body.classList.toggle("white-turn", currentPlayer === "white");

    if (winnerName) {
      showWinner(winnerName);
      return;
    }

    if (myColor === currentPlayer) {
      status.textContent = `Your turn vs ${opponentName || "Opponent"}`;
    } else {
      status.textContent = `Opponent's turn vs ${opponentName || "Opponent"}`;
    }
  });

  socket.on("movePlayed", ({ index, player }) => {
    if (gameOver) return;
    if (typeof index !== "number") return;
    if (index < 0 || index >= N) return;
    if (grid[index]) return;

    grid[index] = player;

    const cell = cells[index];
    if (cell) {
      document.querySelectorAll(".cell.last-move").forEach((c) => {
        c.classList.remove("last-move");
      });

      lastMoveIndex = index;

      cell.classList.remove("black", "white", "placing", "winner");
      cell.classList.add(player, "last-move", "placing");

      setTimeout(() => {
        if (cell) cell.classList.remove("placing");
      }, 200);
    }

    playPlaceSound();

    const line = getWinningLine(index);
    if (line) {
      gameOver = true;
      winningLine = line.map((idx) => {
        const [row, col] = rcOf(idx);
        return { row, col, index: idx };
      });

      lockBoard();
      line.forEach((idx) => {
        if (cells[idx]) cells[idx].classList.add("winner");
      });
      return;
    }

    currentPlayer = player === "black" ? "white" : "black";
    document.body.classList.toggle("white-turn", currentPlayer === "white");

    if (isWatching) {
      status.textContent = `👀 Watching ${currentBlackName} vs ${currentWhiteName}`;
      return;
    }

    status.textContent =
      currentPlayer === myColor ? "Your turn" : "Opponent's turn";
  });

  socket.on("matchState", ({
    matchId,
    board: serverBoard,
    blackName,
    whiteName,
    currentPlayer: serverCurrentPlayer,
    gameOver: serverGameOver,
    winnerName
  }) => {
    currentBlackName = blackName || "Black";
    currentWhiteName = whiteName || "White";
    currentPlayer = serverCurrentPlayer || "black";
    gameOver = !!serverGameOver;

    if (Array.isArray(serverBoard) && serverBoard.length === N) {
      applyBoardFromServer(serverBoard);
    }

    if (isWatching) {
      watchingMatchId = matchId || watchingMatchId;
      document.body.classList.add("watching-mode");
      board.classList.add("spectator-board");
    }

    document.body.classList.toggle("white-turn", currentPlayer === "white");

    if (gameOver) {
      lockBoard();
      if (winnerName) showWinner(winnerName);
      return;
    }

    unlockBoard();
    updateTurnStatus();
  });

  socket.on("gameWon", ({ winnerName }) => {
    gameOver = true;
    lockBoard();
    showWinner(winnerName);
  });

  socket.on("onlineGameReset", ({
    board: serverBoard,
    currentPlayer: serverCurrentPlayer,
    blackName,
    whiteName,
    gameOver: serverGameOver,
    winnerName
  }) => {
    unlockBoard();

    resetButton.textContent = "Restart";
    resetButton.style.background = "";

    currentBlackName = blackName || currentBlackName;
    currentWhiteName = whiteName || currentWhiteName;

    applyBoardFromServer(serverBoard || Array(N).fill(null));

    gameOver = !!serverGameOver;
    currentPlayer = serverCurrentPlayer || "black";
    winningLine = [];

    document.body.classList.toggle("white-turn", currentPlayer === "white");

    if (gameOver) {
      lockBoard();
      if (winnerName) showWinner(winnerName);
      return;
    }

    const shareContainer = document.getElementById("shareContainer");
    if (shareContainer) {
      shareContainer.style.display = "none";
    }

    if (isWatching) {
      status.textContent = `👀 Watching ${currentBlackName} vs ${currentWhiteName}`;
    } else {
      status.textContent =
        myColor === currentPlayer ? "Your turn" : "Opponent's turn";
    }
  });

  socket.on("watchEnded", () => {
    isWatching = false;
    watchingMatchId = null;
    document.body.classList.remove("watching-mode");
    board.classList.remove("spectator-board");
    unlockBoard();

    if (leaveMatchButton) leaveMatchButton.textContent = "End Match";

    resetMatchScore();
    resetGame();
  });

  socket.on("matchEnded", ({ message }) => {
    document.body.classList.remove("watching-mode");
    board.classList.remove("spectator-board");
    isWatching = false;
    watchingMatchId = null;
    unlockBoard();

    const shareContainer = document.getElementById("shareContainer");
    if (shareContainer) {
      shareContainer.style.display = "none";
    }

    myColor = null;
    gameOver = true;
    currentPlayer = "black";
    currentBlackName = "Black";
    currentWhiteName = "White";
    resetMatchScore();

    grid.fill(null);
    lastMoveIndex = null;
    winnerAlreadyCounted = false;
    winningLine = [];
    buildBoard();

    pendingInviteTargetId = null;
    pendingInviteTargetName = "";
    renderOnlinePlayers(onlinePlayers);

    status.textContent = message || "🎉 Match finished!";
    resetButton.textContent = "Play Again";
    resetButton.style.background = "#28a745";
  });
}

// ----------------- RESET -----------------
function resetGame() {
  resetButton.textContent = "Restart";
  resetButton.style.background = "";

  if (leaveMatchButton) {
    leaveMatchButton.textContent = "End Match";
  }

  if (isWatching && socket) {
    socket.emit("leaveWatch");
  }

  document.body.classList.remove("watching-mode");
  board.classList.remove("spectator-board");
  unlockBoard();
  isWatching = false;
  watchingMatchId = null;
  resetButton.style.display = "inline-block";

  refreshPlayerNames();

  if (modeSelect.value !== "online") {
  if (onlineInfo) {
    onlineInfo.textContent = 'Select "Online Multiplayer" mode to find players.';
  }

  if (onlinePlayersBox) {
    onlinePlayersBox.innerHTML = "No players online";
  }

  if (publicMatchesBox) {
    publicMatchesBox.innerHTML = "No public matches";
  }

  isOnlineRegistered = false;
  myColor = null;
}

  grid.fill(null);
  lastMoveIndex = null;
  winnerAlreadyCounted = false;
  gameOver = false;
  winningLine = [];
  document.body.classList.remove("white-turn");
  buildBoard();

  const shareContainer = document.getElementById("shareContainer");
  if (shareContainer) {
    shareContainer.style.display = "none";
  }

  if (scoreText) {
    scoreText.textContent =
      `${currentBlackName} ${matchScore.black} - ${matchScore.white} ${currentWhiteName}`;
  }

  if (modeSelect.value === "online") {
    if (socket && myColor) {
      socket.emit("resetOnlineGame");
    } else {
      currentPlayer = "black";
      status.textContent = "Online mode ready";
    }
    return;
  }

  if (modeSelect.value === "ai" && firstPlayerSelect.value === "ai") {
    currentPlayer = AI_PLAYER;
    status.textContent = "Turn : AI";
    maybePlayAI();
  } else {
    currentPlayer = "black";
    status.textContent = `Turn : ${currentBlackName}`;
  }
}

// ----------------- BUTTONS -----------------
resetButton.addEventListener("click", resetGame);
modeSelect.addEventListener("change", () => {
  resetGame();

  if (onlineInfo) {
    if (modeSelect.value === "online") {
      onlineInfo.textContent = 'Enter your name and click "Find a player" to appear online.';
    } else {
      onlineInfo.textContent = 'Select "Online Multiplayer" mode to find players.';
    }
  }
});
firstPlayerSelect.addEventListener("change", resetGame);

if (challengeBtn) {
  challengeBtn.addEventListener("click", () => {
  window.location.href = "challenge.html";
});
}

if (leaveMatchButton) {
  leaveMatchButton.addEventListener("click", () => {
    if (!socket) return;

    if (isWatching) {
      socket.emit("leaveWatch");
      document.body.classList.remove("watching-mode");
      board.classList.remove("spectator-board");
      unlockBoard();
      leaveMatchButton.textContent = "End Match";
      isWatching = false;
      watchingMatchId = null;
      resetGame();
      return;
    }

    socket.emit("leaveMatch");
  });
}

if (acceptInviteButton) {
  acceptInviteButton.addEventListener("click", () => {
    if (!socket || !currentInviteFrom) return;

    socket.emit("acceptInvite", { fromId: currentInviteFrom });

    if (inviteBox) {
      inviteBox.style.display = "none";
    }

    currentInviteFrom = null;
  });
}

if (declineInviteButton) {
  declineInviteButton.addEventListener("click", () => {
    if (!socket || !currentInviteFrom) return;

    socket.emit("declineInvite", { fromId: currentInviteFrom });

    if (inviteBox) {
      inviteBox.style.display = "none";
    }

    currentInviteFrom = null;
  });
}

if (goOnlineButton) {
  goOnlineButton.addEventListener("click", () => {
    const mode = modeSelect.value;
    const name = playerNameInput ? playerNameInput.value.trim() : "";

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
    myColor = null;

    if (!isOnlineRegistered) {
      socket.emit("registerOnlinePlayer", { name });
      isOnlineRegistered = true;
    }

    if (onlineInfo) {
      onlineInfo.textContent = `You are online as ${name}. Choose a player or watch a public match.`;
    }

    if (onlinePlayersBox) {
      onlinePlayersBox.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

// ----------------- START -----------------
document.addEventListener("DOMContentLoaded", () => {
  initWorker();
  initSocket();
  initOnlineUI();
  initCollapsiblePanels();
  resetGame();

  if (chatContent) {
    chatContent.style.display = "none";
  }

  if (isChallengeMode === "true") {
    launchChallengeMode();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("chatHeader")?.addEventListener("click", () => {
    unreadCount = 0;

    const badge = document.getElementById("chatBadge");
    if (badge) {
      badge.style.display = "none";
      badge.textContent = "0";
    }
  });
});

const shareSiteBtn = document.getElementById("shareSiteBtn");

if (shareSiteBtn) {
  shareSiteBtn.addEventListener("click", async () => {
    const shareData = {
      title: "Can you beat me? 🔥 Gomoku Online",
      text: "I challenge you. Come play Gomoku and beat me 😏",
      url: "https://gomoku-morpion-5-online.onrender.com/"
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        alert("Link copied!");
      }
    } catch (error) {
      console.log(error);
    }
  });
}

function initCollapsiblePanels() {
  const toggles = document.querySelectorAll(".collapse-toggle");

  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const box = toggle.closest(".collapsible-box");
      if (!box) return;

      box.classList.toggle("open");
    });
  });
}

async function generateShareImage(winnerName) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = 1080;
  canvas.height = 1400;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#111827";
  ctx.font = "bold 60px Arial";
  ctx.textAlign = "center";
  ctx.fillText("GOMOKU ONLINE", 540, 100);

  ctx.fillStyle = "#2563eb";
  ctx.font = "bold 34px Arial";
  ctx.fillText("Can you beat me? 😈", 540, 155);

  ctx.fillStyle = "#111827";
  ctx.font = "36px Arial";
  ctx.fillText(`Winner: ${winnerName}`, 540, 220);

  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(180, 260, 720, 90);

  ctx.fillStyle = "#6b7280";
  ctx.font = "bold 24px Arial";
  ctx.fillText("MATCH SCORE", 540, 295);

  ctx.fillStyle = "#111827";
  ctx.font = "bold 34px Arial";
  ctx.fillText(
    `${currentBlackName} ${matchScore.black} - ${matchScore.white} ${currentWhiteName}`,
    540,
    335
  );

  const boardCanvas = await html2canvas(board, {
    backgroundColor: null,
    scale: 2
  });

  ctx.drawImage(boardCanvas, 140, 400, 800, 800);

  ctx.fillStyle = "#6b7280";
  ctx.font = "28px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Play free online with other players", 540, 1220);

  ctx.fillStyle = "#111827";
  ctx.font = "26px Arial";
  ctx.fillText("Play now:", 540, 1280);

  ctx.fillStyle = "#2563eb";
  ctx.font = "bold 28px Arial";
  ctx.fillText("gomoku-morpion-5-online.onrender.com", 540, 1335);

  const link = document.createElement("a");
  link.download = "gomoku-match.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

const fbLoginBtn = document.getElementById("fbLoginBtn");

if (fbLoginBtn) {
  fbLoginBtn.addEventListener("click", () => {

    if (typeof FB === "undefined") {
      alert("Facebook SDK not loaded");
      return;
    }

    FB.login(function (response) {
      if (response.authResponse) {
        console.log("Connected!");

        FB.api('/me', { fields: 'name' }, function (user) {
          console.log("User:", user.name);

          // 🔥 Sauvegarde du nom
          localStorage.setItem("playerName", user.name);

          // 🔥 Affichage dans ton UI
          const status = document.getElementById("status");
          if (status) {
            status.textContent = "Welcome " + user.name;
          }
        });

      } else {
        console.log("Login cancelled");
      }
    }, { scope: 'public_profile' }); // ✅ IMPORTANT (pas email)

  });
}

let deferredPrompt = null;

const installBtn = document.getElementById("installBtn");

if (installBtn) {
  installBtn.style.display = "none";
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log("Install prompt ready");

  if (installBtn) {
    installBtn.style.display = "inline-flex";
  }
});

if (installBtn) {
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) {
      console.log("No install prompt available yet");
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;

      if (choiceResult.outcome === "accepted") {
        console.log("PWA install accepted");
      } else {
        console.log("PWA install dismissed");
      }
    } catch (error) {
      console.error("PWA install failed:", error);
    }

    deferredPrompt = null;
    installBtn.style.display = "none";
  });
}

window.addEventListener("appinstalled", () => {
  console.log("PWA was installed");
  deferredPrompt = null;

  if (installBtn) {
    installBtn.style.display = "none";
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      console.log("Service worker registered", registration);
    } catch (error) {
      console.error("Service worker registration failed:", error);
    }
  });
}