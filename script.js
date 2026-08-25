const board = document.getElementById("board");
const resetButton = document.getElementById("reset");
const status = document.getElementById("status");

const tournamentTurnTimer =
  document.getElementById(
    "tournamentTurnTimer"
  );

const tournamentTurnTimerValue =
  document.getElementById(
    "tournamentTurnTimerValue"
  );

let tournamentTimerInterval = null;
let tournamentTurnDeadline = null;
let currentFinishedTournamentCode = null;

if (tournamentTurnTimer) {
  tournamentTurnTimer.hidden = true;
}

if (tournamentTurnTimerValue) {
  tournamentTurnTimerValue.textContent = "02:00";
}

const modeSelect = document.getElementById("mode");
const aiSelect = document.getElementById("aiLevel");
const firstPlayerSelect = document.getElementById("firstPlayer");

const playerNameInput = document.getElementById("playerName");
const localMoveHistory = [];
let localUndoAvailable = false;
const undoLastMoveBtn =
  document.getElementById("undoLastMoveBtn");

const tournamentMatchesSection =
  document.getElementById("tournamentMatchesSection");

const tournamentMatchesHeader =
  document.getElementById("tournamentMatchesHeader");

const tournamentMatchesContent =
  document.getElementById("tournamentMatchesContent");

const tournamentMatchesToggle =
  document.getElementById("tournamentMatchesToggle");

const tournamentMatchesList =
  document.getElementById("tournamentMatchesList");

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

    renderMatchScore();
  });
}

const goOnlineButton = document.getElementById("goOnline");
const onlineInfo = document.getElementById("onlineInfo");
const onlinePlayersBox = document.getElementById("onlinePlayers");
const publicMatchesBox = document.getElementById("publicMatches");
const scoreText = document.getElementById("scoreText");
const shareContainer =
  document.getElementById(
    "shareContainer"
  );

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

const chatContainer =
  document.getElementById("chatContainer");

const chatBox =
  document.getElementById("chatBox");

const chatHeader =
  document.getElementById("chatHeader");

const chatContent =
  document.getElementById("chatContent");

const challengeBtn =
  document.getElementById("challengeBtn");

const tournamentTrophyOverlay =
  document.getElementById(
    "tournamentTrophyOverlay"
  );

const trophyChampion =
  document.getElementById(
    "trophyChampion"
  );

const trophyRunnerUp =
  document.getElementById(
    "trophyRunnerUp"
  );

const trophyThirdPlace =
  document.getElementById(
    "trophyThirdPlace"
  );

const trophyFinalScore =
  document.getElementById(
    "trophyFinalScore"
  );

const closeTournamentBtn =
  document.getElementById(
    "closeTournamentBtn"
  );

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

if (
  chatContainer &&
  chatHeader &&
  chatContent
) {
  /*
   * Le chat commence fermé :
   * seule la petite barre Chat apparaît.
   */
  chatContent.style.display = "none";

  chatContainer.classList.add(
    "chat-collapsed"
  );

  chatContainer.classList.remove(
    "chat-open"
  );

  chatHeader.addEventListener(
    "click",
    () => {
      const isClosed =
        getComputedStyle(
          chatContent
        ).display === "none";

      if (isClosed) {
        chatContent.style.display =
          "block";

        chatContainer.classList.remove(
          "chat-collapsed"
        );

        chatContainer.classList.add(
          "chat-open"
        );
      } else {
        chatContent.style.display =
          "none";

        chatContainer.classList.remove(
          "chat-open"
        );

        chatContainer.classList.add(
          "chat-collapsed"
        );
      }
    }
  );
}

const placeSound = new Audio("/click.mp3");
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
let isTournamentMatchActive = false;
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

function renderMatchScore() {
  if (!scoreText) return;

  scoreText.textContent =
    `${currentBlackName} ${matchScore.black} - ${matchScore.white} ${currentWhiteName}`;
}

function resetMatchScore() {
  matchScore.black = 0;
  matchScore.white = 0;
  winnerAlreadyCounted = false;

  renderMatchScore();
}

function updateModeSpecificUI() {
  const mode = modeSelect?.value || "pvp";
  const isTournamentMode =
    mode === "tournament";

  if (
    !isTournamentMode ||
    !isTournamentMatchActive ||
    gameOver
  ) {
    stopTournamentCountdown(true);

    if (tournamentTurnTimerValue) {
      tournamentTurnTimerValue.textContent =
        "02:00";
    }
  }

  if (challengeBtn) {
    const challengeAllowed =
      mode === "ai" ||
      mode === "pvp" ||
      mode === "twoPlayers";

    challengeBtn.style.display =
      challengeAllowed &&
      !isTournamentMode
        ? "inline-flex"
        : "none";
  }
}

if (closeTournamentBtn) {
  closeTournamentBtn.addEventListener(
    "click",
    () => {
      if (!socket) {
        alert(
          "The server is not connected."
        );
        return;
      }

      const tournamentCode =
        currentFinishedTournamentCode ||
        tournamentCodeInput?.value
          .trim()
          .toUpperCase();

      if (!tournamentCode) {
        alert(
          "Tournament code not found."
        );
        return;
      }

      const confirmed =
        window.confirm(
          "Close this tournament for all players?"
        );

      if (!confirmed) return;

      closeTournamentBtn.disabled = true;
      closeTournamentBtn.textContent =
        "Closing...";

      socket.emit(
        "closeTournament",
        {
          code: tournamentCode
        }
      );
    }
  );
}

function hideTournamentTrophy() {
  stopTournamentConfetti();
  
  if (tournamentTrophyOverlay) {
    tournamentTrophyOverlay.hidden = true;
  }

  if (closeTournamentBtn) {
    closeTournamentBtn.hidden = true;
  }

  if (trophyChampion) {
    trophyChampion.textContent = "—";
  }

  if (trophyRunnerUp) {
    trophyRunnerUp.textContent = "—";
  }

  if (trophyThirdPlace) {
    trophyThirdPlace.textContent = "—";
  }

  if (trophyFinalScore) {
    trophyFinalScore.textContent = "—";
  }
}

  let tournamentConfettiInterval = null;

function stopTournamentConfetti() {
  if (tournamentConfettiInterval) {
    clearInterval(tournamentConfettiInterval);
    tournamentConfettiInterval = null;
  }

  const confettiContainer =
    document.getElementById("tournamentConfetti");

  if (confettiContainer) {
    confettiContainer.remove();
  }
}

function launchTournamentConfetti() {
  stopTournamentConfetti();

  const confettiContainer =
    document.createElement("div");

  confettiContainer.id = "tournamentConfetti";
  document.body.appendChild(confettiContainer);

  const symbols = [
    "🎉",
    "🎊",
    "✨",
    "⭐"
  ];

  function createConfettiPiece() {
    const confetti =
      document.createElement("span");

    confetti.className =
      "tournament-confetti-piece";

    confetti.textContent =
      symbols[
        Math.floor(
          Math.random() * symbols.length
        )
      ];

    confetti.style.left =
      `${Math.random() * 100}%`;

    confetti.style.animationDuration =
      `${4 + Math.random() * 3}s`;

    confetti.style.fontSize =
      `${14 + Math.random() * 16}px`;

    confettiContainer.appendChild(confetti);

    setTimeout(() => {
      confetti.remove();
    }, 7500);
  }

  // Première vague immédiate
  for (let i = 0; i < 40; i++) {
    setTimeout(
      createConfettiPiece,
      Math.random() * 1500
    );
  }

  // Continuer jusqu'à Close Tournament
  tournamentConfettiInterval =
    setInterval(() => {
      for (let i = 0; i < 8; i++) {
        setTimeout(
          createConfettiPiece,
          Math.random() * 1000
        );
      }
    }, 1000);
}

function showTournamentTrophy({
  champion,
  runnerUp,
  thirdPlace,
  finalMatch,
  organizer
}) {
  if (!tournamentTrophyOverlay) {
    return;
  }

  stopTournamentCountdown(true);

  gameOver = true;
  isTournamentMatchActive = false;

  lockBoard();

  if (challengeBtn) {
    challengeBtn.style.display = "none";
  }

  if (resetButton) {
    resetButton.style.display = "none";
  }

  if (shareContainer) {
    shareContainer.style.display = "none";
  }

  if (trophyChampion) {
    trophyChampion.textContent =
      champion || "—";
  }

  if (trophyRunnerUp) {
    trophyRunnerUp.textContent =
      runnerUp || "—";
  }

  if (trophyThirdPlace) {
    trophyThirdPlace.textContent =
      thirdPlace || "—";
  }

  if (trophyFinalScore) {
    if (finalMatch) {
      trophyFinalScore.textContent =
        `${finalMatch.player1} ` +
        `${finalMatch.player1Wins} - ` +
        `${finalMatch.player2Wins} ` +
        `${finalMatch.player2}`;
    } else {
      trophyFinalScore.textContent = "—";
    }
  }

  const currentTournamentPlayerName =
    tournamentPlayerNameInput?.value
      .trim() || "";

  const isOrganizer =
    currentTournamentPlayerName ===
    organizer;

  if (closeTournamentBtn) {
    closeTournamentBtn.hidden =
      !isOrganizer;
  }

  tournamentTrophyOverlay.hidden = false;

launchTournamentConfetti();

if (status) {
  status.textContent =
    `🏆 Tournament Finished — ` +
    `Champion: ${champion}`;
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

  const isOnlineOrWatching = modeSelect.value === "online" || isWatching;

  if (!winnerAlreadyCounted && !isOnlineOrWatching) {
    if (winnerName === currentBlackName) {
      matchScore.black++;
    }

    if (winnerName === currentWhiteName) {
      matchScore.white++;
    }
  }

  winnerAlreadyCounted = true;
  renderMatchScore();

  status.textContent =
    `🎉 ${winnerName} wins the game! Score: ${currentBlackName} ${matchScore.black} - ${matchScore.white} ${currentWhiteName}`;

  resetButton.textContent = "Play Again";

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
  const challengeAllowed =
    modeSelect.value === "ai" ||
    modeSelect.value === "pvp" ||
    modeSelect.value === "twoPlayers";

  if (!challengeAllowed || isTournamentMatchActive) {
    challengeBtn.style.display = "none";
  } else {
    challengeBtn.textContent = "🔥 Challenge Me";
    challengeBtn.style.display = "inline-flex";
  }

  const humanWonVsAI =
    challengeAllowed &&
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
    } else if (challengeAllowed) {
  challengeBtn.onclick = () => {
    window.location.href = "challenge.html";
  };
} else {
  challengeBtn.onclick = null;
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

    worker = new Worker("/aiWorker.js");

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
  const input =
    document.getElementById(
      "chatInput"
    );

  if (!input || !socket) {
    return;
  }

  const message =
    input.value.trim();

  if (!message) {
    return;
  }

  /*
   * Même interface, mais événement
   * différent selon le mode.
   */
  if (
    modeSelect.value ===
    "tournament"
  ) {
    socket.emit(
      "sendTournamentMessage",
      {
        message
      }
    );
  } else if (
    modeSelect.value ===
    "online"
  ) {
    /*
     * Conserver le format attendu
     * par ton ancien serveur.
     */
    socket.emit(
      "sendMessage",
      message
    );
  } else {
    return;
  }

  input.value = "";
}

function updateChatMode() {
  const chatHeader =
    document.getElementById(
      "chatHeader"
    );

  const chatBox =
    document.getElementById(
      "chatBox"
    );

  if (!chatHeader) {
    return;
  }

  chatHeader.innerHTML =
  '💬 Chat <span id="chatBadge"></span>';

  unreadCount = 0;

  if (chatBox) {
    chatBox.innerHTML =
      "Aucun message...";
  }
}

function addChatMessage(name, message) {
  const box = document.getElementById("chatBox");
  const chatContentLocal = document.getElementById("chatContent");

  if (!box) return;

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

function forceHomeToolsDisplay() {
  const modeSelect =
    document.getElementById("mode");

  if (!modeSelect) return;

  const mode = modeSelect.value;

  const aiTools =
    document.querySelectorAll(".ai-tool");

  const onlineTools =
    document.querySelectorAll(".online-tool");

  const pvpTools =
    document.querySelectorAll(".pvp-tool");

  const tournamentTools =
    document.querySelectorAll(
      ".tournament-tool"
    );

  aiTools.forEach((el) => {
    el.style.display = "none";
  });

  onlineTools.forEach((el) => {
    el.style.display = "none";
  });

  pvpTools.forEach((el) => {
    el.style.display = "none";
  });

  tournamentTools.forEach((el) => {
    el.style.display = "none";
  });

  if (mode === "ai") {
    aiTools.forEach((el) => {
      el.style.display = "";
    });

    pvpTools.forEach((el) => {
      el.style.display = "";
    });
  }

  if (mode === "online") {
    onlineTools.forEach((el) => {
      el.style.display = "";
    });

    if (mode === "online" && resetButton) {
  resetButton.style.display = "inline-block";
}
  }

  if (mode === "pvp") {
    pvpTools.forEach((el) => {
      el.style.display = "";
    });
  }

  if (mode === "tournament") {
    tournamentTools.forEach((el) => {
      el.style.display = "";
    });
  }

  if (chatContainer) {
    const showChat =
      mode === "online" ||
      mode === "tournament";

    chatContainer.style.display =
      showChat ? "block" : "none";
  }

  if (inviteBox && mode !== "online") {
    inviteBox.style.display = "none";
  }

  const onlinePanel =
    document.querySelector(".online-panel");

  if (onlinePanel) {
    onlinePanel.style.display =
      mode === "online" ? "" : "none";
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

  if (
  modeSelect.value === "tournament" &&
  !isTournamentMatchActive
) {
  status.textContent =
    "⏳ Wait until both players have joined the match.";
  lockBoard();
  return;
}

if (
  modeSelect.value === "online" &&
  !myColor
) {
  status.textContent =
    "⏳ Wait until your opponent accepts the match.";
  lockBoard();
  return;
}

  if (
  modeSelect.value === "online" ||
  isTournamentMatchActive
) {
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
  localMoveHistory.push(i);
  localUndoAvailable = true;
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
  localMoveHistory.push(i);
  localUndoAvailable = true;

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

function formatTournamentTime(
  milliseconds
) {
  const totalSeconds = Math.max(
    0,
    Math.ceil(milliseconds / 1000)
  );

  const minutes = Math.floor(
    totalSeconds / 60
  );

  const seconds =
    totalSeconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")
  );
}

function stopTournamentCountdown(hideTimer = false) {
  if (tournamentTimerInterval) {
    clearInterval(tournamentTimerInterval);
    tournamentTimerInterval = null;
  }

  tournamentTurnDeadline = null;

  if (tournamentTurnTimer && hideTimer) {
    tournamentTurnTimer.hidden = true;
    tournamentTurnTimer.style.display = "none";
  }
}

function updateTournamentCountdown() {
  if (
    !tournamentTurnDeadline ||
    !tournamentTurnTimerValue
  ) {
    return;
  }

  const remainingTime =
    tournamentTurnDeadline -
    Date.now();

  tournamentTurnTimerValue.textContent =
    formatTournamentTime(
      remainingTime
    );

  if (remainingTime <= 0) {
    tournamentTurnTimerValue.textContent =
      "00:00";

    stopTournamentCountdown(false);
  }
}

function startTournamentCountdown(deadline) {
  stopTournamentCountdown(false);

  /*
   * Ne jamais afficher le timer en dehors
   * d’une partie active du tournoi.
   */
  if (
    modeSelect.value !== "tournament" ||
    !isTournamentMatchActive ||
    gameOver
  ) {
    stopTournamentCountdown(true);
    return;
  }

  tournamentTurnDeadline = Number(deadline);

  if (!Number.isFinite(tournamentTurnDeadline)) {
    stopTournamentCountdown(true);
    return;
  }

  if (tournamentTurnTimer) {
  tournamentTurnTimer.hidden = false;
  tournamentTurnTimer.style.display = "";
}

  updateTournamentCountdown();

  tournamentTimerInterval = setInterval(
    updateTournamentCountdown,
    250
  );
}

function initSocket() {
  if (typeof io === "undefined") {
    console.warn("Socket.IO not loaded yet.");
    return;
  }

  socket = io();

  socket.on("tournamentCreated", ({ tournament }) => {
  tournamentInfo.innerHTML = `
🏆 ${tournament.name}<br>
👑  Organizer: ${tournament.organizer || tournament.creator}<br>
Code: ${tournament.code}
`;
playersContent.style.display = "block";
playersToggle.textContent = "▼";

const startTournamentBtn = document.getElementById("startTournamentBtn");

if (startTournamentBtn) {
  startTournamentBtn.style.display = "inline-block";
}

  renderTournamentPlayers(tournament);
});

socket.on(
  "tournamentColorChanged",
  ({ color }) => {
    myColor = color;
  }
);

socket.on(
  "tournamentTurnTimerStopped",
  () => {
    stopTournamentCountdown(true);

    if (tournamentTurnTimerValue) {
      tournamentTurnTimerValue.textContent =
        "02:00";
    }
  }
);

socket.on(
  "tournamentTurnTimerStarted",
  ({
    deadline,
    currentPlayerName
  }) => {
    if (
      modeSelect.value !== "tournament" ||
      !isTournamentMatchActive ||
      gameOver
    ) {
      stopTournamentCountdown(true);
      return;
    }

    startTournamentCountdown(deadline);

    if (status) {
      status.textContent =
        `⏱️ ${currentPlayerName}'s turn`;
    }
  }
);

socket.on(
  "tournamentTurnExpired",
  ({
    loserName,
    winnerName,
    message
  }) => {
    stopTournamentCountdown(false);

    if (tournamentTurnTimerValue) {
      tournamentTurnTimerValue.textContent =
        "00:00";
    }

    if (status) {
      status.textContent =
        message ||
        `⏱️ ${loserName} a dépassé le temps. ` +
        `${winnerName} gagne la partie.`;
    }
  }
);

socket.on(
  "tournamentSeriesFinished",
  ({
    winnerName,
    player1,
    player2,
    player1Wins,
    player2Wins,
    standings
  }) => {

    stopTournamentCountdown(true);

    gameOver = true;

    status.textContent =
      `🏆 ${winnerName} wins the series! ` +
      `${player1} ${player1Wins} - ` +
      `${player2Wins} ${player2}`;

    renderTournamentStandings(
      standings
    );
  }
);

socket.on(
  "tournamentFinished",
  ({
    tournamentCode,
    tournamentName,
    organizer,
    champion,
    runnerUp,
    thirdPlace,
    standings,
    finalMatch
  }) => {
    currentFinishedTournamentCode =
  tournamentCode;
    console.log(
      "🏆 Tournament completely finished:",
      {
        tournamentCode,
        tournamentName,
        organizer,
        champion,
        runnerUp,
        thirdPlace,
        finalMatch
      }
    );

    showTournamentTrophy({
      champion,
      runnerUp,
      thirdPlace,
      finalMatch,
      organizer
    });

    /*
     * Afficher le classement final
     * après quelques secondes.
     */
    setTimeout(() => {
      renderTournamentStandings(
        standings || []
      );

      if (
        tournamentStandingsContent
      ) {
        tournamentStandingsContent
          .scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
      }
    }, 5000);
  }
);

socket.on(
  "tournamentClosed",
  ({
    tournamentCode,
    message
  }) => {
    console.log(
      "🏁 Tournament closed:",
      tournamentCode
    );

    stopTournamentConfetti();
    hideTournamentTrophy();
    stopTournamentCountdown(true);

    currentFinishedTournamentCode =
      null;

    isTournamentMatchActive =
      false;

    myColor = null;
    gameOver = false;
    isWatching = false;
    watchingMatchId = null;

    if (closeTournamentBtn) {
      closeTournamentBtn.disabled =
        false;

      closeTournamentBtn.textContent =
        "🏁 Close Tournament";

      closeTournamentBtn.hidden =
        true;
    }

    if (tournamentPlayerNameInput) {
      tournamentPlayerNameInput.value =
        "";
    }

    if (tournamentNameInput) {
      tournamentNameInput.value =
        "";
    }

    if (tournamentCodeInput) {
      tournamentCodeInput.value =
        "";
    }

    if (tournamentInfo) {
      tournamentInfo.textContent =
        "Organizer creates a tournament. " +
        "Players join with the code.";
    }

    const tournamentPlayersList =
      document.getElementById(
        "tournamentPlayersList"
      );

    if (tournamentPlayersList) {
      tournamentPlayersList.innerHTML =
        "";
    }

    if (tournamentMatchesList) {
      tournamentMatchesList.innerHTML =
        "";
    }

    if (tournamentMatchesSection) {
      tournamentMatchesSection.style
        .display = "none";
    }

    if (tournamentStandingsContent) {
      tournamentStandingsContent
        .textContent =
        "Standings will appear after a series.";
    }

    /*
     * Retourner automatiquement tout le
     * monde au mode 2 Players.
     */
    modeSelect.value = "pvp";

    modeSelect.dispatchEvent(
      new Event("change")
    );

    if (status) {
      status.textContent =
        message ||
        "🏁 Tournament closed.";
    }
  }
);

socket.on(
  "tournamentSeriesClosed",
  ({
    board: emptyBoard,
    winnerName,
    player1,
    player2,
    player1Wins,
    player2Wins
  }) => {
    /*
 * Ne pas vider la grille.
 * On conserve le dernier match qui a donné la victoire.
 */
gameOver = true;
isTournamentMatchActive = false;
winnerAlreadyCounted = true;

highlightWinningLineFromBoard();
lockBoard();

    gameOver = true;
    currentPlayer = "black";
    myColor = null;
    isTournamentMatchActive = false;
    winnerAlreadyCounted = true;

    lockBoard();

    document.body.classList.remove(
      "white-turn"
    );

    const shareContainer =
  document.getElementById(
    "shareContainer"
  );

if (shareContainer) {
  shareContainer.style.display = "none";
}

    status.textContent =
      `🏆 ${winnerName} wins the series! ` +
      `${player1} ${player1Wins} - ` +
      `${player2Wins} ${player2}`;

    console.log(
      "✅ Tournament grid cleared"
    );
  }
);

socket.on("tournamentJoined", ({ tournament }) => {
  tournamentInfo.innerHTML = `
🏆 ${tournament.name}<br>
👑  Organizer: ${tournament.organizer || tournament.creator}<br>
Code: ${tournament.code}
`;
playersContent.style.display = "block";
playersToggle.textContent = "▼";

  renderTournamentPlayers(tournament);
});

socket.on("tournamentUpdated", (tournament) => {

  playersContent.style.display = "block";
playersToggle.textContent = "▼";

renderTournamentPlayers(tournament);
renderTournamentMatches(tournament);

renderTournamentStandings(
  tournament.standings || []
);

});

socket.on("tournamentStarted", (tournament) => {
hideTournamentTrophy();
  console.log("Tournament started:", tournament);

  if (startTournamentBtn) {
    startTournamentBtn.style.display = "none";
  }

  tournamentInfo.innerHTML = `
    🏆 ${tournament.name}<br>
    👑 Organizer: ${tournament.organizer || tournament.creator}<br>
    Code: ${tournament.code}<br>
    ✅ Tournament started<br>
    Matches generated: ${tournament.matches?.length || 0}
  `;

  renderTournamentPlayers(tournament);
  renderTournamentMatches(tournament);
});

socket.on("tournamentMatchRoomUpdated", ({
  tournamentCode,
  roomId,
  match
}) => {
  console.log("Tournament match room updated:", {
    tournamentCode,
    roomId,
    match
  });

  if (!match) return;

  const myName =
    tournamentPlayerNameInput?.value.trim() || "";

  const opponentName =
    myName === match.player1
      ? match.player2
      : match.player1;

  if (match.joinedPlayers?.length >= 2) {
    status.textContent =
      `✅ ${match.player1} vs ${match.player2} — Match ready`;

    alert(
      `${match.player1} and ${match.player2} are ready to play.`
    );
  } else {
    status.textContent =
      `⏳ Waiting for ${opponentName} to click Play`;

    alert(
      `You joined the match room. Waiting for ${opponentName}.`
    );
  }
});

socket.on(
  "tournamentWaitingForOpponent",
  ({
    matchId,
    playerName,
    opponentName
  }) => {
    lockBoard();
    status.textContent =
      `⏳ Waiting for ${opponentName} to join`;

    const button = document.querySelector(
      `.playTournamentMatchBtn[data-match-id="${matchId}"]`
    );

    if (button) {
      button.textContent =
        `⏳ Waiting for ${opponentName}`;

      button.disabled = true;
    }

    console.log(
      `${playerName} is waiting for ${opponentName}`
    );
  }
);

socket.on(
  "tournamentOpponentWaiting",
  ({
    tournamentCode,
    matchId,
    waitingPlayer
  }) => {
    lockBoard();

gameOver = false;
myColor = null;
isTournamentMatchActive = false;
    const myName =
      tournamentPlayerNameInput?.value
        .trim() || "";

    status.textContent =
      `🎮 ${waitingPlayer} is ready to play against you`;

    const button = document.querySelector(
      `.playTournamentMatchBtn[data-match-id="${matchId}"]`
    );

    if (button) {
      button.textContent =
        `▶️ Join ${waitingPlayer}`;

      button.disabled = false;
    }

    alert(
      `${waitingPlayer} is ready to play against you.`
    );

    console.log(
      `${waitingPlayer} is waiting for ${myName} ` +
      `in tournament ${tournamentCode}`
    );
  }
);

socket.on("tournamentError", ({ message }) => {
  alert(message);
});

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

  socket.on(
  "receiveTournamentMessage",
  ({
    tournamentCode,
    name,
    message,
    role
  }) => {
    if (
      modeSelect.value !==
      "tournament"
    ) {
      return;
    }

    const currentCode =
      tournamentCodeInput?.value
        .trim()
        .toUpperCase() || "";

    /*
     * Sécurité supplémentaire côté client :
     * ne pas afficher le message si le code
     * ne correspond pas au tournoi ouvert.
     */
    if (
      currentCode &&
      tournamentCode !==
        currentCode
    ) {
      return;
    }

    const displayName =
      role === "organizer"
        ? `👑 ${name}`
        : name;

    addChatMessage(
      displayName,
      message
    );

    const myName =
      tournamentPlayerNameInput?.value
        .trim() || "";

    if (name !== myName) {
      unreadCount++;

      const badge =
        document.getElementById(
          "chatBadge"
        );

      if (badge) {
        badge.style.display =
          "inline-block";

        badge.textContent =
          unreadCount;
      }
    }
  }
);

socket.on(
  "tournamentChatError",
  ({ message }) => {
    alert(
      message ||
      "Tournament chat error."
    );
  }
);

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
  winnerName,
  matchScore: serverMatchScore,
  isTournamentMatch,
  organizerWatching,
  turnDeadline
}) => {
  isWatching = true;
  watchingMatchId = matchId;
  myColor = null;
  isTournamentMatchActive =
  isTournamentMatch === true;

const isOrganizerWatching =
  organizerWatching === true;
  gameOver = !!watchedGameOver;
  winnerAlreadyCounted = true;
  lastMoveIndex = null;
  winningLine = [];

  currentBlackName = blackName || "Black";
  currentWhiteName = whiteName || "White";
  matchScore = {
  black: Number(serverMatchScore?.black || 0),
  white: Number(serverMatchScore?.white || 0)
};
  currentPlayer = watchedCurrentPlayer || "black";

  if (Array.isArray(matchBoard) && matchBoard.length === N) {
    applyBoardFromServer(matchBoard);
  } else {
    applyBoardFromServer(Array(N).fill(null));
  }

  renderMatchScore();

  if (
  isTournamentMatchActive &&
  turnDeadline &&
  !gameOver
) {
  startTournamentCountdown(
    turnDeadline
  );
} else {
  stopTournamentCountdown(true);
}

  document.body.classList.add("watching-mode");
  board.classList.add("spectator-board");
  document.body.classList.toggle("white-turn", currentPlayer === "white");

  if (leaveMatchButton) {
    leaveMatchButton.textContent = "Leave Watch";
  }

  lockBoard();

if (gameOver) {
  if (winnerName) {
    highlightWinningLineFromBoard();
  }
} else {
  status.textContent =
    isOrganizerWatching
      ? `👑 Referee watching ${currentBlackName} vs ${currentWhiteName}`
      : `👀 Watching ${currentBlackName} vs ${currentWhiteName}`;
}

  renderPublicMatches(publicMatches);
});

  socket.on("gameStart", ({
  color,
  opponentName,
  blackName,
  whiteName,
  board: matchBoard,
  currentPlayer: serverCurrentPlayer,
  winnerName,
  matchScore: serverMatchScore,
  isTournamentMatch
}) => {
stopTournamentCountdown(true);

if (
  modeSelect.value === "online" &&
  resetButton
) {
  resetButton.style.display = "none";
  resetButton.textContent = "Restart";
}

if (tournamentTurnTimerValue) {
  tournamentTurnTimerValue.textContent = "02:00";
}

isTournamentMatchActive =
  modeSelect.value === "tournament" &&
  isTournamentMatch === true;

updateModeSpecificUI();
    document.body.classList.remove("watching-mode");
    board.classList.remove("spectator-board");
    isWatching = false;
    watchingMatchId = null;
    unlockBoard();

    pendingInviteTargetId = null;
    pendingInviteTargetName = "";

    myColor = color;
    matchScore = {
  black: Number(serverMatchScore?.black || 0),
  white: Number(serverMatchScore?.white || 0)
};
    winnerAlreadyCounted = false;

    currentBlackName = blackName || (color === "black" ? myPlayerName : opponentName || "Black");
    currentWhiteName = whiteName || (color === "white" ? myPlayerName : opponentName || "White");

    renderMatchScore();

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

  socket.on("onlineUndoApplied", ({
  board: serverBoard,
  currentPlayer: serverCurrentPlayer,
  blackName,
  whiteName,
  matchScore: serverMatchScore
}) => {
  grid = [...serverBoard];

  currentPlayer = serverCurrentPlayer;

  currentBlackName =
    blackName || currentBlackName;

  currentWhiteName =
    whiteName || currentWhiteName;

  matchScore =
    serverMatchScore || matchScore;

  gameOver = false;
  winnerAlreadyCounted = false;
  winningLine = [];
  lastMoveIndex = null;

  buildBoard();
  renderMatchScore();

  document.body.classList.toggle(
    "white-turn",
    currentPlayer === "white"
  );

  unlockBoard();
  updateTurnStatus();
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
  winnerName,
  matchScore: serverMatchScore
}) => {
    currentBlackName = blackName || "Black";
    currentWhiteName = whiteName || "White";
    matchScore = {
  black: Number(serverMatchScore?.black || 0),
  white: Number(serverMatchScore?.white || 0)
};
    renderMatchScore();
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

  socket.on("gameWon", ({ winnerName, blackName, whiteName, matchScore: serverMatchScore }) => {
  currentBlackName = blackName || currentBlackName;
  currentWhiteName = whiteName || currentWhiteName;
  matchScore = {
  black: Number(serverMatchScore?.black || 0),
  white: Number(serverMatchScore?.white || 0)
};
  winnerAlreadyCounted = true;

  gameOver = true;
  lockBoard();
  renderMatchScore();
  showWinner(winnerName);

  console.log("🔥 GAME WON RECEIVED", {
  winnerName,
  mode: modeSelect.value,
  goOnlineButton
});

if (
  modeSelect.value === "online" &&
  goOnlineButton
) {
  console.log("✅ SETTING PLAY AGAIN");

  goOnlineButton.textContent = "▶️ Play Again";
  goOnlineButton.dataset.action = "playAgain";
  goOnlineButton.classList.add("play-again");
}
});

  socket.on("onlineGameReset", ({
  board: serverBoard,
  currentPlayer: serverCurrentPlayer,
  blackName,
  whiteName,
  gameOver: serverGameOver,
  winnerName,
  matchScore: serverMatchScore,
  isTournamentMatch
}) => {

  if (isTournamentMatch) {
    stopTournamentCountdown(true);
  }

  unlockBoard();

  resetButton.textContent = "Restart";
  resetButton.style.background = "";

  if (goOnlineButton) {
  goOnlineButton.textContent = "🔎 Find a player";
  delete goOnlineButton.dataset.action;
  goOnlineButton.classList.remove("play-again");
}

    currentBlackName = blackName || currentBlackName;
    currentWhiteName = whiteName || currentWhiteName;
    matchScore = {
  black: Number(serverMatchScore?.black || 0),
  white: Number(serverMatchScore?.white || 0)
};
    winnerAlreadyCounted = false;
    renderMatchScore();

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

  if (leaveMatchButton) {
    leaveMatchButton.textContent = "End Match";
  }

  renderPublicMatches(publicMatches);
  updateTurnStatus();
});

  socket.on("matchEnded", ({ message, blackName, whiteName, matchScore: serverMatchScore }) => {
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
    currentBlackName = blackName || "Black";
    currentWhiteName = whiteName || "White";
    matchScore = serverMatchScore || { black: 0, white: 0 };
    winnerAlreadyCounted = false;
    renderMatchScore();

    grid.fill(null);
    localMoveHistory.length = 0;
    lastMoveIndex = null;
    winnerAlreadyCounted = false;
    winningLine = [];
    buildBoard();

    pendingInviteTargetId = null;
    pendingInviteTargetName = "";
    renderOnlinePlayers(onlinePlayers);

    status.textContent = message || "🎉 Match finished!";
    resetButton.textContent = "Play Again";
    resetButton.style.display = "inline-block";
    resetButton.style.background = "#28a745";
  });
}

function undoLastLocalMove(numberOfMoves = 1) {
  if (modeSelect.value === "tournament") {
    return;
  }

  if (!localUndoAvailable) {
  return;
}

  if (localMoveHistory.length === 0) {
    return;
  }

  gameOver = false;
  winnerAlreadyCounted = false;
  winningLine = [];

  let removed = 0;

  while (
    localMoveHistory.length > 0 &&
    removed < numberOfMoves
  ) {
    const index = localMoveHistory.pop();

    if (
      typeof index !== "number" ||
      index < 0 ||
      index >= grid.length
    ) {
      continue;
    }

    grid[index] = null;

    const cell = cells[index];

    if (cell) {
      cell.classList.remove(
        "black",
        "white",
        "winner",
        "last-move",
        "placing"
      );
    }

    removed++;
  }
  localUndoAvailable = false;

  lastMoveIndex =
    localMoveHistory.length > 0
      ? localMoveHistory[
          localMoveHistory.length - 1
        ]
      : null;

  document
    .querySelectorAll(".cell.last-move")
    .forEach((cell) => {
      cell.classList.remove("last-move");
    });

  if (
    lastMoveIndex !== null &&
    cells[lastMoveIndex]
  ) {
    cells[lastMoveIndex].classList.add(
      "last-move"
    );
  }

  const stonesPlayed =
    localMoveHistory.length;

  currentPlayer =
    stonesPlayed % 2 === 0
      ? "black"
      : "white";

  document.body.classList.toggle(
    "white-turn",
    currentPlayer === "white"
  );

  unlockBoard();

  if (modeSelect.value === "ai") {
    status.textContent =
      currentPlayer === HUMAN_PLAYER
        ? "Your turn"
        : "AI turn";
  } else {
    status.textContent =
      currentPlayer === "black"
        ? `Turn : ${currentBlackName}`
        : `Turn : ${currentWhiteName}`;
  }
}

// ----------------- RESET -----------------
function resetGame() {

  stopTournamentCountdown(true);

if (tournamentTurnTimerValue) {
  tournamentTurnTimerValue.textContent =
    "02:00";
}
if (modeSelect.value !== "tournament") {
  isTournamentMatchActive = false;
}

updateModeSpecificUI();
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

  if (modeSelect.value !== "online") {
  refreshPlayerNames();
}

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
  
  localMoveHistory.length = 0;
localUndoAvailable = false;

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

  renderMatchScore();

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
if (undoLastMoveBtn) {
  undoLastMoveBtn.addEventListener("click", () => {
    const mode = modeSelect.value;

    // Aucun Undo en tournoi
    if (mode === "tournament") {
      return;
    }

    // =========================
    // ONLINE MULTIPLAYER
    // =========================
    if (mode === "online") {
      if (!socket || !socket.connected) {
        return;
      }

      socket.emit("undoOnlineMove");
      return;
    }

    // =========================
    // TWO PLAYERS
    // =========================
    if (mode === "pvp") {
      undoLastLocalMove(1);
      return;
    }

    // =========================
    // AI
    // =========================
    if (mode === "ai") {
      undoLastLocalMove(2);
    }
  });
}
resetButton.addEventListener("click", resetGame);
modeSelect.addEventListener("change", () => {
  updateChatMode();
  forceHomeToolsDisplay();
hideTournamentTrophy();
  const selectedMode = modeSelect.value;

  stopTournamentCountdown(true);

  if (tournamentTurnTimerValue) {
    tournamentTurnTimerValue.textContent = "02:00";
  }

  /*
   * Lorsque nous quittons le mode tournoi,
   * supprimer toutes les anciennes données du tournoi.
   */
  if (selectedMode !== "tournament") {
    isTournamentMatchActive = false;

    matchScore = {
      black: 0,
      white: 0
    };

    currentBlackName = "Black";
    currentWhiteName = "White";

    myColor = null;
    winnerAlreadyCounted = false;

    renderMatchScore();
  }

  resetGame();
  updateModeSpecificUI();

  if (
  modeSelect.value === "online" ||
  modeSelect.value === "tournament"
) {
  myColor = null;
  isTournamentMatchActive = false;
  lockBoard();
} else {
  unlockBoard();
}

  if (onlineInfo) {
    if (selectedMode === "online") {
      onlineInfo.textContent =
        'Enter your name and click "Find a player" to appear online.';
    } else {
      onlineInfo.textContent =
        'Select "Online Multiplayer" mode to find players.';
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

      isWatching = false;
      watchingMatchId = null;

      document.body.classList.remove("watching-mode");
      board.classList.remove("spectator-board");
      unlockBoard();

      leaveMatchButton.textContent = "End Match";
      renderPublicMatches(publicMatches);
      updateTurnStatus();
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

    if (
  modeSelect.value === "online" &&
  goOnlineButton.dataset.action === "playAgain"
) {
  if (!socket || !socket.connected) {
    alert("Socket not connected.");
    return;
  }

  socket.emit("resetOnlineGame");
  return;
}

    console.log("✅ FIND A PLAYER CLICKED");

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

  initTournamentControls();
forceHomeToolsDisplay();

  hideTournamentTrophy();
  resetGame();
  updateModeSpecificUI();
  if (
  modeSelect.value === "online" ||
  modeSelect.value === "tournament"
) {
  lockBoard();
}

  if (chatContent) {
    chatContent.style.display = "none";
  }

  if (isChallengeMode === "true") {
    launchChallengeMode();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  updateChatMode();
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
  text: "Play Gomoku online with real players 🔥 Train your brain and strategy 🧠",
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
  installBtn.style.display = "none";
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

// ===============================
// TOURNAMENT BASIC ACTIONS
// ===============================

let createTournamentBtn;
let joinTournamentBtn;
let tournamentPlayerNameInput;
let tournamentNameInput;
let tournamentCodeInput;
let tournamentInfo;
let tournamentPlayers;
let startTournamentBtn;

function initTournamentControls() {
  createTournamentBtn =
    document.getElementById("createTournamentBtn");

  joinTournamentBtn =
    document.getElementById("joinTournamentBtn");

  tournamentPlayerNameInput =
    document.getElementById("tournamentPlayerName");

  tournamentNameInput =
    document.getElementById("tournamentName");

  tournamentCodeInput =
    document.getElementById("tournamentCode");

  tournamentInfo =
    document.getElementById("tournamentInfo");

  tournamentPlayers =
    document.getElementById("tournamentPlayers");

  startTournamentBtn =
    document.getElementById("startTournamentBtn");

  console.log("Tournament buttons:", {
    createTournamentBtn,
    joinTournamentBtn,
    startTournamentBtn
  });

  if (createTournamentBtn) {
    createTournamentBtn.addEventListener("click", () => {
      console.log("✅ CREATE TOURNAMENT CLICKED");

      const playerName =
        tournamentPlayerNameInput?.value.trim() ||
        document.getElementById("playerName")?.value.trim();

      const name =
        tournamentNameInput?.value.trim();

      const code =
        tournamentCodeInput?.value
          .trim()
          .toUpperCase();

      if (!playerName) {
        alert("Please enter your player name.");
        return;
      }

      if (!name) {
        alert("Please enter a tournament name.");
        return;
      }

      if (!code) {
        alert("Please enter a tournament code.");
        return;
      }

      if (!socket || !socket.connected) {
        alert("Socket not connected.");
        console.log("Socket:", socket);
        return;
      }

      console.log(
        "📤 Sending createTournament:",
        {
          name,
          code,
          playerName
        }
      );

      socket.emit(
        "createTournament",
        {
          name,
          code,
          playerName
        }
      );
    });
  }

  if (joinTournamentBtn) {
    joinTournamentBtn.addEventListener("click", () => {
      console.log("✅ JOIN TOURNAMENT CLICKED");

      const playerName =
        tournamentPlayerNameInput?.value.trim() ||
        document.getElementById("playerName")?.value.trim();

      const code =
        tournamentCodeInput?.value
          .trim()
          .toUpperCase();

      if (!playerName) {
        alert("Please enter your player name.");
        return;
      }

      if (!code) {
        alert("Please enter a tournament code.");
        return;
      }

      if (!socket || !socket.connected) {
        alert("Socket not connected.");
        console.log("Socket:", socket);
        return;
      }

      console.log(
        "📤 Sending joinTournament:",
        {
          code,
          playerName
        }
      );

      socket.emit(
        "joinTournament",
        {
          code,
          playerName
        }
      );
    });
  }

  if (startTournamentBtn) {
    startTournamentBtn.addEventListener("click", () => {
      console.log("✅ START TOURNAMENT CLICKED");

      const playerName =
        tournamentPlayerNameInput?.value.trim() ||
        document.getElementById("playerName")?.value.trim();

      const code =
        tournamentCodeInput?.value
          .trim()
          .toUpperCase();

      if (!playerName) {
        alert("Please enter the organizer name.");
        return;
      }

      if (!code) {
        alert("Please enter the tournament code.");
        return;
      }

      if (!socket || !socket.connected) {
        alert("Socket not connected.");
        return;
      }

      socket.emit(
        "startTournament",
        {
          code,
          playerName
        }
      );
    });
  }
}

function renderTournamentPlayers(tournament) {
  const tournamentPlayersList = document.getElementById("tournamentPlayersList");

  if (!tournamentPlayersList || !tournament || !Array.isArray(tournament.players)) return;

  tournamentPlayersList.innerHTML = `
    Players: ${tournament.players.length}/10<br>
    ${tournament.players.map((name, index) =>
      `${index + 1}. ${name}${name === (tournament.organizer || tournament.creator) ? " 👑" : ""}`
    ).join("<br>")}
  `;
}

function renderTournamentStandings(
  standings = []
) {
  if (!tournamentStandingsContent) {
    return;
  }

  if (!standings.length) {
    tournamentStandingsContent.innerHTML =
      "No standings yet.";
    return;
  }

  tournamentStandingsContent.innerHTML =
    standings
      .map(
        (player, index) => `
          <div class="tournament-standing-row">
            <strong>
              ${index + 1}. ${player.name}
            </strong>
            — ${player.points} pts
            — ${player.seriesWins} wins
            — ${player.seriesLosses} losses
            — Games:
            ${player.gamesWon}-${player.gamesLost}
          </div>
        `
      )
      .join("");
}

function renderTournamentMatches(tournament) {
  if (
    !tournamentMatchesSection ||
    !tournamentMatchesContent ||
    !tournamentMatchesToggle ||
    !tournamentMatchesList ||
    !tournament ||
    !Array.isArray(tournament.matches)
  ) {
    return;
  }

  tournamentMatchesSection.style.display = "block";
  tournamentMatchesContent.style.display = "block";
  tournamentMatchesToggle.textContent = "▼";

  const currentPlayerName =
    tournamentPlayerNameInput?.value.trim() || "";

  const organizerName =
    tournament.organizer ||
    tournament.creator ||
    "";

  const isOrganizer =
    currentPlayerName === organizerName;

  tournamentMatchesList.innerHTML = tournament.matches
    .map((match, index) => {
      const seriesFinished =
        match.status === "finished" ||
        Boolean(match.winner);

      const waitingPlayer =
        match.waitingPlayer || null;

      const isCurrentPlayerWaiting =
        waitingPlayer === currentPlayerName;

      const opponentIsWaiting =
        Boolean(waitingPlayer) &&
        waitingPlayer !== currentPlayerName &&
        (
          currentPlayerName === match.player1 ||
          currentPlayerName === match.player2
        );

      const isPlayerInMatch =
        currentPlayerName === match.player1 ||
        currentPlayerName === match.player2;

      const canPlay =
        !isOrganizer &&
        !seriesFinished &&
        isPlayerInMatch;

      /*
       * L’organisateur peut regarder seulement
       * lorsque la partie est réellement active.
       */
      const canOrganizerWatch =
        isOrganizer &&
        !seriesFinished &&
        match.status === "playing" &&
        Boolean(match.liveMatchId);

      const organizerAlreadyWatching =
        canOrganizerWatch &&
        isWatching &&
        watchingMatchId === match.liveMatchId;

      return `
        <div
          class="tournament-match"
          style="margin:10px 0;"
        >
          <strong>
            Match ${index + 1}:
          </strong>

          ${match.player1}
          vs
          ${match.player2}

          <br>

          <small>
            Best of ${match.maxGames || 7} —
            first to ${match.winsRequired || 4} victories
          </small>

          <br>

          ${
            seriesFinished
              ? `
                <div class="tournament-series-finished">
                  ✅ Series finished<br>
                  🏆 Winner: ${match.winner}<br>
                  Final score:
                  ${match.player1}
                  ${match.player1Wins || 0}
                  -
                  ${match.player2Wins || 0}
                  ${match.player2}
                </div>
              `

              : canOrganizerWatch
                ? `
                  <button
                    type="button"
                    class="watchTournamentMatchBtn"
                    data-match-id="${match.id}"
                    data-live-match-id="${match.liveMatchId}"
                    ${organizerAlreadyWatching ? "disabled" : ""}
                  >
                    ${
                      organizerAlreadyWatching
                        ? "👑 Watching Match"
                        : "👀 Watch Match"
                    }
                  </button>
                `

              : isOrganizer
                ? `
                  <span style="font-size:13px;">
                    ⏳ Waiting for both players to start
                  </span>
                `

              : isCurrentPlayerWaiting
                ? `
                  <button
                    type="button"
                    class="playTournamentMatchBtn"
                    data-match-id="${match.id}"
                    disabled
                  >
                    ⏳ Waiting for opponent
                  </button>
                `

              : opponentIsWaiting
                ? `
                  <button
                    type="button"
                    class="playTournamentMatchBtn"
                    data-match-id="${match.id}"
                    data-player1="${match.player1}"
                    data-player2="${match.player2}"
                  >
                    ▶️ Join ${waitingPlayer}
                  </button>
                `

              : canPlay
                ? `
                  <button
                    type="button"
                    class="playTournamentMatchBtn"
                    data-match-id="${match.id}"
                    data-player1="${match.player1}"
                    data-player2="${match.player2}"
                  >
                    ▶️ Play
                  </button>
                `

              : `
                <span style="font-size:13px;">
                  Waiting for players
                </span>
              `
          }
        </div>
      `;
    })
    .join("");

  /*
   * Boutons Play et Join pour les joueurs.
   */
  document
    .querySelectorAll(
      ".playTournamentMatchBtn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const matchId =
            button.dataset.matchId;

          if (!socket) {
            alert(
              "Socket not connected."
            );
            return;
          }

          const tournamentCode =
            tournamentCodeInput?.value
              .trim()
              .toUpperCase() ||
            tournament.code;

          const playerName =
            tournamentPlayerNameInput?.value
              .trim() || "";

          if (!playerName) {
            alert(
              "Please enter your player name."
            );
            return;
          }

          button.disabled = true;
          button.textContent =
            "Joining match...";

          lockBoard();

          socket.emit(
            "joinTournamentMatch",
            {
              tournamentCode,
              matchId,
              playerName
            }
          );
        }
      );
    });

  /*
   * Boutons Watch réservés à l’organisateur.
   */
  document
    .querySelectorAll(
      ".watchTournamentMatchBtn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          if (!socket) {
            alert(
              "Socket not connected."
            );
            return;
          }

          const tournamentMatchId =
            button.dataset.matchId;

          const tournamentCode =
            tournamentCodeInput?.value
              .trim()
              .toUpperCase() ||
            tournament.code;

          if (!tournamentCode) {
            alert(
              "Tournament code not found."
            );
            return;
          }

          if (!tournamentMatchId) {
            alert(
              "Tournament match not found."
            );
            return;
          }

          button.disabled = true;
          button.textContent =
            "Loading match...";

          /*
           * L’organisateur reste spectateur :
           * aucune couleur et grille verrouillée.
           */
          myColor = null;
          isWatching = true;
          isTournamentMatchActive = true;

          lockBoard();

          if (status) {
            status.textContent =
              "👑 Organizer is joining the match as referee...";
          }

          socket.emit(
            "watchTournamentMatch",
            {
              tournamentCode,
              tournamentMatchId
            }
          );
        }
      );
    });
}

function makeTournamentCode(name) {
  const cleanName = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
  return (cleanName || "CUP") + Math.floor(1000 + Math.random() * 9000);
}


const playersHeader = document.getElementById("playersHeader");
const playersContent = document.getElementById("playersContent");
const playersToggle = document.getElementById("playersToggle");

const tournamentStandingsContent =
  document.getElementById(
    "tournamentStandingsContent"
  );

playersHeader?.addEventListener("click", () => {
  if (playersContent.style.display === "none") {
    playersContent.style.display = "block";
    playersToggle.textContent = "▼";
  } else {
    playersContent.style.display = "none";
    playersToggle.textContent = "▶️";
  }
});

tournamentMatchesHeader?.addEventListener("click", () => {
  const isClosed =
    tournamentMatchesContent.style.display === "none";

  tournamentMatchesContent.style.display =
    isClosed ? "block" : "none";

  tournamentMatchesToggle.textContent =
    isClosed ? "▼" : "▶️";
});
