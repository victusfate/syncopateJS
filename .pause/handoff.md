# Pause handoff

**When / branch:** 2026-06-12 16:45 UTC · `main` @ 49330e9 (clean)

**Goal:** syncopateJS — standalone client-side "drop a video, get a music
video" app, extracted from agent-demos. Current focus: **mobile still broken**
after the first fix attempt.

## Active artifacts
- `experiments/syncopatejs/index.html` — the whole app; mobile fixes from
  PR #3 are merged but the user reports it **still does not work on their
  phone** (no further detail yet — unclear if it's still silent, layout,
  or both).
- `experiments/syncopatejs/syncopatejs.test.mjs` — 119 tests green,
  includes a structural mobile-regression test.

## Done this session
- Extracted beat-prism + scaffold from victusfate/agent-demos with
  git-filter-repo; landed as a clean single import commit (PR #1, merged).
- Renamed app to syncopateJS; gallery removed; `pages.yml` deploys
  `experiments/syncopatejs/` as the Pages site root:
  https://victusfate.github.io/syncopateJS/ (deploy verified).
- README rebranded with the live URL (PR #2, merged).
- Mobile fix attempt (PR #3, merged): `begin()` pointerdown→click (touch
  activation for `AC.resume()`), AC resume retry on ▶, coarse-pointer toast
  copy, `@media (max-width: 640px)` layout.

## Next steps
1. User offered to pull the app up locally for live review — take them up
   on it: run a local server (`npx http-server .` → `/experiments/syncopatejs/`)
   or use the `/verify` / `/run` skill with mobile emulation to reproduce.
2. First check the deployed page actually has the fix (cache!): view source
   of the live URL and confirm `addEventListener('click', begin)` is present.
3. Get specifics from the user: silent demo? video won't play? layout?
   Which browser/device (iOS Safari vs Android Chrome)?
4. Likely suspects if still silent on iOS: `AC.resume()` promise not
   awaited before `startDemo()`; `createMediaElementSource` muting video
   audio on iOS Safari; consider an on-screen debug toast of `AC.state`.
5. Branch for the next fix: `fix/mobile-playback-2` off latest main.

## Open questions
- What exactly "still not working" means on the user's device (symptom +
  browser/OS).
- Whether the user's phone test hit the *new* deploy (run #2, 16:43 UTC)
  or a cached pre-fix page.

## How to resume
- Any device: `/resume` (reads this file).
- This machine: `claude -c` reopens the full conversation (richer).
