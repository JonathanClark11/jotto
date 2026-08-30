# STEERING.md — Jotto (Jortal)

Standing context and rules for Bucky when working on this project.

## What this is
Jortal — a count-based word guessing game (Wordle variant) built by Colin. Existing live version at https://jotto-word-game.ceegray.chatgpt.site. Goal: ship to iOS App Store (and optionally Android) via Capacitor.

## Approach
1. Port/recreate the game as a Next.js web app (replicating the existing game logic)
2. Wrap with Capacitor for native iOS/Android packaging
3. Submit to App Store

## Stack
- Next.js 16, React 19, Tailwind v4, TypeScript (web layer)
- Capacitor 7 for iOS/Android native shell
- No database needed — game is stateless

## Deploy
- Web: Vercel (for testing/demo, auto-deploy on push to `main`)
- Native: Capacitor build → Xcode → App Store Connect

## Risk gate — auto-merge OK
- Doc-only changes, copy/typo fixes, CSS/style-only changes
- Game logic unit tests

## Risk gate — approval required
- Any change to Capacitor config or native platform files
- Any change to `package.json` runtime dependencies
- App Store metadata / submission steps (Jon approves before submit)
- PRs > 200 lines net
