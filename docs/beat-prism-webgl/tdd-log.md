# TDD log: beat-prism-webgl

## Slice 1 — pass plan core (order, gating, minimal plan)
- Status: done
- Notes: `buildPassPlan` + `passLive` in `__logic`; fold passes carry a
  `members` array (observable gating without uniform math, which lands in
  slice 2). 82 tests green.

## Slice 2 — fold uniforms + geometry matrix
- Status: done
- Notes: `colorFoldUniforms` (parity transfer curves + GL-native
  `levels` posterize hook), `overlayFoldUniforms`, `geometryMatrix`
  (column-major mat3, 2D ctx-transform op order, parity amplitudes),
  `mat3mul`. Plan input grew `hueBase`, `joltDir`, `shake`, and
  `scheduled.lbPos` — design.md contract updated alongside. 93 green.

## Slice 3 — GL skeleton renders the show
- Status: done
- Notes: main canvas is WebGL2 (one shared quad VS with uMatrix; SHADERS
  registry keyed by program; glRender executes the plan subset that has
  programs, so families come alive per slice). Source upload is the 2D
  `src` canvas — video never enters GL at 4K, passes run at canvas res.
  #nogl fallback, context-lost/restored rebuild, ping-pong realloc on
  resize (old targets deleted). Scene sims extracted to `ageScene`; pulse
  decay moved into the frame loop. 2D draw functions are dead code until
  slice 9; `s` save-PNG temporarily unreliable (GL buffer not preserved)
  — fixed in slice 9. Added an app-script parse test. 97 green.

## Slice 4 — non-affine geometry programs
- Status: done
- Notes: base pass forks by program (kaleido/tile/slice/vslice, 2D
  priority chain); pixelate is a `uBlock` UV-quantizer in FS_COMMON and
  rides any variant. Kaleidoscope upgraded to true aspect-corrected polar
  mirroring (per the color/perceptual emphasis). `sliceSeed` joined the
  plan input. glRender now feeds frame-global uRes/uT. 101 green.

## Slice 5 — color passes
- Status: done
- Notes: folded `color` transfer (brightness/saturation/hueRotate/gray/
  contrast/true-posterize/invert/flash in one shader — the ctx.filter
  stack replacement) + heavy programs. GL-native upgrades landed here per
  the emphasis: real RGB-split chroma, true channel rotation, palette
  thermal, edge-difference neon. `SOLO_UNIFORMS` synthesizers; chroma
  pass omitted when bass-driven split is sub-pixel. 104 green.

## Slice 6 — temporal passes
- Status: done
- Notes: feedback textures captured per-pass via copyTexSubImage2D (ghost
  on its 120 ms cadence); frame ring is now GL textures with the same
  capture-pause-while-frozen semantics; frozen state collapses the whole
  plan to one `freeze` pass reading the held ring frame (app only raises
  `frozen` once the ring has content). Stutter gating needs pulse > 0.2
  AND ring depth; strobe-black keeps its even-frame parity via `frameNo`
  in the plan input. dropGlTemporal cleans ring+feedback on resize and
  forgets (without deleting) on context restore. 108 green.

## Slice 7 — overlay pass
- Status: done
- Notes: all eight screen-space overlays in one shader; zero-valued
  uniforms are no-ops so the fold costs one draw regardless of how many
  are live. Noise tile (the existing generated canvas) uploads once as a
  REPEAT texture on unit 2. lbPos easing stayed in the frame loop;
  starburst/shockwave became analytic ray/ring functions. 110 green.

## Slice 8 — sprite layer + GL demo scene
- Status: done
- Notes: `packSprites`/`hslToRgb` pure (stride-10 instances; additive
  group = the 2D 'lighter' set, premultiplied normal group = confetti);
  one atlas canvas rasterized once (circle/rect/bar/8 glyphs); instanced
  TRIANGLE_STRIP draws. Video now uploads straight to GL — letterboxing
  moved into srcTexAt(uFit) — and the demo scene is all-GL (gradient
  pass, glow-sprite spectrum bars, prism wireframe via gl.LINES into the
  srcT target). drawSource/drawDemoScene joined the dead 2D code for
  slice 9 deletion. 116 green.

## Slice 9 — 2D pipeline removal + save-png
- Status: done
- Notes: 548 lines of dead Canvas2D pipeline deleted (render/drawBase/
  draw* fns, offscreen buffers, scanline tile); only noise + atlas
  generation still touch a 2D canvas. `s` redraws the last pass plan
  before toDataURL (GL back buffer unpreserved). 118 green, 323 repo.

## Code-quality review (auto-fix)
- glOk unused binding dropped; passLive if-chain → LIVE_OVERRIDES map
  (mirrors SOLO_UNIFORMS); FX_INDEX map replaces per-call registry find.
- File is 2,127 lines — over the 1,000 guidance but the single-file
  experiment constraint is a recorded design decision; accepted.
- 323 green after fixes.
