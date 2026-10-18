# Analytics events

Events go through `track(name, props)` in `src/game/track.js`. The default sink is a **no-op**: nothing is sent
anywhere. The sink is pending the decision in #36; once chosen, install it with `setSink((name, props) => ...)`
at startup. `track` never throws, even if the sink does.

Rules for props: no PII. Never include `playerKey`, player names, friend IDs/codes, or match codes.

| Event | Fires when | Props |
| --- | --- | --- |
| `howto_opened` | The HOW TO PLAY button on Home is pressed (once per open). | none |
| `howto_completed` | The player reaches the last how-to card and taps LET'S PLAY. Skipping does not fire it. | none |
| `first_match_started` | The first multiplayer match this device successfully creates, joins or rematches (guarded by the `cinq-first-match-tracked` localStorage flag). | `intent`: `create`, `join` or `rematch` |
| `friend_added` | An explicit add succeeds: friend ID typed in Multiplayer, `?friend=` link, or friend invite link. Automatic adds from matches or incoming adds do not fire. | none |
| `rematch_started` | A rematch is successfully created from a finished match or a friend's REMATCH button. | none |
| `landing_viewed` | The web landing page (GetTheApp) mounts, once per view. | `has_friend_id`, `has_match_code` (booleans; both false for a bare visit) |
| `landing_app_store_tapped` | The GET ON THE APP STORE link is tapped on the landing page. | none |
| `landing_code_copied` | The friend ID / match code is copied to the clipboard on the landing page (not fired if the clipboard is blocked). | `kind`: `friend_id` or `match_code` (never the value) |

The multiplayer intro has no event yet, and no `intro_*` events existed in code, so none were added.
Read `howto_completed / howto_opened` for how-to completion.
