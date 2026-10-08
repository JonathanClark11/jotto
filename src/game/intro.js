// First-time-user intros. Pure helpers so the show/skip/persist rules are unit-testable.
// Flags live in localStorage; once set they are never cleared by the app.
export const INTRO_KEYS = {
  howto: 'cinq-intro-howto-seen',
  multiplayer: 'cinq-intro-multiplayer-seen',
};

export const INTRO_CARDS = {
  howto: [
    { title: 'Find the secret word', body: 'Every Cinqle word has five letters. Guess any five-letter word to get a clue.' },
    { title: 'The clue is a count', body: 'You get a number: how many letters of your guess are in the secret word. Not which ones, and not where.' },
    { title: 'Not Wordle', body: 'No green or yellow tiles. Only the count, and no letter repeats in a word. Use the counts to work out which letters are in.' },
    { title: 'Cross out and circle', body: 'Tap letters on the board to circle the ones you think are in and cross out the ones that are out.' },
  ],
  multiplayer: [
    {
      title: 'How multiplayer works',
      body: 'Each player picks a secret word. Take turns guessing each other’s word and get the count back. The first to crack the other’s word wins.',
    },
  ],
};

function read(storage, key) {
  try { return storage.getItem(key) === '1'; } catch { return false; }
}

export function hasSeenIntro(kind, storage = globalThis.localStorage) {
  return read(storage, INTRO_KEYS[kind]);
}

// Marks the intro as seen (completed or skipped). Storage failures are ignored.
export function markIntroSeen(kind, storage = globalThis.localStorage) {
  try { storage.setItem(INTRO_KEYS[kind], '1'); } catch { /* optional */ }
}

export function shouldShowIntro(kind, storage = globalThis.localStorage) {
  return !hasSeenIntro(kind, storage);
}
