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

const fs = require("fs");

const possibleWwwPath = path.join(__dirname, "www");

const PUBLIC_PATH = fs.existsSync(possibleWwwPath)
  ? possibleWwwPath
  : __dirname;

console.log("Using PUBLIC_PATH =", PUBLIC_PATH);

console.log("www exists:", fs.existsSync(PUBLIC_PATH));
console.log("index exists:", fs.existsSync(path.join(PUBLIC_PATH, "index.html")));
console.log("script exists:", fs.existsSync(path.join(PUBLIC_PATH, "script.js")));
console.log("worker exists:", fs.existsSync(path.join(PUBLIC_PATH, "aiWorker.js")));
console.log("icon-192 exists:", fs.existsSync(path.join(PUBLIC_PATH, "icons", "icon-192.png")));
console.log("click.mp3 exists:", fs.existsSync(path.join(PUBLIC_PATH, "sounds", "click.mp3")));
console.log("ROOT files:", fs.readdirSync(__dirname));

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
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "";
const BOARD_SIZE = 15;
const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;
const MAX_NAME_LENGTH = 20;
const MAX_CHAT_LENGTH = 200;
const MAX_PENDING_INVITES = 1;

const TOURNAMENT_TURN_TIME_MS =
  2 * 60 * 1000; // 2 minutes

  const TOURNAMENT_RECONNECT_TIME_MS =
  3 * 60 * 1000; // 3 minutes

const tournamentReconnectTimers =
  new Map();

const onlinePlayers = new Map();
const publicMatches = [];
const pendingInvites = new Map();
const tournaments = new Map();

/* =========================
   CHALLENGE LEADERBOARD BY LEVEL
========================= */

const VALID_LEVELS = ["2", "3", "4", "5"];

const challengeLeaderboards = {
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

function normalizePlayerId(playerId) {
  return String(playerId || "").trim().slice(0, 80);
}

function normalizeLevel(level) {
  const clean = String(level || "").trim();
  return VALID_LEVELS.includes(clean) ? clean : "2";
}

function getLevelBoard(level) {
  return challengeLeaderboards[normalizeLevel(level)];
}

function sortLevelBoard(level) {
  getLevelBoard(level).sort((a, b) => (b.points || 0) - (a.points || 0));
}

function findChallengePlayer(level, playerId) {
  const cleanId = normalizePlayerId(playerId);
  if (!cleanId) return null;

  return getLevelBoard(level).find((p) => p.playerId === cleanId) || null;
}

function upsertChallengePlayer(level, playerId, name, updates = {}) {
  const cleanLevel = normalizeLevel(level);
  const cleanId = normalizePlayerId(playerId);
  const cleanName = normalizePlayerName(name);

  if (!cleanId || !cleanName || cleanName === "Player") return null;

  const board = getLevelBoard(cleanLevel);
  let player = findChallengePlayer(cleanLevel, cleanId);

  if (!player) {
    player = {
      playerId: cleanId,
      name: cleanName,
      points: 0,
      online: false,
      level: cleanLevel
    };
    board.push(player);
  }

  player.name = cleanName;

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

function setChallengePlayerOffline(level, playerId) {
  const player = findChallengePlayer(level, playerId);
  if (!player) return;

  player.online = false;
  sortLevelBoard(level);
}

function getChallengeLeaderboardView(level) {
  const cleanLevel = normalizeLevel(level);
  sortLevelBoard(cleanLevel);

  return getLevelBoard(cleanLevel).map((player, index) => ({
    rank: index + 1,
    playerId: player.playerId,
    name: player.name,
    points: player.points || 0,
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
  matchScore: m.matchScore || { black: 0, white: 0 },
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
    matchScore: match.matchScore || { black: 0, white: 0 },
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

function clearTournamentTurnTimer(match) {
  if (!match) return;

  if (match.turnTimer) {
    clearTimeout(match.turnTimer);
    match.turnTimer = null;
  }

  match.turnDeadline = null;
}

function getCurrentTournamentPlayerName(match) {
  if (!match) return "";

  return match.currentPlayer === "black"
    ? match.blackName
    : match.whiteName;
}

function startTournamentTurnTimer(match) {
  if (
    !match ||
    !match.isTournamentMatch ||
    match.gameOver
  ) {
    return;
  }

  clearTournamentTurnTimer(match);

  match.turnDeadline =
    Date.now() + TOURNAMENT_TURN_TIME_MS;

  const currentPlayerName =
    getCurrentTournamentPlayerName(match);

  io.to(match.id).emit(
    "tournamentTurnTimerStarted",
    {
      matchId: match.id,
      deadline: match.turnDeadline,
      currentPlayer: match.currentPlayer,
      currentPlayerName
    }
  );

  match.turnTimer = setTimeout(() => {
    handleTournamentTurnTimeout(
      match.id
    );
  }, TOURNAMENT_TURN_TIME_MS);
}

function clearTournamentSocketMatch(socketId) {
  const playerSocket =
    io.sockets.sockets.get(socketId);

  if (!playerSocket) return;

  playerSocket.matchId = null;
  playerSocket.tournamentMatchId = null;
  playerSocket.tournamentRoomId = null;
}

function findTournamentPlayerSocketId(
  tournamentCode,
  playerName
) {
  for (const connectedSocket of io.sockets.sockets.values()) {
    if (
      connectedSocket.tournamentCode === tournamentCode &&
      connectedSocket.tournamentPlayerName === playerName
    ) {
      return connectedSocket.id;
    }
  }

  return null;
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

    if (match.isTournamentMatch) {
  continue;
}

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
  matchScore: match.matchScore || { black: 0, white: 0 },
});
      }

      io.to(match.id).emit("matchEnded", {
  message: "A player disconnected. Match ended.",
  winnerName: match.winnerName,
  blackName: match.blackName,
  whiteName: match.whiteName,
  matchScore: match.matchScore || { black: 0, white: 0 },
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
  const { playerId, name, points, online, level } = req.body || {};

  const cleanId = normalizePlayerId(playerId);
  const cleanName = normalizePlayerName(name);
  const cleanLevel = normalizeLevel(level);

  if (!cleanId) {
    return res.status(400).json({
      success: false,
      message: "Valid playerId is required."
    });
  }

  if (!cleanName || cleanName === "Player") {
    return res.status(400).json({
      success: false,
      message: "Valid player name is required."
    });
  }

  const updatedPlayer = upsertChallengePlayer(cleanLevel, cleanId, cleanName, {
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
   TOURNAMENT HELPERS
========================= */

function generateRoundRobinMatches(players, tournamentCode) {
  const matches = [];

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      matches.push({
        id: `${tournamentCode}-M${matches.length + 1}`,

        player1: players[i],
        player2: players[j],

        // Série au meilleur de 7 :
        // le premier à 4 victoires gagne la série
        player1Wins: 0,
        player2Wins: 0,
        gamesPlayed: 0,
        maxGames: 7,
        winsRequired: 4,

        winner: null,
        status: "waiting"
      });
    }
  }

  return matches;
}

function generateTournamentStandings(players) {
  return players.map((name) => ({
    name,
    points: 0,
    seriesPlayed: 0,
    seriesWins: 0,
    seriesLosses: 0,
    gamesWon: 0,
    gamesLost: 0
  }));
}

function syncTournamentSeriesScore(match, tournamentMatch) {
  const player1Score = tournamentMatch.player1Wins || 0;
  const player2Score = tournamentMatch.player2Wins || 0;

  match.matchScore = {
    black:
      match.blackName === tournamentMatch.player1
        ? player1Score
        : player2Score,

    white:
      match.whiteName === tournamentMatch.player1
        ? player1Score
        : player2Score
  };
}

function updateTournamentStandings(tournament, tournamentMatch) {
  // Empêcher de compter deux fois la même série
  if (tournamentMatch.standingsUpdated) {
    return;
  }

  const player1Standing = tournament.standings.find(
    (standing) => standing.name === tournamentMatch.player1
  );

  const player2Standing = tournament.standings.find(
    (standing) => standing.name === tournamentMatch.player2
  );

  if (!player1Standing || !player2Standing) {
    console.log("Tournament standing not found.");
    return;
  }

  player1Standing.seriesPlayed += 1;
  player2Standing.seriesPlayed += 1;

  player1Standing.gamesWon += tournamentMatch.player1Wins;
  player1Standing.gamesLost += tournamentMatch.player2Wins;

  player2Standing.gamesWon += tournamentMatch.player2Wins;
  player2Standing.gamesLost += tournamentMatch.player1Wins;

  if (tournamentMatch.winner === tournamentMatch.player1) {
    player1Standing.seriesWins += 1;
    player1Standing.points += 3;

    player2Standing.seriesLosses += 1;
  } else {
    player2Standing.seriesWins += 1;
    player2Standing.points += 3;

    player1Standing.seriesLosses += 1;
  }

  tournamentMatch.standingsUpdated = true;

  tournament.standings.sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    if (b.seriesWins !== a.seriesWins) {
      return b.seriesWins - a.seriesWins;
    }

    if (b.gamesWon !== a.gamesWon) {
      return b.gamesWon - a.gamesWon;
    }

    return a.gamesLost - b.gamesLost;
  });
}

function checkTournamentFinished(
  tournament,
  lastFinishedMatch
) {
  if (
    !tournament ||
    !Array.isArray(tournament.matches) ||
    tournament.matches.length === 0
  ) {
    return false;
  }

  // Éviter d'annoncer plusieurs fois le champion
  if (tournament.finished) {
    return true;
  }

  const allSeriesFinished =
    tournament.matches.every(
      (match) =>
        match.status === "finished" &&
        Boolean(match.winner)
    );

  if (!allSeriesFinished) {
    return false;
  }

  tournament.finished = true;
  tournament.finishedAt = Date.now();

  const finalStandings = [
    ...(tournament.standings || [])
  ].sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    if (b.seriesWins !== a.seriesWins) {
      return b.seriesWins - a.seriesWins;
    }

    if (b.gamesWon !== a.gamesWon) {
      return b.gamesWon - a.gamesWon;
    }

    return a.gamesLost - b.gamesLost;
  });

  const champion =
    finalStandings[0]?.name || "—";

  const runnerUp =
    finalStandings[1]?.name || "—";

  const thirdPlace =
    finalStandings[2]?.name || "—";

  const finalMatch = lastFinishedMatch
    ? {
        player1: lastFinishedMatch.player1,
        player2: lastFinishedMatch.player2,
        player1Wins:
          lastFinishedMatch.player1Wins || 0,
        player2Wins:
          lastFinishedMatch.player2Wins || 0,
        winner:
          lastFinishedMatch.winner || champion
      }
    : null;

  tournament.finalResults = {
    champion,
    runnerUp,
    thirdPlace,
    standings: finalStandings,
    finalMatch
  };

  // Envoyer uniquement aux personnes de ce tournoi
  for (
    const connectedSocket
    of io.sockets.sockets.values()
  ) {
    if (
      connectedSocket.tournamentCode ===
      tournament.code
    ) {
      connectedSocket.emit(
        "tournamentFinished",
        {
          tournamentCode:
            tournament.code,

          tournamentName:
            tournament.name,

          organizer:
            tournament.organizer,

          champion,
          runnerUp,
          thirdPlace,

          standings:
            finalStandings,

          finalMatch
        }
      );
    }
  }

  console.log(
    `🏆 Tournament finished: ` +
    `${tournament.code}. ` +
    `Champion: ${champion}`
  );

  return true;
}

function handleTournamentTurnTimeout(matchId) {
  const match = findMatchById(matchId);

  if (
    !match ||
    !match.isTournamentMatch ||
    match.gameOver
  ) {
    return;
  }

  const tournament =
    tournaments.get(match.tournamentCode);

  const tournamentMatch =
    tournament?.matches.find(
      (item) =>
        item.id === match.tournamentMatchId
    );

  if (!tournament || !tournamentMatch) {
    console.log(
      "⚠️ Tournament match not found after timeout."
    );
    return;
  }

  clearTournamentTurnTimer(match);

  // Le joueur dont c’était le tour perd.
  const loserColor =
    match.currentPlayer;

  const winnerColor =
    loserColor === "black"
      ? "white"
      : "black";

  const loserName =
    loserColor === "black"
      ? match.blackName
      : match.whiteName;

  const winnerName =
    winnerColor === "black"
      ? match.blackName
      : match.whiteName;

  match.gameOver = true;

  clearTournamentTurnTimer(match);

  match.winnerName = winnerName;

  tournamentMatch.gamesPlayed += 1;

  if (
    winnerName === tournamentMatch.player1
  ) {
    tournamentMatch.player1Wins += 1;
  } else {
    tournamentMatch.player2Wins += 1;
  }

  syncTournamentSeriesScore(
    match,
    tournamentMatch
  );

  const seriesFinished =
    tournamentMatch.player1Wins >=
      tournamentMatch.winsRequired ||
    tournamentMatch.player2Wins >=
      tournamentMatch.winsRequired;

  if (seriesFinished) {
    tournamentMatch.winner =
      tournamentMatch.player1Wins >=
      tournamentMatch.winsRequired
        ? tournamentMatch.player1
        : tournamentMatch.player2;

    tournamentMatch.status =
      "finished";

    updateTournamentStandings(
      tournament,
      tournamentMatch
    );
    checkTournamentFinished(
  tournament,
  tournamentMatch
);
  }

  stats.totalGamesFinished++;

  io.to(match.id).emit(
    "tournamentTurnExpired",
    {
      loserName,
      winnerName,
      loserColor,
      winnerColor,

      message:
        `⏱️ ${loserName} did not play within 2 minutes. ` +
        `${winnerName} wins the game.`,

      matchScore:
        match.matchScore,

      seriesFinished
    }
  );

  io.to(match.id).emit(
    "gameWon",
    {
      winnerColor,
      winnerName,

      blackName:
        match.blackName,

      whiteName:
        match.whiteName,

      matchScore:
        match.matchScore,

      isTournamentMatch: true,
      seriesFinished,

      winReason: "timeout"
    }
  );

  if (seriesFinished) {
    io.to(match.id).emit(
      "tournamentSeriesFinished",
      {
        winnerName:
          tournamentMatch.winner,

        player1:
          tournamentMatch.player1,

        player2:
          tournamentMatch.player2,

        player1Wins:
          tournamentMatch.player1Wins,

        player2Wins:
          tournamentMatch.player2Wins,

        standings:
          tournament.standings
      }
    );
  }

  io.emit(
  "tournamentUpdated",
  tournament
);

emitMatchState(match);

if (!seriesFinished) {
  setTimeout(() => {
    const currentMatch =
      findMatchById(matchId);

    if (
      !currentMatch ||
      !currentMatch.isTournamentMatch
    ) {
      return;
    }

    clearTournamentTurnTimer(
      currentMatch
    );

    currentMatch.board =
      Array(BOARD_CELLS).fill(null);

    currentMatch.gameOver = false;
    currentMatch.winnerName = null;
    currentMatch.winningCells = [];
    currentMatch.lastMove = null;
    currentMatch.currentPlayer = "black";

    io.to(currentMatch.id).emit(
      "onlineGameReset",
      {
        board: currentMatch.board,
        currentPlayer:
          currentMatch.currentPlayer,
        blackName:
          currentMatch.blackName,
        whiteName:
          currentMatch.whiteName,
        matchScore:
          currentMatch.matchScore,
        isTournamentMatch: true
      }
    );

    io.to(currentMatch.id).emit(
  "tournamentTurnTimerStopped"
);

    emitMatchState(currentMatch);

  }, 5000);

  return;
}

console.log(
  `⏱️ Timeout: ${loserName} lost. ` +
  `${winnerName} wins the game.`
);
}

/* =========================
   TOURNAMENT DISCONNECT
========================= */

function getTournamentReconnectKey(
  tournamentCode,
  tournamentMatchId,
  playerName
) {
  return (
    tournamentCode +
    ":" +
    tournamentMatchId +
    ":" +
    playerName
  );
}

function clearTournamentReconnectTimer(
  tournamentCode,
  tournamentMatchId,
  playerName
) {
  const key =
    getTournamentReconnectKey(
      tournamentCode,
      tournamentMatchId,
      playerName
    );

  const timer =
    tournamentReconnectTimers.get(key);

  if (timer) {
    clearTimeout(timer);
    tournamentReconnectTimers.delete(key);
  }
}

function tournamentBoardHasMove(match) {
  return Boolean(
    match &&
    Array.isArray(match.board) &&
    match.board.some(
      (cell) => cell !== null
    )
  );
}

function resetTournamentGameAfterDisconnect(
  liveMatch,
  tournamentMatch
) {
  if (!liveMatch || !tournamentMatch) {
    return;
  }

  clearTournamentTurnTimer(liveMatch);

  liveMatch.board =
    Array(BOARD_CELLS).fill(null);

  liveMatch.gameOver = false;
  liveMatch.winnerName = null;
  liveMatch.currentPlayer = "black";

  /*
   * Alterner les couleurs comme après
   * une partie normale du tournoi.
   */
  const oldBlackId =
    liveMatch.blackId;

  const oldBlackName =
    liveMatch.blackName;

  liveMatch.blackId =
    liveMatch.whiteId;

  liveMatch.whiteId =
    oldBlackId;

  liveMatch.blackName =
    liveMatch.whiteName;

  liveMatch.whiteName =
    oldBlackName;

  syncTournamentSeriesScore(
    liveMatch,
    tournamentMatch
  );

  io.to(liveMatch.id).emit(
    "onlineGameReset",
    {
      board: liveMatch.board,
      currentPlayer:
        liveMatch.currentPlayer,

      blackName:
        liveMatch.blackName,

      whiteName:
        liveMatch.whiteName,

      gameOver: false,
      winnerName: null,

      spectatorCount:
        getSpectatorCount(
          liveMatch
        ),

      matchScore:
        liveMatch.matchScore,

      isTournamentMatch: true
    }
  );

  io.to(liveMatch.id).emit(
    "tournamentTurnTimerStopped"
  );

  emitMatchState(liveMatch);
}

function finishTournamentSeriesByDisconnect(
  tournament,
  tournamentMatch,
  loserName
) {
  if (
    !tournament ||
    !tournamentMatch ||
    tournamentMatch.status === "finished"
  ) {
    return;
  }

  const winnerName =
    loserName === tournamentMatch.player1
      ? tournamentMatch.player2
      : tournamentMatch.player1;

  clearTournamentReconnectTimer(
    tournament.code,
    tournamentMatch.id,
    loserName
  );

  tournamentMatch.reconnectPending =
    false;

  tournamentMatch.disconnectedPlayer =
    null;

  tournamentMatch.reconnectDeadline =
    null;

  tournamentMatch.winner =
    winnerName;

  tournamentMatch.status =
    "finished";

  tournamentMatch.waitingPlayer =
    null;

  tournamentMatch.forfeit = true;
  tournamentMatch.forfeitLoser =
    loserName;

  updateTournamentStandings(
    tournament,
    tournamentMatch
  );

  checkTournamentFinished(
    tournament,
    tournamentMatch
  );

  const liveMatch =
    tournamentMatch.liveMatchId
      ? findMatchById(
          tournamentMatch.liveMatchId
        )
      : null;

  if (liveMatch) {
    clearTournamentTurnTimer(
      liveMatch
    );

    liveMatch.gameOver = true;
    liveMatch.winnerName =
      winnerName;

    io.to(liveMatch.id).emit(
      "tournamentSeriesFinished",
      {
        winnerName,

        player1:
          tournamentMatch.player1,

        player2:
          tournamentMatch.player2,

        player1Wins:
          tournamentMatch.player1Wins,

        player2Wins:
          tournamentMatch.player2Wins,

        standings:
          tournament.standings,

        winReason:
          "disconnect_forfeit",

        message:
          `${loserName} did not reconnect within 3 minutes. ` +
          `${winnerName} wins the series by forfeit.`
      }
    );

    io.to(liveMatch.id).emit(
      "tournamentSeriesClosed",
      {
        board:
          [...liveMatch.board],

        winnerName,

        player1:
          tournamentMatch.player1,

        player2:
          tournamentMatch.player2,

        player1Wins:
          tournamentMatch.player1Wins,

        player2Wins:
          tournamentMatch.player2Wins,

        matchId:
          liveMatch.id,

        winReason:
          "disconnect_forfeit"
      }
    );

    if (liveMatch.spectators) {
      for (
        const spectatorId
        of liveMatch.spectators
      ) {
        clearSocketMatchId(
          spectatorId
        );
      }
    }

    removeMatchById(
      liveMatch.id
    );
  }

  tournamentMatch.liveMatchId =
    null;

  tournamentMatch.joinedPlayers =
    [];

  tournamentMatch.playerSockets =
    {};

  io.emit(
    "tournamentUpdated",
    tournament
  );

  broadcastMatches();

  console.log(
    `🏳️ ${loserName} lost tournament series ` +
    `${tournamentMatch.id} by disconnect. ` +
    `Winner: ${winnerName}`
  );
}

function startTournamentReconnectTimer(
  tournament,
  tournamentMatch,
  disconnectedPlayer
) {
  clearTournamentReconnectTimer(
    tournament.code,
    tournamentMatch.id,
    disconnectedPlayer
  );

  const deadline =
    Date.now() +
    TOURNAMENT_RECONNECT_TIME_MS;

  tournamentMatch.reconnectPending =
    true;

  tournamentMatch.disconnectedPlayer =
    disconnectedPlayer;

  tournamentMatch.reconnectDeadline =
    deadline;

  const key =
    getTournamentReconnectKey(
      tournament.code,
      tournamentMatch.id,
      disconnectedPlayer
    );

  const timer =
    setTimeout(() => {
      const currentTournament =
        tournaments.get(
          tournament.code
        );

      if (!currentTournament) {
        return;
      }

      const currentTournamentMatch =
        currentTournament.matches.find(
          (item) =>
            item.id ===
            tournamentMatch.id
        );

      if (
        !currentTournamentMatch ||
        currentTournamentMatch.status ===
          "finished" ||
        !currentTournamentMatch
          .reconnectPending ||
        currentTournamentMatch
          .disconnectedPlayer !==
          disconnectedPlayer
      ) {
        return;
      }

      tournamentReconnectTimers.delete(
        key
      );

      finishTournamentSeriesByDisconnect(
        currentTournament,
        currentTournamentMatch,
        disconnectedPlayer
      );
    }, TOURNAMENT_RECONNECT_TIME_MS);

  tournamentReconnectTimers.set(
    key,
    timer
  );

  io.emit(
    "tournamentUpdated",
    tournament
  );

  console.log(
    `⏳ ${disconnectedPlayer} has 3 minutes ` +
    `to reconnect to tournament ${tournament.code}.`
  );
}

function clearTournamentReconnectOnReturn(
  tournament,
  playerName
) {
  if (
    !tournament ||
    !Array.isArray(tournament.matches)
  ) {
    return;
  }

  const tournamentMatch =
    tournament.matches.find(
      (match) =>
        match.reconnectPending === true &&
        match.disconnectedPlayer ===
          playerName &&
        match.status !== "finished"
    );

  if (!tournamentMatch) {
    return;
  }

  clearTournamentReconnectTimer(
    tournament.code,
    tournamentMatch.id,
    playerName
  );

  tournamentMatch.reconnectPending =
    false;

  tournamentMatch.disconnectedPlayer =
    null;

  tournamentMatch.reconnectDeadline =
    null;

  io.emit(
    "tournamentUpdated",
    tournament
  );

  console.log(
    `✅ ${playerName} reconnected before ` +
    `the 3 minute tournament limit.`
  );
}

function handleTournamentDisconnect(
  socket
) {
  const tournamentCode =
    String(
      socket.tournamentCode || ""
    )
      .trim()
      .toUpperCase();

  const playerName =
    sanitizeName(
      socket.tournamentPlayerName
    );

  const tournamentMatchId =
    socket.tournamentMatchId;

  if (
    !tournamentCode ||
    !playerName ||
    !tournamentMatchId
  ) {
    return false;
  }

  const tournament =
    tournaments.get(
      tournamentCode
    );

  if (!tournament) {
    return false;
  }

  /*
   * L'organisateur n'est pas joueur.
   */
  if (
    playerName ===
    tournament.organizer
  ) {
    return false;
  }

  const tournamentMatch =
    tournament.matches.find(
      (item) =>
        item.id ===
        tournamentMatchId
    );

  if (
    !tournamentMatch ||
    tournamentMatch.status === "finished"
  ) {
    return false;
  }

  const liveMatch =
    tournamentMatch.liveMatchId
      ? findMatchById(
          tournamentMatch.liveMatchId
        )
      : null;

  const boardHasMove =
    tournamentBoardHasMove(
      liveMatch
    );

  /*
   * La série est commencée si :
   *
   * 1. au moins une partie a déjà été jouée
   * OU
   * 2. un pion existe sur la grille actuelle.
   */
  const seriesStarted =
    tournamentMatch.gamesPlayed > 0 ||
    boardHasMove;

  /*
   * Retirer uniquement le socket déconnecté
   * de la room logique de la série.
   */
  if (
    Array.isArray(
      tournamentMatch.joinedPlayers
    )
  ) {
    tournamentMatch.joinedPlayers =
      tournamentMatch.joinedPlayers.filter(
        (name) =>
          name !== playerName
      );
  }

  if (
    tournamentMatch.playerSockets
  ) {
    delete tournamentMatch
      .playerSockets[playerName];
  }

  const opponentName =
    playerName ===
      tournamentMatch.player1
      ? tournamentMatch.player2
      : tournamentMatch.player1;

  tournamentMatch.status =
    "waiting";

  /*
   * L'adversaire connecté est celui qui attend.
   * Le joueur qui revient verra alors
   * "Join <opponent>".
   */
  tournamentMatch.waitingPlayer =
    opponentName;

  if (liveMatch) {
    clearTournamentTurnTimer(
      liveMatch
    );

    io.to(liveMatch.id).emit(
      "tournamentTurnTimerStopped"
    );
  }

  /*
   * Si la série n'a jamais commencé,
   * aucune pénalité et aucun timer de 3 minutes.
   */
  if (!seriesStarted) {
    io.emit(
      "tournamentUpdated",
      tournament
    );

    console.log(
      `ℹ️ ${playerName} disconnected before ` +
      `the tournament series started.`
    );

    return true;
  }

  /*
   * Si un pion était déjà posé,
   * le joueur perd immédiatement
   * cette partie.
   */
  if (
    boardHasMove &&
    liveMatch &&
    !liveMatch.gameOver
  ) {
    const winnerName =
      opponentName;

    const winnerColor =
      liveMatch.blackName ===
        winnerName
        ? "black"
        : "white";

    liveMatch.gameOver = true;
    liveMatch.winnerName =
      winnerName;

    tournamentMatch.gamesPlayed +=
      1;

    if (
      winnerName ===
      tournamentMatch.player1
    ) {
      tournamentMatch.player1Wins +=
        1;
    } else {
      tournamentMatch.player2Wins +=
        1;
    }

    syncTournamentSeriesScore(
      liveMatch,
      tournamentMatch
    );

    stats.totalGamesFinished++;

    const seriesFinished =
      tournamentMatch.player1Wins >=
        tournamentMatch.winsRequired ||
      tournamentMatch.player2Wins >=
        tournamentMatch.winsRequired;

    if (seriesFinished) {
      tournamentMatch.winner =
        winnerName;

      tournamentMatch.status =
        "finished";

      tournamentMatch.waitingPlayer =
        null;

      updateTournamentStandings(
        tournament,
        tournamentMatch
      );

      checkTournamentFinished(
        tournament,
        tournamentMatch
      );
    }

    io.to(liveMatch.id).emit(
      "gameWon",
      {
        winnerColor,
        winnerName,

        blackName:
          liveMatch.blackName,

        whiteName:
          liveMatch.whiteName,

        matchScore:
          liveMatch.matchScore,

        isTournamentMatch: true,

        seriesFinished,

        winReason:
          "disconnect"
      }
    );

    if (seriesFinished) {
      io.to(liveMatch.id).emit(
        "tournamentSeriesFinished",
        {
          winnerName,

          player1:
            tournamentMatch.player1,

          player2:
            tournamentMatch.player2,

          player1Wins:
            tournamentMatch.player1Wins,

          player2Wins:
            tournamentMatch.player2Wins,

          standings:
            tournament.standings,

          winReason:
            "disconnect"
        }
      );

      io.emit(
        "tournamentUpdated",
        tournament
      );

      emitMatchState(
        liveMatch
      );

      /*
       * La déconnexion a donné la 4e victoire.
       * La série est déjà terminée :
       * pas besoin d'attendre 3 minutes.
       */
      return true;
    }

    /*
     * Préparer la prochaine partie,
     * mais NE PAS lancer le timer 2 minutes.
     * On attend le retour du joueur.
     */
    resetTournamentGameAfterDisconnect(
      liveMatch,
      tournamentMatch
    );

    tournamentMatch.status =
      "waiting";

    tournamentMatch.waitingPlayer =
      opponentName;
  }

  /*
   * La série est commencée et n'est pas
   * encore terminée :
   * 3 minutes pour revenir.
   */
  startTournamentReconnectTimer(
    tournament,
    tournamentMatch,
    playerName
  );

  return true;
}
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
  socket.isAdmin = false;
  socket.challengePlayerId = null;
  socket.challengeLevel = null;

  socket.tournamentCode = null;
  socket.tournamentMatchId = null;
  socket.tournamentRoomId = null;
  socket.tournamentPlayerName = null;
  socket.tournamentChatRoom = null;

  socket.emit(
    "publicMatches",
    buildSafeMatchesForSocket(socket.id)
  );

  console.log("👥 Players online:", onlinePlayers.size);

  broadcastPlayers();
  broadcastMatches();

  // ===============================
// REGISTER ONLINE PLAYER
// ===============================

socket.on("registerOnlinePlayer", ({ name }) => {
  const cleanName = sanitizeName(name);

  console.log(
    "📥 registerOnlinePlayer received:",
    cleanName,
    socket.id
  );

  if (!cleanName) {
    socket.emit(
      "errorMessage",
      "Please enter a valid player name."
    );
    return;
  }

  /*
   * Si ce socket était déjà enregistré,
   * mettre simplement son nom à jour.
   */
  const existingPlayer =
    onlinePlayers.get(socket.id);

  if (existingPlayer) {
    existingPlayer.name = cleanName;

    if (
      existingPlayer.status !== "playing"
    ) {
      existingPlayer.status =
        "available";
    }

    broadcastPlayers();
    broadcastMatches();

    console.log(
      `✅ Online player updated: ` +
      `${cleanName} (${socket.id})`
    );

    return;
  }

  /*
   * Nouveau joueur online.
   */
  const player = {
    id: socket.id,
    name: cleanName,
    code: generatePlayerCode(),
    status: "available"
  };

  onlinePlayers.set(
    socket.id,
    player
  );

  console.log(
    `✅ Online player registered: ` +
    `${player.name}#${player.code}`
  );

  console.log(
    "👥 Players online:",
    onlinePlayers.size
  );

  broadcastPlayers();
  broadcastMatches();
});

// ===============================
// ADMIN LOGIN
// ===============================

socket.on(
  "adminLogin",
  ({ password }) => {

    if (
      !canPerformAction(
        socket,
        "adminLogin",
        1000
      )
    ) {
      socket.emit("adminError", {
        message:
          "Please wait before trying again."
      });
      return;
    }

    const enteredPassword =
      String(password || "");

    if (
      !ADMIN_PASSWORD ||
      enteredPassword !== ADMIN_PASSWORD
    ) {
      socket.isAdmin = false;

      socket.emit("adminError", {
        message:
          "Invalid admin password."
      });

      return;
    }

    socket.isAdmin = true;

    socket.emit(
      "adminLoginSuccess",
      {
        success: true
      }
    );

    console.log(
      "🛡️ Admin authenticated:",
      socket.id
    );
  }
);

  // ===============================
  // CREATE TOURNAMENT
  // ===============================

  socket.on(
    "createTournament",
    ({ name, code, playerName }) => {
      const cleanCode = String(code || "")
        .trim()
        .toUpperCase();

      const cleanTournamentName = String(name || "")
        .trim()
        .slice(0, 50);

      const cleanPlayerName = sanitizeName(playerName);

      if (!cleanCode) {
        socket.emit("tournamentError", {
          message: "Tournament code is required."
        });
        return;
      }

      if (!cleanPlayerName) {
        socket.emit("tournamentError", {
          message: "Player name is required."
        });
        return;
      }

      if (tournaments.has(cleanCode)) {
        socket.emit("tournamentError", {
          message: "This tournament code already exists."
        });
        return;
      }

      const tournament = {
        name: cleanTournamentName || "Gomoku Tournament",
        code: cleanCode,

        organizer: cleanPlayerName,
creator: cleanPlayerName,

// L’organisateur est l’arbitre.
// Il n’est pas ajouté aux joueurs.
organizerSocketId: socket.id,
players: [],

started: false,
        locked: false,

        matches: [],
        standings: [],

        createdAt: Date.now()
      };

      tournaments.set(cleanCode, tournament);

      socket.tournamentCode = cleanCode;
socket.tournamentPlayerName = cleanPlayerName;

const tournamentChatRoom =
  `tournament-chat-${cleanCode}`;

socket.join(tournamentChatRoom);

socket.tournamentChatRoom =
  tournamentChatRoom;

      socket.emit("tournamentCreated", {
        success: true,
        tournament
      });

      io.emit("tournamentUpdated", tournament);

      console.log(
        `🏆 Tournament created: ${cleanCode} by ${cleanPlayerName}`
      );
    }
  );

  // ===============================
  // JOIN TOURNAMENT
  // ===============================

  socket.on(
    "joinTournament",
    ({ code, playerName }) => {
      const cleanCode = String(code || "")
        .trim()
        .toUpperCase();

      const cleanPlayerName = sanitizeName(playerName);

      if (!cleanCode || !cleanPlayerName) {
        socket.emit("tournamentError", {
          message: "Tournament code and player name are required."
        });
        return;
      }

      const tournament = tournaments.get(cleanCode);

      if (!tournament) {
        socket.emit("tournamentError", {
          message: "Tournament not found."
        });
        return;
      }

      // L’organisateur reste arbitre et ne joue pas.
if (
  socket.id === tournament.organizerSocketId ||
  cleanPlayerName === tournament.organizer
) {
  socket.tournamentCode = cleanCode;
  socket.tournamentPlayerName =
    tournament.organizer;

  socket.emit("tournamentJoined", {
    success: true,
    tournament,
    role: "organizer"
  });

  return;
}

      if (
        tournament.locked &&
        !tournament.players.includes(cleanPlayerName)
      ) {
        socket.emit("tournamentError", {
          message: "Tournament has already started."
        });
        return;
      }

      if (
        tournament.players.length >= 10 &&
        !tournament.players.includes(cleanPlayerName)
      ) {
        socket.emit("tournamentError", {
          message: "Tournament is full. Maximum 10 players."
        });
        return;
      }

      if (!tournament.players.includes(cleanPlayerName)) {
        tournament.players.push(cleanPlayerName);
      }

      socket.tournamentCode = cleanCode;
      socket.tournamentPlayerName = cleanPlayerName;

      clearTournamentReconnectOnReturn(
  tournament,
  cleanPlayerName
);

      /*
 * Quitter une ancienne room de tournoi
 * avant d’entrer dans la nouvelle.
 */
if (
  socket.tournamentChatRoom &&
  socket.tournamentChatRoom !==
    `tournament-chat-${cleanCode}`
) {
  socket.leave(
    socket.tournamentChatRoom
  );
}

const tournamentChatRoom =
  `tournament-chat-${cleanCode}`;

socket.join(tournamentChatRoom);

socket.tournamentChatRoom =
  tournamentChatRoom;

      socket.emit("tournamentJoined", {
        success: true,
        tournament
      });

      io.emit("tournamentUpdated", tournament);

      console.log(
        `🏆 ${cleanPlayerName} joined tournament ${cleanCode}`
      );
    }
  );

  // ===============================
  // START TOURNAMENT
  // ===============================

  socket.on(
    "startTournament",
    ({ code, playerName }) => {
      const cleanCode = String(code || "")
        .trim()
        .toUpperCase();

      const cleanPlayerName = sanitizeName(playerName);

      const tournament = tournaments.get(cleanCode);

      if (!tournament) {
        socket.emit("tournamentError", {
          message: "Tournament not found."
        });
        return;
      }

      if (
  tournament.organizer !== cleanPlayerName ||
  tournament.organizerSocketId !== socket.id
) {
  socket.emit("tournamentError", {
    message:
      "Only the tournament organizer can start the tournament."
  });
  return;
}

      if (tournament.started) {
        socket.emit("tournamentError", {
          message: "Tournament already started."
        });
        return;
      }

      if (tournament.players.length < 2) {
        socket.emit("tournamentError", {
          message: "At least 2 players are required."
        });
        return;
      }

      tournament.started = true;
      tournament.locked = true;

      tournament.matches = generateRoundRobinMatches(
        tournament.players,
        tournament.code
      );

      tournament.standings = generateTournamentStandings(
        tournament.players
      );

      io.emit("tournamentStarted", tournament);
      io.emit("tournamentUpdated", tournament);

      console.log(
        `🏆 Tournament ${cleanCode} started with ` +
        `${tournament.players.length} players and ` +
        `${tournament.matches.length} series.`
      );
    }
  );

  // ===============================
// CLOSE TOURNAMENT
// ===============================

socket.on(
  "closeTournament",
  ({ code }) => {
    const cleanCode =
      String(code || "")
        .trim()
        .toUpperCase();

    if (!cleanCode) {
      socket.emit(
        "tournamentError",
        {
          message:
            "Tournament code is required."
        }
      );

      return;
    }

    const tournament =
      tournaments.get(cleanCode);

    if (!tournament) {
      socket.emit(
        "tournamentError",
        {
          message:
            "Tournament not found or already closed."
        }
      );

      return;
    }

    /*
     * Vérification importante :
     * seul l’organisateur peut fermer
     * le tournoi.
     */
    const socketPlayerName =
      sanitizeName(
        socket.tournamentPlayerName
      );

    if (
      tournament.organizer !==
      socketPlayerName
    ) {
      socket.emit(
        "tournamentError",
        {
          message:
            "Only the organizer can close the tournament."
        }
      );

      return;
    }

    /*
     * Le tournoi doit être complètement
     * terminé avant sa fermeture.
     */
    if (!tournament.finished) {
      socket.emit(
        "tournamentError",
        {
          message:
            "The tournament is not finished yet."
        }
      );

      return;
    }

    /*
     * Informer tous les utilisateurs
     * enregistrés dans ce tournoi.
     */
    for (
      const connectedSocket
      of io.sockets.sockets.values()
    ) {
      if (
        connectedSocket.tournamentCode ===
        cleanCode
      ) {
        connectedSocket.emit(
          "tournamentClosed",
          {
            tournamentCode: cleanCode,
            message:
              "🏁 The organizer closed the tournament."
          }
        );
      }
    }

    /*
     * Supprimer toutes les parties actives
     * appartenant à ce tournoi.
     */
    for (
      let i = publicMatches.length - 1;
      i >= 0;
      i--
    ) {
      const match =
        publicMatches[i];

      if (
        !match.isTournamentMatch ||
        match.tournamentCode !== cleanCode
      ) {
        continue;
      }

      clearTournamentTurnTimer(match);

      leaveMatchRoom(
        match.blackId,
        match.id
      );

      leaveMatchRoom(
        match.whiteId,
        match.id
      );

      clearTournamentSocketMatch(
        match.blackId
      );

      clearTournamentSocketMatch(
        match.whiteId
      );

      if (match.spectators) {
        for (
          const spectatorId
          of match.spectators
        ) {
          leaveMatchRoom(
            spectatorId,
            match.id
          );

          clearSocketMatchId(
            spectatorId
          );
        }
      }

      publicMatches.splice(i, 1);
    }

    /*
     * Nettoyer les informations du tournoi
     * sur chaque socket.
     */
    for (
      const connectedSocket
      of io.sockets.sockets.values()
    ) {
      if (
        connectedSocket.tournamentCode !==
        cleanCode
      ) {
        continue;
      }

      if (
  connectedSocket.tournamentChatRoom
) {
  connectedSocket.leave(
    connectedSocket.tournamentChatRoom
  );
}
connectedSocket.tournamentCode =
        null;

      connectedSocket.tournamentMatchId =
        null;

      connectedSocket.tournamentRoomId =
        null;

      connectedSocket.tournamentPlayerName =
        null;

      connectedSocket.tournamentChatRoom =
        null;

      connectedSocket.matchId =
        null;
    }

    tournaments.delete(cleanCode);

    broadcastMatches();
    broadcastPlayers();

    console.log(
      `🏁 Tournament closed: ${cleanCode} ` +
      `by ${socketPlayerName}`
    );
  }
);

  // ===============================
  // JOIN TOURNAMENT MATCH ROOM
  // ===============================

  socket.on(
    "joinTournamentMatch",
    ({ tournamentCode, matchId, playerName }) => {
      const cleanCode = String(tournamentCode || "")
        .trim()
        .toUpperCase();

      const cleanMatchId = String(matchId || "").trim();
      const cleanPlayerName = sanitizeName(playerName);

      const tournament = tournaments.get(cleanCode);

      if (!tournament) {
        socket.emit("tournamentError", {
          message: "Tournament not found."
        });
        return;
      }

      if (!tournament.started) {
        socket.emit("tournamentError", {
          message: "Tournament has not started yet."
        });
        return;
      }

      const tournamentMatch = tournament.matches.find(
        (match) => match.id === cleanMatchId
      );

      if (!tournamentMatch) {
        socket.emit("tournamentError", {
          message: "Tournament match not found."
        });
        return;
      }

      if (tournamentMatch.winner) {
        socket.emit("tournamentError", {
          message: "This tournament series is already finished."
        });
        return;
      }

      const isPlayer1 =
        tournamentMatch.player1 === cleanPlayerName;

      const isPlayer2 =
        tournamentMatch.player2 === cleanPlayerName;

      if (!isPlayer1 && !isPlayer2) {
        socket.emit("tournamentError", {
          message: "You are not a player in this match."
        });
        return;
      }

      const roomId =
        `tournament-${cleanCode}-${tournamentMatch.id}`;

      if (!tournamentMatch.playerSockets) {
        tournamentMatch.playerSockets = {};
      }

      if (!Array.isArray(tournamentMatch.joinedPlayers)) {
        tournamentMatch.joinedPlayers = [];
      }

      tournamentMatch.playerSockets[cleanPlayerName] =
        socket.id;

      if (
        !tournamentMatch.joinedPlayers.includes(
          cleanPlayerName
        )
      ) {
        tournamentMatch.joinedPlayers.push(
          cleanPlayerName
        );
      }

      socket.join(roomId);

      socket.tournamentCode = cleanCode;
      socket.tournamentMatchId = tournamentMatch.id;
      socket.tournamentRoomId = roomId;
      socket.tournamentPlayerName = cleanPlayerName;

      if (tournamentMatch.joinedPlayers.length < 2) {
  tournamentMatch.status = "waiting";
  tournamentMatch.waitingPlayer =
    cleanPlayerName;

  const opponentName =
    cleanPlayerName === tournamentMatch.player1
      ? tournamentMatch.player2
      : tournamentMatch.player1;

  const opponentSocketId =
    findTournamentPlayerSocketId(
      cleanCode,
      opponentName
    );

  // Confirmer au premier joueur qu’il attend
  socket.emit(
    "tournamentMatchRoomUpdated",
    {
      tournamentCode: cleanCode,
      roomId,
      match: tournamentMatch,
      ready: false,
      waitingPlayer: cleanPlayerName,
      opponentName
    }
  );

  socket.emit(
    "tournamentWaitingForOpponent",
    {
      tournamentCode: cleanCode,
      matchId: tournamentMatch.id,
      playerName: cleanPlayerName,
      opponentName
    }
  );

  // Avertir directement l’adversaire
  if (opponentSocketId) {
    io.to(opponentSocketId).emit(
      "tournamentOpponentWaiting",
      {
        tournamentCode: cleanCode,
        matchId: tournamentMatch.id,
        waitingPlayer: cleanPlayerName,
        opponentName,
        player1: tournamentMatch.player1,
        player2: tournamentMatch.player2
      }
    );
  }

  io.emit("tournamentUpdated", tournament);

  console.log(
    `⏳ ${cleanPlayerName} is waiting for ` +
    `${opponentName} in ${roomId}`
  );

  return;
}

      const player1SocketId =
        tournamentMatch.playerSockets[
          tournamentMatch.player1
        ];

      const player2SocketId =
        tournamentMatch.playerSockets[
          tournamentMatch.player2
        ];

      const player1Socket =
        io.sockets.sockets.get(player1SocketId);

      const player2Socket =
        io.sockets.sockets.get(player2SocketId);

      if (!player1Socket || !player2Socket) {
        tournamentMatch.status = "waiting";

        socket.emit("tournamentError", {
          message: "The second player is not connected yet."
        });

        return;
      }

      tournamentMatch.status = "playing";
      tournamentMatch.waitingPlayer = null;

      let liveMatch = tournamentMatch.liveMatchId
        ? findMatchById(tournamentMatch.liveMatchId)
        : null;

      if (!liveMatch) {
        liveMatch = {
          id: roomId,

          blackId: player1SocketId,
          whiteId: player2SocketId,

          blackName: tournamentMatch.player1,
          whiteName: tournamentMatch.player2,

          board: Array(BOARD_CELLS).fill(null),
          currentPlayer: "black",
          nextStarterId: player2SocketId,

          gameOver: false,
          winnerName: null,

          spectators: new Set(),

          matchScore: {
            black: tournamentMatch.player1Wins || 0,
            white: tournamentMatch.player2Wins || 0
          },

          isTournamentMatch: true,
          tournamentCode: cleanCode,
          tournamentMatchId: tournamentMatch.id
        };

        publicMatches.push(liveMatch);

        tournamentMatch.liveMatchId = liveMatch.id;

        stats.totalGamesStarted++;

        console.log("🎮 Tournament game created");
        logStats();
      } else {
  /*
   * Préserver les couleurs actuelles
   * après une reconnexion.
   */
  liveMatch.blackId =
    liveMatch.blackName ===
      tournamentMatch.player1
      ? player1SocketId
      : player2SocketId;

  liveMatch.whiteId =
    liveMatch.whiteName ===
      tournamentMatch.player1
      ? player1SocketId
      : player2SocketId;
}

      joinMatchRoom(player1SocketId, liveMatch.id);
      joinMatchRoom(player2SocketId, liveMatch.id);

      setSocketMatchId(player1SocketId, liveMatch.id);
      setSocketMatchId(player2SocketId, liveMatch.id);

      const player1Color =
  liveMatch.blackName ===
    tournamentMatch.player1
    ? "black"
    : "white";

const player2Color =
  player1Color === "black"
    ? "white"
    : "black";

      io.to(player1SocketId).emit("gameStart", {
        matchId: liveMatch.id,
        color: player1Color,
        opponentName: tournamentMatch.player2,

        blackName: liveMatch.blackName,
        whiteName: liveMatch.whiteName,

        board: liveMatch.board,
        currentPlayer: liveMatch.currentPlayer,
        gameOver: liveMatch.gameOver,
        winnerName: liveMatch.winnerName,

        spectatorCount: getSpectatorCount(liveMatch),
        matchScore: liveMatch.matchScore,

        isTournamentMatch: true,
        tournamentCode: cleanCode,
        tournamentMatchId: tournamentMatch.id
      });

      io.to(player2SocketId).emit("gameStart", {
        matchId: liveMatch.id,
        color: player2Color,
        opponentName: tournamentMatch.player1,

        blackName: liveMatch.blackName,
        whiteName: liveMatch.whiteName,

        board: liveMatch.board,
        currentPlayer: liveMatch.currentPlayer,
        gameOver: liveMatch.gameOver,
        winnerName: liveMatch.winnerName,

        spectatorCount: getSpectatorCount(liveMatch),
        matchScore: liveMatch.matchScore,

        isTournamentMatch: true,
        tournamentCode: cleanCode,
        tournamentMatchId: tournamentMatch.id
      });

      io.to(roomId).emit(
        "tournamentMatchRoomUpdated",
        {
          tournamentCode: cleanCode,
          roomId,
          match: tournamentMatch,
          ready: true
        }
      );

      io.emit("tournamentUpdated", tournament);

      emitMatchState(liveMatch);

      console.log(
        `✅ Tournament match started: ` +
        `${tournamentMatch.player1} vs ` +
        `${tournamentMatch.player2}`
      );
    }
  );

  // ===============================
// TOURNAMENT CHAT
// ===============================

socket.on(
  "sendTournamentMessage",
  ({ message }) => {
    if (
      !canPerformAction(
        socket,
        "sendTournamentMessage",
        300
      )
    ) {
      socket.emit(
        "tournamentChatError",
        {
          message:
            "Please wait before sending another message."
        }
      );
      return;
    }

    const cleanMessage =
      sanitizeChatMessage(message);

    const cleanCode =
      String(
        socket.tournamentCode || ""
      )
        .trim()
        .toUpperCase();

    const senderName =
      sanitizeName(
        socket.tournamentPlayerName
      );

    if (
      !cleanCode ||
      !senderName ||
      !cleanMessage
    ) {
      socket.emit(
        "tournamentChatError",
        {
          message:
            "You must join a tournament before using the tournament chat."
        }
      );
      return;
    }

    const tournament =
      tournaments.get(cleanCode);

    if (!tournament) {
      socket.emit(
        "tournamentChatError",
        {
          message:
            "Tournament not found."
        }
      );
      return;
    }

    const isOrganizer =
      tournament.organizer ===
      senderName;

    const isTournamentPlayer =
      tournament.players.includes(
        senderName
      );

    if (
      !isOrganizer &&
      !isTournamentPlayer
    ) {
      socket.emit(
        "tournamentChatError",
        {
          message:
            "You are not a member of this tournament."
        }
      );
      return;
    }

    const tournamentChatRoom =
      `tournament-chat-${cleanCode}`;

    /*
     * Envoyer seulement aux personnes
     * du même tournoi.
     */
    io.to(tournamentChatRoom).emit(
      "receiveTournamentMessage",
      {
        tournamentCode:
          cleanCode,

        name:
          senderName,

        message:
          cleanMessage,

        role:
          isOrganizer
            ? "organizer"
            : "player",

        sentAt:
          Date.now()
      }
    );
  }
);

// ===============================
// ONLINE CHAT
// ===============================

socket.on("sendMessage", (message) => {
  if (
    !canPerformAction(
      socket,
      "sendMessage",
      300
    )
  ) {
    return;
  }

  const cleanMessage =
    sanitizeChatMessage(message);

  if (!cleanMessage) {
    return;
  }

  const matchId = socket.matchId;

  if (!matchId) {
    socket.emit(
      "errorMessage",
      "No active match found."
    );
    return;
  }

  const match =
    findMatchById(matchId);

  if (!match) {
    socket.emit(
      "errorMessage",
      "Match not found."
    );
    return;
  }

  const player =
    onlinePlayers.get(socket.id);

  let senderName =
    player?.name || "Spectator";

  if (socket.id === match.blackId) {
    senderName = match.blackName;
  }

  if (socket.id === match.whiteId) {
    senderName = match.whiteName;
  }

  io.to(match.id).emit(
    "receiveMessage",
    {
      name: senderName,
      message: cleanMessage
    }
  );
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
  matchScore: {
    black: 0,
    white: 0,
  },
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
  matchScore: match.matchScore,
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
  matchScore: match.matchScore,
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

  // ======================================
// ORGANIZER WATCHES A TOURNAMENT MATCH
// ======================================

socket.on(
  "watchTournamentMatch",
  ({ tournamentCode, tournamentMatchId }) => {
    if (
      !canPerformAction(
        socket,
        "watchTournamentMatch",
        500
      )
    ) {
      socket.emit("tournamentError", {
        message:
          "Please wait before watching another match."
      });
      return;
    }

    const cleanCode = String(
      tournamentCode || ""
    )
      .trim()
      .toUpperCase();

    const cleanTournamentMatchId =
      String(
        tournamentMatchId || ""
      ).trim();

    const tournament =
      tournaments.get(cleanCode);

    if (!tournament) {
      socket.emit("tournamentError", {
        message: "Tournament not found."
      });
      return;
    }

    /*
     * Vérifier que ce socket est réellement
     * celui de l’organisateur.
     */
    const isOrganizer =
      tournament.organizerSocketId ===
        socket.id &&
      socket.tournamentCode ===
        cleanCode &&
      socket.tournamentPlayerName ===
        tournament.organizer;

    if (!isOrganizer) {
      socket.emit("tournamentError", {
        message:
          "Only the organizer can watch tournament matches as referee."
      });
      return;
    }

    const tournamentMatch =
      tournament.matches.find(
        (item) =>
          item.id ===
          cleanTournamentMatchId
      );

    if (!tournamentMatch) {
      socket.emit("tournamentError", {
        message:
          "Tournament match not found."
      });
      return;
    }

    if (
      tournamentMatch.status !==
        "playing" ||
      !tournamentMatch.liveMatchId
    ) {
      socket.emit("tournamentError", {
        message:
          "This match is not currently being played."
      });
      return;
    }

    const liveMatch =
      findMatchById(
        tournamentMatch.liveMatchId
      );

    if (!liveMatch) {
      socket.emit("tournamentError", {
        message:
          "The live match is not available yet."
      });
      return;
    }

    if (
      !liveMatch.isTournamentMatch ||
      liveMatch.tournamentCode !==
        cleanCode
    ) {
      socket.emit("tournamentError", {
        message:
          "Invalid tournament match."
      });
      return;
    }

    /*
     * Quitter l’ancien match regardé,
     * s’il y en avait un.
     */
    removeSpectatorFromAllMatches(
      socket.id
    );

    if (!liveMatch.spectators) {
      liveMatch.spectators =
        new Set();
    }

    liveMatch.spectators.add(
      socket.id
    );

    joinMatchRoom(
      socket.id,
      liveMatch.id
    );

    setSocketMatchId(
      socket.id,
      liveMatch.id
    );

    socket.tournamentRoomId =
      liveMatch.id;

    stats.totalWatchJoins++;

    socket.emit(
      "watchStart",
      {
        matchId:
          liveMatch.id,

        board:
          liveMatch.board,

        blackName:
          liveMatch.blackName,

        whiteName:
          liveMatch.whiteName,

        currentPlayer:
          liveMatch.currentPlayer,

        gameOver:
          liveMatch.gameOver,

        winnerName:
          liveMatch.winnerName,

        spectatorCount:
          getSpectatorCount(
            liveMatch
          ),

        matchScore:
          liveMatch.matchScore || {
            black: 0,
            white: 0
          },

        isTournamentMatch: true,
        organizerWatching: true,

        tournamentCode:
          cleanCode,

        tournamentMatchId:
          tournamentMatch.id,

        turnDeadline:
          liveMatch.turnDeadline ||
          null
      }
    );

    /*
     * Si le chronomètre tourne déjà,
     * l’organisateur doit voir le même temps.
     */
    if (
      liveMatch.turnDeadline &&
      !liveMatch.gameOver
    ) {
      socket.emit(
        "tournamentTurnTimerStarted",
        {
          matchId:
            liveMatch.id,

          deadline:
            liveMatch.turnDeadline,

          currentPlayer:
            liveMatch.currentPlayer,

          currentPlayerName:
            getCurrentTournamentPlayerName(
              liveMatch
            )
        }
      );
    }

    emitMatchState(
      liveMatch
    );

    console.log(
      `👑 Organizer ${tournament.organizer} ` +
      `is watching ${liveMatch.blackName} ` +
      `vs ${liveMatch.whiteName}`
    );
  }
);

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

    joinMatchRoom(socket.id, match.id);
    setSocketMatchId(socket.id, match.id);

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

  matchScore:
    match.matchScore || {
      black: 0,
      white: 0
    },

  isTournamentMatch:
    !!match.isTournamentMatch,

  organizerWatching: false,

  tournamentCode:
    match.tournamentCode || null,

  tournamentMatchId:
    match.tournamentMatchId || null,

  turnDeadline:
    match.turnDeadline || null
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

    if (!match.isTournamentMatch) {
  if (!Array.isArray(match.moveHistory)) {
    match.moveHistory = [];
  }

  match.moveHistory.push({
    index,
    player
  });

  match.undoAvailable = true;
}

    io.to(match.id).emit("movePlayed", { index, player });

    if (isWinningMove(match.board, index, player)) {
  match.gameOver = true;

  clearTournamentTurnTimer(match);

  match.winnerName =
    player === "black"
      ? match.blackName
      : match.whiteName;

  let tournament = null;
  let tournamentMatch = null;
  let seriesFinished = false;

  // ==================================
  // TOURNAMENT MATCH
  // ==================================

  if (
    match.isTournamentMatch &&
    match.tournamentCode &&
    match.tournamentMatchId
  ) {
    tournament = tournaments.get(
      match.tournamentCode
    );

    tournamentMatch =
      tournament?.matches.find(
        (item) =>
          item.id === match.tournamentMatchId
      );

    if (tournament && tournamentMatch) {
      tournamentMatch.gamesPlayed += 1;

      // Ajouter la victoire selon le nom,
      // et non selon la couleur.
      if (
        match.winnerName ===
        tournamentMatch.player1
      ) {
        tournamentMatch.player1Wins += 1;
      } else if (
        match.winnerName ===
        tournamentMatch.player2
      ) {
        tournamentMatch.player2Wins += 1;
      }

      // Synchroniser le score avec les noms
      syncTournamentSeriesScore(
        match,
        tournamentMatch
      );

      seriesFinished =
        tournamentMatch.player1Wins >=
          tournamentMatch.winsRequired ||
        tournamentMatch.player2Wins >=
          tournamentMatch.winsRequired;

      if (seriesFinished) {
        tournamentMatch.winner =
          tournamentMatch.player1Wins >=
          tournamentMatch.winsRequired
            ? tournamentMatch.player1
            : tournamentMatch.player2;

        tournamentMatch.status = "finished";

        updateTournamentStandings(
  tournament,
  tournamentMatch
);

checkTournamentFinished(
  tournament,
  tournamentMatch
);

io.to(match.id).emit(
  "tournamentSeriesFinished",
          {
            winnerName:
              tournamentMatch.winner,

            player1:
              tournamentMatch.player1,

            player2:
              tournamentMatch.player2,

            player1Wins:
              tournamentMatch.player1Wins,

            player2Wins:
              tournamentMatch.player2Wins,

            standings:
              tournament.standings
          }
        );

        console.log(
          `🏆 Series finished: ` +
          `${tournamentMatch.winner} wins ` +
          `${tournamentMatch.player1Wins} - ` +
          `${tournamentMatch.player2Wins}`
        );
      }

      io.emit(
        "tournamentUpdated",
        tournament
      );
    }
  } else {
    // ==================================
    // NORMAL ONLINE MATCH
    // ==================================

    if (!match.matchScore) {
      match.matchScore = {
        black: 0,
        white: 0
      };
    }

    if (player === "black") {
      match.matchScore.black += 1;
    } else {
      match.matchScore.white += 1;
    }
  }

  stats.totalGamesFinished++;

  console.log("🏁 Match finished");
  logStats();

  io.to(match.id).emit("gameWon", {
    winnerColor: player,
    winnerName: match.winnerName,
    blackName: match.blackName,
    whiteName: match.whiteName,
    matchScore:
      match.matchScore || {
        black: 0,
        white: 0
      },

    isTournamentMatch:
      !!match.isTournamentMatch,

    seriesFinished
  });

  // ==================================
  // RESET TOURNAMENT GRID AFTER 3 SECONDS
  // ==================================

  if (
    match.isTournamentMatch &&
    tournament &&
    tournamentMatch &&
    !seriesFinished
  ) {
    setTimeout(() => {
      const currentMatch =
        findMatchById(match.id);

      if (!currentMatch) {
        return;
      }

      const currentTournament =
        tournaments.get(
          currentMatch.tournamentCode
        );

      const currentTournamentMatch =
        currentTournament?.matches.find(
          (item) =>
            item.id ===
            currentMatch.tournamentMatchId
        );

      if (
        !currentTournament ||
        !currentTournamentMatch ||
        currentTournamentMatch.status ===
          "finished"
      ) {
        return;
      }

      currentMatch.board =
        Array(BOARD_CELLS).fill(null);

      currentMatch.gameOver = false;
      currentMatch.winnerName = null;

      // Alterner les couleurs
      const oldBlackId =
        currentMatch.blackId;

      const oldBlackName =
        currentMatch.blackName;

      currentMatch.blackId =
        currentMatch.whiteId;

      currentMatch.whiteId =
        oldBlackId;

      currentMatch.blackName =
        currentMatch.whiteName;

      currentMatch.whiteName =
        oldBlackName;

      currentMatch.currentPlayer =
        "black";

      currentMatch.nextStarterId =
        currentMatch.whiteId;

      // Replacer le score devant les bons noms
      syncTournamentSeriesScore(
        currentMatch,
        currentTournamentMatch
      );

      io.to(currentMatch.blackId).emit(
        "tournamentColorChanged",
        {
          color: "black",
          opponentName:
            currentMatch.whiteName
        }
      );

      io.to(currentMatch.whiteId).emit(
        "tournamentColorChanged",
        {
          color: "white",
          opponentName:
            currentMatch.blackName
        }
      );

      io.to(currentMatch.id).emit(
  "onlineGameReset",
  {
    board: currentMatch.board,
    currentPlayer:
      currentMatch.currentPlayer,

    blackName:
      currentMatch.blackName,

    whiteName:
      currentMatch.whiteName,

    gameOver: false,
    winnerName: null,

    spectatorCount:
      getSpectatorCount(
        currentMatch
      ),

    matchScore:
      currentMatch.matchScore,

    isTournamentMatch: true
  }
);

io.to(currentMatch.id).emit(
  "tournamentTurnTimerStopped"
);

      emitMatchState(currentMatch);

      console.log(
        `▶️ Tournament grid reset: ` +
        `${currentMatch.blackName} is black, ` +
        `${currentMatch.whiteName} is white`
      );
    }, 3000);
  }

  emitMatchState(match);
  
  if (
  seriesFinished &&
  match.isTournamentMatch &&
  tournamentMatch
) {
  const finishedMatchId = match.id;
  const blackId = match.blackId;
  const whiteId = match.whiteId;

  // Empêcher la création d’une nouvelle partie
  // avec cet ancien liveMatch.
  tournamentMatch.liveMatchId = null;
  tournamentMatch.waitingPlayer = null;

  setTimeout(() => {
    const finishedMatch =
      findMatchById(finishedMatchId);

    const closePayload = {
  board: finishedMatch
    ? [...finishedMatch.board]
    : Array(BOARD_CELLS).fill(null),

      winnerName:
        tournamentMatch.winner,

      player1:
        tournamentMatch.player1,

      player2:
        tournamentMatch.player2,

      player1Wins:
        tournamentMatch.player1Wins,

      player2Wins:
        tournamentMatch.player2Wins,

      matchId:
        finishedMatchId
    };

    if (finishedMatch) {
      finishedMatch.gameOver = true;
      finishedMatch.winnerName =
        tournamentMatch.winner;
    }

    /*
     * Envoyer directement à chacun des joueurs.
     * Cela fonctionne même si l’un des sockets
     * n’est plus correctement enregistré dans la room.
     */
    io.to(blackId).emit(
      "tournamentSeriesClosed",
      closePayload
    );

    io.to(whiteId).emit(
      "tournamentSeriesClosed",
      closePayload
    );

    // Informer aussi les éventuels spectateurs
    if (
      finishedMatch &&
      finishedMatch.spectators
    ) {
      for (
        const spectatorId
        of finishedMatch.spectators
      ) {
        io.to(spectatorId).emit(
          "tournamentSeriesClosed",
          closePayload
        );

        leaveMatchRoom(
          spectatorId,
          finishedMatchId
        );

        clearSocketMatchId(
          spectatorId
        );
      }
    }

    // Sortir les deux joueurs de l’ancienne room
    leaveMatchRoom(
      blackId,
      finishedMatchId
    );

    leaveMatchRoom(
      whiteId,
      finishedMatchId
    );

    // Libérer complètement les sockets
    clearTournamentSocketMatch(
      blackId
    );

    clearTournamentSocketMatch(
      whiteId
    );

    // Supprimer l’ancienne partie active
    removeMatchById(
      finishedMatchId
    );

    io.emit(
      "tournamentUpdated",
      tournament
    );

    broadcastMatches();

    console.log(
      `✅ Tournament series closed: ` +
      `${finishedMatchId}`
    );
  }, 8000);
}
return;
}

    match.currentPlayer =
  player === "black"
    ? "white"
    : "black";

emitMatchState(match);

// ==========================
// Restart timer for next turn
// ==========================
if (
  match.isTournamentMatch &&
  !match.gameOver
) {
  startTournamentTurnTimer(match);
}
  });

  socket.on("undoOnlineMove", () => {
  if (
    !canPerformAction(
      socket,
      "undoOnlineMove",
      500
    )
  ) {
    return;
  }

  const match =
    findMatchBySocketId(socket.id);

  if (!match) {
    socket.emit(
      "errorMessage",
      "No active match found."
    );
    return;
  }

  // Aucun Undo en Tournament
  if (match.isTournamentMatch) {
    return;
  }

  // Il faut avoir un historique de coups
  if (
    !Array.isArray(match.moveHistory) ||
    match.moveHistory.length === 0
  ) {
    return;
  }

  // Empêche plusieurs Undo consécutifs
  if (!match.undoAvailable) {
    return;
  }

  // Déterminer la couleur du joueur
  let myColor = null;

  if (socket.id === match.blackId) {
    myColor = "black";
  } else if (socket.id === match.whiteId) {
    myColor = "white";
  }

  if (!myColor) {
    return;
  }

  const removedMoves = [];

  const lastMove =
    match.moveHistory[
      match.moveHistory.length - 1
    ];

  if (!lastMove) {
    return;
  }

  /*
   * CAS 1
   * Mon propre pion est le dernier.
   * L'adversaire n'a pas encore répondu.
   * => enlever seulement 1 pion.
   */
  if (lastMove.player === myColor) {
    const move =
      match.moveHistory.pop();

    if (
      move &&
      isValidIndex(move.index)
    ) {
      match.board[move.index] = null;
      removedMoves.push(move);
    }
  }

  /*
   * CAS 2
   * Le dernier pion appartient
   * à l'adversaire.
   *
   * Il a donc déjà répondu après
   * mon dernier coup.
   * => enlever les 2 derniers coups.
   */
  else {
    for (
      let i = 0;
      i < 2 &&
      match.moveHistory.length > 0;
      i++
    ) {
      const move =
        match.moveHistory.pop();

      if (
        !move ||
        !isValidIndex(move.index)
      ) {
        continue;
      }

      match.board[move.index] = null;
      removedMoves.push(move);
    }
  }

  if (removedMoves.length === 0) {
    return;
  }

  /*
   * Le plus ancien des coups retirés
   * correspond au joueur qui doit
   * rejouer maintenant.
   */
  const firstRemovedMove =
    removedMoves[
      removedMoves.length - 1
    ];

  match.currentPlayer =
    firstRemovedMove.player;

  match.gameOver = false;
  match.winnerName = null;

  // Bloque un deuxième Undo immédiat
  match.undoAvailable = false;

  io.to(match.id).emit(
    "onlineUndoApplied",
    {
      board: match.board,
      currentPlayer:
        match.currentPlayer,

      blackName:
        match.blackName,

      whiteName:
        match.whiteName,

      matchScore:
        match.matchScore || {
          black: 0,
          white: 0
        }
    }
  );

  emitMatchState(match);

  console.log(
    `↩️ Online undo: ` +
    `${removedMoves.length} move(s) removed`
  );
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
  matchScore: match.matchScore || { black: 0, white: 0 },
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
  matchScore: match.matchScore || { black: 0, white: 0 },
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
  console.log(
    "🔴 User disconnected:",
    socket.id
  );

  if (
    socket.challengePlayerName &&
    socket.challengeLevel
  ) {
    setChallengePlayerOffline(
      socket.challengeLevel,
      socket.challengePlayerId
    );

    broadcastChallengeLeaderboard(
      socket.challengeLevel
    );
  }

  /*
   * Règles spéciales Tournament.
   */
  const tournamentDisconnectHandled =
    handleTournamentDisconnect(
      socket
    );

  /*
   * Nettoyage normal Online.
   *
   * cleanupDisconnectedPlayer()
   * ignore maintenant les liveMatch Tournament,
   * donc le Online Multiplayer continue
   * de fonctionner normalement.
   */
  cleanupDisconnectedPlayer(
    socket.id
  );

  if (
    tournamentDisconnectHandled
  ) {
    console.log(
      "🏆 Tournament disconnect handled."
    );
  }

  console.log(
    "👥 Players online:",
    onlinePlayers.size
  );
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