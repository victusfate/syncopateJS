# beat-prism-fx-pack — PRD

Source design: `docs/beat-prism-fx-pack/design.md` (binding — ids, counts,
vocabulary, and decisions there are canonical). This PRD translates it into
requirements against the existing app `experiments/beat-prism/index.html`.

## Goal

Grow beat-prism from 6 effects to 46 and make effects fire *with* the
audible beat via a predictive, latency-compensated beat grid. A shuffle
conductor keeps the show composed. The six chips become a collapsible
effects drawer. Still one file, Canvas 2D only, zero external fetches,
works over `file://`.

## Functional requirements

### R1 — Effect registry (data-driven)

- `FX_REGISTRY` exported from the `<script id="logic">` block: 46 entries
  `{ id, name, cat, kind, heavy }`. Pure data — draw hooks live in the app
  script, keyed by id.
- New effects, canonical ids per design.md:
  - color (12): hue-spin, posterize, invert-strobe, duotone, sat-pump,
    bleach-burn, thermal, channel-swap, neon-edge, gamma-flicker,
    color-drain, sepia-ghost
  - geometry (10): rotate-jolt, kaleidoscope, mirror-flip, tile-grid,
    pixelate, slice-glitch, v-slice, squash, skew-tilt, spin-zoom
  - temporal (8): echo-trails, motion-ghost, strobe-black, freeze-frame,
    stutter-loop, time-smear, droste, interlace-roll
  - overlay (7): scanlines, vhs-band, grain-burst, vignette-pump,
    letterbox-snap, starburst, shockwave
  - scene (3): lightning, confetti, glyph-pop
- Original six join the registry with their current look preserved:
  zoom (geometry), flash (color), shake (geometry), burst (scene),
  chroma (color), glow (overlay). Note: the legacy `particles` toggle id
  becomes the canonical id `burst`.
- `kind` ∈ {pulse, continuous, scheduled}; `heavy` boolean on every entry
  (heavy = needs an extra full-frame draw).
- Render pipeline runs active effects in fixed category order:
  geometry → color → temporal → overlay → scene; registry order within a
  category.

### R2 — Predictive beat grid (top priority)

- Pure `stepGrid(grid, onsetMs, bpm, nowMs, opts)` maintains a phase-locked
  clock: an anchor beat time plus `periodMs = 60000 / bpm`.
  - `onsetMs` null → frame tick (free-run + confidence-lapse bookkeeping).
  - Latency compensation: `opts.latencyMs` is subtracted from `onsetMs`
    before any phase math, so the anchor lives in audible time. The app
    computes it as `latencyMs(fftSize, sampleRate)` ≈ fftSize/2/sampleRate
    (FFT window center) + 16 ms (one rAF) ≈ 39 ms at 2048 / 44.1 kHz.
  - An onset within ±90 ms of a predicted beat re-locks phase:
    `anchor ← predicted + 0.35 · (onset − predicted)`. Onsets elsewhere are
    ignored by the clock (still counted as onsets).
  - Confidence: ≥ 8 onsets since last lapse AND bpm ≠ null. 4 s without an
    onset drops confidence and resets the onset count (8 fresh onsets to
    re-confirm).
  - Free-run: with no onsets the anchor and period are untouched —
    predictions continue through quiet passages until the lapse.
- Pure `gridEvents(grid, prevMs, nowMs)` → beat boundaries crossed in the
  half-open interval (prevMs, nowMs]: `{ timeMs, beatIndex, isBar,
  barIndex }`, bars every 4 beats. Empty unless the grid is confident.
  Consecutive frame windows never double-fire a beat.
- App wiring: while confident, pulse effects fire in the frame a predicted
  beat time elapses (grid events), not on detection; while not confident,
  raw onsets fire them (today's behavior). HUD shows a beat-locked blinking
  dot next to the BPM readout (lit only while confident, pulsing on grid
  beats).

### R3 — Shuffle conductor

- On by default. Pure `dealHand(registry, seed, enabledIds)`: seeded
  mulberry32, deterministic per seed; hand size 4–6 (or the whole pool if
  fewer enabled); ≤ 2 per category; ≤ 2 heavy; drawn only from enabled
  effects.
- Reseeded every 4 bars: seed = 4-bar window index (`floor(barIndex / 4)`),
  re-dealt when the window changes.
- Manual changes (any drawer checkbox, `0`, `9`, chip click) switch shuffle
  off; `r` re-enables and deals immediately. Shuffle off → active set =
  enabled set (manual mode trusts the user, no caps).

### R4 — Drawer UI

- The six HUD toggle-chips are replaced as toggles by a collapsible drawer
  listing all 46 effects grouped by category, one line each, with
  checkboxes (built from FX_REGISTRY — data-driven).
- HUD keeps: BPM readout + beat dot, sensitivity slider, shuffle toggle,
  drawer button, load-video button. Six HUD chip slots now display the
  currently *active* hand (read-only feedback; clicking one toggles that
  effect off → manual mode).
- Keys: space, `d`, `s` unchanged; `r` shuffle on; `e` drawer; `0` all off;
  `9` all on. Keys 1–6 retired.

### R4b — Transport controls (design addendum, added mid-build)

- Transport bar above the HUD, shown in video mode only: play/pause
  button, `m:ss / m:ss` elapsed/total readout, and a scrubbable seek bar
  (click or drag).
- Keys (video mode only): `←`/`→` jump −/+5 s, shift+`←`/`→` −/+30 s.
  Space stays play/pause in both modes; in demo mode the transport hides.
- Any seek clears the onset history and grid confidence; the clock
  re-locks within a couple of bars.
- Pure helpers in the logic block: `formatTime(sec)` and
  `seekTarget(cur, dur, deltaSec)` (clamped to [0, dur]; degenerate
  duration → hold position).

### R5 — Performance & caps

- Offscreen buffers (feedback, smear, ghost, pixelate, noise) created once
  and reused; resized with the window.
- Frame ring: 12 reused canvases, allocated lazily and only while
  freeze-frame or stutter-loop is enabled; released when both are off.
- Particles ≤ 600 total across burst + confetti.
- Single file, no WebGL, no workers, no external fetches, `file://`-safe.

## Pure logic surface (script id="logic")

Existing (unchanged): spectralFlux, bandEnergy, adaptiveThreshold,
stepOnset, estimateBpm, decayPulse.

New: FX_REGISTRY, stepGrid, gridEvents, dealHand, mulberry32,
latencyMs(fftSize, sampleRate), sliceOffsets(seed, count, maxOffset),
wedgeAngles(n), posterizeCurve(v, levels), ringIndex(head, back, size),
formatTime(sec), seekTarget(cur, dur, deltaSec).

No DOM, no canvas types in the logic block — it is evaluated in Node by
`experiments/_harness/logic.mjs`.

## Quality bar

Every effect visually distinct and individually verifiable by soloing it in
the drawer. posterize ≠ thermal ≠ duotone; slice-glitch (horizontal strips)
≠ v-slice (vertical). Existing neon-on-black aesthetic and the six original
effects' look preserved.

## Acceptance

- `node --test 'experiments/beat-prism/*.test.mjs'`: all 26 existing tests
  pass unmodified, plus new tests covering registry shape, grid phase-lock
  / free-run / lapse / latency compensation, gridEvents boundaries,
  dealHand constraints, and parameter-math edge cases.
- `npm run test:experiments` green.
- Both script blocks parse in Node; zero external fetches.
