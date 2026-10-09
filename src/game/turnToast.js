// One-time turn warning toasts. A key is "code:threshold"; once shown it is remembered in device storage.
const TOAST_KEY = 'cinq-turn-toasts';

function readSeen(storage) {
  try {
    const rows = JSON.parse(storage.getItem(TOAST_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function hasSeenTurnToast(key, storage = globalThis.localStorage) {
  return readSeen(storage).includes(key);
}

// Returns true the first time a key is seen (and records it), false afterwards. Storage failures are ignored.
export function claimTurnToast(key, storage = globalThis.localStorage) {
  const seen = readSeen(storage);
  if (seen.includes(key)) return false;
  try { storage.setItem(TOAST_KEY, JSON.stringify([...seen, key].slice(-200))); } catch { /* optional */ }
  return true;
}
