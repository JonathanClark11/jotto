# App Store Review Responses — Cinqle (Guideline 2.1 Information Needed)

Paste these into the App Store Connect reply AND into the Notes field in App Review Information.

---

**2. App purpose and target audience**

Cinqle is a word-guessing game for adults and teens who enjoy vocabulary and logic puzzles. Players guess a secret five-letter word; each guess returns only a count of how many letters appear in the target word (not which ones or where). The game rewards deductive reasoning and vocabulary without giving positional hints, making it harder than similar games in the genre. The target audience is word game enthusiasts, 13 and up, with no account required to play.

---

**3. Setup instructions and main features**

No account, login, or setup is required to play. The app opens directly to the home screen with four modes:

- **Daily** — One shared puzzle per day, same word for all players. Resets at midnight.
- **Solo** — The app picks a random word; the player tries to crack it in as few guesses as possible.
- **Rival** — Invite a friend via a share link. Each player sets a word for the other to guess; you take turns. No account required; game state is tracked via a unique game ID in the URL.
- **Friends** — Lists your active and completed Rival games and your win/loss stats.

To test: open the app, tap Daily, type a five-letter word using the keyboard, and tap Submit. The counter updates to show how many letters in your guess appear in the target.

---

**4. External services and platforms**

- **Cloudflare Workers** — Hosts the web application layer that the iOS app loads at runtime. Handles game logic, daily word selection, and Rival game state storage. No user accounts or personal data are stored.
- No authentication services, payment processors, or AI services are used.
- No third-party analytics or advertising SDKs are included.

---

**5. Regional availability and consistency**

The app functions identically in all regions. There are no region-locked features, localized content differences, or region-specific pricing. The word list is English only; the app is available globally with no restrictions.

---

**6. Regulated industry / third-party content**

The app does not operate in a regulated industry and does not include any protected third-party material. The word list consists of common English words. No licensed content, trademarks, or third-party intellectual property are used.

---

*Note: Item 1 (screen recording on a physical device) must be recorded and uploaded by Jon separately.*
