# PRD: beat-prism-webgl — full GL port of the effect pipeline

## Problem Statement

beat-prism renders 46 beat-matched effects through a Canvas2D pipeline that
makes up to a dozen sequential full-frame passes per frame (filter stacks,
full-canvas self-draws, shadowBlur glows). On 4K60 sources with a heavy hand
dealt, that pass structure risks dropped frames — the show stutters exactly
when the music peaks. The fps diagnostics panel (PR #7) made this measurable;
the user chose to tighten the pipeline now rather than wait for test data.

## Solution

Replace the Canvas2D render path with a raw WebGL2 pipeline in the same
single-file experiment: the video frame is uploaded once per frame as a
texture, effects run as a short chain of fragment-shader passes over
ping-pong framebuffers (geometry → color-folded → temporal → overlay-folded),
and scene elements draw as an instanced sprite layer. Beat detection, the
predictive grid, the conductor, all UI, and the fps panel are untouched. The
user experience is identical — drop a video, effects fire with the beat —
but the frame budget at 4K60 has real headroom, visible in the `f` panel.

## User Stories

1. As a viewer, I want a full shuffle hand (including 2 heavy effects) on a
   4K60 video to hold ≥ 0.95 × my display refresh with no climbing drop
   total, so the show never stutters on the beat.
2. As a viewer, I want every effect to keep its name, trigger feel, and
   overall look after the port, so the show I validated still reads the same.
3. As a viewer on a browser without WebGL2, I want a clear "needs WebGL2"
   message instead of a black canvas.
4. As a viewer whose GPU resets mid-show (context loss), I want the page to
   rebuild and continue within a frame or two, accepting a one-frame visual
   hiccup in feedback effects.
5. As a user pressing `s`, I still get a PNG of the current frame.
6. As a user pressing `f`, I see the same diagnostics panel, now reflecting
   the GL pipeline's JS submission cost in `draw`.
7. As a user of every existing control (drawer, chips, shuffle, sens,
   transport, seek, demo mode), I notice no behavioral change.
8. As a developer, I can run `npm run test:experiments` in Node (no browser,
   no GL) and the pass-plan logic and file structure are fully verified.

## Implementation Decisions

- **Pass plan as pure logic.** `buildPassPlan(input)` joins the `__logic`
  block with the contract fixed in design.md: explicit input record
  (active set, pulses, bass/treble, tSec, scheduled-effect state) → ordered
  array of `{ id, program, uniforms }`. It owns render order, pulse gating
  (a pass whose pulse decayed below threshold is omitted), and folding.
- **Folding.** All "light" color effects (hue-spin, sat-pump, bleach-burn,
  gamma-flicker, color-drain, posterize, invert-strobe, flash) collapse into
  one `color` program with combined uniforms — the GL replacement for the
  `ctx.filter` string stack. Heavy color effects (duotone, thermal,
  sepia-ghost, channel-swap, neon-edge, chroma) and temporal effects keep
  individual programs. Screen-space overlays (scanlines, vhs-band,
  grain-burst, vignette-pump, letterbox-snap, starburst, shockwave, glow)
  fold into one `overlay` program.
- **Geometry as a sampling matrix.** Affine geometry pulses (zoom, shake,
  rotate-jolt, spin-zoom, squash, skew-tilt, mirror-flip) compose into a
  single mat3 the first pass samples through — computed by a pure
  `geometryMatrix(...)` helper in `__logic`. Non-affine geometry
  (kaleidoscope, tile-grid, pixelate, slice-glitch, v-slice) are variants of
  the first pass's fragment shader selected by program key.
- **Temporal state as textures.** Echo/smear/ghost/droste feedback becomes
  persistent textures; freeze/stutter's frame ring becomes a small texture
  array with the same capture-pause semantics as today.
- **Sprite layer.** Particles, confetti, bolts, and glyphs keep their JS
  simulation (positions, ages — already framerate-independent) and render
  as instanced quads; glyph characters rasterize once into a glyph-atlas
  texture via an offscreen 2D canvas (generation only, never per frame).
- **Demo scene** (radial bars + prism wireframe) renders into the source
  texture via its own GL draws (line/quad primitives) — no 2D canvas in the
  hot path anywhere.
- **GL plumbing** is hand-rolled once: program compile/cache keyed by the
  pass-plan `program` field, one VAO full-screen quad, ping-pong FBO pair
  at canvas resolution, `texImage2D` upload of the video element per frame.
- **Removal.** The Canvas2D render functions, offscreen canvas buffers, and
  `ctx.filter` paths are deleted in the final slice, not kept behind flags.
- **Unchanged.** `FX_REGISTRY`, conductor, grid, onset/BPM logic, HUD DOM,
  keyboard map, transport, fps diagnostics logic and panel, audio graph.

## Testing Decisions

- Extend `experiments/beat-prism/beat-prism.test.mjs`; same harness
  (`loadLogic` extracts the `__logic` block, runs DOM/GL-free in Node).
- `buildPassPlan`: render-order invariants, pulse gating, color/overlay
  folding (one pass each regardless of how many fold members are active),
  scheduled-state handling (frozen, mirror, tile), heavy-pass presence,
  empty active set → minimal plan (source → screen).
- `geometryMatrix`: identity when no pulses, composition order, mirror flip,
  determinism.
- Structure tests (prior art: existing `structure:` tests): `webgl2` context
  requested; no `getContext('2d')` in the app script's hot path; shader
  sources present for every program key the registry can produce; fallback
  message element exists; context-loss handlers bound.
- Shader GLSL compilation is **not** unit-tested (needs a browser); the
  structure tests plus the user's visual pass are the acceptance, matching
  how the fx-pack's visual quality was accepted.

## Out of Scope

- The Chrome extension (docs/beat-prism-extension — separate chain).
- WebGPU, OffscreenCanvas/worker rendering, HDR output.
- New effects, registry changes, or beat-detection changes.
- Mobile-specific tuning beyond context-loss recovery.
- Pixel-exact parity with the Canvas2D renderer.

## Further Notes

- The port lands on the session branch `claude/zealous-franklin-m8czyv`
  (user's explicit instruction) while PR #7 (fps diagnostics) is open from
  the same branch; if #7 merges mid-port, later commits flow into a
  follow-up PR.
- The user's 4K60 acceptance test (fetch via `scripts/fetch-test-video.sh
  --res 2160`, drag onto the page, watch the `f` panel) doubles as the
  before/after benchmark — capture the Canvas2D numbers first if a
  comparison is wanted.
- If `EXT_disjoint_timer_query_webgl2` is cheap to add later, the `f` panel
  could grow a true GPU-time line; not in this PRD.
