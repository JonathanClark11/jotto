import assert from 'node:assert/strict';
import test from 'node:test';
import { AASA } from '../worker/aasa.ts';

// Apple pattern syntax: "?" is exactly one character, "*" is zero or more.
function matches(pattern, value) {
  const re = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\?/g, '.').replace(/\*/g, '.*');
  return new RegExp(`^${re}$`).test(value);
}

const components = AASA.applinks.details[0].components;
const patternFor = (key) => components.find((c) => c['?'] && key in c['?'])?.['?'][key];

for (const key of ['join', 'friend']) {
  test(`AASA ${key} query pattern is "?*"`, () => {
    assert.equal(patternFor(key), '?*');
  });
}

test('AASA patterns match real share-link values but not empty ones', () => {
  assert.ok(matches(patternFor('friend'), 'abc123'));
  assert.ok(matches(patternFor('join'), 'ABCD1234'));
  assert.ok(!matches(patternFor('friend'), ''));
  assert.ok(!matches(patternFor('join'), ''));
  assert.ok(!matches('?', 'abc123'), 'sanity: bare "?" matches only one character');
});
