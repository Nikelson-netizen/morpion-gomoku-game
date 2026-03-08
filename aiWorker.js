self.postMessage({ type: "inited" });

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

const SCORE = {
  WIN: 100000000,
  OPEN_FOUR: 5000000,
  FOUR: 1000000,
  OPEN_THREE: 180000,
  BROKEN_THREE: 70000,
  THREE: 25000,
  OPEN_TWO: 5000,
  TWO: 1200,
  ONE: 80,
};

function indexToRC(i, size) {
  return [Math.floor(i / size), i % size];
}

function rcToIndex(r, c, size) {
  return r * size + c;
}

function inBounds(r, c, size) {
  return r >= 0 && c >= 0 && r < size && c < size;
}

function countStones(grid) {
  let n = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] != null) n++;
  }
  return n;
}

function centerIndex(size) {
  return rcToIndex(Math.floor(size / 2), Math.floor(size / 2), size);
}

function centerMove(grid, size) {
  const c = centerIndex(size);
  return grid[c] == null ? c : null;
}

function getAllEmpty(grid) {
  const arr = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] == null) arr.push(i);
  }
  return arr;
}

function randomMove(grid) {
  const empty = getAllEmpty(grid);
  if (empty.length === 0) return null;
  return empty[(Math.random() * empty.length) | 0];
}

function countDir(grid, r, c, dr, dc, player, size) {
  let n = 0;
  r += dr;
  c += dc;

  while (inBounds(r, c, size) && grid[rcToIndex(r, c, size)] === player) {
    n++;
    r += dr;
    c += dc;
  }

  return n;
}

function maxLineAt(grid, index, player, size) {
  const [r, c] = indexToRC(index, size);
  let best = 1;

  for (const [dr, dc] of DIRS) {
    const a = countDir(grid, r, c, dr, dc, player, size);
    const b = countDir(grid, r, c, -dr, -dc, player, size);
    best = Math.max(best, 1 + a + b);
  }

  return best;
}

function isWinningMove(grid, index, player, size) {
  if (grid[index] != null) return false;
  grid[index] = player;
  const ok = maxLineAt(grid, index, player, size) >= 5;
  grid[index] = null;
  return ok;
}

function findWinningMove(grid, player, size, candidates = null) {
  const arr = candidates || getAllEmpty(grid);

  for (const i of arr) {
    if (grid[i] != null) continue;

    grid[i] = player;
    const win = maxLineAt(grid, i, player, size) >= 5;
    grid[i] = null;

    if (win) return i;
  }

  return null;
}

function getCandidateMoves(grid, size, radius = 2) {
  if (countStones(grid) === 0) {
    return [centerIndex(size)];
  }

  const set = new Set();

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] == null) continue;

    const [r, c] = indexToRC(i, size);

    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const rr = r + dr;
        const cc = c + dc;

        if (!inBounds(rr, cc, size)) continue;

        const idx = rcToIndex(rr, cc, size);
        if (grid[idx] == null) set.add(idx);
      }
    }
  }

  return [...set];
}

function nearMove(grid, size) {
  const candidates = getCandidateMoves(grid, size, 2);
  if (candidates.length === 0) return null;

  const centerR = Math.floor(size / 2);
  const centerC = Math.floor(size / 2);

  let best = null;
  let bestScore = -Infinity;

  for (const i of candidates) {
    const [r, c] = indexToRC(i, size);

    let localScore = 0;

    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (dr === 0 && dc === 0) continue;

        const rr = r + dr;
        const cc = c + dc;

        if (!inBounds(rr, cc, size)) continue;

        const v = grid[rcToIndex(rr, cc, size)];
        if (v != null) localScore += 10;
      }
    }

    const distCenter = Math.abs(r - centerR) + Math.abs(c - centerC);
    const score = localScore - distCenter;

    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  return best;
}

function lineString(grid, r, c, dr, dc, player, size) {
  let s = "";

  for (let k = -4; k <= 4; k++) {
    const rr = r + dr * k;
    const cc = c + dc * k;

    if (!inBounds(rr, cc, size)) {
      s += "#";
      continue;
    }

    const idx = rcToIndex(rr, cc, size);
    const v = grid[idx];

    if (rr === r && cc === c) {
      s += "X";
    } else if (v === player) {
      s += "X";
    } else if (v == null) {
      s += ".";
    } else {
      s += "O";
    }
  }

  return s;
}

function scorePatternString(str) {
  if (str.includes("XXXXX")) return SCORE.WIN;

  if (str.includes(".XXXX.")) return SCORE.OPEN_FOUR;

  if (
    str.includes("XXXX.") ||
    str.includes(".XXXX") ||
    str.includes("XXX.X") ||
    str.includes("XX.XX") ||
    str.includes("X.XXX")
  ) return SCORE.FOUR;

  if (str.includes(".XXX.")) return SCORE.OPEN_THREE;

  if (
    str.includes(".XX.X.") ||
    str.includes(".X.XX.") ||
    str.includes("XX..X") ||
    str.includes("X..XX")
  ) return SCORE.BROKEN_THREE;

  if (
    str.includes("XXX..") ||
    str.includes("..XXX") ||
    str.includes(".XX.") ||
    str.includes(".X.X.")
  ) return SCORE.THREE;

  if (str.includes("XX..") || str.includes("..XX")) return SCORE.OPEN_TWO;

  if (str.includes(".X.")) return SCORE.ONE;

  return 0;
}

function scoreMove(grid, index, player, size) {
  if (grid[index] != null) return -Infinity;

  const [r, c] = indexToRC(index, size);
  let score = 0;

  for (const [dr, dc] of DIRS) {
    const str = lineString(grid, r, c, dr, dc, player, size);
    score += scorePatternString(str);
  }

  return score;
}

function createDoubleThreat(grid, index, player, size) {
  if (grid[index] != null) return false;

  grid[index] = player;
  const candidates = getCandidateMoves(grid, size, 2);

  let strongThreats = 0;

  for (const m of candidates) {
    if (grid[m] != null) continue;

    const s = scoreMove(grid, m, player, size);
    if (s >= SCORE.OPEN_FOUR || isWinningMove(grid, m, player, size)) {
      strongThreats++;
      if (strongThreats >= 2) {
        grid[index] = null;
        return true;
      }
    }
  }

  grid[index] = null;
  return false;
}
function analyzeOpenLinesForMove(grid, index, player, size) {
  if (grid[index] != null) return null;

  grid[index] = player;

  let openTwo = 0;
  let openThree = 0;
  let openFour = 0;

  for (const [dr, dc] of DIRS) {
    const [r, c] = indexToRC(index, size);

    let left = 0;
    let rr = r - dr;
    let cc = c - dc;
    while (inBounds(rr, cc, size) && grid[rcToIndex(rr, cc, size)] === player) {
      left++;
      rr -= dr;
      cc -= dc;
    }
    const leftOpen = inBounds(rr, cc, size) && grid[rcToIndex(rr, cc, size)] == null;

    let right = 0;
    rr = r + dr;
    cc = c + dc;
    while (inBounds(rr, cc, size) && grid[rcToIndex(rr, cc, size)] === player) {
      right++;
      rr += dr;
      cc += dc;
    }
    const rightOpen = inBounds(rr, cc, size) && grid[rcToIndex(rr, cc, size)] == null;

    const total = 1 + left + right;
    const isOpen = leftOpen && rightOpen;

    if (isOpen && total === 2) openTwo++;
    if (isOpen && total === 3) openThree++;
    if (isOpen && total === 4) openFour++;
  }

  grid[index] = null;

  return { openTwo, openThree, openFour };
}

function bestHeuristicMove(grid, ai, human, size, level) {
  let candidates = getCandidateMoves(grid, size, 2);

  if (candidates.length === 0) {
    return centerMove(grid, size) ?? randomMove(grid);
  }

  let best = null;
  let bestScore = -Infinity;

  for (const i of candidates) {
    if (grid[i] != null) continue;

    const attack = scoreMove(grid, i, ai, size);
const defend = scoreMove(grid, i, human, size);

const aiLines = analyzeOpenLinesForMove(grid, i, ai, size);
const huLines = analyzeOpenLinesForMove(grid, i, human, size);

let total = 0;

if (level === 1) {
  total = attack * 0.55 + defend * 0.45;
} else if (level === 2) {
  total = attack * 0.90 + defend * 1.05;
} else if (level === 3) {
  total = attack * 1.20 + defend * 1.10;
} else if (level === 4) {
  total = attack * 1.25 + defend * 1.20;
} else {
  total = attack * 1.35 + defend * 1.25;
}

if (aiLines) {
  total += aiLines.openTwo * (level >= 5 ? 14000 : level >= 4 ? 9000 : 2500);
  total += aiLines.openThree * (level >= 5 ? 140000 : level >= 4 ? 90000 : 25000);
  total += aiLines.openFour * (level >= 5 ? 1400000 : level >= 4 ? 900000 : 250000);

  if (aiLines.openTwo >= 2) {
    total += (level >= 5 ? 60000 : level >= 4 ? 30000 : 8000);
  }

  if (aiLines.openThree >= 2) {
    total += (level >= 5 ? 350000 : level >= 4 ? 180000 : 50000);
  }
}

if (huLines) {
  total += huLines.openTwo * (level >= 5 ? 10000 : level >= 4 ? 7000 : 2000);
  total += huLines.openThree * (level >= 5 ? 100000 : level >= 4 ? 70000 : 20000);
  total += huLines.openFour * (level >= 5 ? 1000000 : level >= 4 ? 700000 : 200000);
}

    if (createDoubleThreat(grid, i, ai, size)) total += 900000;
    if (createDoubleThreat(grid, i, human, size)) total += 850000;

    const [r, c] = indexToRC(i, size);
    const cr = Math.floor(size / 2);
    const cc = Math.floor(size / 2);
    const distCenter = Math.abs(r - cr) + Math.abs(c - cc);

    total -= distCenter * (level >= 3 ? 4 : 2);

    if (total > bestScore) {
      bestScore = total;
      best = i;
    }
  }

  return best;
}

self.onmessage = function (e) {
  const { grid, ai, human, level = 1, jobId } = e.data;
  const size = Math.sqrt(grid.length);

  let move = null;

  // 1) gagner immédiatement
  move = findWinningMove(grid, ai, size);
  if (move != null) {
    self.postMessage({ type: "move", jobId, move });
    return;
  }

  // 2) bloquer victoire immédiate
  move = findWinningMove(grid, human, size);
  if (move != null) {
    self.postMessage({ type: "move", jobId, move });
    return;
  }

  // 3) premier coup
  if (countStones(grid) === 0) {
    move = centerMove(grid, size);
    self.postMessage({ type: "move", jobId, move });
    return;
  }

  // 4) niveaux
  if (level === 1) {
    move = nearMove(grid, size) ?? randomMove(grid);
  } else if (level === 2) {
    move = bestHeuristicMove(grid, ai, human, size, 2);
  } else if (level === 3) {
    move = bestHeuristicMove(grid, ai, human, size, 3);
  } else if (level === 4) {
    move = bestHeuristicMove(grid, ai, human, size, 4);
  } else {
    move = bestHeuristicMove(grid, ai, human, size, 5);
  }

  if (move == null) {
    move = randomMove(grid);
  }

  self.postMessage({
    type: "move",
    jobId,
    move,
  });
};