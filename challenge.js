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
const CHALLENGE_RESET_VERSION_KEY = "gomokuChallengeResetVersion";
const CHALLENGE_LAST_SOCKET_RESET_KEY = "gomokuChallengeLastSocketResetAt";

const isStandaloneChallengePage =
  !!document.querySelector(".challenge-page");

const isIntegratedChallenge =
  !!document.getElementById("aiChallengePanel");

const isChallengePage =
  isStandaloneChallengePage || isIntegratedChallenge;

const VALID_LEVELS = ["1", "2", "3", "4", "5"];

/* =========================
   BASIC HELPERS
========================= */

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function normalizeLevel(level) {
  const clean = String(level || "").trim();
  return VALID_LEVELS.includes(clean) ? clean : "1";
}

function createEmptyLevelStats() {
  return {
    "1": { points: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, revision: 0 },
    "2": { points: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, revision: 0 },
    "3": { points: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, revision: 0 },
    "4": { points: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, revision: 0 },
    "5": { points: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, revision: 0 }
  };
}

function createEmptyLeaderboards() {
  return {
    "1": [],
    "2": [],
    "3": [],
    "4": [],
    "5": []
  };
}

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

function getExistingOnlinePlayerId() {
  return String(
    localStorage.getItem("onlinePlayerId") || ""
  ).trim();
}

function getChallengeSocket() {
  return typeof socket !== "undefined" ? socket : null;
}

/* =========================
   DEFAULT DATA
========================= */

const defaultChallengeData = {
  browserPlayerId: getChallengePlayerId(),

  playerName:
    localStorage.getItem("challengePlayerName") ||
    localStorage.getItem("playerName") ||
    "Player",

  online: false,
  selectedLeaderboardLevel: "1",
  levelStats: createEmptyLevelStats(),
  history: [],
  leaderboards: createEmptyLeaderboards()
};

/* =========================
   DATA NORMALIZATION
========================= */

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
      revision:
        Number.isSafeInteger(stat.revision) && stat.revision >= 0
          ? stat.revision
          : 0
    };
  });

  return next;
}

function migrateLegacyData(data) {
  const next = { ...data };

  if (!next.levelStats || typeof next.levelStats !== "object") {
    next.levelStats = createEmptyLevelStats();
  }

  const hasLegacyPoints =
    Number.isFinite(next.points) ||
    Number.isFinite(next.wins) ||
    Number.isFinite(next.losses) ||
    Number.isFinite(next.streak) ||
    Number.isFinite(next.bestStreak);

  const hasAnyLevelData = VALID_LEVELS.some((level) => {
    const stat = next.levelStats[level];

    return (
      stat &&
      (stat.points ||
        stat.wins ||
        stat.losses ||
        stat.streak ||
        stat.bestStreak)
    );
  });

  if (hasLegacyPoints && !hasAnyLevelData) {
    const targetLevel = normalizeLevel(
      localStorage.getItem("challengeLevel") ||
        next.selectedLeaderboardLevel ||
        "1"
    );

    next.levelStats[targetLevel] = {
      points: Number.isFinite(next.points) ? next.points : 0,
      wins: Number.isFinite(next.wins) ? next.wins : 0,
      losses: Number.isFinite(next.losses) ? next.losses : 0,
      streak: Number.isFinite(next.streak) ? next.streak : 0,
      bestStreak: Number.isFinite(next.bestStreak)
        ? next.bestStreak
        : 0,
      revision: 0
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
  let next = {
    ...deepClone(defaultChallengeData),
    ...(data || {})
  };

  next = migrateLegacyData(next);
  next = ensureLeaderboardsShape(next);
  next = ensureLevelStatsShape(next);

  next.playerName =
    typeof next.playerName === "string" && next.playerName.trim()
      ? next.playerName.trim()
      : "Player";

  next.online = !!next.online;
  next.history = Array.isArray(next.history)
    ? next.history
    : [];

  next.selectedLeaderboardLevel = normalizeLevel(
    next.selectedLeaderboardLevel || "1"
  );

  VALID_LEVELS.forEach((level) => {
    next.leaderboards[level] = Array.isArray(
      next.leaderboards[level]
    )
      ? next.leaderboards[level].filter(
          (player) =>
            player &&
            player.name &&
            String(player.name).trim() &&
            player.name !== "Player"
        )
      : [];
  });

  return next;
}

function loadChallengeData() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    const freshData = normalizeChallengeData(
      defaultChallengeData
    );

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(freshData)
    );

    return freshData;
  }

  try {
    return normalizeChallengeData(
      JSON.parse(saved)
    );
  } catch (error) {
    console.error(
      "Error parsing challenge data:",
      error
    );

    const freshData = normalizeChallengeData(
      defaultChallengeData
    );

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(freshData)
    );

    return freshData;
  }
}

let challengeData = loadChallengeData();

function saveChallengeData() {
  challengeData = normalizeChallengeData(
    challengeData
  );

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(challengeData)
  );
}

function buildFreshChallengeData() {
  return normalizeChallengeData({
    browserPlayerId: getChallengePlayerId(),
    playerName: "Player",
    online: false,
    selectedLeaderboardLevel: "1",
    levelStats: createEmptyLevelStats(),
    history: [],
    leaderboards: createEmptyLeaderboards()
  });
}

/* =========================
   CURRENT LEVEL / PLAYER
========================= */

function getCurrentChallengeLevel() {
  return normalizeLevel(
    (pageAiLevelSelect && pageAiLevelSelect.value) ||
      localStorage.getItem("challengeLevel") ||
      challengeData.selectedLeaderboardLevel ||
      "1"
  );
}

function getSelectedLeaderboardLevel() {
  return normalizeLevel(
    challengeData.selectedLeaderboardLevel ||
      getCurrentChallengeLevel()
  );
}

function setSelectedLeaderboardLevel(level) {
  challengeData.selectedLeaderboardLevel =
    normalizeLevel(level);

  saveChallengeData();
  renderLeaderboard();
}

function getStoredChallengePlayerName() {
  const name =
    localStorage.getItem("challengePlayerName") ||
    challengeData.playerName;

  return name && name.trim()
    ? name.trim()
    : "Player";
}

function getStoredChallengeAiLevel() {
  return normalizeLevel(
    localStorage.getItem("challengeLevel") || "1"
  );
}

function getStoredChallengeFirstPlayer() {
  return (
    localStorage.getItem("challengeFirstPlayer") ||
    "human"
  );
}

function getTypedPageName() {
  return pagePlayerNameInput
    ? pagePlayerNameInput.value.trim()
    : "";
}

function getChallengeParamsFromURL() {
  const params = new URLSearchParams(
    window.location.search
  );

  const level = params.get("level");
  const first = params.get("first");
  const challenge = params.get("challenge");

  return {
    level: VALID_LEVELS.includes(level)
      ? level
      : null,

    first: ["human", "ai"].includes(first)
      ? first
      : null,

    challenge:
      challenge === "1" ||
      challenge === "true"
  };
}

function getStatsForLevel(
  level = getCurrentChallengeLevel()
) {
  const cleanLevel = normalizeLevel(level);

  if (!challengeData.levelStats[cleanLevel]) {
    challengeData.levelStats[cleanLevel] = {
      points: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      bestStreak: 0,
      revision: 0
    };
  }

  return challengeData.levelStats[cleanLevel];
}

function getCurrentStats() {
  return getStatsForLevel(
    getCurrentChallengeLevel()
  );
}

/* =========================
   GOMOKU GUEST SESSION
========================= */

async function initializeGomokuGuestSession() {
  try {
    const response = await fetch(
      "/api/guest/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({})
      }
    );

    if (!response.ok) {
      throw new Error(
        `Guest session error: ${response.status}`
      );
    }

    const data = await response.json();

    if (!data.success || !data.guestId) {
      throw new Error(
        "Invalid guest session"
      );
    }

    window.gomokuGuestId = data.guestId;

    console.log(
      "✅ Gomoku Guest session active"
    );

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
   GLOBAL RESET HELPERS
========================= */

const guestChallengeSavingLevels = new Set();
const guestChallengeSaveAgain = new Set();
const guestChallengeSaveControllers = new Map();

let challengeResetEpoch = 0;
let challengeResetInProgress = false;

function clearChallengeLocalStorageForGlobalReset() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem("challengeLevel");
  localStorage.removeItem("challengeResult");
  localStorage.removeItem("challengePlayerId");
  localStorage.removeItem("challengePlayerName");
  localStorage.removeItem("playerName");

  VALID_LEVELS.forEach((level) => {
    localStorage.removeItem(
      `gomokuChallengePending_${level}`
    );

    localStorage.removeItem(
      `gomokuChallengeSynced_${level}`
    );

    localStorage.removeItem(
      `gomokuChallengeConflict_${level}`
    );
  });
}

function abortChallengeSavesForReset() {
  guestChallengeSaveAgain.clear();

  for (const controller of guestChallengeSaveControllers.values()) {
    try {
      controller.abort();
    } catch (_) {
      // Nothing to do.
    }
  }

  guestChallengeSaveControllers.clear();
  guestChallengeSavingLevels.clear();
}

async function applyGlobalChallengeResetInPlace(
  payload = {},
  {
    refreshLeaderboards = true,
    reinitializeGuestSession = false
  } = {}
) {
  if (challengeResetInProgress) {
    return true;
  }

  challengeResetInProgress = true;
  challengeResetEpoch += 1;

  try {
    console.log(
      "♻️ Applying global Challenge reset in place",
      payload
    );

    abortChallengeSavesForReset();
    clearChallengeLocalStorageForGlobalReset();

    const resetVersion = Number(
      payload.version ?? payload.resetVersion
    );

    if (
      Number.isSafeInteger(resetVersion) &&
      resetVersion >= 0
    ) {
      localStorage.setItem(
        CHALLENGE_RESET_VERSION_KEY,
        String(resetVersion)
      );
    }

    const resetAt = Number(
      payload.resetAt
    );

    if (
      Number.isFinite(resetAt) &&
      resetAt > 0
    ) {
      localStorage.setItem(
        CHALLENGE_LAST_SOCKET_RESET_KEY,
        String(resetAt)
      );
    }

    getChallengePlayerId();

    localStorage.setItem(
      "challengeLevel",
      "1"
    );

    challengeData = buildFreshChallengeData();
    challengeData.selectedLeaderboardLevel = "1";
    challengeData.playerName = "Player";
    challengeData.online = false;

    if (pageAiLevelSelect) {
      pageAiLevelSelect.value = "1";
      pageAiLevelSelect.disabled = false;
    }

    if (pagePlayerNameInput) {
      pagePlayerNameInput.value = "";
    }

    resetRoundSyncFlag();
    window.__rankedChallengeActive = false;

    saveChallengeData();

    renderProfile();
    renderLeaderboard();
    renderHistory();
    ensureLeaderboardTabs();

    if (reinitializeGuestSession) {
      window.gomokuGuestSessionReady =
        initializeGomokuGuestSession();

      await window.gomokuGuestSessionReady;
    }

    if (refreshLeaderboards) {
      await fetchAllLeaderboardsFromServer();
    }

    renderProfile();
    renderLeaderboard();
    renderHistory();

    console.log(
      "✅ Challenge reset applied without page reload"
    );

    return true;
  } catch (error) {
    console.error(
      "❌ Global Challenge reset error:",
      error.message
    );

    return false;
  } finally {
    challengeResetInProgress = false;
  }
}

async function checkGlobalChallengeReset() {
  try {
    const response = await fetch(
      "/api/challenge/reset-version",
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json();

    const serverVersion =
      Number(data.version) || 0;

    const localVersion =
      Number(
        localStorage.getItem(
          CHALLENGE_RESET_VERSION_KEY
        )
      ) || 0;

    if (serverVersion <= localVersion) {
      return false;
    }

    await applyGlobalChallengeResetInPlace(
      {
        version: serverVersion
      },
      {
        refreshLeaderboards: false,
        reinitializeGuestSession: false
      }
    );

    console.log(
      "✅ Challenge reset version applied:",
      serverVersion
    );

    return true;
  } catch (error) {
    console.error(
      "❌ Impossible de vérifier le reset Challenge:",
      error.message
    );

    return false;
  }
}

/* =========================
   LOAD GUEST CHALLENGE STATS
========================= */

async function loadGuestChallengeStats() {
  const epochAtStart = challengeResetEpoch;

  try {
    const response = await fetch(
      "/api/guest/challenge-stats",
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
      }
    );

    if (epochAtStart !== challengeResetEpoch) {
      return null;
    }

    if (!response.ok) {
      console.warn(
        "Guest stats unavailable:",
        response.status
      );

      return null;
    }

    const data = await response.json();

    if (epochAtStart !== challengeResetEpoch) {
      return null;
    }

    if (
      !data.success ||
      !Array.isArray(data.stats)
    ) {
      return null;
    }

    console.log(
      "✅ Guest Challenge stats loaded:",
      data.stats
    );

    for (const row of data.stats) {
      const level = String(row.level);

      if (!VALID_LEVELS.includes(level)) {
        continue;
      }

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
        bestStreak:
          Number(row.best_streak) || 0,
        revision:
          Number(row.revision) || 0
      };

      localStorage.setItem(
        `gomokuChallengeSynced_${level}`,
        JSON.stringify(row)
      );
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

/* =========================
   GUEST SAVE HELPERS
========================= */

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
          saved.best_streak ??
            saved.bestStreak
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

/* =========================
   UNSYNCED / CONFLICT
========================= */

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
      localStats.points -
      syncedStats.points,

    winsDifference:
      localStats.wins -
      syncedStats.wins,

    lossesDifference:
      localStats.losses -
      syncedStats.losses,

    localStreak:
      localStats.streak,

    localBestStreak:
      localStats.bestStreak
  };
}

function inspectGuestChallengeConflict(
  level,
  serverStats
) {
  const cleanLevel = normalizeLevel(level);

  const synced =
    getLastSyncedGuestStats(cleanLevel);

  const changes =
    getGuestChallengeUnsyncedChanges(
      cleanLevel
    );

  if (!synced || !changes || !serverStats) {
    return null;
  }

  const serverWinsDifference =
    Number(serverStats.wins) -
    synced.wins;

  const serverLossesDifference =
    Number(serverStats.losses) -
    synced.losses;

  const differences = [
    serverWinsDifference,
    serverLossesDifference,
    changes.winsDifference,
    changes.lossesDifference
  ];

  if (
    !differences.every(
      (value) =>
        Number.isSafeInteger(value) &&
        value >= 0
    )
  ) {
    return null;
  }

  const serverGames =
    serverWinsDifference +
    serverLossesDifference;

  const localGames =
    changes.winsDifference +
    changes.lossesDifference;

  return {
    level: cleanLevel,
    serverGames,
    localGames,
    concurrentChanges:
      serverGames > 0 &&
      localGames > 0
  };
}

async function saveGuestChallengeStats(level) {
  const cleanLevel = normalizeLevel(level);
  const epochAtStart = challengeResetEpoch;

  localStorage.setItem(
    `gomokuChallengePending_${cleanLevel}`,
    "1"
  );

  if (
    guestChallengeSavingLevels.has(
      cleanLevel
    )
  ) {
    guestChallengeSaveAgain.add(
      cleanLevel
    );

    return;
  }

  guestChallengeSavingLevels.add(
    cleanLevel
  );

  const controller = new AbortController();

  guestChallengeSaveControllers.set(
    cleanLevel,
    controller
  );

  try {
    const guestReady =
      window.gomokuGuestSessionReady;

    if (!guestReady) {
      return;
    }

    const guestId = await guestReady;

    if (
      !guestId ||
      epochAtStart !== challengeResetEpoch
    ) {
      return;
    }

    const stats =
      getStatsForLevel(cleanLevel);

    const response = await fetch(
      "/api/guest/challenge-stats",
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          name:
            getStoredChallengePlayerName(),

          level:
            Number(cleanLevel),

          revision:
            Number(stats.revision) || 0,

          points:
            stats.points,

          wins:
            stats.wins,

          losses:
            stats.losses,

          streak:
            stats.streak,

          bestStreak:
            stats.bestStreak
        })
      }
    );

    if (epochAtStart !== challengeResetEpoch) {
      return;
    }

    const result = await response.json();

    if (epochAtStart !== challengeResetEpoch) {
      return;
    }

    if (response.status === 409) {
      if (result.serverStats) {
        localStorage.setItem(
          `gomokuChallengeConflict_${cleanLevel}`,
          JSON.stringify(
            result.serverStats
          )
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

      if (
        conflictInfo?.concurrentChanges
      ) {
        console.warn(
          "⚠️ Modifications simultanées détectées.",
          conflictInfo
        );
      }

      if (result.serverStats) {
        const serverRevision = Number(
          result.serverStats.revision
        );

        if (
          Number.isSafeInteger(
            serverRevision
          ) &&
          serverRevision >= 0
        ) {
          const currentStats =
            getStatsForLevel(
              cleanLevel
            );

          currentStats.revision =
            serverRevision;

          saveChallengeData();

          guestChallengeSaveAgain.add(
            cleanLevel
          );

          console.log(
            "🔄 Nouvelle révision PostgreSQL récupérée. Nouvelle tentative:",
            serverRevision
          );
        }
      }

      return;
    }

    if (!response.ok || !result.success) {
      throw new Error(
        result.message ||
          "Unable to save Guest stats"
      );
    }

    if (result.stats) {
      localStorage.setItem(
        `gomokuChallengeSynced_${cleanLevel}`,
        JSON.stringify(result.stats)
      );
    }

    const serverRevision = Number(
      result.stats?.revision
    );

    if (
      Number.isSafeInteger(
        serverRevision
      ) &&
      serverRevision >= 0
    ) {
      const currentStats =
        getStatsForLevel(cleanLevel);

      currentStats.revision = Math.max(
        Number(currentStats.revision) || 0,
        serverRevision
      );

      saveChallengeData();
    }

    if (
      !guestChallengeSaveAgain.has(
        cleanLevel
      )
    ) {
      localStorage.removeItem(
        `gomokuChallengePending_${cleanLevel}`
      );
    }

    console.log(
      "✅ Guest Challenge stats saved:",
      cleanLevel
    );

    await fetchChallengeLeaderboardFromServer(
      cleanLevel
    );
  } catch (error) {
    if (
      error?.name === "AbortError" ||
      epochAtStart !== challengeResetEpoch
    ) {
      localStorage.removeItem(
        `gomokuChallengePending_${cleanLevel}`
      );

      console.log(
        "♻️ Old Challenge save cancelled after reset:",
        cleanLevel
      );

      return;
    }

    localStorage.setItem(
      `gomokuChallengePending_${cleanLevel}`,
      "1"
    );

    console.error(
      "❌ Guest Challenge save error:",
      error.message
    );
  } finally {
    const activeController =
      guestChallengeSaveControllers.get(
        cleanLevel
      );

    if (activeController === controller) {
      guestChallengeSaveControllers.delete(
        cleanLevel
      );
    }

    guestChallengeSavingLevels.delete(
      cleanLevel
    );

    if (
      epochAtStart === challengeResetEpoch &&
      guestChallengeSaveAgain.has(
        cleanLevel
      )
    ) {
      guestChallengeSaveAgain.delete(
        cleanLevel
      );

      saveGuestChallengeStats(
        cleanLevel
      );
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

      await saveGuestChallengeStats(
        level
      );
    }
  }
}

window.addEventListener(
  "online",
  async () => {
    console.log(
      "🌐 Internet connection restored"
    );

    await retryPendingGuestChallengeSaves();
    await fetchAllLeaderboardsFromServer();
  }
);

/* =========================
   PROFILE / PROGRESSION
========================= */

function updateAvatar() {
  if (!challengeAvatar) return;

  const firstLetter =
    challengeData.playerName
      ?.trim()
      ?.charAt(0)
      ?.toUpperCase() || "P";

  challengeAvatar.textContent =
    firstLetter;
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
  if (points < 900) {
    return { min: 0, max: 900 };
  }

  if (points < 1100) {
    return { min: 900, max: 1100 };
  }

  if (points < 1300) {
    return { min: 1100, max: 1300 };
  }

  if (points < 1500) {
    return { min: 1300, max: 1500 };
  }

  if (points < 1800) {
    return { min: 1500, max: 1800 };
  }

  return { min: 1800, max: 2200 };
}

function getProgressPercent(points) {
  const range = getLevelRange(points);
  const current = points - range.min;
  const total = range.max - range.min;

  return total <= 0
    ? 0
    : Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (current / total) * 100
          )
        )
      );
}

function addHistory(
  title,
  details,
  level = getCurrentChallengeLevel()
) {
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
  const levelNum =
    parseInt(aiLevel, 10) || 1;

  if (levelNum === 1) return 0;
  if (levelNum === 2) return 5;
  if (levelNum === 3) return 10;
  if (levelNum === 4) return 15;
  if (levelNum >= 5) return 20;

  return 0;
}

const CHALLENGE_WINS_TO_UNLOCK = {
  "1": 2,
  "2": 3,
  "3": 4,
  "4": 4
};

function getWinsNeededForNextLevel(level) {
  const cleanLevel = normalizeLevel(level);

  if (cleanLevel === "5") {
    return null;
  }

  return (
    CHALLENGE_WINS_TO_UNLOCK[
      cleanLevel
    ] || null
  );
}

function checkChallengeLevelUp(level) {
  const cleanLevel = normalizeLevel(level);

  if (cleanLevel === "5") {
    return {
      leveledUp: false,
      maxLevel: true,
      level: "5"
    };
  }

  const stats =
    getStatsForLevel(cleanLevel);

  const winsNeeded =
    getWinsNeededForNextLevel(
      cleanLevel
    );

  if (
    !winsNeeded ||
    stats.wins < winsNeeded
  ) {
    return {
      leveledUp: false,
      maxLevel: false,
      level: cleanLevel,
      wins: stats.wins,
      winsNeeded
    };
  }

  const nextLevel = String(
    Number(cleanLevel) + 1
  );

  localStorage.setItem(
    "challengeLevel",
    nextLevel
  );

  challengeData.selectedLeaderboardLevel =
    nextLevel;

  if (pageAiLevelSelect) {
    pageAiLevelSelect.value =
      nextLevel;
  }

  saveChallengeData();

  return {
    leveledUp: true,
    maxLevel: nextLevel === "5",
    previousLevel: cleanLevel,
    level: nextLevel
  };
}

/* =========================
   PLAYER NAME
========================= */

function hydratePlayerNameIntoInput() {
  if (!pagePlayerNameInput) return;

  const storedName =
    getStoredChallengePlayerName();

  pagePlayerNameInput.value =
    storedName !== "Player"
      ? storedName
      : "";
}

function updateLocalLeaderboardName(
  oldName,
  newName
) {
  const oldClean = String(
    oldName || ""
  ).trim();

  const newClean = String(
    newName || ""
  ).trim();

  if (!newClean) return;

  VALID_LEVELS.forEach((level) => {
    const board = Array.isArray(
      challengeData.leaderboards[level]
    )
      ? [...challengeData.leaderboards[level]]
      : [];

    challengeData.leaderboards[level] =
      board.map((player) => {
        if (
          oldClean &&
          player &&
          player.name &&
          player.name.toLowerCase() ===
            oldClean.toLowerCase()
        ) {
          return {
            ...player,
            name: newClean
          };
        }

        return player;
      });
  });
}

function updateCurrentPlayerInLocalLeaderboard(
  level = getCurrentChallengeLevel()
) {
  const cleanLevel = normalizeLevel(level);
  const name = String(
    challengeData.playerName || ""
  ).trim();

  if (!name || name === "Player") {
    return;
  }

  const stats =
    getStatsForLevel(cleanLevel);

  const board = Array.isArray(
    challengeData.leaderboards[cleanLevel]
  )
    ? [...challengeData.leaderboards[cleanLevel]]
    : [];

  const playerId =
    getChallengePlayerId();

  const existingIndex = board.findIndex(
    (player) =>
      player &&
      (
        (player.playerId &&
          String(player.playerId) ===
            playerId) ||
        String(player.name || "")
          .trim()
          .toLowerCase() ===
          name.toLowerCase()
      )
  );

  const playerData = {
    playerId,
    name,
    points: stats.points || 0,
    online: true,
    level: cleanLevel
  };

  if (existingIndex >= 0) {
    board[existingIndex] = {
      ...board[existingIndex],
      ...playerData
    };
  } else {
    board.push(playerData);
  }

  challengeData.leaderboards[cleanLevel] =
    board;
}

/* =========================
   RENDER
========================= */

function renderProfile() {
  updateAvatar();

  const hasRealPlayer =
    challengeData.playerName &&
    challengeData.playerName.trim() &&
    challengeData.playerName !== "Player";

  const stats = getCurrentStats();

  const displayPoints =
    hasRealPlayer ? stats.points : 0;

  const displayLevel =
    hasRealPlayer
      ? getLevelFromPoints(stats.points)
      : "Beginner";

  const displayWins =
    hasRealPlayer ? stats.wins : 0;

  const displayLosses =
    hasRealPlayer ? stats.losses : 0;

  const displayStreak =
    hasRealPlayer ? stats.streak : 0;

  const displayBestStreak =
    hasRealPlayer
      ? stats.bestStreak
      : 0;

  const displayProgress =
    hasRealPlayer
      ? getProgressPercent(stats.points)
      : 0;

  if (challengePlayerName) {
    challengePlayerName.textContent =
      hasRealPlayer
        ? challengeData.playerName
        : "Player";
  }

  if (challengePlayerStatus) {
    challengePlayerStatus.innerHTML =
      hasRealPlayer && challengeData.online
        ? `<span class="dot green"></span> Online`
        : `<span class="dot red"></span> Offline`;
  }

  if (playerPointsEl) {
    playerPointsEl.textContent =
      displayPoints;
  }

  if (playerLevelEl) {
    playerLevelEl.textContent =
      displayLevel;
  }

  if (playerWinsEl) {
    playerWinsEl.textContent =
      displayWins;
  }

  if (playerLossesEl) {
    playerLossesEl.textContent =
      displayLosses;
  }

  if (playerStreakEl) {
    playerStreakEl.textContent =
      displayStreak;
  }

  if (playerBestStreakEl) {
    playerBestStreakEl.textContent =
      displayBestStreak;
  }

  if (progressPercentEl) {
    progressPercentEl.textContent =
      `${displayProgress}%`;
  }

  if (progressFillEl) {
    progressFillEl.style.width =
      `${displayProgress}%`;
  }
}

function ensureLeaderboardTabs() {
  const container =
    document.getElementById(
      "leaderboardLevelTabs"
    );

  if (!container) return;

  container.innerHTML = "";

  VALID_LEVELS.forEach((level) => {
    const btn =
      document.createElement("button");

    btn.type = "button";
    btn.className =
      "leaderboard-level-btn";

    if (
      getSelectedLeaderboardLevel() ===
      level
    ) {
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

  leaderboardList.innerHTML = "";

  const levelBoard =
    VALID_LEVELS.flatMap((level) => {
      const players = Array.isArray(
        challengeData.leaderboards[level]
      )
        ? challengeData.leaderboards[level]
        : [];

      return players.map((player) => ({
        ...player,
        level: String(level)
      }));
    });

  const sorted = [...levelBoard]
    .filter(
      (player) =>
        player &&
        player.name &&
        player.name.trim() &&
        player.name !== "Player"
    )
    .sort(
      (a, b) =>
        (Number(b.points) || 0) -
        (Number(a.points) || 0)
    );

  if (!sorted.length) {
    leaderboardList.innerHTML =
      `<div class="empty-text">No players yet in the Global Leaderboard</div>`;

    return;
  }

  sorted.forEach((player, index) => {
    const item =
      document.createElement("div");

    item.className =
      "leaderboard-item";

    item.innerHTML = `
      <div class="lb-left">
        <div class="rank-badge">${index + 1}</div>
        <div>
          <div class="lb-name">${player.name}</div>
          <div class="lb-sub">
            <span class="dot ${player.online ? "green" : "red"}"></span>
            ${player.online ? "Online" : "Offline"} • Level ${player.level}
          </div>
        </div>
      </div>
      <div class="lb-points">${Number(player.points) || 0} pts</div>
    `;

    leaderboardList.appendChild(item);
  });
}

function renderHistory() {
  if (!historyList) return;

  historyList.innerHTML = "";

  if (!challengeData.history.length) {
    historyList.innerHTML =
      `<div class="empty-text">No challenge history yet</div>`;

    return;
  }

  challengeData.history
    .slice()
    .reverse()
    .forEach((entry) => {
      const item =
        document.createElement("div");

      item.className =
        "history-item";

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
  ensureLeaderboardTabs();
  saveChallengeData();
}

/* =========================
   LEADERBOARD SERVER SYNC
========================= */

async function fetchChallengeLeaderboardFromServer(
  level = getSelectedLeaderboardLevel()
) {
  const epochAtStart = challengeResetEpoch;

  try {
    const cleanLevel = normalizeLevel(level);

    const res = await fetch(
      `/api/challenge/leaderboard?level=${cleanLevel}`,
      {
        cache: "no-store"
      }
    );

    if (epochAtStart !== challengeResetEpoch) {
      return;
    }

    const data = await res.json();

    if (
      !data.success ||
      !Array.isArray(data.leaderboard)
    ) {
      return;
    }

    challengeData.leaderboards[cleanLevel] =
      data.leaderboard.map((player) => ({
        playerId: player.playerId,
        name: player.name,
        points: Number(player.points) || 0,
        online: !!player.online,
        level: cleanLevel
      }));

    saveChallengeData();
    renderLeaderboard();
  } catch (error) {
    console.error(
      "Failed to fetch challenge leaderboard:",
      error
    );
  }
}

async function fetchAllLeaderboardsFromServer() {
  const epochAtStart = challengeResetEpoch;

  try {
    const res = await fetch(
      "/api/challenge/leaderboards",
      {
        cache: "no-store"
      }
    );

    if (epochAtStart !== challengeResetEpoch) {
      return;
    }

    const data = await res.json();

    if (
      !data.success ||
      !data.leaderboards
    ) {
      return;
    }

    VALID_LEVELS.forEach((level) => {
      const serverBoard = Array.isArray(
        data.leaderboards[level]
      )
        ? data.leaderboards[level]
        : [];

      challengeData.leaderboards[level] =
        serverBoard.map((player) => ({
          playerId: player.playerId,
          name: player.name,
          points: Number(player.points) || 0,
          online: !!player.online,
          level
        }));
    });

    saveChallengeData();
    renderLeaderboard();
  } catch (error) {
    console.error(
      "Failed to fetch all challenge leaderboards:",
      error
    );
  }
}

async function syncCurrentPlayerToServer() {
  try {
    const playerName = String(
      challengeData.playerName ||
        localStorage.getItem(
          "challengePlayerName"
        ) ||
        localStorage.getItem(
          "playerName"
        ) ||
        ""
    ).trim();

    if (
      !playerName ||
      playerName === "Player"
    ) {
      return;
    }

    const level =
      getCurrentChallengeLevel();

    const challengeSocket =
      getChallengeSocket();

    if (challengeSocket) {
      challengeSocket.emit(
        "registerChallengePlayer",
        {
          playerId:
            getChallengePlayerId(),
          name:
            playerName,
          level
        }
      );
    }

    await fetchChallengeLeaderboardFromServer(
      level
    );
  } catch (error) {
    console.error(
      "Failed to sync player to server:",
      error
    );
  }
}

function syncPointsToServer(
  level = getCurrentChallengeLevel()
) {
  const challengeSocket =
    getChallengeSocket();

  const cleanLevel =
    normalizeLevel(level);

  if (
    challengeSocket &&
    challengeData.playerName &&
    challengeData.playerName.trim() &&
    challengeData.playerName !== "Player"
  ) {
    challengeSocket.emit(
      "updateChallengePoints",
      {
        level: cleanLevel
      }
    );
  }
}

/* =========================
   SOCKET LISTENERS
========================= */

function registerChallengeSocketListeners() {
  const challengeSocket =
    getChallengeSocket();

  if (!challengeSocket) return;

  if (
    window.__challengeLeaderboardListenerBound
  ) {
    return;
  }

  window.__challengeLeaderboardListenerBound =
    true;

  challengeSocket.on(
    "challengeLeaderboard",
    ({ level, leaderboard }) => {
      const cleanLevel =
        normalizeLevel(level);

      if (!Array.isArray(leaderboard)) {
        return;
      }

      challengeData.leaderboards[cleanLevel] =
        leaderboard.map((player) => ({
          playerId: player.playerId,
          name: player.name,
          points:
            Number(player.points) || 0,
          online: !!player.online,
          level: cleanLevel
        }));

      saveChallengeData();
      renderLeaderboard();
    }
  );

  challengeSocket.on(
    "challengeGlobalReset",
    async (payload = {}) => {
      console.log(
        "♻️ Global Challenge reset received",
        payload
      );

      await applyGlobalChallengeResetInPlace(
        payload,
        {
          refreshLeaderboards: true,
          reinitializeGuestSession: false
        }
      );
    }
  );

  challengeSocket.on(
    "connect",
    async () => {
      await checkGlobalChallengeReset();
      await fetchAllLeaderboardsFromServer();

      const name = String(
        challengeData.playerName || ""
      ).trim();

      if (
        name &&
        name !== "Player"
      ) {
        challengeSocket.emit(
          "registerChallengePlayer",
          {
            playerId:
              getChallengePlayerId(),
            name,
            level:
              getCurrentChallengeLevel()
          }
        );
      }
    }
  );
}

/* =========================
   LEGACY LAST RESULT
========================= */

function applyLastChallengeResult() {
  const raw =
    localStorage.getItem(
      "challengeResult"
    );

  if (!raw) {
    return;
  }

  /*
   * IMPORTANT :
   * retirer le résultat immédiatement.
   *
   * Ainsi un Restart, refresh ou second appel
   * ne peut pas recompter la même partie.
   */
  localStorage.removeItem(
    "challengeResult"
  );

  try {
    const result = JSON.parse(raw);

    const mode = String(
      result.mode || ""
    ).trim();

    /*
     * Ne jamais appliquer un résultat
     * provenant d'un autre mode.
     */
    if (
      mode &&
      mode !== "challenge"
    ) {
      return;
    }

    const resultLevel =
      normalizeLevel(
        result.aiLevel ||
          getStoredChallengeAiLevel()
      );

    const stats =
      getStatsForLevel(
        resultLevel
      );

    let gain = 20;

    if (result.aiStarted) {
      gain += 10;
    }

    gain +=
      getAiBonus(resultLevel);

    const winnerName = String(
      result.winnerName || ""
    ).trim();

    const humanName = String(
      challengeData.playerName ||
        getStoredChallengePlayerName() ||
        "Player"
    ).trim();

    const aiWon =
      winnerName === "AI" ||
      winnerName === "White";

    const humanWon =
      winnerName &&
      (
        winnerName === humanName ||
        (
          winnerName !== "AI" &&
          winnerName !== "White"
        )
      );

    if (!winnerName || humanWon) {
      stats.points += gain;
      stats.wins += 1;
      stats.streak += 1;

      if (
        stats.streak >
        stats.bestStreak
      ) {
        stats.bestStreak =
          stats.streak;
      }

      addHistory(
        "🔥 Real Challenge Victory",
        `+${gain} pts • Level ${resultLevel}${result.aiStarted ? " • AI started first" : ""}`,
        resultLevel
      );
    } else if (
      aiWon &&
      winnerName !== humanName
    ) {
      let loss = 10;

      if (
        Number(resultLevel) >= 5
      ) {
        loss = 15;
      }

      stats.points =
        Math.max(
          0,
          stats.points - loss
        );

      stats.losses += 1;
      stats.streak = 0;

      addHistory(
        "❌ Real Challenge Defeat",
        `-${loss} pts • Level ${resultLevel}`,
        resultLevel
      );
    }

    updateCurrentPlayerInLocalLeaderboard(
      resultLevel
    );

    saveChallengeData();
    renderAll();

    saveGuestChallengeStats(
      resultLevel
    );
  } catch (error) {
    console.error(
      "Error reading challengeResult:",
      error
    );
  }
}

/* =========================
   WIN / LOSS
========================= */

function handleWin({
  aiStarted = false,
  onlineGame = false,
  fastWin = false,
  aiLevel = null
} = {}) {
  const level =
    normalizeLevel(
      aiLevel ||
        getCurrentChallengeLevel()
    );

  const stats =
    getStatsForLevel(level);

  let gain = 20;

  if (aiStarted) {
    gain += 10;
  }

  if (onlineGame) {
    gain += 10;
  }

  if (fastWin) {
    gain += 5;
  }

  gain += getAiBonus(level);

  stats.points += gain;
  stats.wins += 1;
  stats.streak += 1;

  if (
    stats.streak >
    stats.bestStreak
  ) {
    stats.bestStreak =
      stats.streak;
  }

  /*
   * Vérifier le déblocage APRÈS
   * avoir ajouté la victoire.
   */
  const levelProgress =
    checkChallengeLevelUp(level);

  addHistory(
    "✅ Victory",
    `+${gain} pts • Level ${level}${aiStarted ? " • AI started first" : ""}${onlineGame ? " • Online match" : ""}${fastWin ? " • Fast win" : ""}`,
    level
  );

  updateCurrentPlayerInLocalLeaderboard(
    level
  );

  saveChallengeData();
  renderAll();

  /*
   * Sauvegarder le niveau sur lequel
   * la victoire vient réellement d'être gagnée,
   * même si le niveau suivant vient d'être débloqué.
   */
  saveGuestChallengeStats(level);

  syncPointsToServer(level);

  if (levelProgress.leveledUp) {
    /*
     * Le nouveau niveau devient immédiatement
     * le niveau du prochain match.
     */
    const nextLevel =
      levelProgress.level;

    localStorage.setItem(
      "challengeLevel",
      nextLevel
    );

    challengeData.selectedLeaderboardLevel =
      nextLevel;

    if (pageAiLevelSelect) {
      pageAiLevelSelect.value =
        nextLevel;
    }

    saveChallengeData();

    const challengeSocket =
      getChallengeSocket();

    const name = String(
      challengeData.playerName || ""
    ).trim();

    if (
      challengeSocket &&
      name &&
      name !== "Player"
    ) {
      challengeSocket.emit(
        "registerChallengePlayer",
        {
          playerId:
            getChallengePlayerId(),

          name,

          level:
            nextLevel
        }
      );
    }

    setTimeout(() => {
      alert(
        `🏆 Félicitations ! Niveau ${nextLevel} débloqué ! 🚀\nL'IA devient plus difficile.`
      );
    }, 300);

    return;
  }

  if (levelProgress.maxLevel) {
    setTimeout(() => {
      alert(
        `👑 Victoire au niveau 5 ! +${gain} points 🔥\nContinue pour monter dans le classement général.`
      );
    }, 300);

    return;
  }

  const remaining =
    Math.max(
      0,
      Number(
        levelProgress.winsNeeded
      ) -
        Number(
          levelProgress.wins
        )
    );

  setTimeout(() => {
    alert(
      `🎉 Victoire ! ${levelProgress.wins}/${levelProgress.winsNeeded} victoires — encore ${remaining} pour débloquer le niveau ${Number(level) + 1} 🔥🤖`
    );
  }, 300);
}

function handleLoss({
  onlineGame = false,
  aiLevel = null
} = {}) {
  const level =
    normalizeLevel(
      aiLevel ||
        getCurrentChallengeLevel()
    );

  const stats =
    getStatsForLevel(level);

  let loss = 10;

  if (onlineGame) {
    loss = 15;
  }

  if (
    Number(level) >= 5
  ) {
    loss = 15;
  }

  stats.points =
    Math.max(
      0,
      stats.points - loss
    );

  stats.losses += 1;
  stats.streak = 0;

  addHistory(
    "❌ Defeat",
    `-${loss} pts • Level ${level}${onlineGame ? " • Online match" : ""}`,
    level
  );

  updateCurrentPlayerInLocalLeaderboard(
    level
  );

  saveChallengeData();
  renderAll();

  saveGuestChallengeStats(level);

  syncPointsToServer(level);
}

/* =========================
   RANKED CHALLENGE STATE
========================= */

function isRankedChallengeActive() {
  /*
   * Le flag est activé lorsque le joueur
   * appuie sur Start Challenge.
   */
  if (
    window.__rankedChallengeActive ===
    true
  ) {
    return true;
  }

  /*
   * Compatibilité avec une page qui utilise
   * directement mode="challenge".
   */
  if (
    pageModeSelect &&
    pageModeSelect.value ===
      "challenge"
  ) {
    return true;
  }

  /*
   * Compatibilité avec un lien partagé :
   * ?challenge=1
   */
  const params =
    getChallengeParamsFromURL();

  if (params.challenge) {
    return true;
  }

  return false;
}

/* =========================
   ROUND PROTECTION
========================= */

function resetRoundSyncFlag() {
  /*
   * false = aucun résultat n'a encore été
   * enregistré pour cette nouvelle partie.
   */
  window.__challengeRoundApplied =
    false;
}

function markChallengeRoundApplied() {
  window.__challengeRoundApplied =
    true;
}

function hasChallengeRoundBeenApplied() {
  return (
    window.__challengeRoundApplied ===
    true
  );
}

/* =========================
   START CHALLENGE
========================= */

function startChallenge() {
  const typedName =
    getTypedPageName();

  if (!typedName) {
    alert(
      "Please enter your name first."
    );

    if (pagePlayerNameInput) {
      pagePlayerNameInput.focus();
    }

    return;
  }

  const oldName =
    challengeData.playerName;

  localStorage.setItem(
    "challengePlayerName",
    typedName
  );

  localStorage.setItem(
    "playerName",
    typedName
  );

  challengeData.playerName =
    typedName;

  challengeData.online = true;

  /*
   * IMPORTANT :
   * utiliser le niveau réellement débloqué.
   */
  const unlockedLevel =
    getStoredChallengeAiLevel();

  localStorage.setItem(
    "challengeLevel",
    unlockedLevel
  );

  challengeData.selectedLeaderboardLevel =
    unlockedLevel;

  if (pageAiLevelSelect) {
    pageAiLevelSelect.value =
      unlockedLevel;

    pageAiLevelSelect.disabled =
      false;
  }

  const firstPlayer =
    pageFirstPlayerSelect
      ? pageFirstPlayerSelect.value
      : getStoredChallengeFirstPlayer();

  localStorage.setItem(
    "challengeFirstPlayer",
    firstPlayer
  );

  updateLocalLeaderboardName(
    oldName,
    typedName
  );

  updateCurrentPlayerInLocalLeaderboard(
    unlockedLevel
  );

  /*
   * Cette variable est importante :
   * elle permet de distinguer un Ranked Challenge
   * d'une simple partie contre l'IA.
   */
  window.__rankedChallengeActive =
    true;

  /*
   * Nouvelle partie =
   * autoriser exactement UN résultat.
   */
  resetRoundSyncFlag();

  /*
   * Supprimer tout résultat ancien
   * avant de lancer la nouvelle partie.
   */
  localStorage.removeItem(
    "challengeResult"
  );

  renderAll();

  const challengeSocket =
    getChallengeSocket();

  if (challengeSocket) {
    challengeSocket.emit(
      "registerChallengePlayer",
      {
        playerId:
          getChallengePlayerId(),

        name:
          typedName,

        level:
          unlockedLevel
      }
    );
  }

  /*
   * PostgreSQL est la source réelle
   * pour les statistiques.
   */
  syncCurrentPlayerToServer();

  /*
   * Lancer/réinitialiser la grille.
   */
  if (
    typeof window.resetGame ===
    "function"
  ) {
    window.resetGame();
  } else if (
    typeof resetGame ===
    "function"
  ) {
    resetGame();
  }
}

/* =========================
   SHOW WINNER PATCH
   ONE RESULT PER ROUND
========================= */

function patchChallengeGameSync() {
  if (
    typeof window.showWinner !==
    "function"
  ) {
    return;
  }

  if (
    window.__challengeShowWinnerPatched
  ) {
    return;
  }

  window.__challengeShowWinnerPatched =
    true;

  const originalShowWinner =
    window.showWinner;

  window.showWinner =
    function patchedShowWinner(
      winnerName
    ) {
      /*
       * Toujours afficher le résultat
       * normal du jeu.
       *
       * Challenge ajoute seulement
       * les statistiques Ranked.
       */

      const rankedChallenge =
        isRankedChallengeActive();

      const alreadyApplied =
        hasChallengeRoundBeenApplied();

      if (
        rankedChallenge &&
        !alreadyApplied
      ) {
        const currentAiLevel =
          normalizeLevel(
            pageAiLevelSelect
              ? pageAiLevelSelect.value
              : getStoredChallengeAiLevel()
          );

        const firstPlayer =
          pageFirstPlayerSelect
            ? pageFirstPlayerSelect.value
            : getStoredChallengeFirstPlayer();

        const aiStarted =
          firstPlayer === "ai";

        const humanName = String(
          pagePlayerNameInput?.value
            ?.trim() ||
            getStoredChallengePlayerName()
        ).trim();

        const currentBlackName =
          typeof window.currentBlackName ===
            "string"
            ? window.currentBlackName.trim()
            : "";

        const currentWhiteName =
          typeof window.currentWhiteName ===
            "string"
            ? window.currentWhiteName.trim()
            : "";

        const cleanWinnerName =
          String(
            winnerName || ""
          ).trim();

        /*
         * Déterminer si l'humain a gagné.
         */
        const humanWon =
          cleanWinnerName ===
            humanName ||
          (
            humanName &&
            currentBlackName ===
              humanName &&
            cleanWinnerName ===
              currentBlackName
          ) ||
          (
            humanName &&
            currentWhiteName ===
              humanName &&
            cleanWinnerName ===
              currentWhiteName
          );

        /*
         * Déterminer si l'IA a gagné.
         */
        const aiWon =
          cleanWinnerName === "AI" ||
          (
            currentWhiteName &&
            currentWhiteName !==
              humanName &&
            cleanWinnerName ===
              currentWhiteName
          ) ||
          (
            currentBlackName &&
            currentBlackName !==
              humanName &&
            cleanWinnerName ===
              currentBlackName
          ) ||
          cleanWinnerName ===
            "White";

        /*
         * IMPORTANT :
         * marquer la partie AVANT de modifier
         * les statistiques.
         *
         * Même si showWinner est appelé deux fois,
         * les points ne seront ajoutés qu'une fois.
         */
        if (
          humanWon ||
          aiWon
        ) {
          markChallengeRoundApplied();
        }

        if (humanWon) {
          console.log(
            "🏆 Ranked Challenge victory",
            {
              winnerName:
                cleanWinnerName,
              level:
                currentAiLevel
            }
          );

          handleWin({
            aiStarted,
            onlineGame: false,
            fastWin: false,
            aiLevel:
              currentAiLevel
          });
        } else if (aiWon) {
          console.log(
            "❌ Ranked Challenge defeat",
            {
              winnerName:
                cleanWinnerName,
              level:
                currentAiLevel
            }
          );

          handleLoss({
            onlineGame: false,
            aiLevel:
              currentAiLevel
          });
        } else {
          /*
           * Si le nom reçu est inconnu,
           * ne pas compter automatiquement.
           */
          console.warn(
            "⚠️ Challenge winner could not be identified:",
            {
              winnerName:
                cleanWinnerName,
              humanName,
              currentBlackName,
              currentWhiteName
            }
          );
        }
      }

      return originalShowWinner.apply(
        this,
        arguments
      );
    };
}

/* =========================
   RESTART PATCH
========================= */

function patchChallengeRestart() {
  /*
   * Le bouton Restart utilise normalement
   * resetGame() dans script.js.
   *
   * On enveloppe cette fonction une seule fois.
   */
  if (
    typeof window.resetGame !==
    "function"
  ) {
    return;
  }

  if (
    window.__challengeResetGamePatched
  ) {
    return;
  }

  window.__challengeResetGamePatched =
    true;

  const originalResetGame =
    window.resetGame;

  window.resetGame =
    function patchedChallengeResetGame() {
      /*
       * IMPORTANT :
       * Restart ne doit JAMAIS :
       *
       * - remettre les points à zéro,
       * - changer le nom,
       * - effacer PostgreSQL,
       * - recompter l'ancienne partie.
       *
       * Il prépare seulement une nouvelle manche.
       */

      localStorage.removeItem(
        "challengeResult"
      );

      resetRoundSyncFlag();

      return originalResetGame.apply(
        this,
        arguments
      );
    };

  console.log(
    "✅ Ranked Challenge Restart protection active"
  );
}

/* =========================
   PREPARE NEXT RANKED ROUND
========================= */

function prepareNextChallengeRound() {
  localStorage.removeItem(
    "challengeResult"
  );

  resetRoundSyncFlag();

  /*
   * Le niveau actuel reste celui
   * qui est déjà enregistré.
   */
  const level =
    getStoredChallengeAiLevel();

  if (pageAiLevelSelect) {
    pageAiLevelSelect.value =
      level;
  }

  console.log(
    "▶️ New Ranked Challenge round ready:",
    level
  );
}

/* =========================
   PAGE CONTROLS
========================= */

function bindChallengePageControls() {
  if (!isChallengePage) {
    return;
  }

  hydratePlayerNameIntoInput();
  renderAll();

  function saveFinalChallengeName() {
    if (!pagePlayerNameInput) {
      return;
    }

    const name =
      pagePlayerNameInput.value.trim();

    const oldName =
      challengeData.playerName;

    if (name) {
      localStorage.setItem(
        "challengePlayerName",
        name
      );

      localStorage.setItem(
        "playerName",
        name
      );

      challengeData.playerName =
        name;

      challengeData.online =
        true;

      updateLocalLeaderboardName(
        oldName,
        name
      );

      updateCurrentPlayerInLocalLeaderboard(
        getCurrentChallengeLevel()
      );
    } else {
      localStorage.removeItem(
        "challengePlayerName"
      );

      localStorage.removeItem(
        "playerName"
      );

      challengeData.playerName =
        "Player";

      challengeData.online =
        false;
    }

    saveChallengeData();
    renderAll();

    const challengeSocket =
      getChallengeSocket();

    if (
      challengeSocket &&
      name &&
      name !== "Player"
    ) {
      challengeSocket.emit(
        "registerChallengePlayer",
        {
          playerId:
            getChallengePlayerId(),

          name,

          level:
            getCurrentChallengeLevel()
        }
      );
    }

    fetchChallengeLeaderboardFromServer(
      getCurrentChallengeLevel()
    );
  }

  /* =========================
     PLAYER NAME INPUT
  ========================= */

  if (pagePlayerNameInput) {
    pagePlayerNameInput.addEventListener(
      "input",
      () => {
        const name =
          pagePlayerNameInput.value.trim();

        if (name) {
          challengeData.playerName =
            name;

          challengeData.online =
            true;
        } else {
          challengeData.playerName =
            "Player";

          challengeData.online =
            false;
        }

        updateAvatar();
        renderProfile();
      }
    );

    pagePlayerNameInput.addEventListener(
      "change",
      saveFinalChallengeName
    );

    pagePlayerNameInput.addEventListener(
      "blur",
      saveFinalChallengeName
    );

    pagePlayerNameInput.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          saveFinalChallengeName();

          pagePlayerNameInput.blur();
        }
      }
    );
  }

  /* =========================
     AI LEVEL
  ========================= */

  if (pageAiLevelSelect) {
    const storedLevel =
      getStoredChallengeAiLevel();

    pageAiLevelSelect.value =
      storedLevel;

    pageAiLevelSelect.disabled =
      false;

    pageAiLevelSelect.addEventListener(
      "change",
      async () => {
        const cleanLevel =
          normalizeLevel(
            pageAiLevelSelect.value
          );

        localStorage.setItem(
          "challengeLevel",
          cleanLevel
        );

        challengeData.selectedLeaderboardLevel =
          cleanLevel;

        /*
         * Changer de niveau signifie
         * préparer une nouvelle partie.
         */
        prepareNextChallengeRound();

        saveChallengeData();
        renderAll();

        await fetchChallengeLeaderboardFromServer(
          cleanLevel
        );

        const challengeSocket =
          getChallengeSocket();

        const name = String(
          challengeData.playerName || ""
        ).trim();

        if (
          challengeSocket &&
          name &&
          name !== "Player"
        ) {
          challengeSocket.emit(
            "registerChallengePlayer",
            {
              playerId:
                getChallengePlayerId(),

              name,

              level:
                cleanLevel
            }
          );
        }
      }
    );
  }

  /* =========================
     FIRST PLAYER
  ========================= */

  if (pageFirstPlayerSelect) {
    pageFirstPlayerSelect.value =
      getStoredChallengeFirstPlayer();

    pageFirstPlayerSelect.addEventListener(
      "change",
      () => {
        localStorage.setItem(
          "challengeFirstPlayer",
          pageFirstPlayerSelect.value
        );

        prepareNextChallengeRound();
      }
    );
  }

  /* =========================
     NORMAL RESET / RESTART
  ========================= */

  if (pageResetButton) {
    pageResetButton.addEventListener(
      "click",
      () => {
        /*
         * IMPORTANT :
         * ce bouton ne touche jamais
         * aux points Challenge.
         */
        prepareNextChallengeRound();
      }
    );
  }

  /*
   * Sur la page Challenge séparée,
   * le jeu reste techniquement en mode AI.
   *
   * Ranked Challenge est contrôlé
   * par __rankedChallengeActive.
   */
  if (
    isStandaloneChallengePage &&
    pageModeSelect
  ) {
    pageModeSelect.value = "ai";
  }
}

/* =========================
   START BUTTON
========================= */

if (startChallengeBtn) {
  startChallengeBtn.addEventListener(
    "click",
    startChallenge
  );
}

/* =========================
   DEV TEST BUTTONS
========================= */

if (simulateWinBtn) {
  simulateWinBtn.addEventListener(
    "click",
    () => {
      handleWin({
        aiStarted: false,
        onlineGame: false,
        fastWin: false,
        aiLevel:
          getStoredChallengeAiLevel()
      });
    }
  );
}

if (simulateLossBtn) {
  simulateLossBtn.addEventListener(
    "click",
    () => {
      handleLoss({
        onlineGame: false,
        aiLevel:
          getStoredChallengeAiLevel()
      });
    }
  );
}

if (simulateHardWinBtn) {
  simulateHardWinBtn.addEventListener(
    "click",
    () => {
      handleWin({
        aiStarted: true,
        onlineGame: false,
        fastWin: true,
        aiLevel:
          getStoredChallengeAiLevel()
      });
    }
  );
}

/* =========================
   RESET CURRENT PLAYER LEVEL
========================= */

if (resetChallengeDataBtn) {
  resetChallengeDataBtn.addEventListener(
    "click",
    async () => {
      const currentName = String(
        challengeData.playerName || ""
      ).trim();

      const currentLevel =
        getCurrentChallengeLevel();

      if (
        !currentName ||
        currentName === "Player"
      ) {
        alert(
          "Please enter your player name first."
        );

        return;
      }

      const ok = confirm(
        `Reset stats for ${currentName} in Level ${currentLevel}?`
      );

      if (!ok) {
        return;
      }

      /*
       * IMPORTANT :
       * garder la révision PostgreSQL actuelle.
       *
       * Sinon PostgreSQL répondrait 409.
       */
      const currentStats =
        getStatsForLevel(
          currentLevel
        );

      const currentRevision =
        Number(
          currentStats.revision
        ) || 0;

      challengeData.levelStats[
        currentLevel
      ] = {
        points: 0,
        wins: 0,
        losses: 0,
        streak: 0,
        bestStreak: 0,
        revision:
          currentRevision
      };

      challengeData.history =
        challengeData.history.filter(
          (entry) =>
            normalizeLevel(
              entry.level
            ) !== currentLevel
        );

      /*
       * Supprimer l'ancienne version locale
       * du joueur dans le classement.
       * PostgreSQL renverra ensuite la vraie valeur.
       */
      challengeData.leaderboards[
        currentLevel
      ] = (
        challengeData.leaderboards[
          currentLevel
        ] || []
      ).filter(
        (player) =>
          String(
            player.playerId || ""
          ) !==
          getChallengePlayerId()
      );

      updateCurrentPlayerInLocalLeaderboard(
        currentLevel
      );

      prepareNextChallengeRound();

      saveChallengeData();
      renderAll();

      /*
       * Sauvegarder 0 dans PostgreSQL.
       */
      await saveGuestChallengeStats(
        currentLevel
      );

      await fetchChallengeLeaderboardFromServer(
        currentLevel
      );

      renderAll();

      console.log(
        `✅ Challenge Level ${currentLevel} reset for ${currentName}`
      );
    }
  );
}

/* =========================
   SHARE CHALLENGE
========================= */

if (shareChallengeBtn) {
  shareChallengeBtn.addEventListener(
    "click",
    async () => {
      const level =
        getStoredChallengeAiLevel();

      const first =
        getStoredChallengeFirstPlayer();

      const shareUrl =
        `https://gomoku-morpion-5-online.onrender.com/index.html?mode=ai&challenge=1&level=${encodeURIComponent(level)}&first=${encodeURIComponent(first)}`;

      const shareText =
        `🟢 I'm dominating Gomoku right now.

🧠 Challenge your brain.
😏 Think you're smarter?

Join the challenge:
${shareUrl}`;

      try {
        const imageBlob =
          await generateChallengeImage();

        if (!imageBlob) {
          return;
        }

        const file = new File(
          [imageBlob],
          "challenge.png",
          {
            type: "image/png"
          }
        );

        if (
          navigator.share &&
          navigator.canShare &&
          navigator.canShare({
            files: [file]
          })
        ) {
          await navigator.share({
            title:
              "Gomoku Challenge",

            text:
              shareText,

            url:
              shareUrl,

            files:
              [file]
          });
        } else {
          const link =
            document.createElement(
              "a"
            );

          const objectUrl =
            URL.createObjectURL(
              imageBlob
            );

          link.href =
            objectUrl;

          link.download =
            "challenge.png";

          link.click();

          setTimeout(() => {
            URL.revokeObjectURL(
              objectUrl
            );
          }, 1000);

          if (
            navigator.clipboard &&
            navigator.clipboard.writeText
          ) {
            await navigator.clipboard.writeText(
              shareText
            );
          }

          alert(
            "Image downloaded + text copied 🚀"
          );
        }
      } catch (error) {
        console.error(
          "Challenge share error:",
          error
        );
      }
    }
  );
}

/* =========================
   GENERATE SHARE IMAGE
========================= */

async function generateChallengeImage() {
  const canvas =
    document.createElement(
      "canvas"
    );

  const ctx =
    canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  canvas.width = 1080;
  canvas.height = 1080;

  ctx.fillStyle = "#f7efd8";

  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.textAlign = "center";

  ctx.fillStyle = "#111";
  ctx.font =
    "bold 62px Arial";

  ctx.fillText(
    "GOMOKU",
    540,
    120
  );

  ctx.fillStyle = "#777";
  ctx.font =
    "26px Arial";

  ctx.fillText(
    "Morpion à 5 • Five in a row",
    540,
    165
  );

  ctx.fillStyle =
    "#2563eb";

  ctx.font =
    "bold 34px Arial";

  ctx.fillText(
    "Challenge your brain 🧠",
    540,
    220
  );

  ctx.fillStyle = "#111";
  ctx.font =
    "30px Arial";

  ctx.fillText(
    "Think you're smarter? 😏",
    540,
    265
  );

  const selectedLevel =
    getSelectedLeaderboardLevel();

  ctx.fillStyle =
    "#6b7280";

  ctx.font =
    "bold 28px Arial";

  ctx.fillText(
    `TOP PLAYERS • LEVEL ${selectedLevel}`,
    540,
    330
  );

  const topPlayers = [
    ...(
      challengeData.leaderboards[
        selectedLevel
      ] || []
    )
  ]
    .sort(
      (a, b) =>
        (Number(b.points) || 0) -
        (Number(a.points) || 0)
    )
    .slice(0, 3);

  topPlayers.forEach(
    (player, index) => {
      const y =
        420 + index * 80;

      ctx.textAlign =
        "left";

      ctx.beginPath();

      ctx.arc(
        300,
        y - 10,
        10,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        player.online
          ? "#22c55e"
          : "#9ca3af";

      ctx.fill();

      ctx.fillStyle =
        "#111";

      ctx.font =
        "bold 30px Arial";

      ctx.fillText(
        `#${index + 1} ${player.name}`,
        330,
        y
      );

      ctx.fillStyle =
        "#6b7280";

      ctx.font =
        "24px Arial";

      ctx.fillText(
        `${Number(player.points) || 0} pts`,
        700,
        y
      );
    }
  );

  const logo =
    new Image();

  logo.src =
    "logo.png";

  await new Promise(
    (resolve) => {
      logo.onload =
        resolve;

      logo.onerror =
        resolve;
    }
  );

  const logoSize =
    220;

  if (
    logo.complete &&
    logo.naturalWidth > 0
  ) {
    ctx.drawImage(
      logo,
      canvas.width / 2 -
        logoSize / 2,
      650,
      logoSize,
      logoSize
    );
  }

  ctx.textAlign =
    "center";

  ctx.fillStyle =
    "#111";

  ctx.font =
    "bold 28px Arial";

  ctx.fillText(
    `Join the Level ${selectedLevel} challenge 🔥`,
    540,
    910
  );

  ctx.fillStyle =
    "#2563eb";

  ctx.font =
    "bold 26px Arial";

  ctx.fillText(
    "gomoku-morpion-5-online.onrender.com",
    540,
    960
  );

  return new Promise(
    (resolve) => {
      canvas.toBlob(
        resolve,
        "image/png"
      );
    }
  );
}

/* =========================
   COLLAPSIBLE CARDS
========================= */

function bindCollapseCards() {
  document
    .querySelectorAll(
      ".collapse-toggle"
    )
    .forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          const card =
            btn.closest(
              ".collapsible-card"
            );

          if (card) {
            card.classList.toggle(
              "open"
            );
          }
        }
      );
    });
}

/* =========================
   PERIODIC RESET CHECK
========================= */

let challengeResetCheckTimer =
  null;

function startChallengeResetMonitoring() {
  if (
    challengeResetCheckTimer
  ) {
    return;
  }

  /*
   * Ce contrôle est une sécurité supplémentaire.
   *
   * Le Socket.IO reste le système principal
   * pour les joueurs connectés.
   */
  challengeResetCheckTimer =
    setInterval(
      async () => {
        await checkGlobalChallengeReset();
      },
      10000
    );
}

window.addEventListener(
  "focus",
  async () => {
    await checkGlobalChallengeReset();
    await fetchAllLeaderboardsFromServer();
  }
);

document.addEventListener(
  "visibilitychange",
  async () => {
    if (
      document.visibilityState ===
      "visible"
    ) {
      await checkGlobalChallengeReset();
      await fetchAllLeaderboardsFromServer();
    }
  }
);

/* =========================
   GLOBAL FUNCTIONS
========================= */

window.handleWin =
  handleWin;

window.handleLoss =
  handleLoss;

window.renderAllChallenge =
  renderAll;

window.renderProfileChallenge =
  renderProfile;

window.renderLeaderboardChallenge =
  renderLeaderboard;

window.renderHistoryChallenge =
  renderHistory;

window.prepareNextChallengeRound =
  prepareNextChallengeRound;

/* =========================
   INITIAL PAGE SETUP
========================= */

bindChallengePageControls();

const urlParams =
  getChallengeParamsFromURL();

/*
 * Les paramètres URL sont appliqués
 * seulement avant le contrôle global.
 *
 * Si un reset global est détecté ensuite,
 * Level 1 remplacera correctement cette valeur.
 */
if (
  urlParams.level &&
  pageAiLevelSelect
) {
  pageAiLevelSelect.value =
    urlParams.level;

  localStorage.setItem(
    "challengeLevel",
    urlParams.level
  );

  challengeData.selectedLeaderboardLevel =
    normalizeLevel(
      urlParams.level
    );
}

if (
  urlParams.first &&
  pageFirstPlayerSelect
) {
  pageFirstPlayerSelect.value =
    urlParams.first;

  localStorage.setItem(
    "challengeFirstPlayer",
    urlParams.first
  );
}

if (urlParams.challenge) {
  window.__rankedChallengeActive =
    true;
}

renderAll();

resetRoundSyncFlag();
bindCollapseCards();

/* =========================
   DEV BUTTON VISIBILITY
========================= */

const isLocal =
  location.hostname ===
    "localhost" ||
  location.hostname ===
    "127.0.0.1";

const isAdmin =
  localStorage.getItem(
    "adminMode"
  ) === "true";

if (isLocal || isAdmin) {
  document
    .querySelectorAll(
      ".dev-only"
    )
    .forEach((element) => {
      element.style.display =
        "block";
    });
}

/* =========================
   MAIN INITIALIZATION
========================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    /*
     * Installer la protection du résultat
     * Ranked Challenge.
     */
    patchChallengeGameSync();

    /*
     * Installer la protection Restart.
     *
     * Si script.js a déjà créé resetGame(),
     * le patch fonctionne immédiatement.
     */
    patchChallengeRestart();

    /*
     * Petite seconde tentative au cas où
     * script.js est chargé juste après challenge.js.
     */
    setTimeout(() => {
      patchChallengeGameSync();
      patchChallengeRestart();
    }, 500);

    /*
     * 1. Vérifier d'abord le reset global.
     */
    const globalResetApplied =
      await checkGlobalChallengeReset();

    if (globalResetApplied) {
      /*
       * Forcer de nouveau le niveau 1
       * dans tous les éléments de l'interface.
       */
      localStorage.setItem(
        "challengeLevel",
        "1"
      );

      challengeData.selectedLeaderboardLevel =
        "1";

      challengeData.playerName =
        "Player";

      challengeData.online =
        false;

      if (pageAiLevelSelect) {
        pageAiLevelSelect.value =
          "1";

        pageAiLevelSelect.disabled =
          false;
      }

      if (pagePlayerNameInput) {
        pagePlayerNameInput.value =
          "";
      }

      localStorage.removeItem(
        "challengeResult"
      );

      resetRoundSyncFlag();

      saveChallengeData();
      renderAll();
    }

    /*
     * 2. Initialiser la session Guest.
     */
    window.gomokuGuestSessionReady =
      initializeGomokuGuestSession();

    await window.gomokuGuestSessionReady;

    /*
     * 3. Charger PostgreSQL uniquement
     * si aucun reset vient d'être appliqué.
     */
    if (!globalResetApplied) {
      await loadGuestChallengeStats();
    }

    /*
     * 4. Compatibilité avec un éventuel
     * ancien challengeResult.
     */
    if (!globalResetApplied) {
      applyLastChallengeResult();
    } else {
      localStorage.removeItem(
        "challengeResult"
      );
    }

    /*
     * 5. Activer les événements Socket.IO.
     */
    registerChallengeSocketListeners();

    /*
     * 6. PostgreSQL est la source permanente
     * du leaderboard.
     */
    await fetchAllLeaderboardsFromServer();

    /*
     * 7. Réessayer les résultats qui n'avaient
     * pas pu être sauvegardés.
     */
    if (!globalResetApplied) {
      await retryPendingGuestChallengeSaves();
    }

    /*
     * 8. Réenregistrer le joueur déjà connu.
     */
    const playerName = String(
      challengeData.playerName ||
        localStorage.getItem(
          "challengePlayerName"
        ) ||
        localStorage.getItem(
          "playerName"
        ) ||
        ""
    ).trim();

    const level =
      getCurrentChallengeLevel();

    const challengeSocket =
      getChallengeSocket();

    if (
      !globalResetApplied &&
      challengeSocket &&
      playerName &&
      playerName !== "Player"
    ) {
      challengeData.online =
        true;

      challengeSocket.emit(
        "registerChallengePlayer",
        {
          playerId:
            getChallengePlayerId(),

          name:
            playerName,

          level
        }
      );
    }

    /*
     * 9. Rafraîchir le classement
     * du joueur.
     */
    if (!globalResetApplied) {
      await syncCurrentPlayerToServer();
    }

    /*
     * 10. Démarrer la surveillance
     * du reset global.
     */
    startChallengeResetMonitoring();

    renderAll();

    console.log(
      "✅ Challenge system initialized"
    );
  }
);