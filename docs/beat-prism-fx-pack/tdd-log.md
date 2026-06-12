# beat-prism-fx-pack — TDD log

Suite: `node --test 'experiments/beat-prism/*.test.mjs'`.
Baseline before the feature: 26 tests (all green, kept unmodified
throughout). Final: 66 tests green; full `npm run test:experiments`:
271 green (was 231).

| slice | behavior | red | green | tests added | status |
| --- | --- | --- | --- | --- | --- |
| 1 | registry shape + parameter math (FX_REGISTRY, mulberry32, latencyMs, sliceOffsets, wedgeAngles, posterizeCurve, ringIndex) | cc6623e (26 pass / 10 fail) | 3151cef (36 pass) | 10 | green |
| 2 | grid phase lock (stepGrid: anchor, lerp re-lock, off-grid ignore, confidence, 4 s lapse, free-run, latency compensation, purity) | 6b279f0 (36 / 8) | 6b1237c (44 pass) | 8 | green |
| 3 | grid events (half-open windows, no double fire, bar flags, unconfident → silent) | 96bacfc (44 / 5) | 699dc6f (49 pass) | 5 | green |
| 4 | shuffle conductor (dealHand: determinism, 4–6, ≤2/cat, ≤2 heavy, enabled-only, seed divergence, small pools) | e7654c3 (49 / 6) | 3667241 (55 pass) | 6 | green |
| 5 | app integration (drawer, beat dot, keys r/e/0/9, registry pipeline, caps; structural) | 6a459da (55 / 4, 2 structural tests passed pre-implementation) | 20774c6 (61 pass) | 6 | green |
| 6 | transport controls — design addendum (formatTime, seekTarget, transport bar, arrow-key seeking, seek resets grid) | 464c87a (61 / 5) | bbd9091 (66 pass) | 5 | green |

No standalone refactor commits — each green left the code in shape.

Notes:

- Slice 5 green was amended once before publishing to fold in a bug
  found on post-green review: `resetDetector()` (demo ↔ video switch)
  now also drops the beat grid, otherwise a stale confident grid kept
  firing at the previous source's tempo for up to 4 s. Slice 6's seek
  handling reuses the same reset.
- The transport-controls design addendum landed mid-build
  (b1d53a5); it was folded into the PRD/plan (626f9e8) and built as
  slice 6 after the original five slices.
- The 6 legacy HUD chip elements survive as read-only "now playing"
  hand slots, which keeps the pre-existing six-chip structural test
  green without modification.
- DOM/canvas behavior (the 40 draw hooks themselves) is not coverable
  in Node; covered instead by structural tests plus the pure parameter
  math they consume. Verify visually by soloing effects in the drawer.
