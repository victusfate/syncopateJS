# beat-prism — design

## Concept

Drop any video file onto the page and it becomes a music video: the audio is
analyzed in real time and visual effects fire on the beat — punch-zoom,
chromatic aberration, flash, shake, particle bursts. Entirely client-side in
one zero-dependency HTML file; the video never leaves the machine.

## Q&A (auto-resolved — prototype built in auto mode)

**Q: Can this really be done fully client-side?**
A: Yes. `URL.createObjectURL(file)` feeds a `<video>` element; a
`MediaElementAudioSourceNode` routes its audio through an `AnalyserNode` and
on to the speakers. FFT frames drive beat detection; a canvas redraws the
current video frame each rAF with effects applied. No upload, no server.

**Q: How are beats detected without lookahead?**
A: Spectral flux onset detection. Each frame, sum the positive differences
between the current and previous magnitude spectra (bass-weighted). An onset
fires when flux exceeds an adaptive threshold (mean + k·deviation over a
sliding history window) and a refractory period has passed. Tempo is
estimated from the inter-onset-interval histogram, folding intervals into
the 70–180 BPM octave.

**Q: What happens before a video is loaded?**
A: Demo mode. A synthesized Web Audio drum loop (kick/snare/hat scheduled
ahead of time) plays against procedural visuals, so the page demonstrates
itself with zero assets. Loading a video replaces the demo. The demo loop is
routed through the *same* analyser — the beat detector is not faked.

**Q: Which effects, and how do they map to the audio?**
A: Two layers. *Beat-triggered* (fire on onset, decay exponentially):
punch-zoom, flash, shake, particle burst. *Continuous* (follow band energy):
chromatic aberration follows bass, edge glow follows treble. Each effect has
a toggle; one master sensitivity slider scales the onset threshold.

**Q: What are the limits?**
A: Browser autoplay rules require a click before audio starts. Remote video
URLs are CORS-restricted, so local files are the only input. A
`MediaElementAudioSourceNode` silences the element if the source is
cross-origin — blob URLs are same-origin, so this never bites the happy
path. DRM'd videos won't decode; that is out of scope.

**Q: How is it tested?**
A: The detector and tempo math are pure functions in the
`<script id="logic">` block: spectral flux, adaptive threshold, onset state
stepping, BPM estimation, decay envelopes, band splitting. Tests feed
synthetic spectra with onsets at known frames and impulse trains at known
tempi, asserting detection and BPM within tolerance. No DOM, no audio
device needed.

**Q: Dependencies / build?**
A: None. Open `index.html` from disk. Same constraint as every other
experiment in the cabinet.

## Decisions

- Single file, inline scripts, no modules (works over `file://`).
- FFT size 2048, smoothingTimeConstant 0 (smoothing would blur flux).
- Flux uses bass-weighted bins (full spectrum summed, bins below ~250 Hz
  doubled) — kick and snare dominate perceived beat.
- Adaptive threshold: mean + 1.5·MAD over the last ~43 frames (~0.7 s),
  scaled by the sensitivity slider; 180 ms refractory between onsets.
- BPM folded into [70, 180); displayed rounded, "—" until ≥ 8 onsets.
- Effects render into one canvas; the raw `<video>` element stays hidden.
- Keys: space play/pause, `d` demo mode, `1–6` toggle effects, `s` save PNG.

## Canonical vocabulary

| term | meaning |
| --- | --- |
| **frame** | one analyser snapshot: a `Uint8Array` magnitude spectrum |
| **flux** | bass-weighted sum of positive spectral differences between consecutive frames |
| **onset** | a frame where flux crosses the adaptive threshold outside the refractory window |
| **refractory** | minimum time between onsets (180 ms) |
| **pulse** | an effect's [0,1] intensity: jumps to 1 on onset, decays exponentially |
| **band energy** | mean magnitude over a named bin range (bass, mid, treble) |
| **demo mode** | the built-in synthesized drum loop + procedural visuals, active until a video is loaded |
| **logic block** | the `<script id="logic">` element holding pure, Node-testable functions |

## Scenarios

1. First visit → title overlay explains drop-a-video; clicking it starts
   demo mode (synth loop, effects firing on its beats, BPM readout settles
   near the loop's true tempo).
2. Drop or pick a video file → demo stops, video plays in the canvas,
   effects now follow the video's own soundtrack, HUD shows detected BPM.
3. Drag sensitivity down → onsets become rare, effects calm; drag up →
   busier. Refractory still prevents machine-gun retriggers.
4. Toggle an effect off via its chip or number key → that effect stops
   contributing; others continue.
5. `s` → PNG of the current composited frame downloads.
