// script.js (UI + jeu) - utilise aiWorker.js (IA dans un Web Worker)

const board = document.getElementById("board");
const resetButton = document.getElementById("reset");
const status = document.getElementById("status");

const modeSelect = document.getElementById("mode");
const aiSelect = document.getElementById("aiLevel");
const firstPlayerSelect = document.getElementById("firstPlayer");

const size = 15;
const N = size * size;
const grid = Array(N).fill(null);

const AI_PLAYER = "white";
const HUMAN_PLAYER = "black";

let currentPlayer = "black";
let gameOver = false;
let cells = [];

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

  const line = getWinningLine(i);
  if (line) {
    gameOver = true;
    line.forEach(idx => cells[idx].classList.add("winner"));
    status.textContent = `🎉 Gagnant : ${currentPlayer === "black" ? "Noir" : "Blanc"}`;
    return;
  }

  currentPlayer = currentPlayer === "black" ? "white" : "black";
  document.body.classList.toggle("white-turn", currentPlayer === "white");

  if (modeSelect.value === "ai" && currentPlayer === AI_PLAYER) {
    status.textContent = "Tour : IA";
  } else {
    status.textContent = `Tour : ${currentPlayer === "black" ? "Noir" : "Blanc"}`;
  }

  maybePlayAI();
}

function handleAIMove(i) {
  if (gameOver) return;
  if (modeSelect.value !== "ai") return;
  if (currentPlayer !== AI_PLAYER) return;
  if (i == null || grid[i]) return;

  grid[i] = AI_PLAYER;
  placeStoneVisual(i, AI_PLAYER);

  const line = getWinningLine(i);
  if (line) {
    gameOver = true;
    line.forEach(idx => cells[idx].classList.add("winner"));
    status.textContent = "🎉 Gagnant : IA (Blanc)";
    return;
  }

  currentPlayer = HUMAN_PLAYER;
  document.body.classList.toggle("white-turn", false);
  status.textContent = "Tour : Noir";
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

document.addEventListener("DOMContentLoaded", () => {
  initWorker();
  resetGame();
});

// ---------- PRNG deterministic (for zobrist, stable) ----------
let SEED = 123456789;
function rnd32() {
  SEED ^= (SEED << 13) >>> 0;
  SEED ^= (SEED >>> 17) >>> 0;
  SEED ^= (SEED << 5) >>> 0;
  return SEED >>> 0;
}

let zobB = null;
let zobW = null;

function initZobrist() {
  SEED = 0xC0FFEE ^ (size * 99991);
  zobB = new Uint32Array(N);
  zobW = new Uint32Array(N);
  for (let i = 0; i < N; i++) {
    zobB[i] = rnd32();
    zobW[i] = rnd32();
  }
}

function inBounds(r, c) { return r >= 0 && r < size && c >= 0 && c < size; }
function idxOf(r, c) { return r * size + c; }
function rcOf(i) { return [Math.floor(i / size), i % size]; }
function oppOf(p) { return p === AI ? HU : AI; }

// ---------- hashing ----------
function hashBoard() {
  let h = 0 >>> 0;
  for (let i = 0; i < N; i++) {
    const v = grid[i];
    if (v === "black") h ^= zobB[i];
    else if (v === "white") h ^= zobW[i];
  }
  return h >>> 0;
}

// ---------- fast win check ----------
function maxLineAt(index, player) {
  const [r, c] = rcOf(index);
  let best = 1;

  for (const [dr, dc] of DIRS) {
    let count = 1;
    let rr = r + dr, cc = c + dc;
    while (inBounds(rr, cc) && grid[idxOf(rr, cc)] === player) { count++; rr += dr; cc += dc; }
    rr = r - dr; cc = c - dc;
    while (inBounds(rr, cc) && grid[idxOf(rr, cc)] === player) { count++; rr -= dr; cc -= dc; }
    best = Math.max(best, count);
  }
  return best;
}

function isWinMove(index, player) {
  if (grid[index]) return false;
  grid[index] = player;
  const won = maxLineAt(index, player) >= 5;
  grid[index] = null;
  return won;
}

// ---------- candidates ----------
function hasAnyStone() {
  for (let i = 0; i < N; i++) if (grid[i]) return true;
  return false;
}

function getCandidates(radius) {
  if (!hasAnyStone()) return [Math.floor(N / 2)];

  const moves = new Set();
  for (let i = 0; i < N; i++) {
    if (!grid[i]) continue;
    const [r0, c0] = rcOf(i);
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (!inBounds(r, c)) continue;
        const j = idxOf(r, c);
        if (!grid[j]) moves.add(j);
      }
    }
  }
  return [...moves];
}

// ---------- local pattern / threat eval ----------
function cellChar(r, c, player) {
  if (!inBounds(r, c)) return "#";
  const v = grid[idxOf(r, c)];
  if (!v) return ".";
  return v === player ? "X" : "O";
}
function lineString(index, dr, dc, player, span = 5) {
  const [r0, c0] = rcOf(index);
  let s = "";
  for (let k = -span; k <= span; k++) s += cellChar(r0 + k * dr, c0 + k * dc, player);
  return s;
}

function classifyMove(index, player) {
  if (grid[index]) return null;

  const backup = grid[index];
  grid[index] = player;

  let win = false;
  let open4 = 0, four = 0, open3 = 0, broken3 = 0, strong2 = 0;

  for (const [dr, dc] of DIRS) {
    const s = lineString(index, dr, dc, player, 5);

    if (s.includes("XXXXX")) win = true;

    if (/\.XXXX\./.test(s)) open4++;

    if (/XXXX\./.test(s) || /\.XXXX/.test(s) || /XXX\.X/.test(s) || /XX\.XX/.test(s) || /X\.XXX/.test(s)) four++;

    if (/\.XXX\./.test(s)) open3++;

    if (/\.XX\.X\./.test(s) || /\.X\.XX\./.test(s) || /XX\.X/.test(s) || /X\.XX/.test(s)) broken3++;

    if (/\.XX\./.test(s) || /\.X\.X\./.test(s)) strong2++;
  }

  grid[index] = backup;
  return { win, open4, four, open3, broken3, strong2 };
}

function forkScore(th) {
  if (!th) return 0;
  const th3 = th.open3 + th.broken3;
  if (th.open4 >= 2) return 9_000_000;                 // 4x4
  if (th.open4 >= 1 && th3 >= 1) return 3_600_000;     // 4x3
  if (th3 >= 2) return 950_000;                        // 3x3
  return 0;
}
const W = {
  WIN: 40_000_000,
  OPEN4: 6_000_000,
  FOUR: 700_000,
  OPEN3: 150_000,
  BROKEN3: 70_000,
  STRONG2: 12_000,

  DEF_OPEN4: 5_800_000,
  DEF_FORK: 3_200_000,
  DEF_OPEN3: 135_000,
  DEF_STRONG2: 10_000,
};

function quickMoveScore(index, player) {
  const opp = oppOf(player);
  const a = classifyMove(index, player);
  const d = classifyMove(index, opp);
  if (!a || !d) return -Infinity;

  let s = 0;

  // Attack
  if (a.win) s += W.WIN;
  s += a.open4 * W.OPEN4;
  s += a.four * W.FOUR;
  s += a.open3 * W.OPEN3;
  s += a.broken3 * W.BROKEN3;
  s += a.strong2 * W.STRONG2;
  s += forkScore(a);

  // Defense (open4/forks strong; open3 less to keep initiative)
  s += d.open4 * W.DEF_OPEN4;
  s += forkScore(d) * 0.98;
  s += d.open3 * W.DEF_OPEN3;
  s += d.strong2 * W.DEF_STRONG2;

  // Center bonus
  const [r, c] = rcOf(index);
  const center = (size - 1) / 2;
  const dist = Math.abs(r - center) + Math.abs(c - center);
  s += (size - dist) * 18;

  return s;
}

function orderCandidates(cands, player, limit) {
  const scored = cands.map(m => ({ m, s: quickMoveScore(m, player) }));
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map(x => x.m);
}

function evalPositionFast() {
  const c2 = getCandidates(2);
  let bestAI = 0, bestHU = 0;
  for (const m of c2) {
    bestAI = Math.max(bestAI, quickMoveScore(m, AI));
    bestHU = Math.max(bestHU, quickMoveScore(m, HU));
  }
  return bestAI - bestHU;
}

// ---------- tactical forced move ----------
function bestTacticalMove(level) {
  const radius = level >= 4 ? 3 : 2;
  const cands = orderCandidates(getCandidates(radius), AI, 32);

  // 0) win now
  for (const m of cands) if (isWinMove(m, AI)) return m;

  // 1) block immediate loss
  for (const m of cands) if (isWinMove(m, HU)) return m;

  // 2) create open4
  for (const m of cands) {
    const a = classifyMove(m, AI);
    if (a && a.open4 >= 1) return m;
  }

  // 3) block opponent open4
  for (const m of cands) {
    const d = classifyMove(m, HU);
    if (d && d.open4 >= 1) return m;
  }

  // 4) create forks
  for (const m of cands) {
    const a = classifyMove(m, AI);
    if (a && forkScore(a) >= 3_600_000) return m;
  }
  for (const m of cands) {
    const a = classifyMove(m, AI);
    if (a && forkScore(a) >= 950_000) return m;
  }

  // 5) block dangerous forks
  for (const m of cands) {
    const d = classifyMove(m, HU);
    if (d && forkScore(d) >= 3_600_000) return m;
  }
  for (const m of cands) {
    const d = classifyMove(m, HU);
    if (d && forkScore(d) >= 950_000) return m;
  }

  // 6) open3: attack if strong enough else block
  let bestAtk = null, bestAtkS = -Infinity;
  let bestBlk = null, bestBlkS = -Infinity;

  for (const m of cands) {
    const a = classifyMove(m, AI);
    const d = classifyMove(m, HU);
    const s = quickMoveScore(m, AI);

    if (a && (a.open3 >= 1 || a.broken3 >= 2)) {
      if (s > bestAtkS) { bestAtkS = s; bestAtk = m; }
    }
    if (d && (d.open3 >= 1 || d.broken3 >= 2)) {
      if (s > bestBlkS) { bestBlkS = s; bestBlk = m; }
    }
  }

  if (bestAtk != null && bestAtkS >= 320_000) return bestAtk;
  if (bestBlk != null) return bestBlk;

  return null;
}
// ---------- Negamax alpha-beta with time cutoff + TT ----------
let TT = new Map(); // key -> {depth, val}
function ttGet(key, depth) {
  const v = TT.get(key);
  if (v && v.depth >= depth) return v.val;
  return null;
}
function ttPut(key, depth, val) {
  TT.set(key, { depth, val });
  if (TT.size > 250000) TT.clear();
}

function negamax(depth, alpha, beta, player, radius, endTime) {
  if (Date.now() >= endTime) return evalPositionFast() * (player === AI ? 1 : -1);
  if (depth === 0) return evalPositionFast() * (player === AI ? 1 : -1);

  const h = hashBoard();
  const tt = ttGet(h, depth);
  if (tt != null) return tt;

  const cands = orderCandidates(getCandidates(radius), player, 10);

  // immediate win
  for (const m of cands) {
    if (isWinMove(m, player)) {
      const v = 9_999_999;
      ttPut(h, depth, v);
      return v;
    }
  }

  let best = -Infinity;
  const opp = oppOf(player);

  for (const m of cands) {
    if (Date.now() >= endTime) break;

    grid[m] = player;

    // blunder check: allow opponent immediate win?
    let blunder = 0;
    const oc = getCandidates(2);
    for (const om of oc) {
      if (isWinMove(om, opp)) { blunder = 2_500_000; break; }
    }

    const val = -negamax(depth - 1, -beta, -alpha, opp, radius, endTime) - blunder;
    grid[m] = null;

    if (val > best) best = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }

  ttPut(h, depth, best);
  return best;
}

// ---------- main choose move (iterative deepening) ----------
function chooseMove(level, thinkMs) {
  const t = bestTacticalMove(level);
  if (t != null) return t;

  const cfg = {
    1: { maxDepth: 2, radius: 2 },
    2: { maxDepth: 3, radius: 2 },
    3: { maxDepth: 4, radius: 2 },
    4: { maxDepth: 5, radius: 3 },
    5: { maxDepth: 6, radius: 3 },
  }[String(level)] || { maxDepth: 4, radius: 2 };

  const endTime = Date.now() + thinkMs;

  let root = orderCandidates(getCandidates(cfg.radius), AI, 14);
  let bestMove = root[0] ?? Math.floor(N / 2);
  let bestVal = -Infinity;

  for (let depth = 1; depth <= cfg.maxDepth; depth++) {
    if (Date.now() >= endTime) break;

    root = orderCandidates(root, AI, root.length);

    let localBestMove = bestMove;
    let localBestVal = -Infinity;

    for (const m of root) {
      if (Date.now() >= endTime) break;
      if (grid[m]) continue;

      if (isWinMove(m, AI)) return m;

      grid[m] = AI;
      const val = -negamax(depth - 1, -Infinity, Infinity, HU, cfg.radius, endTime);
      grid[m] = null;

      if (val > localBestVal) {
        localBestVal = val;
        localBestMove = m;
      }
    }

    if (localBestVal > bestVal) {
      bestVal = localBestVal;
      bestMove = localBestMove;
    }
  }

  return bestMove;
}

// ---------- worker messaging ----------
let lastJobId = 0;

self.onmessage = (e) => {
  const msg = e.data;

  if (msg.type === "init") {
    size = msg.size ?? 15;
    N = size * size;
    grid = Array(N).fill(null);   // ✅ voilà la ligne qui te manquait
    AI = msg.ai ?? "white";
    HU = msg.human ?? "black";
    initZobrist();
    TT = new Map();
    self.postMessage({ type: "inited" });
    return;
  }

  if (msg.type === "think") {
    console.log("🧠 worker think reçu");

    const jobId = msg.jobId;
    lastJobId = jobId;

    grid = msg.grid.slice();
    AI = msg.ai;
    HU = msg.human;

    const level = msg.level ?? 3;
    const thinkMs = msg.thinkMs ?? ({ 1: 120, 2: 200, 3: 320, 4: 450, 5: 650 }[level] || 320);

    const move = chooseMove(level, thinkMs);

    if (jobId !== lastJobId) return;

    self.postMessage({ type: "move", jobId, move });
    return;
  }
};