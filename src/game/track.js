// Sink-agnostic analytics seam. Call sites use track(name, props); where events go is decided in one place.
// The default sink is a no-op: nothing is sent anywhere until a sink is chosen (see #36) and passed to setSink.
// Props must never carry PII (no playerKey, names, friend IDs or match codes). See docs/analytics-events.md.
const noopSink = () => {};
let sink = noopSink;

// Replaces the active sink. Pass null/undefined (or a non-function) to restore the no-op default.
export function setSink(next) {
  sink = typeof next === 'function' ? next : noopSink;
}

// Never throws: a broken sink must not break the game.
export function track(name, props = {}) {
  try { sink(name, { ...props }); } catch { /* analytics is best effort */ }
}

export const FIRST_MATCH_KEY = 'cinq-first-match-tracked';

export function trackHowToOpened() {
  track('howto_opened');
}

// Only the intro kind 'howto' is measured; completed is false when the player skipped.
export function trackIntroClosed(kind, completed) {
  if (kind === 'howto' && completed) track('howto_completed');
}

// Called once per successfully created/joined/rematched match. first_match_started fires only the first time
// on this device (flag in localStorage); rematch_started fires for every rematch.
export function trackMatchStarted(intent, storage = globalThis.localStorage) {
  let first = false;
  try {
    first = storage.getItem(FIRST_MATCH_KEY) !== '1';
    if (first) storage.setItem(FIRST_MATCH_KEY, '1');
  } catch { /* storage unavailable: skip the first-match event rather than repeat it */ }
  if (first) track('first_match_started', { intent });
  if (intent === 'rematch') track('rematch_started');
}

export function trackFriendAdded() {
  track('friend_added');
}
