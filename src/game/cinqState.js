// Pure state transitions extracted from useCinq so they can be unit tested. No behavior change.

export function freshRound() {
  return {
    myGuesses: [], rivalGuesses: [], marks: {}, groups: [],
    pendingTool: null, pendingLetters: [], tool: 'type', view: 'you',
    rivalNew: false, thinking: false, result: null, reviewing: false,
    error: '', input: '', setupInput: '', setupName: '', pendingGuess: '', shareFeedback: '',
    dailyStats: null, dailyStatsLoading: false,
  };
}

// State after a server match payload arrives. savedMatches and friends are computed by the caller (they touch storage).
export function nextMatchState(previous, match, token, savedMatches, friends) {
  const sameMatch = previous.matchCode === match.code;
  const madeGuess = sameMatch && (match.yourGuesses || []).length > previous.myGuesses.length;
  const base = sameMatch ? previous : { ...previous, ...freshRound() };
  const finished = match.status === 'finished';
  const won = finished && match.winner === match.role;
  const result = finished ? {
    won,
    n: won ? match.yourGuesses.length : match.opponentGuesses.length,
    attempts: match.yourGuesses.length,
    multiplayer: true,
  } : null;
  const acceptedQueue = sameMatch && match.pendingGuess && match.pendingGuess !== previous.pendingGuess;
  return {
    ...base,
    friends,
    screen: 'game', mode: 'rival',
    matchCode: match.code, playerToken: token,
    matchStatus: match.status, playerRole: match.role,
    currentTurn: match.currentTurn, yourTurn: match.yourTurn, matchUpdatedAt: match.updatedAt || '',
    opponentJoined: match.opponentJoined, winner: match.winner,
    myName: match.yourName || '', opponentName: match.opponentName || '',
    pendingGuess: match.pendingGuess || '', savedMatches,
    rematchCode: match.rematchCode || '',
    mySecret: match.yourSecret || '', rivalSecret: match.opponentSecret || '',
    myGuesses: match.yourGuesses || [], rivalGuesses: match.opponentGuesses || [],
    input: (madeGuess || acceptedQueue) ? '' : base.input,
    rivalNew: (match.opponentGuesses || []).length > previous.rivalGuesses.length && previous.view !== 'rival',
    result,
    reviewing: result && previous.result ? previous.reviewing : false,
    matchBusy: false,
  };
}

// Patch for tapping a keyboard letter, or null when the tap does nothing.
export function tapLetterPatch(current, letter) {
  if (current.screen === 'setup') {
    if (current.setupInput.length < 5 && !current.setupInput.includes(letter)) return { setupInput: current.setupInput + letter, error: '' };
    return null;
  }
  if (current.screen !== 'game' || current.result) return null;
  if (current.mode === 'rival' && current.matchStatus !== 'active') return null;
  if (current.pendingTool) {
    const letters = current.pendingLetters.slice();
    const index = letters.indexOf(letter);
    if (index >= 0) letters.splice(index, 1); else letters.push(letter);
    return { pendingLetters: letters };
  }
  if (current.tool === 'elim' || current.tool === 'has') {
    const marks = { ...current.marks };
    if (marks[letter] === current.tool) delete marks[letter]; else marks[letter] = current.tool;
    return { marks };
  }
  if (current.input.length < 5 && !current.input.includes(letter)) return { input: current.input + letter, error: '' };
  return null;
}

// Patch for finishing an "N OF" group (or abandoning it when fewer than 2 letters were picked).
export function commitPendingPatch(current) {
  if (current.pendingLetters.length >= 2) {
    return {
      groups: current.groups.concat([{ count: Number(current.pendingTool), letters: current.pendingLetters.slice().sort() }]),
      pendingTool: null, pendingLetters: [], tool: 'type',
    };
  }
  return {
    pendingTool: null, pendingLetters: [], tool: 'type',
    error: current.pendingLetters.length === 1 ? 'A group needs at least 2 letters' : '',
  };
}

// Patch for tapping a tool pill. Tapping the active group tool again commits it.
export function tapToolPatch(current, id) {
  if (current.pendingTool === id) return commitPendingPatch(current);
  if (['1', '2', '3'].includes(id)) return { pendingTool: id, pendingLetters: [], tool: 'group', error: '' };
  return { pendingTool: null, pendingLetters: [], tool: id, error: '' };
}

// Outcome of submitting `word` in solo/daily play: { error } for a rejected guess, otherwise
// { myGuesses, won } where won means the word matched the secret.
export function soloGuessOutcome(current, word, isValidGuess) {
  if (word.length < 5) return { error: 'Guesses need 5 letters' };
  if (current.myGuesses.some((guess) => guess.word === word)) return { error: 'Already guessed' };
  if (!isValidGuess(word)) return { error: 'Not in the word list' };
  const count = word.split('').filter((letter) => current.rivalSecret.includes(letter)).length;
  return { myGuesses: current.myGuesses.concat([{ word, count }]), won: word === current.rivalSecret };
}
