# Design: keeping friend ID and playerKey across reinstall or a new phone

Status: proposal, no code in this PR. Issue #48. Jon decides the path.

## Problem

The friend ID, the private `playerKey`, the friends list and the stats history are all tied to one install. Delete the app or move to a new phone and they are gone, because the key only exists in the app's web storage. There are no accounts by design, so any recovery has to be a deliberate mechanism that does not add a login.

## Current state

### How the key is made and stored

`src/game/useCinq.js` has two near-identical helpers, both synchronous:

| Helper | localStorage key | Used for |
| --- | --- | --- |
| `playerProfileKey()` (line ~124) | `cinq-player-profile` | Friend profile, stats, friend adds, matches, rematches |
| `anonymousDailyKey()` (line ~112) | `cinq-daily-player` | Daily puzzle results only (`/api/daily-stats`) |

Each is `crypto.randomUUID()` (with a Math.random fallback) written to `localStorage` on first use. The two keys are independent: nothing on the server links a player's daily results to their profile.

`capacitor.config.ts` sets `server.url` to the Worker, so the iOS app is a WKWebView on the live site. `localStorage` therefore belongs to the app's WebView data container: it is deleted with the app, it is not part of a Keychain or iCloud store, and iOS can evict WebView storage under pressure.

### What lives where

| Data | Where | Survives reinstall today |
| --- | --- | --- |
| `playerKey` (private, bearer secret) | localStorage `cinq-player-profile` | No |
| Name, friend ID (6 chars) | localStorage `cinq-profile` and D1 `cinq_players` | Server row survives, but nothing can reach it without the key |
| Friends list | localStorage `cinq-friends` (and `cinq-friends-removed`) | No (but see "free wins" below) |
| Rival match list and per-match tokens | localStorage `cinq-rival-matches-v1` | No |
| Stats history | D1 `cinq_player_results`, keyed by `player_key` | Server rows survive, orphaned |
| Friend adds | D1 `cinq_friend_adds (adder_key, target_key)` | Server rows survive, orphaned |
| Daily results | D1 `cinq_daily_results (date, player_key)` | Server rows survive, orphaned |

### How the server treats the key

`normalizePlayerKey` (`app/api/_shared/cinq-db.ts`) accepts 8 to 80 chars of `[a-zA-Z0-9-]`. `upsertPlayer` maps it to a friend code (`CODE_ALPHABET`, 32 symbols, 6 chars). There is no signature or session: the key is the credential. It is sent in JSON bodies and, for `GET /api/player-stats` and `GET /api/friends/incoming`, in the query string, so it can appear in request logs. That is existing behavior and not changed by this doc, but it matters for how carefully any recovery code is treated.

### Free wins that recovery can reuse

Once a restored device holds the old `playerKey`, the server already has enough to rebuild a lot: stats come back from `cinq_player_results`, and the friends list can be rebuilt from `cinq_friend_adds` (outgoing adds, joined to `cinq_players` for name and code). The friends list is only local today, so a small new read endpoint would be needed for that, but no new data. Active matches are harder: match tokens are per-match and local, so restoring them needs a new endpoint that reissues a token for a `player1_key` / `player2_key` match. That is out of scope for the first cut.

## Option 1: iOS Keychain via a Capacitor plugin

### How it works

On first launch of the new build, the app reads `playerKey` from the Keychain. If absent, it writes the key currently in localStorage (so existing players keep their identity) or a fresh one. The Keychain item survives app deletion (iOS keeps items for a deleted app's bundle ID; Apple does not formally guarantee this, so treat it as best effort). With iCloud Keychain sync on, it also appears on a new phone signed into the same Apple ID.

### Plugin candidates (checked 2026-10-09 against npm and the package sources)

| Plugin | License | Capacitor 8 | Last publish | iCloud sync | Notes |
| --- | --- | --- | --- | --- | --- |
| [`@aparajita/capacitor-secure-storage`](https://github.com/aparajita/capacitor-secure-storage) 8.0.1 | MIT | Yes (peer `@capacitor/core ^8.0.2`) | 2026-09-23 | Yes, global `setSynchronize()` and per-call `sync` option | Best fit. Peer deps also list `@capacitor/app` (already installed) and `@capacitor/keyboard` (not installed, check whether npm warns or needs it) |
| [`capacitor-secure-storage-plugin`](https://github.com/martinkasa/capacitor-secure-storage-plugin) 0.13.0 | MIT | Yes (`>=8.0.0`) | 2026-01-10 | No. Source uses SwiftKeychainWrapper with `.afterFirstUnlock` only | Simple, but no `kSecAttrSynchronizable`, so a new phone would not get the key |
| [`@capgo/capacitor-persistent-account`](https://github.com/Cap-go/capacitor-persistent-account) 8.0.44 | MPL-2.0 | Yes | 2026-10-09 | Not documented | Built for exactly "persist account data across installs", very active. MPL-2.0 is fine for an app but is a copyleft-per-file license, and sync behavior needs checking before relying on it |
| Own ~40 line Swift plugin | n/a | n/a | n/a | Whatever we write | Not recommended: a plugin that is one `SecItemAdd` call is still a native change plus an App Store build, and the maintained one already exists |

Recommendation within this option: `@aparajita/capacitor-secure-storage`, because it is the only one with documented iCloud sync.

### What survives

| Scenario | Result |
| --- | --- |
| Delete and reinstall, same phone | Key restored (best effort) |
| New phone via iCloud/encrypted backup or direct transfer | Likely restored even without sync, for non-`ThisDeviceOnly` items. Verify on a real device pair |
| New phone, fresh setup, iCloud Keychain on, `sync: true` | Restored |
| New phone, iCloud Keychain off or different Apple ID | Not restored |
| Android or web | No effect (plugin is a no-op there; the app is iOS only today) |

I have not tested sync behavior on hardware. The claims above come from the plugin docs and Apple's documented Keychain behavior, so run the reinstall and new-phone cases on real devices before telling players it works.

### Privacy

Synced Keychain items are end-to-end encrypted by iCloud Keychain; we never see them. Side effect: two devices on one Apple ID (a family iPad, a shared household account) would share one identity and one friend ID. For a casual word game that is probably acceptable, but it is a behavior change from today where each install is its own player. A per-key `sync: false` is the opt-out.

### Failure modes

- Async API, sync callers: `playerProfileKey()` is synchronous and called from many places. The app has to hydrate the key before the first request (an async bootstrap step, or a cached value filled at startup). A race here would mint a second key and split the identity. This is the main implementation risk.
- Conflicting keys: Keychain and localStorage disagree (for example the user restored an old key onto a phone that already played). Rule: Keychain wins, and localStorage is a cache.
- Two Apple-ID devices that already have different keys: the first to write wins on sync; the loser's data is orphaned.
- Old binaries: the web app is served live, so a JS change reaches old app builds immediately. The JS must feature-detect (`Capacitor.isPluginAvailable`) and fall back to localStorage, or old builds will break.
- `cinq-daily-player` needs the same treatment or daily history stays per-install.

### Server impact

None. No schema change, no new endpoint.

### Cost: native build and App Store

Yes, a new native build and release:

1. `npm i @aparajita/capacitor-secure-storage`, then `npx cap sync ios` (updates the SPM package list under `ios/`; that is a native-project change, not part of this PR).
2. Version and build bump, archive in Xcode, upload to App Store Connect, submit for review. Typically 1 to 2 days of review.
3. No new entitlement or capability should be needed for the Keychain; iCloud Keychain sync does not require the iCloud capability. Check the plugin's privacy manifest is picked up by the build.
4. Players only get protection after they update. A player who never updates, or reinstalls before updating, is not covered, and their key was never written to the Keychain.

## Option 2: recovery code

### How it works

In Settings the player taps "Back up my profile" and sees a code (for example `K7QM-2XH9-PD4T`) with copy and share buttons. The server stores only a hash. On a new install, "Restore profile" accepts the code, and the server returns the original `playerKey`, which the app writes to localStorage. From then on every existing endpoint works unchanged, and stats and friend adds reattach because they are keyed by that key.

### Code design

- Alphabet: reuse `CODE_ALPHABET` (32 symbols, no 0/O/1/I). 12 symbols is 60 bits, shown as 3 groups of 4. Minimum I would accept is 10 symbols (50 bits).
- Generated server-side with `crypto.getRandomValues`, never derived from the `playerKey`.
- Stored as `SHA-256(code + pepper)`. A fast hash is fine here: the input is high-entropy random, so a slow KDF adds nothing, and the pepper lives in a Worker secret so a leaked D1 dump alone cannot be tested offline. Adding the pepper means a new Worker secret (a config change for Jon, not in this PR). Without a pepper, 60 bits is still not practically brute-forceable offline.
- The code is shown once at creation and can be regenerated (which replaces the old hash). We cannot show it again because we do not store it.
- Restore does not delete or rotate the old code by default, so the user can restore twice. Consider one-time use plus automatic reissue on the new device.

### Abuse and brute force

- Online guessing: with N players and a 60-bit space, one random guess hits some player with probability about N / 2^60. At a million players that is roughly 1 in 10^12 per guess, so the real defense is rate limiting, not code length.
- Rate limit the restore endpoint: an additive D1 table of recent attempts (hashed IP, window start, count), for example 10 attempts per IP per hour and 50 per day globally per code-prefix. D1 is fine at this scale. The cleaner tool is Cloudflare's Workers Rate Limiting binding, but that is a wrangler config change that needs Jon's approval, so the D1 counter is the no-config path.
- Uniform failure responses and timing: no distinction between "no such code" and "revoked".
- The restore response returns the `playerKey`, a bearer secret. Serve it over POST only, `Cache-Control: no-store`, and never log bodies.
- Account takeover framing: a leaked code equals a stolen identity (stats, friend list). The code should be treated like a password. Copy in the UI should say so.
- Note the existing unauthenticated surface for context: friend IDs are 6 chars from 32 symbols (about 10^9) and `POST /api/friends` confirms existence, so enumeration is already possible today and there is no rate limiting anywhere in the API. If we add a limiter for restore, a shared helper could later cover those routes.

### What survives

| Scenario | Result |
| --- | --- |
| Reinstall, new phone, other platform, web | All restored, as long as the player saved the code |
| Player never opened Settings | Nothing restored. This is the weakness: most players will not do it unprompted |

### Privacy

The server learns nothing new: one hash per player that opts in, no email or device ID. Sharing the code via the iOS share sheet puts it in Notes, Messages and so on, at the player's discretion.

### Failure modes

- Lost code and lost phone: unrecoverable, by design.
- Restore onto a phone that already has its own profile: show a confirmation, because adopting the old key orphans the new one. Offer to keep the existing profile instead.
- Regenerating the code silently invalidates the old one. Confirm before doing it.
- Support burden: no human can verify identity, so there is no "forgot my code" path.

### Server impact (additive only)

```sql
CREATE TABLE IF NOT EXISTS cinq_recovery_codes (
  player_key TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS cinq_restore_attempts (
  bucket TEXT NOT NULL,        -- hashed IP + hour window
  attempts INTEGER NOT NULL,
  PRIMARY KEY (bucket)
);
```

Added the same way as the existing tables, as `CREATE TABLE IF NOT EXISTS` in `ensureCinqSchema`. Two new routes (`POST /api/recovery` to create, `POST /api/recovery/restore`) and a Settings screen. Nothing renamed or dropped, and a rollback just leaves two unused tables.

### Cost: native build and App Store

None. Everything is Worker plus web UI, and the app already loads the live site (`server.url`), so it ships to every installed copy the moment it deploys. No new binary, no App Store review. This is the biggest practical difference from Option 1. Check the in-WebView share and clipboard APIs work (`navigator.share`, `navigator.clipboard`); if not, a copy button via `document.execCommand` or plain selectable text is enough, still no native change.

## Option 3: other approaches considered

| Idea | Verdict | Reason |
| --- | --- | --- |
| Sign in with Apple | Not recommended | Real account system, needs entitlement, native build, review rules (and it conflicts with the no-accounts decision). Gives the best restore story, at the highest cost |
| Native iCloud key-value store (`NSUbiquitousKeyValueStore`) | Not recommended | Needs the iCloud capability and entitlement change plus a custom plugin; Keychain sync gets the same result with less |
| Recovery by friend ("ask a friend to vouch") | No | Social engineering surface, complex, no hard guarantee |
| QR code transfer from old phone to new | Maybe later | Good for a phone upgrade while the old phone still works. It is the recovery code with a camera, and the QR scanner adds a native dependency. Cheap to add once Option 2 exists, if the code is the payload |
| Email magic link | No | Collects an email address, which changes the privacy posture and the App Store privacy label |
| Passkeys | No | Same account-shaped cost as Sign in with Apple |
| Hardening web storage only (request persistent storage, mirror key into IndexedDB) | No | Does not survive app deletion, so it does not address this issue |

## Comparison

| | 1. Keychain (aparajita, sync on) | 2. Recovery code | Both |
| --- | --- | --- | --- |
| Reinstall same phone | Automatic | Manual, if code saved | Automatic, code as backup |
| New phone, same Apple ID | Automatic (if iCloud Keychain on) | Manual | Automatic |
| New phone, different Apple ID or Android | No | Yes | Yes |
| Player effort | None | Must save a code beforehand | None, with a fallback |
| Native build + App Store review | Yes | No | Yes (for the Keychain half) |
| Reaches existing installs immediately | No, only after update | Yes | Code half yes |
| Server schema change | None | 2 new tables (additive) | Same as 2 |
| New secret / config | None | Optional pepper secret | Same as 2 |
| Main risk | Async key bootstrap and split identity | Low adoption, brute-force surface | Both |
| Rough agent effort | 1 day plus Jon's build and submit | 2 days with tests | About 3 days |

## Recommendation

Do both, in this order:

1. **Recovery code first** (Option 2). It ships with no App Store release, reaches every existing install at once, works across platforms, and is the safety net for the cases Keychain cannot cover (different Apple ID, iCloud Keychain off). Add a gentle prompt after the player's first completed match so adoption is not zero.
2. **Keychain second** (Option 1 with `@aparajita/capacitor-secure-storage`, `sync: true`), bundled into the next native release you were going to cut anyway. It is the only option that protects players who never think about backups. Because the JS must feature-detect the plugin, it can safely deploy before or after the binary.

If you want only one: pick the recovery code, since it carries no release risk and no new native surface. Choose Keychain alone only if you are already shipping a build soon and are comfortable that Apple-ID-bound recovery is enough.

### Decisions needed from Jon

1. Does a shared Apple ID sharing one identity (family devices) matter, or is `sync: true` fine?
2. Recovery code length: 10 (50 bits) or 12 (60 bits) symbols?
3. Is a Worker secret for the hash pepper acceptable, or should we skip it?
4. Rate limiting: D1 counter now, or approve a Workers Rate Limiting binding in wrangler config?
5. Should restore also rebuild the friends list from `cinq_friend_adds`, and should active-match recovery wait for a later phase?
