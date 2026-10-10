import assert from 'node:assert/strict';
import test from 'node:test';
import { claimTurnToast, hasSeenTurnToast } from '../src/game/turnToast.js';

function memoryStorage() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
}

test('claimTurnToast returns true once per code:threshold', () => {
  const storage = memoryStorage();
  assert.equal(hasSeenTurnToast('AB:3', storage), false);
  assert.equal(claimTurnToast('AB:3', storage), true);
  assert.equal(claimTurnToast('AB:3', storage), false);
  assert.equal(hasSeenTurnToast('AB:3', storage), true);
  assert.equal(claimTurnToast('AB:1', storage), true);
  assert.equal(claimTurnToast('CD:3', storage), true);
});

test('claimTurnToast tolerates corrupt or throwing storage', () => {
  const corrupt = { getItem: () => '{nope', setItem: () => {} };
  assert.equal(claimTurnToast('AB:3', corrupt), true);
  const throwing = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(claimTurnToast('AB:3', throwing), true);
});
