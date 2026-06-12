# beat-prism — implementation plan

Vertical slices, each RED → GREEN (→ REFACTOR if needed). Tests live in
`experiments/beat-prism/beat-prism.test.mjs` and load the logic block from
`experiments/beat-prism/index.html` via the shared harness
(`experiments/_harness/logic.mjs`). Slices 1–4 grow the pure detection
math inside the logic block; slice 5 builds the full app shell around it
and locks the structure with acceptance-style tests.

Conventions fixed up front:

- `adaptiveThreshold(history, k)` = mean + k · **median** absolute
  deviation (MAD = median(|x − median(x)|)); empty history → `Infinity`.
- `bandEnergy(spectrum, lo, hi)` = mean magnitude over bins `[lo, hi)`
  (hi exclusive, clamped); empty range → 0.
- `stepOnset(state, flux, nowMs, opts)` compares flux against the
  threshold of the *prior* history (so the spike doesn't lift its own
  threshold), then appends flux, trims to the window, and fires only if
  `nowMs − lastOnsetMs ≥ refractoryMs` (default 180, k default 1.5,
  window default 43). Returns `{ fired, state }` without mutating input.
- `estimateBpm(onsetTimesMs)` → null until ≥ 8 onsets; otherwise each
  inter-onset interval is folded by octave into the [70, 180) BPM range
  and histogrammed in the *period* domain (15 ms bins); the estimate is
  60000 / mean of the periods within two bins of the modal bin. (Period
  domain because timing jitter is linear there — a BPM-domain mean skews
  sharp; found during slice 3 RED.)

## Slice 1 — flux and band energy

- RED: `spectralFlux(prev, curr, bassBins)` sums only positive per-bin
  diffs; bins `< bassBins` count twice; non-increasing spectra → 0.
  `bandEnergy` means a known range, hi-exclusive, empty → 0.
- GREEN: create `experiments/beat-prism/index.html` with the single
  `<script id="logic">` IIFE exporting both via `globalThis.__logic`.

## Slice 2 — adaptive threshold and onset state machine

- RED: `adaptiveThreshold` of a constant history equals its mean (MAD 0);
  known mixed history matches hand-computed mean + k·MAD; empty →
  Infinity. `stepOnset` fed a constant-flux baseline never fires; spikes
  injected at known frames fire at exactly those frames; two spikes
  inside 180 ms fire only once; state is not mutated.
- GREEN: implement both in the logic block.

## Slice 3 — tempo estimation

- RED: `estimateBpm` returns null below 8 onsets; a 120 BPM impulse train
  (500 ms IOIs) → 120 ± 2; a 60 BPM train folds to 120 ± 2; a 200 BPM
  train folds to 100 ± 2; jittered 128 BPM train stays within ± 2.
- GREEN: implement `estimateBpm`.

## Slice 4 — pulse decay

- RED: `decayPulse(value, dtMs, halfLifeMs)` halves after one half-life,
  quarters after two, identity at dt 0, scales linearly in value.
- GREEN: implement `decayPulse`.

## Slice 5 — app shell and structural acceptance

- RED: structural tests — exactly one logic block exporting the full
  six-function surface; `index.html` has no external fetches (no
  http(s):// in src/href/url()); analyser configured with
  `fftSize = 2048` and `smoothingTimeConstant = 0`; HUD markup present
  (BPM readout, sensitivity slider, six effect chips, file input).
- GREEN: build the app — canvas + offscreen source canvas, title overlay,
  HUD, demo-mode synth loop (124 BPM kick/snare/hat through the
  analyser) with prism-wireframe/radial-spectrum visuals, video pipeline
  (object URL lifecycle, lazy once-only MediaElementAudioSourceNode,
  letterboxed draw), detection loop wired to the logic block, all six
  effects, keys, drag-and-drop, resize.

## Out of scope for unit tests

Web Audio output, canvas rendering, and input handling — verified
manually against the scenarios in `design.md` (no browser harness in this
repo's test suite).
