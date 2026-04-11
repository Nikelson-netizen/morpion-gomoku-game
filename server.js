const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  next();
});

const PUBLIC_PATH = path.join(__dirname, "WWW");

const fs = require("fs");

console.log("www exists:", fs.existsSync(PUBLIC_PATH));
console.log("index exists:", fs.existsSync(path.join(PUBLIC_PATH, "index.html")));
console.log("script exists:", fs.existsSync(path.join(PUBLIC_PATH, "script.js")));
console.log("worker exists:", fs.existsSync(path.join(PUBLIC_PATH, "aiWorker.js")));

app.use(express.static(PUBLIC_PATH));

app.get("/service-worker.js", (req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, "service-worker.js"));
});

app.get("/manifest.json", (req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, "manifest.json"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, "index.html"));
});

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e5,
  pingTimeout: 20000,
  pingInterval: 25000
});

const BOARD_SIZE = 15;
const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;
const MAX_NAME_LENGTH = 20;
const MAX_CHAT_LENGTH = 200;
const MAX_PENDING_INVITES = 1;

const onlinePlayers = new Map();
const publicMatches = [];
const pendingInvites = new Map();

/* =========================
   CHALLENGE LEADERBOARD BY LEVEL
========================= */

const VALID_LEVELS = ["1", "2", "3", "4", "5"];

const challengeLeaderboards = {
  "1": [],
  "2": [],
  "3": [],
  "4": [],
  "5": []
};

function normalizePlayerName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

function normalizeLevel(level) {
  const clean = String(level || "").trim();
  return VALID_LEVELS.includes(clean) ? clean : "2";
}

function getLevelBoard(level) {
  const cleanLevel = normalizeLevel(level);
  return challengeLeaderboards[cleanLevel];
}

function sortLevelBoard(level) {
  getLevelBoard(level).sort((a, b) => b.points - a.points);
}

function sortAllChallengeBoards() {
  VALID_LEVELS.forEach(sortLevelBoard);
}

function findChallengePlayer(level, name) {
  const board = getLevelBoard(level);
  const cleanName = normalizePlayerName(name);
  if (!cleanName) return null;

  return (
    board.find(
      (player) => player.name.toLowerCase() === cleanName.toLowerCase()
    ) || null
  );
}

function upsertChallengePlayer(level, name, updates = {}) {
  const cleanLevel = normalizeLevel(level);
  const cleanName = normalizePlayerName(name);
  if (!cleanName) return null;

  const board = getLevelBoard(cleanLevel);

  let player = findChallengePlayer(cleanLevel, cleanName);

  if (!player) {
    player = {
      name: cleanName,
      points: 0,
      online: false,
      level: cleanLevel
    };
    board.push(player);
  }

  if (typeof updates.points === "number" && Number.isFinite(updates.points)) {
    player.points = Math.max(0, Math.floor(updates.points));
  }

  if (typeof updates.online === "boolean") {
    player.online = updates.online;
  }

  player.level = cleanLevel;

  sortLevelBoard(cleanLevel);
  return player;
}

function setChallengePlayerOffline(level, name) {
  const player = findChallengePlayer(level, name);
  if (!player) return;

  player.online = false;
  sortLevelBoard(level);
}

function getChallengeLeaderboardView(level) {
  const cleanLevel = normalizeLevel(level);
  sortLevelBoard(cleanLevel);

  return getLevelBoard(cleanLevel).map((player, index) => ({
    rank: index + 1,
    name: player.name,
    points: player.points,
    online: !!player.online,
    level: cleanLevel
  }));
}

function getAllChallengeLeaderboardViews() {
  const result = {};
  VALID_LEVELS.forEach((level) => {
    result[level] = getChallengeLeaderboardView(level);
  });
  return result;
}

function broadcastChallengeLeaderboard(level) {
  const cleanLevel = normalizeLevel(level);
  io.emit("challengeLeaderboard", {
    level: cleanLevel,
    leaderboard: getChallengeLeaderboardView(cleanLevel)
  });
}

/* =========================
   STATS
========================= */

const stats = {
  totalConnections: 0,
  totalGamesStarted: 0,
  totalGamesFinished: 0,
  totalWatchJoins: 0,
  dailyConnections: {}
};

function getToday() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

function logStats() {
  console.log("📊 ===== PROJECT STATS =====");
  console.log("👥 Total connections :", stats.totalConnections);
  console.log("🎮 Games started    :", stats.totalGamesStarted);
  console.log("🏁 Games finished   :", stats.totalGamesFinished);
  console.log("👀 Watch joins      :", stats.totalWatchJoins);
  console.log("📅 Today connections:", stats.dailyConnections[getToday()] || 0);
  console.log("============================");
}

/* =========================
   GAME HELPERS
========================= */

const WIN_DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

function rcOf(index) {
  return [Math.floor(index / BOARD_SIZE), index % BOARD_SIZE];
}

function idxOf(r, c) {
  return r * BOARD_SIZE + c;
}

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function countLine(board, row, col, dr, dc, player) {
  let count = 1;

  let r = row + dr;
  let c = col + dc;
  while (inBounds(r, c) && board[idxOf(r, c)] === player) {
    count++;
    r += dr;
    c += dc;
  }

  r = row - dr;
  c = col - dc;
  while (inBounds(r, c) && board[idxOf(r, c)] === player) {
    count++;
    r -= dr;
    c -= dc;
  }

  return count;
}

function isWinningMove(board, index, player) {
  const [row, col] = rcOf(index);

  for (const [dr, dc] of WIN_DIRS) {
    if (countLine(board, row, col, dr, dc, player) >= 5) {
      return true;
    }
  }

  return false;
}

function sanitizeName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

function sanitizeChatMessage(msg) {
  return String(msg || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHAT_LENGTH);
}

function isValidIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < BOARD_CELLS;
}

/* =========================
   ONLINE PLAYERS / MATCHES
========================= */

function buildPlayersForSocket(socketId) {
  return [...onlinePlayers.entries()].map(([id, p]) => ({
    id,
    name: p.name,
    code: p.code,
    status: p.status,
    isMe: id === socketId
  }));
}

function getSpectatorCount(match) {
  return match.spectators ? match.spectators.size : 0;
}

function broadcastPlayers() {
  for (const [socketId] of onlinePlayers.entries()) {
    io.to(socketId).emit("onlinePlayers", buildPlayersForSocket(socketId));
  }
}

function buildSafeMatchesForSocket(socketId) {
  return publicMatches.map((m) => {
    const isPlayerInThisMatch =
      m.blackId === socketId || m.whiteId === socketId;

    return {
      id: m.id,
      blackId: m.blackId,
      whiteId: m.whiteId,
      blackName: m.blackName,
      whiteName: m.whiteName,
      currentPlayer: m.currentPlayer,
      gameOver: m.gameOver,
      winnerName: m.winnerName,
      spectatorCount: getSpectatorCount(m),
      canWatch: !isPlayerInThisMatch,
    };
  });
}

function broadcastMatches() {
  for (const [socketId] of onlinePlayers.entries()) {
    io.to(socketId).emit("publicMatches", buildSafeMatchesForSocket(socketId));
  }
}

function findMatchBySocketId(socketId) {
  return publicMatches.find(
    (m) => m.blackId === socketId || m.whiteId === socketId
  );
}

function findMatchById(matchId) {
  return publicMatches.find((m) => m.id === matchId);
}

function removeMatchById(matchId) {
  const index = publicMatches.findIndex((m) => m.id === matchId);
  if (index !== -1) {
    publicMatches.splice(index, 1);
  }
}

function removeAllMatchesForPlayer(socketId) {
  for (let i = publicMatches.length - 1; i >= 0; i--) {
    const match = publicMatches[i];
    if (match.blackId === socketId || match.whiteId === socketId) {
      publicMatches.splice(i, 1);
    }
  }
}

function getPlayerColor(match, socketId) {
  if (match.blackId === socketId) return "black";
  if (match.whiteId === socketId) return "white";
  return null;
}

function emitMatchState(match) {
  io.to(match.id).emit("matchState", {
    matchId: match.id,
    board: match.board,
    blackName: match.blackName,
    whiteName: match.whiteName,
    currentPlayer: match.currentPlayer,
    gameOver: match.gameOver,
    winnerName: match.winnerName,
    spectatorCount: getSpectatorCount(match),
  });

  broadcastMatches();
}

function joinMatchRoom(socketId, matchId) {
  const s = io.sockets.sockets.get(socketId);
  if (s) s.join(matchId);
}

function leaveMatchRoom(socketId, matchId) {
  const s = io.sockets.sockets.get(socketId);
  if (s) s.leave(matchId);
}

function setSocketMatchId(socketId, matchId) {
  const s = io.sockets.sockets.get(socketId);
  if (s) {
    s.matchId = matchId;
  }
}

function clearSocketMatchId(socketId) {
  const s = io.sockets.sockets.get(socketId);
  if (s) {
    s.matchId = null;
  }
}

function removeSpectatorFromMatch(socketId, match) {
  if (match.spectators && match.spectators.has(socketId)) {
    match.spectators.delete(socketId);
    leaveMatchRoom(socketId, match.id);
    clearSocketMatchId(socketId);
    emitMatchState(match);
  }
}

function removeSpectatorFromAllMatches(socketId) {
  for (const match of publicMatches) {
    if (match.spectators && match.spectators.has(socketId)) {
      match.spectators.delete(socketId);
      leaveMatchRoom(socketId, match.id);
      clearSocketMatchId(socketId);
      emitMatchState(match);
    }
  }
}

function generatePlayerCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let attempts = 0;

  while (attempts < 50) {
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    const exists = [...onlinePlayers.values()].some((p) => p.code === code);
    if (!exists) return code;
    attempts++;
  }

  return `${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

function cleanupDisconnectedPlayer(socketId) {
  onlinePlayers.delete(socketId);
  pendingInvites.delete(socketId);
  removeSpectatorFromAllMatches(socketId);

  for (const [targetId, invite] of pendingInvites.entries()) {
    if (invite.fromId === socketId) {
      pendingInvites.delete(targetId);
    }
  }

  for (let i = publicMatches.length - 1; i >= 0; i--) {
    const match = publicMatches[i];

    if (match.blackId === socketId || match.whiteId === socketId) {
      const otherId =
        match.blackId === socketId ? match.whiteId : match.blackId;

      const other = onlinePlayers.get(otherId);
      if (other) {
        other.status = "available";
        io.to(otherId).emit("matchEnded", {
          message: "Opponent disconnected. Match ended.",
          winnerName: match.winnerName,
          blackName: match.blackName,
          whiteName: match.whiteName,
        });
      }

      io.to(match.id).emit("matchEnded", {
        message: "A player disconnected. Match ended.",
        winnerName: match.winnerName,
        blackName: match.blackName,
        whiteName: match.whiteName,
      });

      leaveMatchRoom(match.blackId, match.id);
      leaveMatchRoom(match.whiteId, match.id);
      clearSocketMatchId(match.blackId);
      clearSocketMatchId(match.whiteId);

      if (match.spectators) {
        for (const spectatorId of match.spectators) {
          leaveMatchRoom(spectatorId, match.id);
          clearSocketMatchId(spectatorId);
        }
      }

      publicMatches.splice(i, 1);
    }
  }

  broadcastPlayers();
  broadcastMatches();
}

/* =========================
   RATE LIMIT
========================= */

function canPerformAction(socket, key, limitMs) {
  if (!socket._rateLimits) socket._rateLimits = {};
  const now = Date.now();
  const last = socket._rateLimits[key] || 0;

  if (now - last < limitMs) {
    return false;
  }

  socket._rateLimits[key] = now;
  return true;
}

/* =========================
   API ROUTES - CHALLENGE
========================= */

app.get("/api/challenge/leaderboard", (req, res) => {
  const level = normalizeLevel(req.query.level || "2");

  return res.json({
    success: true,
    level,
    leaderboard: getChallengeLeaderboardView(level)
  });
});

app.get("/api/challenge/leaderboards", (req, res) => {
  return res.json({
    success: true,
    leaderboards: getAllChallengeLeaderboardViews()
  });
});

app.post("/api/challenge/leaderboard/upsert", (req, res) => {
  const { name, points, online, level } = req.body || {};

  const cleanName = normalizePlayerName(name);
  const cleanLevel = normalizeLevel(level);

  if (!cleanName || cleanName === "Player") {
    return res.status(400).json({
      success: false,
      message: "Valid player name is required."
    });
  }

  const updatedPlayer = upsertChallengePlayer(cleanLevel, cleanName, {
    points: typeof points === "number" ? points : undefined,
    online: typeof online === "boolean" ? online : undefined
  });

  broadcastChallengeLeaderboard(cleanLevel);

  return res.json({
    success: true,
    player: updatedPlayer,
    level: cleanLevel,
    leaderboard: getChallengeLeaderboardView(cleanLevel)
  });
});

/* =========================
   SOCKET.IO
========================= */

io.on("connection", (socket) => {
  stats.totalConnections++;

  const today = getToday();
  if (!stats.dailyConnections[today]) {
    stats.dailyConnections[today] = 0;
  }
  stats.dailyConnections[today]++;

  console.log("🟢 New connection:", socket.id);
  logStats();

  socket.matchId = null;
  socket.challengePlayerName = null;
  socket.challengeLevel = null;

  /* ===== CHALLENGE SOCKET EVENTS ===== */

  socket.on("registerChallengePlayer", ({ name, level }) => {
    if (!canPerformAction(socket, "registerChallengePlayer", 600)) {
      return;
    }

    const cleanName = normalizePlayerName(name);
    const cleanLevel = normalizeLevel(level);

    if (!cleanName || cleanName === "Player") return;

    if (
      socket.challengePlayerName &&
      socket.challengeLevel &&
      (
        socket.challengePlayerName.toLowerCase() !== cleanName.toLowerCase() ||
        socket.challengeLevel !== cleanLevel
      )
    ) {
      setChallengePlayerOffline(socket.challengeLevel, socket.challengePlayerName);
      broadcastChallengeLeaderboard(socket.challengeLevel);
    }

    socket.challengePlayerName = cleanName;
    socket.challengeLevel = cleanLevel;

    upsertChallengePlayer(cleanLevel, cleanName, { online: true });
    broadcastChallengeLeaderboard(cleanLevel);
  });

  socket.on("updateChallengePoints", ({ name, points, level }) => {
    if (!canPerformAction(socket, "updateChallengePoints", 300)) {
      return;
    }

    const cleanName = normalizePlayerName(name);
    const cleanLevel = normalizeLevel(level);

    if (!cleanName || cleanName === "Player") return;
    if (typeof points !== "number" || !Number.isFinite(points)) return;

    socket.challengePlayerName = cleanName;
    socket.challengeLevel = cleanLevel;

    upsertChallengePlayer(cleanLevel, cleanName, {
      points: Math.floor(points),
      online: true
    });

    broadcastChallengeLeaderboard(cleanLevel);
  });

  /* ===== CHAT ===== */

  socket.on("sendMessage", (msg) => {
    if (!socket.matchId) return;
    if (!canPerformAction(socket, "sendMessage", 600)) return;

    const cleanMessage = sanitizeChatMessage(msg);
    if (!cleanMessage) return;

    io.to(socket.matchId).emit("receiveMessage", {
      name: onlinePlayers.get(socket.id)?.name || "Player",
      message: cleanMessage
    });
  });

  /* ===== ONLINE REGISTRATION ===== */

  socket.on("registerOnlinePlayer", ({ name }) => {
    if (!canPerformAction(socket, "registerOnlinePlayer", 1000)) {
      socket.emit("errorMessage", "Please wait a moment before trying again.");
      return;
    }

    const cleanName = sanitizeName(name);

    if (!cleanName) {
      socket.emit("errorMessage", "Invalid player name.");
      return;
    }

    removeAllMatchesForPlayer(socket.id);

    onlinePlayers.set(socket.id, {
      name: cleanName,
      code: generatePlayerCode(),
      status: "available"
    });

    socket.emit("onlinePlayers", buildPlayersForSocket(socket.id));
    socket.emit("publicMatches", buildSafeMatchesForSocket(socket.id));

    console.log("👥 Players online:", onlinePlayers.size);

    broadcastPlayers();
    broadcastMatches();
  });

  /* ===== INVITES ===== */

  socket.on("invitePlayer", ({ targetId }) => {
    if (!canPerformAction(socket, "invitePlayer", 1000)) {
      socket.emit("errorMessage", "Please wait before sending another invite.");
      return;
    }

    const me = onlinePlayers.get(socket.id);
    const other = onlinePlayers.get(targetId);

    if (!me) {
      socket.emit("errorMessage", "You must go online first.");
      return;
    }

    if (!other) {
      socket.emit("errorMessage", "This player is no longer online.");
      return;
    }

    if (socket.id === targetId) {
      socket.emit("errorMessage", "You cannot invite yourself.");
      return;
    }

    const invitesFromMe = [...pendingInvites.values()].filter(
      (invite) => invite.fromId === socket.id
    ).length;

    if (invitesFromMe >= MAX_PENDING_INVITES) {
      socket.emit("errorMessage", "You already have a pending invite.");
      return;
    }

    if (me.status !== "available" || other.status !== "available") {
      socket.emit("errorMessage", "One of the players is already in a game.");
      return;
    }

    pendingInvites.set(targetId, {
      fromId: socket.id,
      fromName: me.name,
      toId: targetId,
      toName: other.name,
    });

    io.to(targetId).emit("matchInvite", {
      fromId: socket.id,
      fromName: me.name,
    });

    socket.emit("inviteSent", { ok: true });
  });

  socket.on("acceptInvite", ({ fromId }) => {
    if (!canPerformAction(socket, "acceptInvite", 800)) {
      socket.emit("errorMessage", "Please wait a moment.");
      return;
    }

    const invite = pendingInvites.get(socket.id);
    const me = onlinePlayers.get(socket.id);
    const other = onlinePlayers.get(fromId);

    if (!invite || invite.fromId !== fromId) {
      socket.emit("errorMessage", "Invitation not found.");
      return;
    }

    if (!me || !other) {
      socket.emit("errorMessage", "One player is no longer online.");
      pendingInvites.delete(socket.id);
      return;
    }

    if (me.status !== "available" || other.status !== "available") {
      socket.emit("errorMessage", "One of the players is already in a game.");
      pendingInvites.delete(socket.id);
      return;
    }

    removeAllMatchesForPlayer(socket.id);
    removeAllMatchesForPlayer(fromId);

    other.status = "playing";
    me.status = "playing";

    stats.totalGamesStarted++;
    console.log("🎮 Match started");
    logStats();

    const match = {
      id: `${fromId}-${socket.id}-${Date.now()}`,
      blackId: fromId,
      whiteId: socket.id,
      blackName: other.name,
      whiteName: me.name,
      board: Array(BOARD_CELLS).fill(null),
      currentPlayer: "black",
      nextStarterId: socket.id,
      gameOver: false,
      winnerName: null,
      spectators: new Set(),
    };

    publicMatches.push(match);
    pendingInvites.delete(socket.id);

    joinMatchRoom(match.blackId, match.id);
    joinMatchRoom(match.whiteId, match.id);
    setSocketMatchId(match.blackId, match.id);
    setSocketMatchId(match.whiteId, match.id);

    io.to(fromId).emit("gameStart", {
      matchId: match.id,
      color: "black",
      opponentName: me.name,
      blackName: match.blackName,
      whiteName: match.whiteName,
      currentPlayer: match.currentPlayer,
      board: match.board,
      gameOver: match.gameOver,
      winnerName: match.winnerName,
      spectatorCount: getSpectatorCount(match),
    });

    socket.emit("gameStart", {
      matchId: match.id,
      color: "white",
      opponentName: other.name,
      blackName: match.blackName,
      whiteName: match.whiteName,
      currentPlayer: match.currentPlayer,
      board: match.board,
      gameOver: match.gameOver,
      winnerName: match.winnerName,
      spectatorCount: getSpectatorCount(match),
    });

    emitMatchState(match);
    broadcastPlayers();
  });

  socket.on("declineInvite", ({ fromId }) => {
    if (!canPerformAction(socket, "declineInvite", 500)) {
      socket.emit("errorMessage", "Please wait a moment.");
      return;
    }

    const invite = pendingInvites.get(socket.id);

    if (!invite || invite.fromId !== fromId) {
      socket.emit("errorMessage", "Invitation not found.");
      return;
    }

    pendingInvites.delete(socket.id);
    io.to(fromId).emit("errorMessage", "Invitation declined.");
  });

  /* ===== WATCH ===== */

  socket.on("watchMatch", ({ matchId }) => {
    if (!canPerformAction(socket, "watchMatch", 500)) {
      socket.emit("errorMessage", "Please wait a moment.");
      return;
    }

    stats.totalWatchJoins++;
    console.log("👀 Spectator joined");
    logStats();

    const match = findMatchById(matchId);

    if (!match) {
      socket.emit("errorMessage", "Match not found.");
      return;
    }

    if (match.blackId === socket.id || match.whiteId === socket.id) {
      socket.emit("errorMessage", "Players in the match cannot watch their own game.");
      return;
    }

    removeSpectatorFromAllMatches(socket.id);

    socket.join(matchId);
    socket.matchId = matchId;

    if (!match.spectators) {
      match.spectators = new Set();
    }

    match.spectators.add(socket.id);

    socket.emit("watchStart", {
      matchId: match.id,
      board: match.board,
      blackName: match.blackName,
      whiteName: match.whiteName,
      currentPlayer: match.currentPlayer,
      gameOver: match.gameOver,
      winnerName: match.winnerName,
      spectatorCount: getSpectatorCount(match),
    });

    emitMatchState(match);
  });

  socket.on("leaveWatch", () => {
    for (const match of publicMatches) {
      if (match.spectators && match.spectators.has(socket.id)) {
        removeSpectatorFromMatch(socket.id, match);
        socket.emit("watchEnded", { ok: true });
        break;
      }
    }
  });

  /* ===== MOVES ===== */

  socket.on("playMove", ({ index }) => {
    if (!canPerformAction(socket, "playMove", 80)) {
      socket.emit("errorMessage", "Too many actions. Slow down.");
      return;
    }

    const match = findMatchBySocketId(socket.id);

    if (!match) {
      socket.emit("errorMessage", "No active match found.");
      return;
    }

    if (match.gameOver) {
      socket.emit("errorMessage", "Game is already over.");
      return;
    }

    const player = getPlayerColor(match, socket.id);

    if (!player) {
      socket.emit("errorMessage", "You are not a player in this match.");
      return;
    }

    if (match.currentPlayer !== player) {
      socket.emit("errorMessage", "Not your turn");
      return;
    }

    if (!isValidIndex(index)) {
      socket.emit("errorMessage", "Invalid move.");
      return;
    }

    if (match.board[index] !== null) {
      socket.emit("errorMessage", "Cell already occupied.");
      return;
    }

    match.board[index] = player;

    io.to(match.id).emit("movePlayed", { index, player });

    if (isWinningMove(match.board, index, player)) {
      match.gameOver = true;
      match.winnerName = player === "black" ? match.blackName : match.whiteName;

      stats.totalGamesFinished++;
      console.log("🏁 Match finished");
      logStats();

      io.to(match.id).emit("gameWon", {
        winnerColor: player,
        winnerName: match.winnerName,
      });

      emitMatchState(match);
      return;
    }

    match.currentPlayer = player === "black" ? "white" : "black";
    emitMatchState(match);
  });

  /* ===== RESET MATCH ===== */

  socket.on("resetOnlineGame", () => {
    if (!canPerformAction(socket, "resetOnlineGame", 1000)) {
      socket.emit("errorMessage", "Please wait before restarting again.");
      return;
    }

    const match = findMatchBySocketId(socket.id);

    if (!match) {
      socket.emit("errorMessage", "No active match found.");
      return;
    }

    match.board = Array(BOARD_CELLS).fill(null);
    match.gameOver = false;
    match.winnerName = null;

    const starterId = match.nextStarterId;

    if (starterId === match.blackId) {
      match.currentPlayer = "black";
      match.nextStarterId = match.whiteId;
    } else {
      match.currentPlayer = "white";
      match.nextStarterId = match.blackId;
    }

    io.to(match.id).emit("onlineGameReset", {
      board: match.board,
      currentPlayer: match.currentPlayer,
      blackName: match.blackName,
      whiteName: match.whiteName,
      gameOver: match.gameOver,
      winnerName: match.winnerName,
      spectatorCount: getSpectatorCount(match),
    });

    emitMatchState(match);
  });

  /* ===== LEAVE MATCH ===== */

  socket.on("leaveMatch", () => {
    if (!canPerformAction(socket, "leaveMatch", 500)) {
      socket.emit("errorMessage", "Please wait a moment.");
      return;
    }

    const match = findMatchBySocketId(socket.id);

    if (!match) {
      socket.emit("errorMessage", "No active match to leave.");
      return;
    }

    const black = onlinePlayers.get(match.blackId);
    const white = onlinePlayers.get(match.whiteId);

    if (black) black.status = "available";
    if (white) white.status = "available";

    io.to(match.id).emit("matchEnded", {
      message: "Match ended.",
      winnerName: match.winnerName,
      blackName: match.blackName,
      whiteName: match.whiteName,
    });

    leaveMatchRoom(match.blackId, match.id);
    leaveMatchRoom(match.whiteId, match.id);
    clearSocketMatchId(match.blackId);
    clearSocketMatchId(match.whiteId);

    if (match.spectators) {
      for (const spectatorId of match.spectators) {
        leaveMatchRoom(spectatorId, match.id);
        clearSocketMatchId(spectatorId);
      }
    }

    removeMatchById(match.id);

    broadcastPlayers();
    broadcastMatches();
  });

  /* ===== DISCONNECT ===== */

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);

    if (socket.challengePlayerName && socket.challengeLevel) {
      setChallengePlayerOffline(socket.challengeLevel, socket.challengePlayerName);
      broadcastChallengeLeaderboard(socket.challengeLevel);
    }

    cleanupDisconnectedPlayer(socket.id);
    console.log("👥 Players online:", onlinePlayers.size);
  });
});

/* =========================
   START SERVER
========================= */

const PORT = process.env.PORT || 3002;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

setInterval(logStats, 30000);