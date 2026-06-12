# Plan: beat-prism-webgl — vertical slices

Each slice: logic → app wiring → tests green (`node --test
experiments/beat-prism/beat-prism.test.mjs`), committed red → green
(→ refactor). Node can verify pure logic and file structure only; shader
output is accepted visually at the end (per design.md parity bar).

## Slice 1 — pass plan core
`buildPassPlan` in `__logic`: fixed render order (geometry → color →
temporal → overlay), pulse gating below threshold, empty active set →
minimal `[source→screen]` plan. Tests: ordering invariants, gating,
empty/minimal plan, determinism.

## Slice 2 — folding + geometry matrix
Color fold (8 light color effects → one `color` program with combined
uniforms), overlay fold (8 overlays → one `overlay` program),
`geometryMatrix` composing affine pulses (zoom/shake/jolt/spin/squash/
skew/mirror) into one mat3. Tests: single fold pass regardless of member
count, uniform values hand-computed, matrix identity/composition/mirror.

## Slice 3 — GL skeleton renders the show
WebGL2 context on the main canvas, full-screen-quad VAO, program
compile/cache, ping-pong FBOs, per-frame source texture upload (video or
demo scene), passthrough render driven by `buildPassPlan`, "needs WebGL2"
fallback message, context-loss rebuild handlers. The page now renders via
GL (effects beyond geometry matrix temporarily inert). Tests: structure —
`webgl2` requested, fallback element, lost/restored handlers, plan
consumed in the frame loop.

## Slice 4 — non-affine geometry programs
Kaleidoscope (true polar), tile-grid, pixelate, slice-glitch, v-slice as
fragment variants of the base pass; `sliceOffsets` reused as uniforms.
Tests: pass plan selects the right program key per active geometry
replacement; structure — shader source per program key.

## Slice 5 — color passes
Folded `color` program live; heavy color programs: duotone, thermal,
sepia-ghost, channel-swap, neon-edge, chroma. Per design emphasis, this
slice (with kaleidoscope/droste/time-smear in 4 and 6) carries the
upgrade budget — richest shader work lands here; shake-style geometry
stays subtle parity. Tests: plan emits heavy passes individually, folded
uniforms flow; structure — GLSL present for each color program key.

## Slice 6 — temporal passes
Feedback textures (echo-trails, time-smear, motion-ghost, droste), frame
ring as texture array (freeze-frame, stutter-loop with capture-pause),
strobe-black, interlace-roll. Tests: plan's frozen/stutterBack handling,
ring index math reuse; structure — feedback texture allocation and ring
semantics present.

## Slice 7 — overlay pass
Folded `overlay` program live: glow, scanlines, vhs-band, grain-burst,
vignette-pump, letterbox-snap, starburst, shockwave (noise from a static
GL noise texture). Tests: folded uniform synthesis incl. lbPos easing
input; structure — overlay GLSL.

## Slice 8 — sprite layer + GL demo scene
Instanced quads for burst/confetti/bolts/glyphs (JS simulation unchanged,
glyph atlas texture generated once via offscreen 2D), demo scene (radial
bars + prism wireframe) drawn with GL primitives into the source texture.
Tests: structure — instanced draw path, atlas generation once, no 2D
canvas in the per-frame path.

## Slice 9 — removal + final sweep
Delete dead Canvas2D pipeline (render(), drawBase, offscreen buffers,
filter stacks), save-PNG via on-demand GL render, hint/help text
untouched check, full suite green. Tests: structure — no
`getContext('2d')` outside atlas/noise generation, no `ctx.filter`, file
size sanity; all prior tests still green.
