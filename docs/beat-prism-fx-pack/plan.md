# beat-prism-fx-pack — implementation plan

Vertical slices over `experiments/beat-prism/index.html` and its test file
`experiments/beat-prism/beat-prism.test.mjs` (extended in place). Each
slice: RED (tests committed failing) → GREEN (implementation) →
REFACTOR (only if real). All pure logic goes in the `<script id="logic">`
IIFE; the app script consumes it via `globalThis.__logic`.

## Slice 1 — registry + parameter math

Pure: `FX_REGISTRY` (46 entries, canonical ids, cats, kinds, heavy flags),
`mulberry32`, `latencyMs`, `sliceOffsets`, `wedgeAngles`, `posterizeCurve`,
`ringIndex`.

Tests: 46 entries / unique ids; exact per-category counts (new 12/10/8/7/3;
originals mapped: zoom+shake→geometry, flash+chroma→color, burst→scene,
glow→overlay); canonical id set; valid kinds; boolean heavy on all;
mulberry32 determinism + range + seed divergence; latencyMs ≈ 39.2 ms at
2048/44100; sliceOffsets determinism/length/bounds; wedgeAngles spacing;
posterizeCurve quantization edge cases; ringIndex wraparound.

## Slice 2 — beat grid phase lock (stepGrid)

Pure: `stepGrid(grid, onsetMs, bpm, nowMs, opts)` — anchor + period,
±90 ms lock window, lerp 0.35 re-lock, off-grid onsets ignored,
confidence (≥8 onsets + bpm), 4 s lapse resets the count, free-run,
`opts.latencyMs` subtracted before phase math, pure (no input mutation).

Tests: anchor seeding; 120 BPM train (±jitter) → confident, predicted
beats within tolerance of the true grid; exact lerp re-lock; off-grid
onset leaves the anchor phase untouched; free-run across a 3 s gap stays
confident with continuing predictions; lapse after 4 s drops confidence
and requires 8 fresh onsets; latency compensation shifts the anchor back
by exactly opts.latencyMs; input grid not mutated.

## Slice 3 — grid events

Pure: `gridEvents(grid, prevMs, nowMs)` → beats in (prevMs, nowMs] with
`{ timeMs, beatIndex, isBar, barIndex }`; empty when not confident.

Tests: correct beat times/count between two stamps; consecutive windows
never double-fire; bar flag every 4th beat with correct barIndex; empty
when unconfident or degenerate window.

## Slice 4 — shuffle conductor (dealHand)

Pure: `dealHand(registry, seed, enabledIds)`.

Tests: deterministic per seed; size 4–6 with a full pool; ≤2 per category;
≤2 heavy; only enabled ids; different seeds eventually differ; pool
smaller than 4 → deals the whole pool.

## Slice 5 — app integration: drawer, pipeline, conductor, HUD

App script rewrite (no logic-block changes): registry-driven draw hooks in
fixed category order; grid wiring (compensated onsets, grid-event firing
when confident, raw-onset fallback); beat dot; drawer UI built from
FX_REGISTRY; shuffle toggle + 4-bar re-deal; keys r/e/0/9, 1–6 retired;
hand chips (6 slots, preserves the legacy six-chip HUD test); frame ring
lazy alloc; shared 600-particle cap.

Tests (structural — DOM behavior is browser-only): drawer / shuffle /
beat-dot elements present; both script blocks parse via `new Function`;
key hints updated and the 1–6 binding gone; logic surface complete;
particle cap and ring size constants present; legacy chip count still 6;
no external fetches (existing test re-covers).

## Slice 6 — transport controls (design addendum, added mid-build)

Pure: `formatTime(sec)` (m:ss, degenerate input → 0:00),
`seekTarget(cur, dur, deltaSec)` (clamped; non-finite duration holds).

App: transport bar above the HUD (play/pause button, time readout,
range-input seek bar), video mode only; arrow-key seeking ±5 s /
shift ±30 s; every seek runs resetDetector() (onset history + grid).

Tests: formatTime formatting + edge cases; seekTarget clamping + edge
cases; structural — transport/playbtn/seek/time elements, ArrowLeft /
ArrowRight bound, app consumes both helpers.

## Out of scope

Gallery (`experiments/index.html`) untouched. design.md not edited.

## Commit sequence

`test(...): slice N red — …` / `feat(...): slice N green — …` per slice,
then `docs(beat-prism-fx-pack): tdd log`.
