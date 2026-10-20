import assert from 'node:assert/strict';
import test from 'node:test';
import {
  freshRound, nextMatchState, tapLetterPatch, commitPendingPatch, tapToolPatch, soloGuessOutcome,
} from '../src/game/cinqState.js';
import { autoElim } from '../src/game/logic.js';

const VALID = new Set(['BRAVE', 'CRANE', 'STONE', 'ABOUT']);
const isValid = (word) => VALID.has(word);

function gameState(overrides = {}) {
  return {
    ...freshRound(),
    screen: 'game', mode: 'solo', rivalSecret: 'CRANE', mySecret: '',
    matchCode: '', matchStatus: '', pendingGuess: '', friends: [], savedMatches: [],
    ...overrides,
  };
}

function matchPayload(overrides = {}) {
  return {
    code: 'ABCD2345', status: 'active', role: 1, currentTurn: 1, yourTurn: true, updatedAt: '2026-01-01T00:00:00Z',
    opponentJoined: true, winner: null, yourName: 'Me', opponentName: 'Pal', pendingGuess: '',
    yourSecret: 'BRAVE', opponentSecret: '', yourGuesses: [], opponentGuesses: [],
    ...overrides,
  };
}

const derive = (previous, match, token = 'tok') => nextMatchState(previous, match, token, [], []);

// --- guess submission ---

test('soloGuessOutcome rejects short, repeated and unknown words', () => {
  const state = gameState({ myGuesses: [{ word: 'BRAVE', count: 2 }] });
  assert.equal(soloGuessOutcome(state, 'CRA', isValid).error, 'Guesses need 5 letters');
  assert.equal(soloGuessOutcome(state, 'BRAVE', isValid).error, 'Already guessed');
  assert.equal(soloGuessOutcome(state, 'ZZZZZ', isValid).error, 'Not in the word list');
});

test('soloGuessOutcome counts shared letters and appends the guess', () => {
  const out = soloGuessOutcome(gameState(), 'BRAVE', isValid);
  assert.equal(out.error, undefined);
  assert.equal(out.won, false);
  assert.deepEqual(out.myGuesses, [{ word: 'BRAVE', count: 3 }]); // R, A, E are in CRANE
});

test('soloGuessOutcome flags a win when the guess equals the secret', () => {
  const state = gameState({ myGuesses: [{ word: 'BRAVE', count: 3 }] });
  const out = soloGuessOutcome(state, 'CRANE', isValid);
  assert.equal(out.won, true);
  assert.equal(out.myGuesses.length, 2);
  assert.deepEqual(out.myGuesses[1], { word: 'CRANE', count: 5 });
});

// --- typing and tool rows ---

test('tapLetterPatch types letters, skips duplicates and caps at five', () => {
  assert.deepEqual(tapLetterPatch(gameState({ input: 'CR' }), 'A'), { input: 'CRA', error: '' });
  assert.equal(tapLetterPatch(gameState({ input: 'CR' }), 'R'), null);
  assert.equal(tapLetterPatch(gameState({ input: 'CRANE' }), 'S'), null);
});

test('tapLetterPatch is inert after a result or while a rival match is not active', () => {
  assert.equal(tapLetterPatch(gameState({ result: { won: true, n: 1 } }), 'A'), null);
  assert.equal(tapLetterPatch(gameState({ mode: 'rival', matchStatus: 'waiting' }), 'A'), null);
  assert.deepEqual(tapLetterPatch(gameState({ mode: 'rival', matchStatus: 'active' }), 'A'), { input: 'A', error: '' });
});

test('tapLetterPatch builds the setup word on the setup screen', () => {
  assert.deepEqual(tapLetterPatch(gameState({ screen: 'setup', setupInput: 'BR' }), 'A'), { setupInput: 'BRA', error: '' });
  assert.equal(tapLetterPatch(gameState({ screen: 'setup', setupInput: 'BR' }), 'B'), null);
});

test('explicit not-in and in marks toggle per letter with the active tool', () => {
  let state = gameState({ tool: 'elim' });
  state = { ...state, ...tapLetterPatch(state, 'Q') };
  assert.equal(state.marks.Q, 'elim');
  state = { ...state, tool: 'has' };
  state = { ...state, ...tapLetterPatch(state, 'Q') }; // switching tool overwrites the mark
  assert.equal(state.marks.Q, 'has');
  state = { ...state, ...tapLetterPatch(state, 'Q') }; // same tool again clears it
  assert.equal('Q' in state.marks, false);
  assert.equal(state.input, '');
});

test('auto-eliminated letters come from zero-count guesses and satisfied circles, never overriding a circle', () => {
  assert.deepEqual(autoElim([{ word: 'ABOUT', count: 0 }], {}), { A: true, B: true, O: true, U: true, T: true });
  const guesses = [{ word: 'BRAVE', count: 1 }];
  assert.deepEqual(autoElim(guesses, {}), {});
  const out = autoElim(guesses, { R: 'has' });
  assert.equal(out.R, undefined);
  assert.equal(out.B, true);
  assert.equal(out.E, true);
});

test('tapToolPatch starts an N-OF group and switches plain tools', () => {
  assert.deepEqual(tapToolPatch(gameState(), '2'), { pendingTool: '2', pendingLetters: [], tool: 'group', error: '' });
  assert.deepEqual(tapToolPatch(gameState({ pendingTool: '2', pendingLetters: ['A'] }), 'elim'),
    { pendingTool: null, pendingLetters: [], tool: 'elim', error: '' });
});

test('N-OF group letters toggle while pending, then commit sorted with the count', () => {
  let state = gameState({ pendingTool: '2', tool: 'group' });
  for (const letter of ['R', 'A', 'N', 'A']) state = { ...state, ...tapLetterPatch(state, letter) };
  assert.deepEqual(state.pendingLetters, ['R', 'N']); // second A removed it
  state = { ...state, ...tapLetterPatch(state, 'A') };
  state = { ...state, ...tapToolPatch(state, '2') }; // tapping the active group tool commits it
  assert.deepEqual(state.groups, [{ count: 2, letters: ['A', 'N', 'R'] }]);
  assert.equal(state.pendingTool, null);
  assert.equal(state.tool, 'type');
});

test('commitPendingPatch drops groups of fewer than two letters', () => {
  const one = commitPendingPatch(gameState({ pendingTool: '1', pendingLetters: ['A'] }));
  assert.equal(one.error, 'A group needs at least 2 letters');
  assert.equal('groups' in one, false);
  const none = commitPendingPatch(gameState({ pendingTool: '1', pendingLetters: [] }));
  assert.equal(none.error, '');
});

// --- match state from server payloads ---

test('a first payload for a match resets the round and adopts server state', () => {
  const previous = gameState({ input: 'ABC', marks: { Z: 'elim' }, myGuesses: [{ word: 'OLD', count: 1 }] });
  const next = derive(previous, matchPayload({ yourGuesses: [{ word: 'BRAVE', count: 2 }] }));
  assert.equal(next.screen, 'game');
  assert.equal(next.mode, 'rival');
  assert.equal(next.matchCode, 'ABCD2345');
  assert.equal(next.playerToken, 'tok');
  assert.deepEqual(next.marks, {});
  assert.equal(next.input, '');
  assert.deepEqual(next.myGuesses, [{ word: 'BRAVE', count: 2 }]);
  assert.equal(next.mySecret, 'BRAVE');
  assert.equal(next.yourTurn, true);
  assert.equal(next.result, null);
  assert.equal(next.matchBusy, false);
});

test('a payload for the same match keeps marks and clears input only after the guess lands', () => {
  const previous = derive(gameState(), matchPayload());
  const typing = { ...previous, input: 'CRA', marks: { Z: 'elim' } };
  const idle = derive(typing, matchPayload());
  assert.equal(idle.input, 'CRA');
  assert.deepEqual(idle.marks, { Z: 'elim' });
  const guessed = derive(typing, matchPayload({ yourGuesses: [{ word: 'CRANE', count: 1 }] }));
  assert.equal(guessed.input, '');
  assert.deepEqual(guessed.marks, { Z: 'elim' });
});

test('an accepted queued guess clears the input', () => {
  const previous = { ...derive(gameState(), matchPayload()), input: 'CRANE' };
  assert.equal(derive(previous, matchPayload({ pendingGuess: 'CRANE' })).input, '');
});

test('rivalNew lights up when the rival moved and you are not viewing their board', () => {
  const previous = derive(gameState(), matchPayload());
  const moved = matchPayload({ opponentGuesses: [{ word: 'STONE', count: 2 }] });
  assert.equal(derive(previous, moved).rivalNew, true);
  assert.equal(derive({ ...previous, view: 'rival' }, moved).rivalNew, false);
});

test('a finished match derives won/lost results for the winner and loser', () => {
  const previous = derive(gameState(), matchPayload());
  const mine = [{ word: 'A', count: 1 }, { word: 'B', count: 1 }];
  const theirs = [{ word: 'C', count: 1 }, { word: 'D', count: 1 }, { word: 'E', count: 1 }];
  const won = derive(previous, matchPayload({ status: 'finished', winner: 1, yourGuesses: mine, opponentGuesses: theirs }));
  assert.deepEqual(won.result, { won: true, n: 2, attempts: 2, multiplayer: true });
  const lost = derive(previous, matchPayload({ status: 'finished', winner: 2, yourGuesses: mine, opponentGuesses: theirs }));
  assert.deepEqual(lost.result, { won: false, n: 3, attempts: 2, multiplayer: true });
});

test('reviewing persists across polls only once a result was already showing', () => {
  const finished = matchPayload({ status: 'finished', winner: 1, yourGuesses: [{ word: 'A', count: 1 }] });
  const first = derive({ ...derive(gameState(), matchPayload()), reviewing: true }, finished);
  assert.equal(first.reviewing, false);
  const again = derive({ ...first, reviewing: true }, finished);
  assert.equal(again.reviewing, true);
});

test('missing optional payload fields fall back to safe defaults', () => {
  const next = derive(gameState(), matchPayload({ opponentName: undefined, yourName: undefined, updatedAt: undefined, yourGuesses: undefined, opponentGuesses: undefined, pendingGuess: undefined }));
  assert.equal(next.myName, '');
  assert.equal(next.opponentName, '');
  assert.equal(next.matchUpdatedAt, '');
  assert.deepEqual(next.myGuesses, []);
  assert.deepEqual(next.rivalGuesses, []);
  assert.equal(next.pendingGuess, '');
});
