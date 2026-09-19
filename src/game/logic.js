// Core Cinq game rules — pure functions, no React/DOM here.

export function shared(a, b) {
  let n = 0;
  for (const c of a) if (b.indexOf(c) >= 0) n++;
  return n;
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function todayKey() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

// FNV-1a deterministically derives today's word from the calendar date,
// so every player sees the same daily challenge.
export function hashKey(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function dailyWord(key, list) {
  return list[hashKey(key) % list.length];
}

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem('cinq-daily-history') || '[]');
  } catch {
    return [];
  }
}

export function saveHistory(hist) {
  try {
    localStorage.setItem('cinq-daily-history', JSON.stringify(hist));
  } catch {
    // storage unavailable — daily stats just won't persist
  }
}

// Letters that logic alone proves are NOT in the word:
// (a) every letter of a 0-count guess; (b) if circled letters in a guess
// already account for its full count, the rest of that guess.
export function autoElim(myGuesses, marks) {
  const out = {};
  for (const g of myGuesses) {
    const letters = g.word.split('');
    if (g.count === 0) {
      for (const c of letters) if (marks[c] !== 'has') out[c] = true;
      continue;
    }
    const circled = letters.filter((c) => marks[c] === 'has');
    if (circled.length >= g.count) {
      for (const c of letters) if (marks[c] !== 'has') out[c] = true;
    }
  }
  return out;
}

export const GROUP_TOOL_COLORS = {
  1: { c: '#C58A2D', bg: '#F6EEDC' },
  2: { c: '#8A5FA0', bg: '#EFE9F5' },
  3: { c: '#0E7C86', bg: '#E7F0F1' },
};

// Per-group palette: each committed group gets its own color by creation
// order, cycling, so "1 of" and "2 of" groups stay visually distinguishable.
export const GROUP_PALETTE = [
  { c: '#C58A2D', bg: '#F6EEDC' },
  { c: '#8A5FA0', bg: '#EFE9F5' },
  { c: '#0E7C86', bg: '#E7F0F1' },
  { c: '#B0507A', bg: '#F5E8EE' },
  { c: '#5B7A3A', bg: '#EBF0E2' },
  { c: '#4763B8', bg: '#E8ECF7' },
];

export function groupColor(i) {
  return GROUP_PALETTE[i % GROUP_PALETTE.length];
}

const COUNT_EMOJI = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

export function buildShareText(puzzleNum, guesses, won) {
  const rows = guesses.map((g, i) =>
    i === guesses.length - 1 && won ? '✅' : COUNT_EMOJI[Math.min(g.count, 5)]
  );
  const header = won
    ? `Cinqle #${puzzleNum} — solved in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}`
    : `Cinqle #${puzzleNum} — X/${guesses.length}`;
  return `${header}\n\n${rows.join(' ')}\n\ncinqle.app`;
}

// Puzzle #1 = Sep 1 2026 — sequential number shown in history.
const PUZZLE_EPOCH = '2026-09-01';
export function puzzleNumber(dateKey) {
  const epochMs = new Date(PUZZLE_EPOCH + 'T12:00:00').getTime();
  const keyMs = new Date(dateKey + 'T12:00:00').getTime();
  return Math.max(1, Math.round((keyMs - epochMs) / 86400000) + 1);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function computeLocalStats(history) {
  const total = history.length;
  if (total === 0) return { currentStreak: 0, bestStreak: 0, avgGuesses: null, winPct: 0, total: 0 };

  const wins = history.filter((r) => r.won !== false);
  const winSet = new Set(wins.map((r) => r.date));

  const today = todayKey();
  const yesterday = addDays(today, -1);

  let currentStreak = 0;
  let startDate = winSet.has(today) ? today : (winSet.has(yesterday) ? yesterday : null);
  if (startDate) {
    let d = startDate;
    while (winSet.has(d)) { currentStreak++; d = addDays(d, -1); }
  }

  const sortedWins = [...winSet].sort();
  let bestStreak = 0, run = 0, prev = null;
  for (const s of sortedWins) {
    run = prev && addDays(prev, 1) === s ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
    prev = s;
  }

  const avgGuesses = wins.length > 0
    ? Number((wins.reduce((s, r) => s + r.n, 0) / wins.length).toFixed(1))
    : null;

  return {
    currentStreak,
    bestStreak,
    avgGuesses,
    winPct: Math.round((wins.length / total) * 100),
    total,
  };
}
