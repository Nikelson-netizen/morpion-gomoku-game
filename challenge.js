const challengePlayerName = document.getElementById("challengePlayerName");
const challengePlayerStatus = document.getElementById("challengePlayerStatus");
const challengeAvatar = document.getElementById("challengeAvatar");

const playerPointsEl = document.getElementById("playerPoints");
const playerLevelEl = document.getElementById("playerLevel");
const playerWinsEl = document.getElementById("playerWins");
const playerLossesEl = document.getElementById("playerLosses");
const playerStreakEl = document.getElementById("playerStreak");
const playerBestStreakEl = document.getElementById("playerBestStreak");

const progressPercentEl = document.getElementById("progressPercent");
const progressFillEl = document.getElementById("progressFill");

const leaderboardList = document.getElementById("leaderboardList");
const historyList = document.getElementById("historyList");

const startChallengeBtn = document.getElementById("startChallengeBtn");
const simulateWinBtn = document.getElementById("simulateWinBtn");
const simulateLossBtn = document.getElementById("simulateLossBtn");
const simulateHardWinBtn = document.getElementById("simulateHardWinBtn");
const resetChallengeDataBtn = document.getElementById("resetChallengeDataBtn");
const shareChallengeBtn = document.getElementById("shareChallengeBtn");

const pagePlayerNameInput = document.getElementById("playerName");
const pageAiLevelSelect = document.getElementById("aiLevel");
const pageFirstPlayerSelect = document.getElementById("firstPlayer");
const pageResetButton = document.getElementById("reset");
const pageModeSelect = document.getElementById("mode");

const STORAGE_KEY = "gomokuChallengeData";
const isStandaloneChallengePage =
  !!document.querySelector(".challenge-page");

const isIntegratedChallenge =
  !!document.getElementById("aiChallengePanel");

const isChallengePage =
  isStandaloneChallengePage || isIntegratedChallenge;

// ✅ Level 1 supprimé
const VALID_LEVELS = ["2", "3", "4", "5"];

function getChallengePlayerId() {
  let id = localStorage.getItem("challengePlayerId");

  if (!id) {
    id =
      "challenge_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2, 10);

    localStorage.setItem("challengePlayerId", id);
  }

  return id;
}

/* =========================
   GOMOKU GUEST SESSION
========================= */

async function initializeGomokuGuestSession() {
  try {
    const response = await fetch("/api/guest/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(
        `Guest session error: ${response.status}`
      );
    }

    const data = await response.json();

    if (!data.success || !data.guestId) {
      throw new Error("Invalid guest session");
    }

    window.gomokuGuestId = data.guestId;

    console.log("✅ Gomoku Guest session active");

    return data.guestId;

  } catch (error) {
    console.warn(
      "Guest session unavailable:",
      error.message
    );

    return null;
  }
}

/* =========================
   LOAD GUEST CHALLENGE STATS
========================= */

async function loadGuestChallengeStats() {
  try {
    const response = await fetch(
      "/api/guest/challenge-stats",
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
      }
    );

    if (!response.ok) {
      console.warn(
        "Guest stats unavailable:",
        response.status
      );
      return null;
    }

    const data = await response.json();

    if (!data.success || !Array.isArray(data.stats)) {
      return null;
    }

    console.log(
      "✅ Guest Challenge stats loaded:",
      data.stats
    );

    // Restaurer les statistiques PostgreSQL
// sans écraser les anciennes données locales.

for (const row of data.stats) {
  const level = String(row.level);

  if (!VALID_LEVELS.includes(level)) {
    continue;
  }

  // Protéger les points locaux non synchronisés
const hasPendingSave =
  localStorage.getItem(
    `gomokuChallengePending_${level}`
  ) === "1";

if (hasPendingSave) {
  console.warn(
    "⏳ Guest Challenge sauvegarde en attente:",
    level
  );

  continue;
}

  challengeData.levelStats[level] = {
    points: Number(row.points) || 0,
    wins: Number(row.wins) || 0,
    losses: Number(row.losses) || 0,
    streak: Number(row.streak) || 0,
    bestStreak: Number(row.best_streak) || 0,
    revision: Number(row.revision) || 0
  };

  // Mémoriser la dernière version PostgreSQL
// sans écraser une sauvegarde locale en attente.
if (
  localStorage.getItem(
    `gomokuChallengePending_${level}`
  ) !== "1"
) {
  localStorage.setItem(
    `gomokuChallengeSynced_${level}`,
    JSON.stringify(row)
  );
}
}

saveChallengeData();
renderProfile();

return data.stats;

  } catch (error) {
    console.error(
      "Guest Challenge load error:",
      error.message
    );

    return null;
  }
}

function getExistingOnlinePlayerId() {
  return String(
    localStorage.getItem("onlinePlayerId") || ""
  ).trim();
}

function getChallengeSocket() {
  return typeof socket !== "undefined" ? socket : null;
}

const defaultChallengeData = {
  browserPlayerId: getChallengePlayerId(),
  playerName: localStorage.getItem("challengePlayerName") || localStorage.getItem("playerName") || "Player",
  online: false,

  selectedLeaderboardLevel: "2",

  // ✅ stats séparées par niveau
  levelStats: {
    "2": { points: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0 },
    "3": { points: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0 },
    "4": { points: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0 },
    "5": { points: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0 }
  },

  history: [],

  leaderboards: {
    "2": [],
    "3": [],
    "4": [],
    "5": []
  }
};

let challengeData = loadChallengeData();

function normalizeLevel(level) {
  const clean = String(level || "").trim();
  return VALID_LEVELS.includes(clean) ? clean : "2";
}

function getCurrentChallengeLevel() {
  return normalizeLevel(
    (pageAiLevelSelect && pageAiLevelSelect.value) ||
      localStorage.getItem("challengeLevel") ||
      challengeData.selectedLeaderboardLevel ||
      "2"
  );
}

function getSelectedLeaderboardLevel() {
  return normalizeLevel(challengeData.selectedLeaderboardLevel || getCurrentChallengeLevel());
}

function setSelectedLeaderboardLevel(level) {
  challengeData.selectedLeaderboardLevel = normalizeLevel(level);
  saveChallengeData();
  renderLeaderboard();
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function ensureLeaderboardsShape(data) {
  const next = { ...data };

  next.leaderboards =
    next.leaderboards && typeof next.leaderboards === "object"
      ? next.leaderboards
      : {};

  VALID_LEVELS.forEach((level) => {
    if (!Array.isArray(next.leaderboards[level])) {
      next.leaderboards[level] = [];
    }
  });

  return next;
}

function ensureLevelStatsShape(data) {
  const next = { ...data };

  next.levelStats =
    next.levelStats && typeof next.levelStats === "object"
      ? next.levelStats
      : {};

  VALID_LEVELS.forEach((level) => {
    const stat = next.levelStats[level] || {};
    next.levelStats[level] = {
  points: Number.isFinite(stat.points) ? stat.points : 0,
  wins: Number.isFinite(stat.wins) ? stat.wins : 0,
  losses: Number.isFinite(stat.losses) ? stat.losses : 0,
  streak: Number.isFinite(stat.streak) ? stat.streak : 0,
  bestStreak: Number.isFinite(stat.bestStreak) ? stat.bestStreak : 0,
  revision: Number.isSafeInteger(stat.revision) && stat.revision >= 0
    ? stat.revision
    : 0
};
  });

  return next;
}

// ✅ migration douce des anciennes données
function migrateLegacyData(data) {
  const next = { ...data };

  if (!next.levelStats || typeof next.levelStats !== "object") {
    next.levelStats = deepClone(defaultChallengeData.levelStats);
  }

  const hasLegacyPoints =
    Number.isFinite(next.points) ||
    Number.isFinite(next.wins) ||
    Number.isFinite(next.losses) ||
    Number.isFinite(next.streak) ||
    Number.isFinite(next.bestStreak);

  const hasAnyLevelData = VALID_LEVELS.some((level) => {
    const stat = next.levelStats[level];
    return stat && (stat.points || stat.wins || stat.losses || stat.streak || stat.bestStreak);
  });

  if (hasLegacyPoints && !hasAnyLevelData) {
    const targetLevel = normalizeLevel(
      localStorage.getItem("challengeLevel") ||
        next.selectedLeaderboardLevel ||
        "2"
    );

    next.levelStats[targetLevel] = {
      points: Number.isFinite(next.points) ? next.points : 0,
      wins: Number.isFinite(next.wins) ? next.wins : 0,
      losses: Number.isFinite(next.losses) ? next.losses : 0,
      streak: Number.isFinite(next.streak) ? next.streak : 0,
      bestStreak: Number.isFinite(next.bestStreak) ? next.bestStreak : 0
    };
  }

  delete next.points;
  delete next.wins;
  delete next.losses;
  delete next.streak;
  delete next.bestStreak;
  delete next.level;

  return next;
}

function normalizeChallengeData(data) {
  let next = { ...deepClone(defaultChallengeData), ...data };

  next = migrateLegacyData(next);
  next = ensureLeaderboardsShape(next);
  next = ensureLevelStatsShape(next);

  next.playerName =
    typeof next.playerName === "string" && next.playerName.trim()
      ? next.playerName.trim()
      : "Player";

  next.online = !!next.online;
  next.history = Array.isArray(next.history) ? next.history : [];
  next.selectedLeaderboardLevel = normalizeLevel(next.selectedLeaderboardLevel || "2");

  VALID_LEVELS.forEach((level) => {
    next.leaderboards[level] = Array.isArray(next.leaderboards[level])
      ? next.leaderboards[level].filter(
          (p) => p && p.name && String(p.name).trim() && p.name !== "Player"
        )
      : [];
  });

  return next;
}

function loadChallengeData() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    const freshData = normalizeChallengeData(defaultChallengeData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData));
    return freshData;
  }

  try {
    return normalizeChallengeData(JSON.parse(saved));
  } catch (err) {
    console.error("Error parsing challenge data:", err);
    const freshData = normalizeChallengeData(defaultChallengeData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData));
    return freshData;
  }
}

function saveChallengeData() {
  challengeData = normalizeChallengeData(challengeData);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(challengeData));
}

const guestChallengeSavingLevels = new Set();
const guestChallengeSaveAgain = new Set();

function getLastSyncedGuestStats(level) {
  const cleanLevel = normalizeLevel(level);

  const raw = localStorage.getItem(
    `gomokuChallengeSynced_${cleanLevel}`
  );

  if (!raw) return null;

  try {
    const saved = JSON.parse(raw);

    if (!saved || typeof saved !== "object") {
      return null;
    }

    const revision = Number(saved.revision);

    if (
      !Number.isSafeInteger(revision) ||
      revision < 0
    ) {
      return null;
    }

    return {
      points: Number(saved.points) || 0,
      wins: Number(saved.wins) || 0,
      losses: Number(saved.losses) || 0,
      streak: Number(saved.streak) || 0,
      bestStreak:
        Number(
          saved.best_streak ?? saved.bestStreak
        ) || 0,
      revision
    };

  } catch (error) {
    console.warn(
      "Unable to read synced Challenge stats:",
      error.message
    );

    return null;
  }
  
}

// Calculer les changements depuis
// la dernière sauvegarde PostgreSQL.
function getGuestChallengeUnsyncedChanges(level) {
  const cleanLevel = normalizeLevel(level);

  const syncedStats =
    getLastSyncedGuestStats(cleanLevel);

  if (!syncedStats) {
    return null;
  }

  const localStats =
    getStatsForLevel(cleanLevel);

  return {
    level: cleanLevel,

    baseRevision: syncedStats.revision,

    pointsDifference:
      localStats.points - syncedStats.points,

    winsDifference:
      localStats.wins - syncedStats.wins,

    lossesDifference:
      localStats.losses - syncedStats.losses,

    localStreak: localStats.streak,

    localBestStreak: localStats.bestStreak
  };
}

function inspectGuestChallengeConflict(level, serverStats) {
  const cleanLevel = normalizeLevel(level);

  const synced =
    getLastSyncedGuestStats(cleanLevel);

  const changes =
    getGuestChallengeUnsyncedChanges(cleanLevel);

  if (!synced || !changes || !serverStats) {
    return null;
  }

  const serverWinsDifference =
    Number(serverStats.wins) - synced.wins;

  const serverLossesDifference =
    Number(serverStats.losses) - synced.losses;

  const differences = [
    serverWinsDifference,
    serverLossesDifference,
    changes.winsDifference,
    changes.lossesDifference
  ];

  if (
    !differences.every(
      value => Number.isSafeInteger(value) && value >= 0
    )
  ) {
    return null;
  }

  const serverGames =
    serverWinsDifference + serverLossesDifference;

  const localGames =
    changes.winsDifference + changes.lossesDifference;

  return {
    level: cleanLevel,
    serverGames,
    localGames,
    concurrentChanges:
      serverGames > 0 && localGames > 0
  };
}

async function saveGuestChallengeStats(level) {
  const cleanLevel = normalizeLevel(level);

  localStorage.setItem(
    `gomokuChallengePending_${cleanLevel}`,
    "1"
  );

  if (guestChallengeSavingLevels.has(cleanLevel)) {
    guestChallengeSaveAgain.add(cleanLevel);
    return;
  }

  guestChallengeSavingLevels.add(cleanLevel);

  try {
    const guestReady = window.gomokuGuestSessionReady;

    if (!guestReady) return;

    const guestId = await guestReady;

    if (!guestId) return;

    const stats = getStatsForLevel(cleanLevel);

    const response = await fetch(
      "/api/guest/challenge-stats",
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: getStoredChallengePlayerName(),
          level: Number(cleanLevel),
          revision: Number(stats.revision) || 0,
          points: stats.points,
          wins: stats.wins,
          losses: stats.losses,
          streak: stats.streak,
          bestStreak: stats.bestStreak
        })
      }
    );

    const result = await response.json();

    if (response.status === 409) {
  // Garder les statistiques PostgreSQL
  // pour résoudre le conflit ensuite.
  if (result.serverStats) {
    localStorage.setItem(
      `gomokuChallengeConflict_${cleanLevel}`,
      JSON.stringify(result.serverStats)
    );
  }

  console.warn(
    "⚠️ Conflit PostgreSQL : statistiques locales conservées.",
    result.serverStats
  );

  const conflictInfo =
  inspectGuestChallengeConflict(
    cleanLevel,
    result.serverStats
  );

if (conflictInfo?.concurrentChanges) {
  console.warn(
    "⚠️ Modifications simultanées détectées.",
    conflictInfo
  );
}

  return;
}

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Unable to save Guest stats"
      );
    }

    // Conserver la dernière version réellement
// enregistrée dans PostgreSQL.
if (result.stats) {
  localStorage.setItem(
    `gomokuChallengeSynced_${cleanLevel}`,
    JSON.stringify(result.stats)
  );
}

    // Conserver la nouvelle révision PostgreSQL
const serverRevision = Number(result.stats?.revision);

if (
  Number.isSafeInteger(serverRevision) &&
  serverRevision >= 0
) {
  const currentStats = getStatsForLevel(cleanLevel);

  currentStats.revision = Math.max(
    Number(currentStats.revision) || 0,
    serverRevision
  );

  saveChallengeData();
}

// Ne pas effacer l'indicateur si une
// nouvelle sauvegarde est en attente.
if (!guestChallengeSaveAgain.has(cleanLevel)) {
  localStorage.removeItem(
    `gomokuChallengePending_${cleanLevel}`
  );
}

console.log(
  "✅ Guest Challenge stats saved:",
  cleanLevel
);

  } catch (error) {

  // Signaler une sauvegarde non terminée
  localStorage.setItem(
    `gomokuChallengePending_${normalizeLevel(level)}`,
    "1"
  );

  console.error(
    "❌ Guest Challenge save error:",
    error.message
  );
} finally {
    guestChallengeSavingLevels.delete(cleanLevel);

    if (guestChallengeSaveAgain.has(cleanLevel)) {
      guestChallengeSaveAgain.delete(cleanLevel);
      saveGuestChallengeStats(cleanLevel);
    }
  }
}

async function retryPendingGuestChallengeSaves() {
  for (const level of VALID_LEVELS) {
    const pending = localStorage.getItem(
      `gomokuChallengePending_${level}`
    );

    if (pending === "1") {
      console.log(
        "🔄 Retry Guest Challenge save:",
        level
      );

      await saveGuestChallengeStats(level);
    }
  }
}

// Réessayer les sauvegardes lorsque
// la connexion Internet revient.
window.addEventListener("online", async () => {
  console.log("🌐 Internet connection restored");

  await retryPendingGuestChallengeSaves();
});

function getStoredChallengePlayerName() {
  const name = localStorage.getItem("challengePlayerName") || challengeData.playerName;
  return name && name.trim() ? name.trim() : "Player";
}

function getStoredChallengeAiLevel() {
  return normalizeLevel(localStorage.getItem("challengeLevel") || "2");
}

function getStoredChallengeFirstPlayer() {
  return localStorage.getItem("challengeFirstPlayer") || "human";
}

function getTypedPageName() {
  return pagePlayerNameInput ? pagePlayerNameInput.value.trim() : "";
}

function getChallengeParamsFromURL() {
  const params = new URLSearchParams(window.location.search);

  const level = params.get("level");
  const first = params.get("first");

  return {
    level: VALID_LEVELS.includes(level) ? level : null,
    first: ["human", "ai"].includes(first) ? first : null
  };
}

function getStatsForLevel(level = getCurrentChallengeLevel()) {
  const cleanLevel = normalizeLevel(level);
  if (!challengeData.levelStats[cleanLevel]) {
    challengeData.levelStats[cleanLevel] = {
      points: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      bestStreak: 0
    };
  }
  return challengeData.levelStats[cleanLevel];
}

function getCurrentStats() {
  return getStatsForLevel(getCurrentChallengeLevel());
}

function updateAvatar() {
  if (!challengeAvatar) return;
  const firstLetter = challengeData.playerName?.trim()?.charAt(0)?.toUpperCase() || "P";
  challengeAvatar.textContent = firstLetter;
}

function getLevelFromPoints(points) {
  if (points < 900) return "Beginner";
  if (points < 1100) return "Rookie";
  if (points < 1300) return "Intermediate";
  if (points < 1500) return "Advanced";
  if (points < 1800) return "Expert";
  return "Master 🔥";
}

function getLevelRange(points) {
  if (points < 900) return { min: 0, max: 900 };
  if (points < 1100) return { min: 900, max: 1100 };
  if (points < 1300) return { min: 1100, max: 1300 };
  if (points < 1500) return { min: 1300, max: 1500 };
  if (points < 1800) return { min: 1500, max: 1800 };
  return { min: 1800, max: 2200 };
}

function getProgressPercent(points) {
  const range = getLevelRange(points);
  const current = points - range.min;
  const total = range.max - range.min;
  return total <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}

function addHistory(title, details, level = getCurrentChallengeLevel()) {
  challengeData.history.push({
    title,
    details,
    level: normalizeLevel(level),
    date: Date.now()
  });

  if (challengeData.history.length > 20) {
    challengeData.history.shift();
  }
}

function getAiBonus(aiLevel) {
  const levelNum = parseInt(aiLevel, 10) || 2;

  if (levelNum === 2) return 5;
  if (levelNum === 3) return 10;
  if (levelNum === 4) return 15;
  if (levelNum >= 5) return 20;
  return 0;
}

// ✅ on ne reset PAS le joueur au refresh
function hydratePlayerNameIntoInput() {
  if (!pagePlayerNameInput) return;
  const storedName = getStoredChallengePlayerName();
  pagePlayerNameInput.value = storedName !== "Player" ? storedName : "";
}

function updateLocalLeaderboardName(oldName, newName) {
  const oldClean = String(oldName || "").trim();
  const newClean = String(newName || "").trim();

  if (!newClean) return;

  VALID_LEVELS.forEach((level) => {
    const board = Array.isArray(challengeData.leaderboards[level])
      ? [...challengeData.leaderboards[level]]
      : [];

    let renamed = false;

    const updated = board.map((player) => {
      if (
        oldClean &&
        player &&
        player.name &&
        player.name.toLowerCase() === oldClean.toLowerCase()
      ) {
        renamed = true;
        return {
          ...player,
          name: newClean
        };
      }
      return player;
    });

    if (!renamed) {
      const currentStats = getStatsForLevel(level);
      updated.push({
        name: newClean,
        points: currentStats.points || 0,
        online: level === getCurrentChallengeLevel() ? true : !!challengeData.online,
        level
      });
    }

  challengeData.leaderboards[level] = updated;
  });
}

function renderProfile() {
  updateAvatar();

  const hasRealPlayer =
    challengeData.playerName &&
    challengeData.playerName.trim() &&
    challengeData.playerName !== "Player";

  const stats = getCurrentStats();

  const displayPoints = hasRealPlayer ? stats.points : 0;
  const displayLevel = hasRealPlayer ? getLevelFromPoints(stats.points) : "Beginner";
  const displayWins = hasRealPlayer ? stats.wins : 0;
  const displayLosses = hasRealPlayer ? stats.losses : 0;
  const displayStreak = hasRealPlayer ? stats.streak : 0;
  const displayBestStreak = hasRealPlayer ? stats.bestStreak : 0;
  const displayProgress = hasRealPlayer ? getProgressPercent(stats.points) : 0;

  if (challengePlayerName) {
    challengePlayerName.textContent = hasRealPlayer ? challengeData.playerName : "Player";
  }

  if (challengePlayerStatus) {
    challengePlayerStatus.innerHTML = hasRealPlayer
      ? `<span class="dot green"></span> Online`
      : `<span class="dot red"></span> Offline`;
  }

  if (playerPointsEl) playerPointsEl.textContent = displayPoints;
  if (playerLevelEl) playerLevelEl.textContent = displayLevel;
  if (playerWinsEl) playerWinsEl.textContent = displayWins;
  if (playerLossesEl) playerLossesEl.textContent = displayLosses;
  if (playerStreakEl) playerStreakEl.textContent = displayStreak;
  if (playerBestStreakEl) playerBestStreakEl.textContent = displayBestStreak;
  if (progressPercentEl) progressPercentEl.textContent = `${displayProgress}%`;
  if (progressFillEl) progressFillEl.style.width = `${displayProgress}%`;
}

function ensureLeaderboardTabs() {
  const container = document.getElementById("leaderboardLevelTabs");
  if (!container) return;

  container.innerHTML = "";

  VALID_LEVELS.forEach((level) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "leaderboard-level-btn";

    if (getSelectedLeaderboardLevel() === level) {
      btn.classList.add("active");
    }

    btn.textContent = `Level ${level}`;
    btn.addEventListener("click", () => {
      setSelectedLeaderboardLevel(level);
      ensureLeaderboardTabs();
    });

    container.appendChild(btn);
  });
}

function renderLeaderboard() {
  if (!leaderboardList) return;

  ensureLeaderboardTabs();
  leaderboardList.innerHTML = "";

  const selectedLevel = getSelectedLeaderboardLevel();
  const levelBoard = Array.isArray(challengeData.leaderboards[selectedLevel])
    ? challengeData.leaderboards[selectedLevel]
    : [];

  const sorted = [...levelBoard]
    .filter((player) => player && player.name && player.name.trim() && player.name !== "Player")
    .sort((a, b) => b.points - a.points);

  if (!sorted.length) {
    leaderboardList.innerHTML = `<div class="empty-text">No players yet in Level ${selectedLevel}</div>`;
    return;
  }

  sorted.forEach((player, index) => {
    const item = document.createElement("div");
    item.className = "leaderboard-item";

    item.innerHTML = `
      <div class="lb-left">
        <div class="rank-badge">${index + 1}</div>
        <div>
          <div class="lb-name">${player.name}</div>
          <div class="lb-sub">
            <span class="dot ${player.online ? "green" : "red"}"></span>
            ${player.online ? "Online" : "Offline"} • Level ${selectedLevel}
          </div>
        </div>
      </div>
      <div class="lb-points">${player.points} pts</div>
    `;

    leaderboardList.appendChild(item);
  });
}

function renderHistory() {
  if (!historyList) return;

  historyList.innerHTML = "";

  if (!challengeData.history.length) {
    historyList.innerHTML = `<div class="empty-text">No challenge history yet</div>`;
    return;
  }

  challengeData.history
    .slice()
    .reverse()
    .forEach((entry) => {
      const item = document.createElement("div");
      item.className = "history-item";
      item.innerHTML = `
        <strong>${entry.title}</strong>
        <span>${entry.details}</span>
      `;
      historyList.appendChild(item);
    });
}

function renderAll() {
  renderProfile();
  renderLeaderboard();
  renderHistory();
  saveChallengeData();
}

function registerChallengeSocketListeners() {
  const challengeSocket = getChallengeSocket();
  if (!challengeSocket) return;

  if (window.__challengeLeaderboardListenerBound) return;
  window.__challengeLeaderboardListenerBound = true;

  challengeSocket.on("challengeLeaderboard", ({ level, leaderboard }) => {
    const cleanLevel = normalizeLevel(level);
    if (!Array.isArray(leaderboard)) return;

// Ne pas effacer le classement local
// lorsque le serveur envoie une liste vide.
if (
  leaderboard.length === 0 &&
  Array.isArray(challengeData.leaderboards[cleanLevel]) &&
  challengeData.leaderboards[cleanLevel].length > 0
) {
  console.log(
    `Level ${cleanLevel}: local leaderboard preserved`
  );
  return;
}

    challengeData.leaderboards[cleanLevel] = leaderboard.map((player) => ({
      name: player.name,
      points: player.points,
      online: !!player.online,
      level: cleanLevel
    }));

    saveChallengeData();
    renderLeaderboard();
  });
}

async function fetchChallengeLeaderboardFromServer(level = getSelectedLeaderboardLevel()) {
  try {
    const cleanLevel = normalizeLevel(level);
    const res = await fetch(`/api/challenge/leaderboard?level=${cleanLevel}`);
    const data = await res.json();

    if (!data.success || !Array.isArray(data.leaderboard)) return;

  challengeData.leaderboards[cleanLevel] = data.leaderboard.map((player) => ({
  playerId: player.playerId,
  name: player.name,
  points: player.points,
  online: !!player.online,
  level: cleanLevel
}));

    saveChallengeData();
    renderLeaderboard();
  } catch (err) {
    console.error("Failed to fetch challenge leaderboard:", err);
  }
}

async function fetchAllLeaderboardsFromServer() {
  try {
    const res = await fetch("/api/challenge/leaderboards");
    const data = await res.json();

    if (!data.success || !data.leaderboards) return;

    VALID_LEVELS.forEach((level) => {

  const serverBoard = data.leaderboards[level];

  // Ne pas effacer les anciens classements locaux
  // si le serveur retourne une liste vide.
  if (
    !Array.isArray(serverBoard) ||
    serverBoard.length === 0
  ) {
    console.log(
      `Level ${level}: keeping local leaderboard`
    );
    return;
  }

  challengeData.leaderboards[level] =
    serverBoard.map((player) => ({
      playerId: player.playerId,
      name: player.name,
      points: player.points,
      online: !!player.online,
      level
    }));

});

    saveChallengeData();
    renderLeaderboard();
  } catch (err) {
    console.error("Failed to fetch all challenge leaderboards:", err);
  }
}

async function syncCurrentPlayerToServer() {
  try {
    const playerName = (
      challengeData.playerName ||
      localStorage.getItem("challengePlayerName") ||
      localStorage.getItem("playerName") ||
      ""
    ).trim();

    if (!playerName || playerName === "Player") return;

    const level = getCurrentChallengeLevel();
    const stats = getStatsForLevel(level);

    await fetch("/api/challenge/leaderboard/upsert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
  playerId: getChallengePlayerId(),
  name: playerName,
  points: stats.points || 0,
  online: true,
  level
})
    });

    await fetchChallengeLeaderboardFromServer(level);
  } catch (err) {
    console.error("Failed to sync player to server:", err);
  }
}

function syncPointsToServer(level = getCurrentChallengeLevel()) {
  const challengeSocket = getChallengeSocket();
  const cleanLevel = normalizeLevel(level);
  const stats = getStatsForLevel(cleanLevel);

  if (
    challengeSocket &&
    challengeData.playerName &&
    challengeData.playerName.trim() &&
    challengeData.playerName !== "Player"
  ) {
    challengeSocket.emit("updateChallengePoints", {
  playerId: getChallengePlayerId(),
  name: challengeData.playerName,
  points: stats.points || 0,
  level: cleanLevel
});
  }
}

function applyLastChallengeResult() {
  const raw = localStorage.getItem("challengeResult");
  if (!raw) return;

  try {
    const result = JSON.parse(raw);

    const resultLevel = normalizeLevel(result.aiLevel || getStoredChallengeAiLevel());
    const stats = getStatsForLevel(resultLevel);

    let gain = 20;
    if (result.aiStarted) gain += 10;
    gain += getAiBonus(result.aiLevel);

    const winnerName = String(result.winnerName || "").trim();
    const mode = String(result.mode || "").trim();

    if (mode && mode !== "challenge") {
      localStorage.removeItem("challengeResult");
      return;
    }

    const humanName = (challengeData.playerName || getStoredChallengePlayerName() || "Player").trim();
    const aiWon = winnerName === "AI" || winnerName === "White";
    const humanWon = winnerName && winnerName !== "AI" && winnerName !== "White";

    if (!winnerName || humanWon) {
      stats.points += gain;
      stats.wins += 1;
      stats.streak += 1;
      if (stats.streak > stats.bestStreak) {
        stats.bestStreak = stats.streak;
      }

      addHistory(
        "🔥 Real Challenge Victory",
        `+${gain} pts • Level ${resultLevel}${result.aiStarted ? " • AI started first" : ""}`,
        resultLevel
      );
    } else if (aiWon && winnerName !== humanName) {
      let loss = 10;
      if (parseInt(resultLevel, 10) >= 5) loss = 15;

      stats.points -= loss;
      if (stats.points < 0) stats.points = 0;
      stats.losses += 1;
      stats.streak = 0;

      addHistory(
        "❌ Real Challenge Defeat",
        `-${loss} pts • Level ${resultLevel}`,
        resultLevel
      );
    }

    localStorage.removeItem("challengeResult");
saveChallengeData();

// Sauvegarder les nouveaux points dans PostgreSQL
saveGuestChallengeStats(resultLevel);

syncPointsToServer(resultLevel);
  } catch (err) {
    console.error("Error reading challengeResult:", err);
    localStorage.removeItem("challengeResult");
  }
}

function handleWin({ aiStarted = false, onlineGame = false, fastWin = false, aiLevel = null } = {}) {
  const level = normalizeLevel(aiLevel || getCurrentChallengeLevel());
  const stats = getStatsForLevel(level);

  let gain = 20;

  if (aiStarted) gain += 10;
  if (onlineGame) gain += 10;
  if (fastWin) gain += 5;
  if (aiLevel) gain += getAiBonus(aiLevel);

  stats.points += gain;
  stats.wins += 1;
  stats.streak += 1;

  if (stats.streak > stats.bestStreak) {
    stats.bestStreak = stats.streak;
  }

  addHistory(
    "✅ Victory",
    `+${gain} pts • Level ${level}${aiStarted ? " • AI started first" : ""}${onlineGame ? " • Online match" : ""}${fastWin ? " • Fast win" : ""}`,
    level
  );

  renderAll();
  syncPointsToServer(level);
  saveGuestChallengeStats(level);
}

function handleLoss({ onlineGame = false, aiLevel = null } = {}) {
  const level = normalizeLevel(aiLevel || getCurrentChallengeLevel());
  const stats = getStatsForLevel(level);

  let loss = 10;

  if (onlineGame) loss = 15;
  if (aiLevel && parseInt(aiLevel, 10) >= 5) loss = 15;

  stats.points -= loss;
  if (stats.points < 0) stats.points = 0;

  stats.losses += 1;
  stats.streak = 0;

  addHistory(
    "❌ Defeat",
    `-${loss} pts • Level ${level}${onlineGame ? " • Online match" : ""}`,
    level
  );

  renderAll();
  syncPointsToServer(level);
  saveGuestChallengeStats(level);
}

function startChallenge() {
  const typedName = getTypedPageName();

  if (!typedName) {
    alert("Please enter your name first.");
    if (pagePlayerNameInput) pagePlayerNameInput.focus();
    return;
  }

  const oldName = challengeData.playerName;

  localStorage.setItem("challengePlayerName", typedName);
  localStorage.setItem("playerName", typedName);

  challengeData.playerName = typedName;
  challengeData.online = true;
  challengeData.selectedLeaderboardLevel = getCurrentChallengeLevel();

  updateLocalLeaderboardName(oldName, typedName);

  localStorage.setItem(
    "challengeLevel",
    pageAiLevelSelect ? pageAiLevelSelect.value : getStoredChallengeAiLevel()
  );
  localStorage.setItem(
    "challengeFirstPlayer",
    pageFirstPlayerSelect ? pageFirstPlayerSelect.value : getStoredChallengeFirstPlayer()
  );

  renderAll();
  syncCurrentPlayerToServer();

  const challengeSocket = getChallengeSocket();
  if (challengeSocket) {
    challengeSocket.emit("registerChallengePlayer", {
  playerId: getChallengePlayerId(),
  name: typedName,
  level: getCurrentChallengeLevel()
});
  }

  if (typeof resetGame === "function") {
    resetGame();
  }
}

function resetRoundSyncFlag() {
  window.__challengeRoundApplied = false;
}

function patchChallengeGameSync() {
  if (typeof window.showWinner !== "function") return;
  if (window.__challengeShowWinnerPatched) return;
  window.__challengeShowWinnerPatched = true;

  const originalShowWinner = window.showWinner;

  window.showWinner = function patchedShowWinner(winnerName) {
    const alreadyApplied = !!window.__challengeRoundApplied;

    const currentAiLevel = pageAiLevelSelect ? pageAiLevelSelect.value : getStoredChallengeAiLevel();
    const aiStarted =
      (pageFirstPlayerSelect ? pageFirstPlayerSelect.value : getStoredChallengeFirstPlayer()) === "ai";

    const humanName =
      typeof window.currentBlackName === "string" && window.currentBlackName.trim()
        ? window.currentBlackName.trim()
        : getStoredChallengePlayerName();

    const whiteName =
      typeof window.currentWhiteName === "string" && window.currentWhiteName.trim()
        ? window.currentWhiteName.trim()
        : "White";

    const isAiPageGame = pageModeSelect && pageModeSelect.value === "ai";

    if (!alreadyApplied && isAiPageGame) {
      if (winnerName === humanName) {
        handleWin({
          aiStarted,
          onlineGame: false,
          fastWin: false,
          aiLevel: currentAiLevel
        });
        window.__challengeRoundApplied = true;
      } else if (winnerName === whiteName || winnerName === "AI" || winnerName === "White") {
        handleLoss({
          onlineGame: false,
          aiLevel: currentAiLevel
        });
        window.__challengeRoundApplied = true;
      }
    }

    return originalShowWinner.apply(this, arguments);
  };
}

function bindChallengePageControls() {
  if (!isChallengePage) return;

  hydratePlayerNameIntoInput();
  renderAll();

  function saveFinalChallengeName() {
    if (!pagePlayerNameInput) return;

    const name = pagePlayerNameInput.value.trim();
    const oldName = challengeData.playerName;

    if (name) {
      localStorage.setItem("challengePlayerName", name);
      localStorage.setItem("playerName", name);

      challengeData.playerName = name;
      challengeData.online = true;

      // ✅ on garde les mêmes points du navigateur
      updateLocalLeaderboardName(oldName, name);
    } else {
      localStorage.removeItem("challengePlayerName");
      challengeData.playerName = "Player";
      challengeData.online = false;
    }

    renderAll();
    syncCurrentPlayerToServer();

    const challengeSocket = getChallengeSocket();
    if (challengeSocket && name && name !== "Player") {
      challengeSocket.emit("registerChallengePlayer", {
  playerId: getChallengePlayerId(),
  name: name,
  level: getCurrentChallengeLevel()
});
    }
  }

  if (pagePlayerNameInput) {
    pagePlayerNameInput.addEventListener("input", () => {
      const name = pagePlayerNameInput.value.trim();

      if (name) {
        challengeData.playerName = name;
        challengeData.online = true;
      } else {
        challengeData.playerName = "Player";
        challengeData.online = false;
      }

      updateAvatar();
      renderProfile();
    });

    pagePlayerNameInput.addEventListener("change", saveFinalChallengeName);
    pagePlayerNameInput.addEventListener("blur", saveFinalChallengeName);

    pagePlayerNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        saveFinalChallengeName();
        pagePlayerNameInput.blur();
      }
    });
  }

  if (pageAiLevelSelect) {
    const storedLevel = getStoredChallengeAiLevel();
    if (VALID_LEVELS.includes(storedLevel)) {
      pageAiLevelSelect.value = storedLevel;
    }

    // ✅ si level 1 existe encore dans le HTML, on le retire visuellement
    Array.from(pageAiLevelSelect.options).forEach((opt) => {
      if (opt.value === "1") {
        opt.remove();
      }
    });

    pageAiLevelSelect.addEventListener("change", async () => {
      const cleanLevel = normalizeLevel(pageAiLevelSelect.value);

      localStorage.setItem("challengeLevel", cleanLevel);
      challengeData.selectedLeaderboardLevel = cleanLevel;

      resetRoundSyncFlag();
      renderAll();

      await fetchChallengeLeaderboardFromServer(cleanLevel);

      const challengeSocket = getChallengeSocket();
      const name = (challengeData.playerName || "").trim();

      if (challengeSocket && name && name !== "Player") {
        challengeSocket.emit("registerChallengePlayer", {
  playerId: getChallengePlayerId(),
  name: name,
  level: getCurrentChallengeLevel()
});
      }
    });
  }

  if (pageFirstPlayerSelect) {
    pageFirstPlayerSelect.value = getStoredChallengeFirstPlayer();

    pageFirstPlayerSelect.addEventListener("change", () => {
      localStorage.setItem("challengeFirstPlayer", pageFirstPlayerSelect.value);
      resetRoundSyncFlag();
    });
  }

  if (pageResetButton) {
    pageResetButton.addEventListener("click", () => {
      resetRoundSyncFlag();
    });
  }

  if (isStandaloneChallengePage && pageModeSelect) {
  pageModeSelect.value = "ai";
}
}

if (startChallengeBtn) {
  startChallengeBtn.addEventListener("click", startChallenge);
}

if (simulateWinBtn) {
  simulateWinBtn.addEventListener("click", () => {
    handleWin({
      aiStarted: false,
      onlineGame: false,
      fastWin: false,
      aiLevel: getStoredChallengeAiLevel()
    });
  });
}

if (simulateLossBtn) {
  simulateLossBtn.addEventListener("click", () => {
    handleLoss({
      onlineGame: false,
      aiLevel: getStoredChallengeAiLevel()
    });
  });
}

if (simulateHardWinBtn) {
  simulateHardWinBtn.addEventListener("click", () => {
    handleWin({
      aiStarted: true,
      onlineGame: false,
      fastWin: true,
      aiLevel: getStoredChallengeAiLevel()
    });
  });
}

if (resetChallengeDataBtn) {
  resetChallengeDataBtn.addEventListener("click", async () => {
    const currentName = (challengeData.playerName || "").trim();
    const currentLevel = getCurrentChallengeLevel();

    if (!currentName || currentName === "Player") {
      alert("Please enter your player name first.");
      return;
    }

    const ok = confirm`(Reset stats for ${currentName} in Level ${currentLevel}?)`;
    if (!ok) return;

    challengeData.levelStats[currentLevel] = {
      points: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      bestStreak: 0
    };

    challengeData.history = challengeData.history.filter(
      (entry) => normalizeLevel(entry.level) !== currentLevel
    );

    saveChallengeData();
renderAll();
resetRoundSyncFlag();

// Enregistrer également la remise à zéro dans PostgreSQL
await saveGuestChallengeStats(currentLevel);

    try {
      await fetch("/api/challenge/leaderboard/upsert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
  playerId: getChallengePlayerId(),
  name: currentName,
  points: 0,
  online: true,
  level: currentLevel
})
      });

      await fetchChallengeLeaderboardFromServer(currentLevel);
    } catch (err) {
      console.error("Failed to reset current player stats on server:", err);
    }
  });
}

if (shareChallengeBtn) {
  shareChallengeBtn.addEventListener("click", async () => {
    const level = getStoredChallengeAiLevel();
    const first = getStoredChallengeFirstPlayer();

    'https://gomoku-morpion-5-online.onrender.com/download.html/index.html?mode=ai&challenge=1&level=${level}&first=${first}';

    const shareText = `🟢 I'm dominating Gomoku right now.

🧠 Challenge your brain.
😏 Think you're smarter?

Join the challenge:
${shareUrl}`;

    try {
      const imageBlob = await generateChallengeImage();

      if (!imageBlob) return;

      const file = new File([imageBlob], "challenge.png", {
        type: "image/png"
      });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "Gomoku Challenge",
          text: shareText,
          url: shareUrl,
          files: [file]
        });
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(imageBlob);
        link.download = "challenge.png";
        link.click();

        await navigator.clipboard.writeText(shareText);
        alert("Image downloaded + text copied 🚀");
      }
    } catch (err) {
      console.log(err);
    }
  });
}

async function generateChallengeImage() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = 1080;
  canvas.height = 1080;

  ctx.fillStyle = "#f7efd8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";

  ctx.fillStyle = "#edf0e3";
  ctx.font = "bold 62px Arial";
  ctx.fillText("GOMOKU", 540, 120);

  ctx.fillStyle = "#777";
  ctx.font = "26px Arial";
  ctx.fillText("Morpion à 5 • Five in a row", 540, 165);

  ctx.fillStyle = "#2563eb";
  ctx.font = "bold 34px Arial";
  ctx.fillText("Challenge your brain 🧠", 540, 220);

  ctx.fillStyle = "#111";
  ctx.font = "30px Arial";
  ctx.fillText("Think you're smarter? 😏", 540, 265);

  const selectedLevel = getSelectedLeaderboardLevel();

  ctx.fillStyle = "#6b7280";
  ctx.font = "bold 28px Arial";
  ctx.fillText(`TOP PLAYERS • LEVEL ${selectedLevel}`, 540, 330);

  const topPlayers = [...(challengeData.leaderboards[selectedLevel] || [])]
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);

  topPlayers.forEach((player, i) => {
    const y = 420 + i * 80;

    ctx.textAlign = "left";

    ctx.beginPath();
    ctx.arc(300, y - 10, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#22c55e";
    ctx.fill();

    ctx.fillStyle = "#111";
    ctx.font = "bold 30px Arial";
    ctx.fillText(`#${i + 1} ${player.name}`, 330, y);

    ctx.fillStyle = "#6b7280";
    ctx.font = "24px Arial";
    ctx.fillText(`${player.points} pts`, 700, y);
  });

  const logo = new Image();
  logo.src = "logo.png";

  await new Promise((resolve) => {
    logo.onload = resolve;
    logo.onerror = resolve;
  });

  const logoSize = 220;

  if (logo.complete && logo.naturalWidth > 0) {
    ctx.drawImage(
      logo,
      canvas.width / 2 - logoSize / 2,
      650,
      logoSize,
      logoSize
    );
  }

  ctx.textAlign = "center";

  ctx.fillStyle = "#111";
  ctx.font = "bold 28px Arial";
  ctx.fillText(`Join the Level ${selectedLevel} challenge 🔥`, 540, 910);

  ctx.fillStyle = "#2563eb";
  ctx.font = "bold 26px Arial";
  ctx.fillText("gomoku-morpion-5-online.onrender.com", 540, 960);

  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
}

function bindCollapseCards() {
  document.querySelectorAll(".collapse-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".collapsible-card");
      if (card) {
        card.classList.toggle("open");
      }
    });
  });
}

window.handleWin = handleWin;
window.handleLoss = handleLoss;
window.renderAllChallenge = renderAll;
window.renderProfileChallenge = renderProfile;
window.renderLeaderboardChallenge = renderLeaderboard;
window.renderHistoryChallenge = renderHistory;

bindChallengePageControls();

const urlParams = getChallengeParamsFromURL();

if (urlParams.level && pageAiLevelSelect) {
  pageAiLevelSelect.value = urlParams.level;
  localStorage.setItem("challengeLevel", urlParams.level);
  challengeData.selectedLeaderboardLevel = normalizeLevel(urlParams.level);
}

if (urlParams.first && pageFirstPlayerSelect) {
  pageFirstPlayerSelect.value = urlParams.first;
  localStorage.setItem("challengeFirstPlayer", urlParams.first);
}

renderAll();

patchChallengeGameSync();
resetRoundSyncFlag();
bindCollapseCards();

const isLocal =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1";

const isAdmin =
  localStorage.getItem("adminMode") === "true";

if (isLocal || isAdmin) {
  document.querySelectorAll(".dev-only").forEach((el) => {
    el.style.display = "block";
  });
}

document.addEventListener("DOMContentLoaded", async () => {

  // ✅ Initialiser une seule fois la session Guest
  window.gomokuGuestSessionReady =
    initializeGomokuGuestSession();

  await window.gomokuGuestSessionReady;

// Charger les anciennes statistiques PostgreSQL
await loadGuestChallengeStats();

// Appliquer le résultat de la dernière partie
// après la récupération des anciens points
applyLastChallengeResult();

// Conserver les fonctions Challenge
registerChallengeSocketListeners();

  await fetchAllLeaderboardsFromServer();
  await retryPendingGuestChallengeSaves();

  const playerName = (
    challengeData.playerName ||
    localStorage.getItem("challengePlayerName") ||
    localStorage.getItem("playerName") ||
    ""
  ).trim();

  const level = getCurrentChallengeLevel();
  const challengeSocket = getChallengeSocket();

  if (challengeSocket && playerName && playerName !== "Player") {
    challengeSocket.emit("registerChallengePlayer", {
  playerId: getChallengePlayerId(),
  name: playerName,
  level
});
  }

  await syncCurrentPlayerToServer();

  renderProfile();
  renderLeaderboard();
  renderHistory();
})