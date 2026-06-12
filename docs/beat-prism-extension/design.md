# beat-prism-extension — design

**Status: pre-grill draft.** Captured 2026-06-12 from session discussion so the
idea isn't lost. Not yet interviewed — run `/grill-with-docs` against this doc
before PRD. Open questions below are the grill agenda.

## Idea

A Chrome extension (Manifest V3) that applies beat-prism's beat-matched
effects to videos already playing on other sites — YouTube, TikTok,
Instagram, or any page with an embedded `<video>` element. Drop the
"drop a video" step entirely: the music video comes to you.

## Sketch

- A content script finds the page's playing **host video** and positions an
  **overlay canvas** exactly over it (tracking resize, scroll, fullscreen,
  layout shifts).
- Each rAF, the overlay draws the host video frame and runs the existing
  beat-prism render pipeline on top (registry, conductor, predictive grid —
  all of it transplants; the pure logic block is DOM-free already).
- Beat detection needs an **audio tap**. This is the hard part (below).
- A compact HUD (extension popup or small in-page chip) carries sens,
  shuffle, the fx drawer, and the fps diagnostics panel.

## Known constraints (verify during grill, decided by prototype where noted)

1. **Cross-origin audio is silent in Web Audio.** `createMediaElementSource`
   on a cross-origin `<video>` outputs zeros, and `video.captureStream()`
   throws `SecurityError`. The workable tap is `chrome.tabCapture` from an
   MV3 offscreen document, piping captured audio back to the speakers so the
   user still hears the page. Requires a user gesture (toolbar click) per
   tab — acceptable: that gesture is also the "turn it on" action.
2. **Canvas taint.** Drawing a cross-origin video into the overlay is allowed
   for display but taints the canvas: `toDataURL`/`getImageData` throw. The
   `s` save-PNG feature is disabled in extension mode; no current effect
   reads pixels back, so the 46-effect pipeline itself is unaffected.
3. **DRM (EME) content renders black** when drawn to canvas (Netflix, some
   Prime/Disney). Detect (all-black sample or `encrypted` event) and toast
   "this player is DRM-protected" rather than failing silently.
4. **SPA navigation.** YouTube/TikTok/Instagram swap videos without page
   loads. The content script must re-acquire the host video on URL change
   and on `<video>` replacement (MutationObserver).
5. **Multiple videos per page** (feeds). Policy to grill: largest playing
   video wins? explicit picker?
6. **Performance.** The overlay is a second full-res render of an already
   playing video. Likely needs a canvas resolution cap (e.g. render at
   1080p and upscale) — the fps diagnostics panel ships inside the overlay
   to measure this honestly. A WebGL backend (see below) may land first if
   the 4K60 canvas test shows drops.

## Relationship to the WebGL/PixiJS port idea

Separate idea, separate decision, gated on the 4K60 diagnostics data from
the live canvas version. If the port happens, the extension should consume
the same render backend rather than forking it. Sequencing to grill:
extension-on-canvas2d first vs. port first.

## Code reuse / packaging

- The pure logic lives in a `<script id="logic">` block inside
  `experiments/beat-prism/index.html`. The extension needs the same code as
  a content-script file. To grill: extract the block to a shared `.mjs` the
  HTML inlines at build/test time, or accept one duplicated file with a
  sync check in tests.
- Extension layout would be a new top-level folder (e.g. `extension/` or
  `experiments/beat-prism-extension/`) with `manifest.json`, content script,
  offscreen audio document, and popup — not a single-file experiment.
- Distribution: unpacked/dev-mode first; Web Store only if it proves fun.

## Canonical vocabulary (seed)

- **host video** — the page's own `<video>` element being decorated.
- **overlay canvas** — the extension's canvas positioned over the host video.
- **audio tap** — the tab-capture path feeding the analyser.
- **extension mode** — pipeline behaviors that differ from the standalone
  page (no save-PNG, capped resolution, external HUD).

## Open questions (grill agenda)

1. Audio tap: is tabCapture + offscreen document acceptable UX (per-tab
   gesture, audio rerouted), or is a "visuals-only, beats from video motion"
   fallback worth having?
2. Target-video policy on multi-video pages.
3. Overlay HUD: extension popup, in-page chip, or keyboard-only?
4. Resolution cap default and whether it auto-adapts from frameStats.
5. Logic sharing: extracted module vs. duplicated file.
6. Sequencing against the WebGL/PixiJS port.
7. Firefox/Safari ports in scope?
