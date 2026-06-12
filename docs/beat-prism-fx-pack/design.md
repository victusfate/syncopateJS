# beat-prism-fx-pack — design

## Concept

Grow beat-prism from 6 effects to 46 by adding 40 new beat-matched effects,
and make "beat-matched" literal: a predictive beat grid (phase-locked clock
seeded by the onset detector) lets effects fire *on* the beat — including
through quiet bars — not merely react to onsets. A shuffle conductor rotates
a small active set every few bars so the show stays composed, not soup.

## Q&A (auto-resolved — prototype built in auto mode)

**Q: Reactive vs matched — what changes?**
A: Today effects fire when an onset is detected. The fx-pack adds a beat
grid: BPM + onset phase produce a predicted next-beat clock. Confident
onsets re-lock the phase; absent onsets, the clock free-runs at the
estimated tempo. Effects subscribe to grid events (beat, every-2nd, bar,
every-4-bars) instead of raw onsets. Raw-onset firing remains a fallback
until the grid has confidence (≥ 8 onsets and a stable BPM). Onset
timestamps are latency-compensated (see Decisions), so a confident grid
fires effects in the same frame the beat is heard — with the beat, not
after the fact.

**Q: How do 46 toggles fit in the HUD?**
A: They don't, as chips. The six original chips are replaced by a
collapsible effects drawer listing all 46 grouped by category, each with a
checkbox. The HUD keeps: BPM readout (now with a beat-locked blinking dot),
sensitivity slider, shuffle toggle, drawer button.

**Q: What stops 46 simultaneous effects from being mush (and 5 fps)?**
A: Shuffle mode, on by default. The conductor keeps 4–6 effects active,
re-drawing a weighted random hand every 4 bars (seeded RNG; one category
may contribute at most 2 at a time, at most 2 "heavy" effects concurrently
— heavy = needs an extra full-frame draw). Manual checkbox changes switch
shuffle off; `r` turns it back on.

**Q: What is an effect, structurally?**
A: A registry entry: `{ id, name, cat, kind, heavy, on }` plus a draw hook.
`cat` ∈ {color, geometry, temporal, overlay, scene}. `kind` ∈ {pulse
(fires on a grid event, decays), continuous (follows band energy),
scheduled (toggles state on bar boundaries)}. The registry is data; the
render loop is a generic pipeline that runs active effects in a fixed
category order (geometry → color → temporal → overlay → scene) so
compositing is deterministic.

**Q: Which 40 effects?**
A: The registry below is binding (ids canonical). Color (12): hue-spin,
posterize, invert-strobe, duotone, sat-pump, bleach-burn, thermal,
channel-swap, neon-edge, gamma-flicker, color-drain, sepia-ghost.
Geometry (10): rotate-jolt, kaleidoscope, mirror-flip, tile-grid,
pixelate, slice-glitch, v-slice, squash, skew-tilt, spin-zoom.
Temporal (8): echo-trails, motion-ghost, strobe-black, freeze-frame,
stutter-loop, time-smear, droste, interlace-roll. Overlay (7): scanlines,
vhs-band, grain-burst, vignette-pump, letterbox-snap, starburst,
shockwave. Scene (3): lightning, confetti, glyph-pop. All implementable
with Canvas 2D (`ctx.filter`, transforms, composite ops, an offscreen
feedback buffer, a small frame ring for stutter/freeze).

**Q: What is pure and testable?**
A: The grid: `stepGrid(grid, onsetMs, bpm, nowMs)` (phase lock, free-run,
confidence), `gridEvents(grid, prevMs, nowMs)` (which beat/bar boundaries
elapsed). The conductor: `dealHand(registry, seed, constraints)` (size 4–6,
≤2 per category, ≤2 heavy, only enabled effects, deterministic per seed).
The registry itself (46 entries, unique ids, valid cat/kind, exactly 12/10/
8/7/3 + the original 6 mapped into categories). Parameter math: slice
offsets from a seed, kaleidoscope wedge angles, posterize level curve,
stutter ring indexing. All in the `<script id="logic">` block.

**Q: Do the original six effects change?**
A: They join the registry (zoom, flash, shake, burst, chroma, glow) but
keep their look. Pulse-kind effects now key off grid beats when the grid
is confident, raw onsets when not.

**Q: How does the user control playback? (added mid-build)**
A: A transport bar: play/pause button, elapsed/total time, and a seek bar
(click or drag to scrub) sitting above the HUD, shown in video mode. Keys:
space play/pause (existing), `←`/`→` jump −/+5 s, shift+`←`/`→` −/+30 s.
Seeking clears the onset history and grid confidence (the clock re-locks
within a couple of bars). In demo mode the seek bar hides (the loop has no
timeline); space still pauses/resumes the demo.

## Decisions

- Beat grid: phase-locked at estimated BPM; an onset within ±90 ms of a
  predicted beat re-locks phase (lerp 0.35 toward the onset); onsets
  elsewhere are ignored by the clock. Confidence requires ≥ 8 onsets and
  BPM ≠ null; losing audio for 4 s drops confidence.
- Latency compensation: detection lags the audible hit by roughly the FFT
  window center plus one rAF (≈ fftSize/2/sampleRate + 16 ms ≈ 39 ms at
  44.1 kHz). Onset timestamps are shifted back by this constant before
  phase-locking, so predicted beats — and the pulses they fire — align
  with what the ear hears instead of trailing it. While the grid is
  confident, pulse effects fire at predicted beat instants (the frame in
  which the beat time elapses), not on detection.
- Shuffle: seeded mulberry32; reseed every 4 bars from bar index; the hand
  is dealt from *enabled* effects only (drawer checkboxes are the pool).
- Render order is fixed by category, registry order within category.
- Frame ring: 12 stored frames (offscreen canvases, reused) feed
  freeze-frame and stutter-loop; allocated lazily, only while either is
  enabled.
- Keys: space, `d`, `s` unchanged; `r` shuffle, `e` drawer, `0` all off,
  `9` all on; `←`/`→` seek ±5 s, shift+arrows ±30 s (video mode only).
  Number keys 1–6 are retired (46 effects outgrew them).
- Transport bar (video mode): play/pause, `m:ss / m:ss` time, scrubbable
  seek bar. Pure helpers: `formatTime(sec)` and `seekTarget(cur, dur,
  deltaSec)` (clamped). A seek resets onset history and grid confidence.
- Caps: particles ≤ 600 total across burst/confetti; heavy actives ≤ 2;
  drawer text stays one line per effect.
- No WebGL, no workers, no dependencies — still one file over `file://`.

## Canonical vocabulary

| term | meaning |
| --- | --- |
| **beat grid** | the phase-locked clock predicting beat times from BPM + onset phase |
| **confidence** | grid state: enough onsets (≥ 8) and a stable BPM to free-run |
| **grid event** | a beat or bar boundary crossed between two frames |
| **registry** | the canonical data table of all 46 effects |
| **category** | color, geometry, temporal, overlay, or scene; fixes render order |
| **kind** | pulse, continuous, or scheduled — how an effect is driven |
| **heavy** | an effect needing an extra full-frame draw; ≤ 2 active at once |
| **hand** | the 4–6 effects shuffle keeps active for the current 4-bar window |
| **conductor** | the shuffle logic that deals hands on 4-bar boundaries |
| **frame ring** | rolling buffer of recent frames feeding freeze/stutter |
| **drawer** | the collapsible HUD panel listing all effects by category |

## Scenarios

1. Demo mode, shuffle on → the dot blinks on the demo loop's beat; every
   4 bars the active hand changes; no more than 6 effects at once.
2. Video with a breakdown → onsets vanish, but pulse effects keep firing
   on the free-running grid until confidence lapses (4 s), then they wait
   for onsets again.
3. Open the drawer, uncheck all of category color → shuffle deals only
   from the remaining enabled pool; render order is unchanged.
4. Toggle one effect manually → shuffle switches off, exactly that set
   plays; `r` resumes shuffle.
5. `0` then enabling just kaleidoscope + echo-trails → a stable two-effect
   look, no hand rotation (shuffle off).
6. Heavy check: enabling droste, echo-trails, and motion-ghost manually is
   allowed (manual mode trusts the user); shuffle alone never deals > 2.
