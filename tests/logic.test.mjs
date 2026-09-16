import assert from 'node:assert/strict';
import test from 'node:test';
import { shared, hashKey, dailyWord, autoElim, todayKey } from '../src/game/logic.js';

// --- shared() ---

test('shared() counts letters from the guess that appear in the secret', () => {
  assert.equal(shared('BRAVE', 'BIRDS'), 2);  // B, R
  assert.equal(shared('TRACE', 'CRATE'), 5);  // all 5 letters in common
  assert.equal(shared('ABCDE', 'FGHIJ'), 0);  // no overlap
});

test('shared() returns 0 for an empty string', () => {
  assert.equal(shared('', 'ABCDE'), 0);
});

test('shared() counts 5 when guess equals the secret', () => {
  assert.equal(shared('BRAVE', 'BRAVE'), 5);
});

test('shared() counts each letter independently', () => {
  assert.equal(shared('ABCDE', 'A____'), 1);  // only A in common
});

// --- hashKey() ---

test('hashKey() is deterministic for the same input', () => {
  assert.equal(hashKey('2024-01-01'), hashKey('2024-01-01'));
});

test('hashKey() produces different values for different dates', () => {
  assert.notEqual(hashKey('2024-01-01'), hashKey('2024-01-02'));
  assert.notEqual(hashKey('2024-01-01'), hashKey('2025-01-01'));
});

test('hashKey() returns a non-negative 32-bit integer', () => {
  const h = hashKey('2024-06-15');
  assert.ok(Number.isInteger(h));
  assert.ok(h >= 0);
  assert.ok(h <= 0xFFFFFFFF);
});

// --- dailyWord() ---

test('dailyWord() always returns a word from the list', () => {
  const list = ['ABIDE', 'BLAZE', 'CRIMP', 'DUNCE', 'ELFIN'];
  const word = dailyWord('2024-03-15', list);
  assert.ok(list.includes(word), `expected "${word}" to be in word list`);
});

test('dailyWord() is deterministic for the same key', () => {
  const list = ['ABIDE', 'BLAZE', 'CRIMP', 'DUNCE', 'ELFIN'];
  assert.equal(dailyWord('2024-03-15', list), dailyWord('2024-03-15', list));
});

test('dailyWord() returns different words for different keys (high probability)', () => {
  const list = ['ABIDE', 'BLAZE', 'CRIMP', 'DUNCE', 'ELFIN'];
  const words = new Set();
  for (let d = 1; d <= 31; d++) {
    words.add(dailyWord(`2024-01-${String(d).padStart(2, '0')}`, list));
  }
  // With 31 dates and 5 words the hash should hit at least 2 distinct words
  assert.ok(words.size > 1, 'expected multiple distinct words across different dates');
});

// --- autoElim() ---

test('autoElim() eliminates all letters from a 0-count guess', () => {
  const guesses = [{ word: 'ABCDE', count: 0 }];
  const elim = autoElim(guesses, {});
  for (const ch of 'ABCDE') assert.equal(elim[ch], true, `expected ${ch} to be eliminated`);
});

test('autoElim() protects letters the player marked as "has" from 0-count elimination', () => {
  const guesses = [{ word: 'ABCDE', count: 0 }];
  const elim = autoElim(guesses, { A: 'has' });
  assert.equal(elim['A'], undefined, 'A should not be eliminated');
  assert.equal(elim['B'], true);
  assert.equal(elim['C'], true);
});

test('autoElim() eliminates non-circled letters when circled count covers full count', () => {
  // BRAVE scored 2; player circles B and R (2 of 2) → A, V, E can be ruled out
  const guesses = [{ word: 'BRAVE', count: 2 }];
  const marks = { B: 'has', R: 'has' };
  const elim = autoElim(guesses, marks);
  assert.equal(elim['A'], true);
  assert.equal(elim['V'], true);
  assert.equal(elim['E'], true);
  assert.equal(elim['B'], undefined);
  assert.equal(elim['R'], undefined);
});

test('autoElim() does not eliminate when circled count < guess count', () => {
  // BRAVE scored 3; only B is circled (1 of 3) → cannot rule out A, V, E yet
  const guesses = [{ word: 'BRAVE', count: 3 }];
  const marks = { B: 'has' };
  const elim = autoElim(guesses, marks);
  assert.equal(Object.keys(elim).length, 0);
});

test('autoElim() accumulates eliminations across multiple guesses', () => {
  const guesses = [
    { word: 'ABCDE', count: 0 },
    { word: 'FGHIJ', count: 0 },
  ];
  const elim = autoElim(guesses, {});
  for (const ch of 'ABCDEFGHIJ') assert.equal(elim[ch], true);
});

// --- todayKey() ---

test('todayKey() returns a YYYY-MM-DD formatted string', () => {
  assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
});
