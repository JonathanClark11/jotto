import assert from 'node:assert/strict';
import test from 'node:test';
import {
  freshRound, nextMatchState, tapLetterPatch, commitPendingPatch, tapToolPatch, soloGuessOutcome,
} from '../src/game/cinqState.js';

// Direct coverage for cinqState.js. The module is pure (no storage access); callers pass in
// savedMatches and friends, so "persistence" here means those values survive state derivation.

function gameState(overrides = {}) {
  return { ...freshRound(), screen: 'game', mode: 'solo', matchCode: '', matchStatus: '', rivalSecret: 'CRANE', ...overrides };
}

function payload(overrides = {}) {
  return {
    code: 'ABCD2345', status: 'active', role: 1, currentTurn: 1, yourTurn: true, opponentJoined: true,
    winner: null, yourGuesses: [], opponentGuesses: [], ...overrides,
  };
}

test('freshRound returns a new object with independent arrays and objects on every call', () => {
  const a = freshRound();
  const b = freshRound();
  assert.notEqual(a, b);
  a.myGuesses.push({ word: 'CRANE', count: 5 });
  a.marks.A = 'elim';
  a.groups.push({ count: 1, letters: ['A', 'B'] });
  assert.deepEqual(b.myGuesses, []);
  assert.deepEqual(b.marks, {});
  assert.deepEqual(b.groups, []);
  assert.equal(b.tool, 'type');
  assert.equal(b.view, 'you');
  assert.equal(b.result, null);
});

test('nextMatchState passes through caller-supplied savedMatches, friends and token untouched', () => {
  const saved = [{ code: 'ZZZZ9999' }];
  const friends = [{ id: 'f1' }];
  const next = nextMatchState(gameState(), payload(), 'secret-token', saved, friends);
  assert.equal(next.savedMatches, saved);
  assert.equal(next.friends, friends);
  assert.equal(next.playerToken, 'secret-token');
  assert.equal(next.screen, 'game');
  assert.equal(next.mode, 'rival');
  assert.equal(next.matchBusy, false);
});

test('nextMatchState does not mutate the previous state', () => {
  const previous = gameState({ matchCode: 'ABCD2345', myGuesses: [{ word: 'BRAVE', count: 2 }], input: 'CR' });
  const snapshot = JSON.parse(JSON.stringify(previous));
  nextMatchState(previous, payload({ yourGuesses: [{ word: 'BRAVE', count: 2 }, { word: 'STONE', count: 1 }] }), 't', [], []);
  assert.deepEqual(previous, snapshot);
});

test('switching to a different match resets round state but keeps unrelated fields', () => {
  const previous = gameState({ matchCode: 'OLDCODE1', myGuesses: [{ word: 'BRAVE', count: 2 }], marks: { A: 'elim' }, input: 'CR', extra: 'kept' });
  const next = nextMatchState(previous, payload(), 't', [], []);
  assert.deepEqual(next.myGuesses, []);
  assert.deepEqual(next.marks, {});
  assert.equal(next.input, '');
  assert.equal(next.matchCode, 'ABCD2345');
  assert.equal(next.extra, 'kept');
});

test('a drawn or unfinished payload yields no winning result; a finished loss counts opponent guesses', () => {
  const active = nextMatchState(gameState(), payload(), 't', [], []);
  assert.equal(active.result, null);
  const lost = nextMatchState(gameState(), payload({
    status: 'finished', winner: 2, role: 1,
    yourGuesses: [{ word: 'A', count: 0 }], opponentGuesses: [{ word: 'B', count: 1 }, { word: 'C', count: 2 }],
  }), 't', [], []);
  assert.deepEqual(lost.result, { won: false, n: 2, attempts: 1, multiplayer: true });
  const noWinner = nextMatchState(gameState(), payload({ status: 'finished', winner: null }), 't', [], []);
  assert.equal(noWinner.result.won, false);
});

test('rivalNew stays false when the rival board is already in view', () => {
  const previous = gameState({ matchCode: 'ABCD2345', view: 'rival' });
  const next = nextMatchState(previous, payload({ opponentGuesses: [{ word: 'BRAVE', count: 1 }] }), 't', [], []);
  assert.equal(next.rivalNew, false);
});

test('tapLetterPatch ignores a 6th letter, repeated setup letters and finished games', () => {
  assert.equal(tapLetterPatch(gameState({ input: 'CRANE' }), 'S'), null);
  assert.equal(tapLetterPatch(gameState({ screen: 'setup', setupInput: 'CR' }), 'C'), null);
  assert.equal(tapLetterPatch(gameState({ screen: 'setup', setupInput: 'CRANE' }), 'S'), null);
  assert.equal(tapLetterPatch(gameState({ result: { won: true } }), 'A'), null);
  assert.equal(tapLetterPatch(gameState({ screen: 'home' }), 'A'), null);
});

test('tapLetterPatch clears the error when a letter is accepted', () => {
  assert.deepEqual(tapLetterPatch(gameState({ input: 'C', error: 'Already guessed' }), 'R'), { input: 'CR', error: '' });
});

test('commitPendingPatch reports a single-letter group and clears silently when empty', () => {
  const one = commitPendingPatch(gameState({ pendingTool: '2', pendingLetters: ['A'] }));
  assert.equal(one.error, 'A group needs at least 2 letters');
  assert.equal(one.pendingTool, null);
  assert.equal(commitPendingPatch(gameState({ pendingTool: '2', pendingLetters: [] })).error, '');
});

test('tapToolPatch commits via the active group tool and switches plain tools otherwise', () => {
  const pending = gameState({ pendingTool: '2', pendingLetters: ['B', 'A'], tool: 'group' });
  const committed = tapToolPatch(pending, '2');
  assert.deepEqual(committed.groups, [{ count: 2, letters: ['A', 'B'] }]);
  assert.deepEqual(tapToolPatch(gameState(), 'elim'), { pendingTool: null, pendingLetters: [], tool: 'elim', error: '' });
});

test('soloGuessOutcome returns a new guesses array without mutating the current one', () => {
  const state = gameState({ myGuesses: [{ word: 'BRAVE', count: 2 }] });
  const out = soloGuessOutcome(state, 'STONE', () => true);
  assert.equal(out.myGuesses.length, 2);
  assert.equal(state.myGuesses.length, 1);
  assert.equal(out.won, false);
});
