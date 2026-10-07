import assert from 'node:assert/strict';
import test from 'node:test';
import { GUESS_WORDS } from '../src/data/guessWords.js';
import { WORDS } from '../src/data/words.js';
import { isGuessWord, normalizeCode, normalizeWord, playerRole, sharedLetters } from '../app/api/_shared/cinq-db.ts';

test('normalizeWord trims and uppercases, and returns empty for non-strings', () => {
  assert.equal(normalizeWord('  crane '), 'CRANE');
  assert.equal(normalizeWord('Crane'), 'CRANE');
  for (const value of [undefined, null, 42, {}, ['crane']]) assert.equal(normalizeWord(value), '');
});

test('normalizeCode uppercases, strips invalid characters, and caps at 8', () => {
  assert.equal(normalizeCode('  abcd-2345 '), 'ABCD2345');
  assert.equal(normalizeCode('abcdefghjk'), 'ABCDEFGH');
  assert.equal(normalizeCode('01 io'), 'IO');
  assert.equal(normalizeCode(null), '');
  assert.equal(normalizeCode(12345678), '');
});

test('isGuessWord requires 5 distinct letters from the dictionaries', () => {
  assert.equal(isGuessWord(WORDS[0]), true);
  assert.equal(isGuessWord(GUESS_WORDS[0]), true);
  assert.equal(isGuessWord('CRAN'), false);
  assert.equal(isGuessWord('CRANES'), false);
  assert.equal(isGuessWord('LLAMA'), false);
  assert.equal(isGuessWord('ZZZZZ'), false);
  assert.equal(isGuessWord(''), false);
});

test('sharedLetters counts letters of the first word found in the second', () => {
  assert.equal(sharedLetters('CRANE', 'BUILD'), 0);
  assert.equal(sharedLetters('CRANE', 'CLOSE'), 2);
  assert.equal(sharedLetters('CRANE', 'CRANE'), 5);
  assert.equal(sharedLetters('CRANE', 'NACRE'), 5);
  assert.equal(sharedLetters('CRANE', 'PLANT'), sharedLetters('PLANT', 'CRANE'));
  assert.equal(sharedLetters('', 'CRANE'), 0);
});

test('playerRole maps tokens to player 1, player 2, or 0 for unknown or empty tokens', () => {
  const match = { player1_token: 'tok-one', player2_token: 'tok-two' };
  assert.equal(playerRole(match, 'tok-one'), 1);
  assert.equal(playerRole(match, 'tok-two'), 2);
  assert.equal(playerRole(match, 'nope'), 0);
  assert.equal(playerRole(match, ''), 0);
  assert.equal(playerRole({ ...match, player2_token: null }, ''), 0);
  assert.equal(playerRole({ ...match, player2_token: null }, 'tok-two'), 0);
});
