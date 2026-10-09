import { Capacitor } from '@capacitor/core';

const BYPASS_KEY = 'cinq-web-ok';

// Last-resort signal so a missed Capacitor check can never lock the real app out: an iPhone/iPad WKWebView
// user agent has no "Safari/" token (Mobile Safari, Chrome, Firefox and Edge on iOS all do), and the in-app
// browsers of other apps are excluded by name.
export function looksLikeAppWebview(ua) {
  return /iPhone|iPad|iPod/.test(ua)
    && !/Safari\//.test(ua)
    && !/FBAN|FBAV|Instagram|Twitter|Line\/|GSA|CriOS|FxiOS|EdgiOS|Snapchat|MicroMessenger/.test(ua);
}

// True inside the native iOS app (Capacitor webview). The game only runs there.
export function isNativeApp() {
  try {
    if (Capacitor.isNativePlatform()) return true;
    if (globalThis.webkit?.messageHandlers?.bridge) return true;
    return looksLikeAppWebview(globalThis.navigator?.userAgent || '');
  } catch {
    return false;
  }
}

// Developer escape hatch: open the site with ?web=1 once to play in a desktop browser for testing.
export function webBypassEnabled() {
  try {
    if (new URLSearchParams(globalThis.location.search).get('web') === '1') {
      globalThis.sessionStorage.setItem(BYPASS_KEY, '1');
    }
    return globalThis.sessionStorage.getItem(BYPASS_KEY) === '1';
  } catch {
    return false;
  }
}

// 'pending' only exists for the server render and first hydration pass.
export function clientMode() {
  return isNativeApp() || webBypassEnabled() ? 'game' : 'landing';
}

// What a shared link was asking for, so the landing page can say it (and show the code to type in the app).
export function parseInvite(search) {
  const params = new URLSearchParams(search || '');
  const friend = (params.get('friend') || '').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6);
  if (friend.length === 6) return { kind: 'friend', code: friend };
  const join = (params.get('join') || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8);
  if (join.length === 8) return { kind: 'join', code: join };
  return null;
}
