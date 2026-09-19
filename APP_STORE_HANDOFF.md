# App Store Submission Handoff — Cinq

Everything the swarm can prepare programmatically is done. The remaining steps require Jon's Apple Developer account (jonathanclark11@gmail.com) and Xcode on the Mac.

---

## What's already done (in this branch)

| Asset | Location | Status |
|---|---|---|
| App Store metadata | `APP_STORE.md` | ✅ ready to copy-paste |
| Privacy policy page | `/privacy` route | ✅ live at https://jotto.jonathanclark11.workers.dev/privacy |
| App icon 1024×1024 PNG | `icon/cinq-icon-1024.png` | ✅ ready |
| App icon source SVG | `icon/cinq-icon.svg` | ✅ for any resizing |
| iPhone 6.9" screenshots (5) | `screenshots/6.9-inch-*.png` | ✅ placeholder mockups — replace with real Simulator captures |
| iPhone 5.5" screenshots (5) | `screenshots/5.5-inch-*.png` | ✅ placeholder mockups — replace with real Simulator captures |
| Capacitor iOS project | `ios/` | ✅ scaffold in place |

---

## Steps Jon needs to complete

### 1. Create the App Store Connect record

1. Go to [App Store Connect](https://appstoreconnect.apple.com) → Apps → "+" (New App)
2. Fill in:
   - **Platform:** iOS
   - **Name:** `Cinq`
   - **Primary language:** English (U.S.)
   - **Bundle ID:** use the one from `ios/App/App.xcodeproj` (check `PRODUCT_BUNDLE_IDENTIFIER` in Xcode build settings — it may be `com.jonathanclark11.cinq` or similar; register it in the Developer Portal first if it doesn't exist)
   - **SKU:** `cinq-ios-2024` (arbitrary internal identifier, can be anything)

### 2. Fill in App Store listing metadata

Copy from `APP_STORE.md`:

| Field | Value |
|---|---|
| **Name** | Cinq |
| **Subtitle** | Five-letter word guessing game |
| **Description** | (see `APP_STORE.md`) |
| **Keywords** | `word game,puzzle,daily word,guessing,logic,five letters,word puzzle,deduction,rival` |
| **Support URL** | https://jotto.jonathanclark11.workers.dev |
| **Privacy Policy URL** | https://jotto.jonathanclark11.workers.dev/privacy |
| **Category** | Games → Word |
| **Age Rating** | 4+ |

### 3. Upload the icon

In App Store Connect → App Information → App Icon:
- Upload `icon/cinq-icon-1024.png` (1024×1024, no transparency, no rounded corners — Apple applies rounding automatically)

### 4. Upload screenshots

**Recommendation:** replace the placeholder mockups with real Simulator captures first:

```bash
# In Xcode, open ios/App/App.xcworkspace
# Run on iPhone 16 Pro Max Simulator
# Use Device → Screenshot (Cmd+S) to save each screen
# Rename files to match screenshots/6.9-inch-*.png convention
```

Then upload the PNGs in App Store Connect → Screenshots:
- **6.9" display (required):** upload all 5 from `screenshots/6.9-inch-*.png`
- **5.5" display (required for older device support):** upload all 5 from `screenshots/5.5-inch-*.png`

Order: home → daily → rival → deduction tools → results

### 5. Configure code signing in Xcode

1. Open `ios/App/App.xcworkspace` in Xcode
2. Select the `App` target → Signing & Capabilities
3. Sign in with your Apple ID (jonathanclark11@gmail.com) — use **Automatically manage signing**
4. Xcode will create/download the provisioning profile and certificate automatically for the bundle ID
5. Set **Deployment Target** to iOS 16.0 minimum (covers ~97% of active devices)

### 6. Build and upload the archive

```bash
# In Xcode: Product → Archive
# When archive appears in Organizer: Distribute App → App Store Connect → Upload
# Leave "Strip Swift symbols" and "Upload symbols" checked
```

Or via command line (once signing is configured):
```bash
cd /Users/agent/ws/jotto
npm run build          # builds the Next.js web app
npx cap sync ios       # syncs web assets into ios/
xcodebuild -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -archivePath build/Cinq.xcarchive \
  archive
xcodebuild -exportArchive \
  -archivePath build/Cinq.xcarchive \
  -exportPath build/Cinq-export \
  -exportOptionsPlist ios/ExportOptions.plist
```

*(You'll need to create `ios/ExportOptions.plist` — Xcode generates one during the GUI export flow if you want a template.)*

### 7. Submit for review

In App Store Connect:
1. Select the uploaded build under the version
2. Fill in **What's New** (first release — use "Initial release" or leave empty for new apps)
3. Answer the export compliance and content rights questions (No encryption, Yes you have content rights)
4. Click **Submit for Review**

Apple review typically takes 24–48 hours for new apps.

---

## If Apple rejects the submission

Common first-submission issues:
- **Missing demo account** — if any screen requires login, provide credentials in the review notes (Cinq has no login, so this shouldn't apply)
- **App not functional** — ensure the Capacitor webview loads correctly; test on a real device before submitting
- **Privacy labels** — App Store Connect will ask about data collection; Cinq collects no user data, so answer "No" to all data collection questions

---

## Bundle ID note

`capacitor.config.ts` already uses `com.jonathanclark11.jotto` as the bundle ID. You can keep this or change it to `com.jonathanclark11.cinq` — either works as long as you register the chosen ID in the Apple Developer Portal before creating the App Store Connect record.

If you change it:
```bash
# Edit capacitor.config.ts → appId
npx cap sync ios
```
