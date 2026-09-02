// Core Jortal game rules — pure functions, no React/DOM here.

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
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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
    return JSON.parse(localStorage.getItem('jotto-daily-history') || '[]');
  } catch {
    return [];
  }
}

export function saveHistory(hist) {
  try {
    localStorage.setItem('jotto-daily-history', JSON.stringify(hist));
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
