import assert from 'node:assert/strict';
import test from 'node:test';
import { INTRO_CARDS, INTRO_KEYS, hasSeenIntro, markIntroSeen, shouldShowIntro } from '../src/game/intro.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

for (const kind of ['howto', 'multiplayer']) {
  test(`${kind}: shows on first launch`, () => {
    assert.equal(shouldShowIntro(kind, memoryStorage()), true);
  });

  test(`${kind}: skip or completion persists the flag and it is not shown again`, () => {
    const storage = memoryStorage();
    markIntroSeen(kind, storage);
    assert.equal(storage.data[INTRO_KEYS[kind]], '1');
    assert.equal(hasSeenIntro(kind, storage), true);
    assert.equal(shouldShowIntro(kind, storage), false);
  });
}

test('flags are independent per kind', () => {
  const storage = memoryStorage();
  markIntroSeen('howto', storage);
  assert.equal(shouldShowIntro('howto', storage), false);
  assert.equal(shouldShowIntro('multiplayer', storage), true);
});

test('survives broken storage without throwing', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(shouldShowIntro('howto', broken), true);
  assert.doesNotThrow(() => markIntroSeen('howto', broken));
});

test('how-to is 3 to 5 cards and covers the count mechanic and the Wordle difference', () => {
  const cards = INTRO_CARDS.howto;
  assert.ok(cards.length >= 3 && cards.length <= 5);
  const text = cards.map((c) => `${c.title} ${c.body}`).join(' ');
  assert.match(text, /count/i);
  assert.match(text, /Wordle/);
  assert.match(text, /no letter repeats/i);
});

test('multiplayer explainer is one screen covering secret words, turns and winning', () => {
  assert.equal(INTRO_CARDS.multiplayer.length, 1);
  const { body } = INTRO_CARDS.multiplayer[0];
  assert.match(body, /secret word/);
  assert.match(body, /turns/);
  assert.match(body, /first to crack/i);
});

test('how-to explains the ✕, ✓ and "N OF" tool buttons', () => {
  const text = INTRO_CARDS.howto.map((c) => `${c.title} ${c.body}`).join(' ');
  assert.match(text, /✕/);
  assert.match(text, /✓/);
  assert.match(text, /2 OF/);
  assert.match(text, /1 OF and 3 OF/);
  assert.ok(INTRO_CARDS.howto.some((c) => c.demo === 'marks'));
  assert.ok(INTRO_CARDS.howto.some((c) => c.demo === 'groups'));
});
