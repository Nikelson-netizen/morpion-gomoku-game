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
const scoreText = document.getElementById("scoreText");

const leaveMatchButton = document.getElementById("leaveMatch");
const inviteBox = document.getElementById("inviteBox");
const inviteText = document.getElementById("inviteText");
const acceptInviteButton = document.getElementById("acceptInvite");
const declineInviteButton = document.getElementById("declineInvite");

const chatBox = document.getElementById("chatBox");
const chatHeader = document.getElementById("chatHeader");
const chatContent = document.getElementById("chatContent");

if (chatBox) {
  chatBox.innerHTML = "Aucun message...";
}

if (chatHeader && chatContent) {
  chatHeader.addEventListener("click", () => {
    if (chatContent.style.display === "none") {
      chatContent.style.display = "block";
    } else {
      chatContent.style.display = "none";
    }
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

  scoreText.textContent =
    `${currentBlackName} ${matchScore.black} - ${matchScore.white} ${currentWhiteName}`;

  status.textContent =
    `🎉 ${winnerName} wins the game! Score: ${currentBlackName} ${matchScore.black} - ${matchScore.white} ${currentWhiteName}`;

  resetButton.textContent = "Play Again";

  const shareContainer = document.getElementById("shareContainer");
  const shareBtn = document.getElementById("shareMatchBtn");

  if (shareContainer && shareBtn) {
    shareContainer.style.display = "block";
    shareBtn.onclick = () => shareMatch(winnerName);
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

  status.textContent = `Turn : ${currentPlayer === "black" ? "Black" : "White"}`;
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
  if (!box) return;

  if (box.textContent.trim() === "Aucun message...") {
    box.innerHTML = "";
  }

  const div = document.createElement("div");
  div.textContent = `${name}: ${message}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

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

async function createShareImage(winnerName) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#f5efe2";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 35, 35, 1130, 560, 24);
  ctx.fill();

  ctx.fillStyle = "#111827";
  ctx.font = "bold 42px Arial";
  ctx.fillText("GOMOKU ONLINE", 70, 95);

  ctx.fillStyle = "#2563eb";
  ctx.font = "bold 30px Arial";
  ctx.fillText("I came to win 🔥", 70, 145);

  ctx.fillStyle = "#111827";
  ctx.font = "28px Arial";
  ctx.fillText(`Winner: ${winnerName}`, 70, 205);

  ctx.fillStyle = "#f3f4f6";
  roundRect(ctx, 70, 240, 430, 110, 18);
  ctx.fill();

  ctx.fillStyle = "#6b7280";
  ctx.font = "bold 20px Arial";
  ctx.fillText("MATCH SCORE", 95, 280);

  ctx.fillStyle = "#111827";
  ctx.font = "bold 30px Arial";
  ctx.fillText(
    `${currentBlackName} ${matchScore.black} - ${matchScore.white} ${currentWhiteName}`,
    95,
    325
  );

  ctx.fillStyle = "#374151";
  ctx.font = "24px Arial";
  ctx.fillText("Play now:", 70, 405);

  ctx.fillStyle = "#2563eb";
  ctx.font = "bold 24px Arial";
  ctx.fillText(window.location.origin, 70, 440);

  ctx.fillStyle = "#6b7280";
  ctx.font = "20px Arial";
  ctx.fillText("Play free online with other players", 70, 520);

  const boardX = 650;
  const boardY = 95;
  const boardSizePx = 430;
  const boardCells = 10;
  const step = boardSizePx / boardCells;

  ctx.fillStyle = "#d9b97a";
  roundRect(ctx, boardX, boardY, boardSizePx, boardSizePx, 18);
  ctx.fill();

  ctx.strokeStyle = "#7c5a2c";
  ctx.lineWidth = 1.5;

  for (let i = 0; i <= boardCells; i++) {
    const pos = boardX + i * step;

    ctx.beginPath();
    ctx.moveTo(pos, boardY);
    ctx.lineTo(pos, boardY + boardSizePx);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(boardX, boardY + i * step);
    ctx.lineTo(boardX + boardSizePx, boardY + i * step);
    ctx.stroke();
  }

  const shareData = getShareData(10);
  const stones = shareData.stones;
  const winningOverlay = shareData.winningOverlay;

  if (winningOverlay.length >= 2) {
    const sorted = [...winningOverlay].sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    ctx.beginPath();
    ctx.moveTo(boardX + first.x * step, boardY + first.y * step);
    ctx.lineTo(boardX + last.x * step, boardY + last.y * step);
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.lineCap = "butt";
  }

  stones.forEach((stone, index) => {
    const x = boardX + stone.x * step;
    const y = boardY + stone.y * step;

    if (stone.isWinning) {
      ctx.beginPath();
      ctx.arc(x, y, 21, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(250, 204, 21, 0.35)";
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);

    if (stone.color === "black") {
      ctx.fillStyle = "#111111";
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.stroke();
    } else {
      ctx.fillStyle = "#f8fafc";
      ctx.fill();
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1.5;
    }

    if (index === stones.length - 1) {
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.lineWidth = 1.5;
    }
  });

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
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
    }

    status.textContent = `🎉 Winner: ${getPlayerDisplayName(currentPlayer)}`;
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
    status.textContent = "🎉 Winner : AI (White)";
    return;
  }

  currentPlayer = HUMAN_PLAYER;
  document.body.classList.toggle("white-turn", false);
  status.textContent = "Turn : Black";
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
  onlinePlayersBox.innerHTML = "No players online";
  publicMatchesBox.innerHTML = "No public matches";
  onlineInfo.textContent = 'Enter your name and click "Find a player" to appear online.';
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
      onlineInfo.textContent = `Invitation sent to ${pendingInviteTargetName}.`;

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
        leaveMatchButton.textContent = "Leave Watch";

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
    if (pendingInviteTargetName) {
      onlineInfo.textContent = `Invitation sent to ${pendingInviteTargetName}.`;
    }
  });

  socket.on("matchInvite", ({ fromId, fromName }) => {
    currentInviteFrom = fromId;
    inviteText.textContent = `${fromName} wants to play with you`;
    inviteBox.style.display = "block";
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
      onlineInfo.textContent = message;
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

    leaveMatchButton.textContent = "End Match";

    resetGame();
  });

  socket.on("matchEnded", ({ message }) => {
    document.body.classList.remove("watching-mode");
    board.classList.remove("spectator-board");
    isWatching = false;
    watchingMatchId = null;
    unlockBoard();

    myColor = null;
    gameOver = true;
    currentPlayer = "black";
    currentBlackName = "Black";
    currentWhiteName = "White";

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
  leaveMatchButton.textContent = "End Match";

  if (isWatching && socket) {
    socket.emit("leaveWatch");
  }

  document.body.classList.remove("watching-mode");
  board.classList.remove("spectator-board");
  unlockBoard();
  isWatching = false;
  watchingMatchId = null;
  resetButton.style.display = "inline-block";

  currentBlackName = "Black";
  currentWhiteName = "White";

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
    status.textContent = "Turn : Black";
  }
}

// ----------------- BUTTONS -----------------
resetButton.addEventListener("click", resetGame);
modeSelect.addEventListener("change", resetGame);
firstPlayerSelect.addEventListener("change", resetGame);

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

acceptInviteButton.addEventListener("click", () => {
  if (!socket || !currentInviteFrom) return;

  socket.emit("acceptInvite", { fromId: currentInviteFrom });
  inviteBox.style.display = "none";
  currentInviteFrom = null;
});

declineInviteButton.addEventListener("click", () => {
  if (!socket || !currentInviteFrom) return;

  socket.emit("declineInvite", { fromId: currentInviteFrom });
  inviteBox.style.display = "none";
  currentInviteFrom = null;
});

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
  myColor = null;

  socket.emit("registerOnlinePlayer", { name });

  onlineInfo.textContent = `You are online as ${name}.`;
});

// ----------------- START -----------------
document.addEventListener("DOMContentLoaded", () => {
  initWorker();
  initSocket();
  initOnlineUI();
  resetGame();

  if (chatContent) {
    chatContent.style.display = "none";
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