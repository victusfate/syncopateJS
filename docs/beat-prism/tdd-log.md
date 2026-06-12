# beat-prism — TDD log

## Slice 1 — flux and band energy
- Status: done (6 tests)
- Notes: `node --test experiments/beat-prism/` (directory arg) is not
  supported by this Node (v22) — it tries to require the directory as a
  module. All runs use the repo's quoted-glob form
  (`node --test 'experiments/beat-prism/*.test.mjs'`, and
  `npm run test:experiments` for the suite). RED was the missing
  `index.html`; GREEN created it with the logic-block IIFE.

## Slice 2 — adaptive threshold and onset state machine
- Status: done (9 tests)
- Notes: MAD pinned to *median* absolute deviation (constant history →
  threshold = mean, so a constant-flux baseline can never fire under
  strict `>`). `stepOnset` compares flux against the threshold of the
  prior history before appending — a dedicated test proves a spike
  cannot lift its own threshold. Purity asserted (input state not
  mutated).

## Slice 3 — tempo estimation
- Status: done (5 tests)
- Notes: RED caught a real estimator bug — the planned BPM-domain
  histogram (1-BPM bins, mean of ±3 of mode) skewed sharp under ±15 ms
  jitter (130.9 for a 128 BPM train) because BPM is convex in the
  period. Reworked to a period-domain histogram (15 ms bins, mean of
  the modal neighborhood, converted back) — jitter is linear there, so
  the estimate is unbiased (128.2). `plan.md` updated in the green
  commit.

## Slice 4 — pulse decay
- Status: done (2 tests)
- Notes: `decayPulse(v, dt, halfLife) = v · 2^(−dt/halfLife)`;
  frame-rate independent by construction.

## Slice 5 — app shell and structural acceptance
- Status: done (4 tests)
- Notes: two of the four structural tests (export surface, no external
  fetches) were already green when written — kept as regression guards;
  analyser-config and HUD-markup tests went properly red, then green
  with the full app. The app renders the source frame (letterboxed
  video or procedural demo scene) to an offscreen canvas once per rAF
  so the chroma passes reuse it.

## Manual verification (no browser harness in this repo)
- Both inline script blocks parse (`new Function` syntax check in Node).
- End-to-end pipeline simulation in Node with the app's real constants
  (60 fps frame times, default slider → k ≈ 1.51, bass bins for 250 Hz
  at 48 kHz, synthetic kick spectra at 124 BPM over a noise floor):
  20/20 onsets detected, estimated BPM 124.14 — the demo loop's tempo
  is recoverable through the exact code path the app uses.
- Full suite `npm run test:experiments`: 231/231 green (26 of them
  beat-prism).

## Deviations from plan
- `estimateBpm` uses period-domain bins instead of the planned BPM-domain
  bins (see slice 3 — found by RED, plan amended).
- Test runs use the quoted-glob invocation, not the bare directory
  (Node v22 limitation, same as noted in nightbloom's log).
