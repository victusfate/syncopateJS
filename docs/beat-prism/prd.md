# beat-prism — PRD

## Problem

Turn any local video file into a beat-synced music video, entirely
client-side: real-time onset detection on the soundtrack drives visual
effects composited over the video. One dependency-free HTML file that also
demonstrates itself with zero assets via a built-in synthesized drum loop.

## Goals

1. Drop (or pick) a local video → it plays in a canvas with effects firing
   on its actual beats; the file never leaves the machine.
2. Demo mode before any video: a synthesized Web Audio drum loop routed
   through the *same* analyser, so detection is genuine, with procedural
   visuals standing in for the video.
3. Zero dependencies, zero build, zero network: works over `file://`.
4. All detection/tempo math is pure and unit-tested in Node via the shared
   logic-block harness.

## Non-goals

- Remote video URLs (CORS), DRM'd media, audio-only files.
- Offline/lookahead analysis, beat grid editing, export of processed video.
- Mobile-specific UI, persistence, accessibility audit.

## Functional requirements

- **FR1 — audio graph:** one `AudioContext`; one `AnalyserNode` with
  `fftSize = 2048`, `smoothingTimeConstant = 0`, connected to the
  destination. Demo bus and video source both route through it. The
  `MediaElementAudioSourceNode` is created lazily on the first video and
  reused for the page's life (it can only be created once per element).
- **FR2 — onset detection:** per rAF, read the byte magnitude spectrum and
  compute bass-weighted spectral flux (positive per-bin diffs; bins below
  ~250 Hz counted twice). An onset fires when flux exceeds an adaptive
  threshold — mean + k·MAD (median absolute deviation) over the last ~43
  flux frames — outside a 180 ms refractory window. The sensitivity slider
  scales k.
- **FR3 — tempo:** BPM estimated from the inter-onset-interval histogram,
  intervals folded into the [70, 180) BPM octave; HUD shows "—" until ≥ 8
  onsets, then the rounded estimate.
- **FR4 — beat-triggered effects** (each jumps to a pulse of 1 on onset,
  then decays exponentially): punch-zoom, flash, shake, particle burst.
- **FR5 — continuous effects:** chromatic aberration follows bass band
  energy; edge glow follows treble band energy.
- **FR6 — effect toggles:** six HUD chips and keys `1–6` toggle the six
  effects independently; disabled effects contribute nothing.
- **FR7 — video input:** file-pick button and drag-and-drop anywhere on the
  page. Loading a video revokes any prior object URL, stops the demo loop,
  and switches detection to the video's soundtrack. The hidden `<video>` is
  drawn letterboxed into the canvas every rAF.
- **FR8 — demo mode:** kick (sine drop), snare (filtered noise), hat (short
  noise) scheduled ahead of time at a fixed tempo in 100–140 BPM; procedural
  background visuals (rotating prism wireframe + radial spectrum bars).
  Active on first click, and again on `d`.
- **FR9 — keys:** space play/pause, `d` back to demo mode, `1–6` toggle
  effects, `s` save canvas PNG.
- **FR10 — first visit:** title overlay explains "drop a video — or click
  to hear the demo"; the first click starts audio (autoplay rules) and demo
  mode.
- **FR11 — testability:** `spectralFlux`, `adaptiveThreshold`, `stepOnset`,
  `estimateBpm`, `decayPulse`, `bandEnergy` are pure functions (plain
  arrays/numbers, no Web Audio types) exported from the single
  `<script id="logic">` block via `globalThis.__logic`.

## Quality requirements

- 60 fps target on a mid-size window; particle counts bounded and
  self-pruning; resize handled; the source frame is rendered once per rAF
  to an offscreen canvas and composited (chroma passes reuse it).
- Dark prismatic/neon-on-black identity — the page looks like a music
  visualizer even at rest.
- No external fetches of any kind in `index.html`.
- `node --test experiments/beat-prism/` passes; the full
  `node --test experiments/` suite stays green.

## Acceptance

Unit tests feed synthetic spectra with energy injected at known frames and
assert onsets at those frames and nowhere else (given the refractory); a
120 BPM impulse train estimates 120 ± 2 and a 60 BPM train folds to 120;
decay halves after one half-life; the threshold does not fire on a
constant-flux baseline. Manual run: scenarios 1–5 of
`docs/beat-prism/design.md`.
