import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAppLink, isPreviewHost, looksLikeAppWebview, parseInvite, parseInviteUrl } from '../src/game/platform.js';

test('parseInvite reads a friend ID from a shared link', () => {
  assert.deepEqual(parseInvite('?friend=w7pxbh'), { kind: 'friend', code: 'W7PXBH' });
  assert.deepEqual(parseInvite('?friend=W7-PX BH&x=1'), { kind: 'friend', code: 'W7PXBH' });
});

test('parseInvite reads a match code, and prefers friend when both are present', () => {
  assert.deepEqual(parseInvite('?join=abcd2345'), { kind: 'join', code: 'ABCD2345' });
  assert.deepEqual(parseInvite('?join=ABCD2345&friend=W7PXBH'), { kind: 'friend', code: 'W7PXBH' });
});

test('parseInvite ignores malformed or missing codes', () => {
  assert.equal(parseInvite(''), null);
  assert.equal(parseInvite('?friend=ABC'), null);
  assert.equal(parseInvite('?join=SHORT'), null);
  assert.equal(parseInvite(undefined), null);
});

test('looksLikeAppWebview matches an iOS app webview but not Safari or other iOS browsers', () => {
  const webview = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  const safari = `${webview.replace('Mobile/15E148', 'Version/18.0 Mobile/15E148 Safari/604.1')}`;
  const chromeIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
  const instagram = `${webview} Instagram 350.0`;
  const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
  assert.equal(looksLikeAppWebview(webview), true);
  assert.equal(looksLikeAppWebview(safari), false);
  assert.equal(looksLikeAppWebview(chromeIos), false);
  assert.equal(looksLikeAppWebview(instagram), false);
  assert.equal(looksLikeAppWebview(desktop), false);
  assert.equal(looksLikeAppWebview(''), false);
});

test('buildAppLink makes a cinqle:// link that parseInviteUrl reads back', () => {
  assert.equal(buildAppLink({ kind: 'friend', code: 'W7PXBH' }), 'cinqle://open?friend=W7PXBH');
  assert.equal(buildAppLink({ kind: 'join', code: 'ABCD2345' }), 'cinqle://open?join=ABCD2345');
  assert.equal(buildAppLink(null), 'cinqle://open');
  assert.deepEqual(parseInviteUrl(buildAppLink({ kind: 'friend', code: 'W7PXBH' })), { kind: 'friend', code: 'W7PXBH' });
});

test('parseInviteUrl understands universal links and every cinqle:// form', () => {
  assert.deepEqual(parseInviteUrl('https://cinq.jonathanclark11.workers.dev/?friend=SLWN9T'), { kind: 'friend', code: 'SLWN9T' });
  assert.deepEqual(parseInviteUrl('https://cinq.jonathanclark11.workers.dev/?join=abcd2345'), { kind: 'join', code: 'ABCD2345' });
  assert.deepEqual(parseInviteUrl('cinqle://open?friend=slwn9t'), { kind: 'friend', code: 'SLWN9T' });
  assert.deepEqual(parseInviteUrl('cinqle://friend/SLWN9T'), { kind: 'friend', code: 'SLWN9T' });
  assert.deepEqual(parseInviteUrl('cinqle://join/ABCD2345'), { kind: 'join', code: 'ABCD2345' });
  assert.equal(parseInviteUrl('cinqle://open'), null);
  assert.equal(parseInviteUrl('not a url'), null);
});

test('isPreviewHost allows the tailnet preview and localhost but never the public Worker', () => {
  assert.equal(isPreviewHost('jons-mac-mini.tail712946.ts.net'), true);
  assert.equal(isPreviewHost('localhost'), true);
  assert.equal(isPreviewHost('127.0.0.1'), true);
  assert.equal(isPreviewHost('cinq.jonathanclark11.workers.dev'), false);
  assert.equal(isPreviewHost('evil.example.com'), false);
  assert.equal(isPreviewHost('ts.net.evil.com'), false);
  assert.equal(isPreviewHost(''), false);
  assert.equal(isPreviewHost(undefined), false);
});
