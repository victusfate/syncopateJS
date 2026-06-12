import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLogic } from '../_harness/logic.mjs';

const HTML = new URL('./index.html', import.meta.url).pathname;

// ---------- slice 1 — flux and band energy ----------

test('spectralFlux: sums only positive per-bin differences', () => {
  const { spectralFlux } = loadLogic(HTML);
  // bin0 +5, bin1 -3 (ignored), bin2 +2 — no bass weighting (bassBins 0)
  assert.equal(spectralFlux([10, 10, 10], [15, 7, 12], 0), 7);
});

test('spectralFlux: bins below bassBins count twice', () => {
  const { spectralFlux } = loadLogic(HTML);
  // bin0 +5 doubled, bin1 +5 doubled, bin2 +5 single → 25
  assert.equal(spectralFlux([0, 0, 0], [5, 5, 5], 2), 25);
});

test('spectralFlux: non-increasing spectrum yields zero', () => {
  const { spectralFlux } = loadLogic(HTML);
  assert.equal(spectralFlux([9, 9, 9, 9], [9, 8, 0, 9], 2), 0);
});

test('spectralFlux: identical spectra yield zero', () => {
  const { spectralFlux } = loadLogic(HTML);
  const s = [3, 1, 4, 1, 5, 9, 2, 6];
  assert.equal(spectralFlux(s, s, 3), 0);
});

test('bandEnergy: mean magnitude over [lo, hi)', () => {
  const { bandEnergy } = loadLogic(HTML);
  assert.equal(bandEnergy([10, 20, 30, 40], 1, 3), 25); // (20+30)/2
  assert.equal(bandEnergy([10, 20, 30, 40], 0, 4), 25);
});

test('bandEnergy: hi is exclusive and clamped; empty range is 0', () => {
  const { bandEnergy } = loadLogic(HTML);
  assert.equal(bandEnergy([10, 20, 30], 2, 99), 30); // clamps hi to length
  assert.equal(bandEnergy([10, 20, 30], 2, 2), 0);   // empty range
});

// ---------- slice 2 — adaptive threshold and onset state machine ----------

test('adaptiveThreshold: constant history → mean (MAD is 0)', () => {
  const { adaptiveThreshold } = loadLogic(HTML);
  assert.equal(adaptiveThreshold([7, 7, 7, 7, 7], 1.5), 7);
});

test('adaptiveThreshold: mean + k·median-absolute-deviation, hand-computed', () => {
  const { adaptiveThreshold } = loadLogic(HTML);
  // history [1,2,3,4,100]: mean 22, median 3, |x−3| = [2,1,0,1,97], MAD 1
  assert.equal(adaptiveThreshold([1, 2, 3, 4, 100], 2), 24);
});

test('adaptiveThreshold: empty history → Infinity (never fire blind)', () => {
  const { adaptiveThreshold } = loadLogic(HTML);
  assert.equal(adaptiveThreshold([], 1.5), Infinity);
});

// Drive the state machine like the app does: one flux value per frame.
function run(stepOnset, fluxes, dtMs, opts) {
  let state = { history: [], lastOnsetMs: -Infinity };
  const firedAt = [];
  fluxes.forEach((flux, i) => {
    const r = stepOnset(state, flux, i * dtMs, opts);
    if (r.fired) firedAt.push(i);
    state = r.state;
  });
  return firedAt;
}

test('stepOnset: constant-flux baseline never fires', () => {
  const { stepOnset } = loadLogic(HTML);
  const firedAt = run(stepOnset, Array(100).fill(40), 23, {});
  assert.deepEqual(firedAt, []);
});

test('stepOnset: spikes at known frames fire there and nowhere else', () => {
  const { stepOnset } = loadLogic(HTML);
  const fluxes = Array(120).fill(10);
  // spikes 30 frames apart at 23 ms/frame = 690 ms ≫ 180 ms refractory
  for (const f of [30, 60, 90]) fluxes[f] = 200;
  const firedAt = run(stepOnset, fluxes, 23, {});
  assert.deepEqual(firedAt, [30, 60, 90]);
});

test('stepOnset: refractory suppresses a second spike within 180 ms', () => {
  const { stepOnset } = loadLogic(HTML);
  const fluxes = Array(80).fill(10);
  fluxes[40] = 200;
  fluxes[44] = 200; // 4 frames × 23 ms = 92 ms later → inside refractory
  fluxes[60] = 200; // 460 ms after frame 40 → fires
  const firedAt = run(stepOnset, fluxes, 23, {});
  assert.deepEqual(firedAt, [40, 60]);
});

test('stepOnset: the spike does not lift its own threshold', () => {
  const { stepOnset } = loadLogic(HTML);
  // Two adjacent identical spikes far apart in time: both must fire —
  // proving the threshold is computed from history *before* the spike.
  const fluxes = Array(60).fill(10);
  fluxes[30] = 200;
  fluxes[45] = 200; // 345 ms later
  assert.deepEqual(run(stepOnset, fluxes, 23, {}), [30, 45]);
});

test('stepOnset: returns new state without mutating the input', () => {
  const { stepOnset } = loadLogic(HTML);
  const state = { history: [5, 5, 5], lastOnsetMs: 0 };
  const snapshot = JSON.parse(JSON.stringify(state));
  stepOnset(state, 99, 1000, {});
  assert.deepEqual(state, snapshot);
});

// ---------- slice 3 — tempo estimation ----------

const train = (bpm, n, jitter = 0) => Array.from(
  { length: n },
  (_, i) => i * (60000 / bpm) + (jitter ? Math.sin(i * 7.3) * jitter : 0),
);

test('estimateBpm: null until at least 8 onsets', () => {
  const { estimateBpm } = loadLogic(HTML);
  assert.equal(estimateBpm([]), null);
  assert.equal(estimateBpm(train(120, 7)), null);
  assert.notEqual(estimateBpm(train(120, 8)), null);
});

test('estimateBpm: 120 BPM impulse train → 120 ± 2', () => {
  const { estimateBpm } = loadLogic(HTML);
  const bpm = estimateBpm(train(120, 12));
  assert.ok(Math.abs(bpm - 120) <= 2, `expected ~120, got ${bpm}`);
});

test('estimateBpm: 60 BPM train folds up an octave to 120 ± 2', () => {
  const { estimateBpm } = loadLogic(HTML);
  const bpm = estimateBpm(train(60, 10));
  assert.ok(Math.abs(bpm - 120) <= 2, `expected ~120, got ${bpm}`);
});

test('estimateBpm: 200 BPM train folds down an octave to 100 ± 2', () => {
  const { estimateBpm } = loadLogic(HTML);
  const bpm = estimateBpm(train(200, 16));
  assert.ok(Math.abs(bpm - 100) <= 2, `expected ~100, got ${bpm}`);
});

test('estimateBpm: tolerates ±15 ms jitter on a 128 BPM train', () => {
  const { estimateBpm } = loadLogic(HTML);
  const bpm = estimateBpm(train(128, 24, 15));
  assert.ok(Math.abs(bpm - 128) <= 2, `expected ~128, got ${bpm}`);
});

// ---------- slice 4 — pulse decay ----------

test('decayPulse: halves after one half-life, quarters after two', () => {
  const { decayPulse } = loadLogic(HTML);
  assert.ok(Math.abs(decayPulse(1, 150, 150) - 0.5) < 1e-12);
  assert.ok(Math.abs(decayPulse(1, 300, 150) - 0.25) < 1e-12);
});

test('decayPulse: identity at dt 0 and linear in value', () => {
  const { decayPulse } = loadLogic(HTML);
  assert.equal(decayPulse(0.8, 0, 150), 0.8);
  assert.ok(Math.abs(decayPulse(0.6, 150, 150) - 0.3) < 1e-12);
  assert.equal(decayPulse(0, 999, 150), 0);
});

test('stepOnset: opts override k, window and refractoryMs', () => {
  const { stepOnset } = loadLogic(HTML);
  const fluxes = Array(40).fill(10);
  fluxes[20] = 200;
  fluxes[22] = 200; // 46 ms apart — fires with a 40 ms refractory
  const firedAt = run(stepOnset, fluxes, 23, { refractoryMs: 40 });
  assert.deepEqual(firedAt, [20, 22]);
});

// ---------- slice 5 — structural acceptance ----------

test('structure: logic block exports the full documented surface', () => {
  const logic = loadLogic(HTML);
  const surface = ['spectralFlux', 'adaptiveThreshold', 'stepOnset',
                   'estimateBpm', 'decayPulse', 'bandEnergy'];
  for (const fn of surface) {
    assert.equal(typeof logic[fn], 'function', `${fn} must be a function`);
  }
});

test('structure: no external fetches of any kind', () => {
  const html = readFileSync(HTML, 'utf8');
  assert.ok(!/(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html),
    'no src/href may point at a remote URL');
  assert.ok(!/url\(\s*["']?\s*(?:https?:)?\/\//i.test(html),
    'no CSS url() may point at a remote URL');
  assert.ok(!/@import|fetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(html),
    'no imports or network APIs');
});

test('structure: analyser configured per design (fftSize 2048, no smoothing)', () => {
  const html = readFileSync(HTML, 'utf8');
  assert.match(html, /fftSize\s*=\s*2048/);
  assert.match(html, /smoothingTimeConstant\s*=\s*0\b/);
});

test('structure: HUD has BPM readout, sensitivity slider, six chips, file input', () => {
  const html = readFileSync(HTML, 'utf8');
  assert.match(html, /id="bpm"/, 'BPM readout');
  assert.match(html, /id="sens"[^>]*type="range"/, 'sensitivity slider');
  assert.equal((html.match(/class="chip"/g) ?? []).length, 6, 'six effect chips');
  assert.match(html, /type="file"[^>]*accept="video\/\*"/, 'video file input');
});

// ════════════════════ fx-pack ════════════════════
// docs/beat-prism-fx-pack — registry, beat grid, conductor, parameter math.

// ---------- fx slice 1 — registry + parameter math ----------

const NEW_IDS = {
  color: ['hue-spin', 'posterize', 'invert-strobe', 'duotone', 'sat-pump',
          'bleach-burn', 'thermal', 'channel-swap', 'neon-edge',
          'gamma-flicker', 'color-drain', 'sepia-ghost'],
  geometry: ['rotate-jolt', 'kaleidoscope', 'mirror-flip', 'tile-grid',
             'pixelate', 'slice-glitch', 'v-slice', 'squash', 'skew-tilt',
             'spin-zoom'],
  temporal: ['echo-trails', 'motion-ghost', 'strobe-black', 'freeze-frame',
             'stutter-loop', 'time-smear', 'droste', 'interlace-roll'],
  overlay: ['scanlines', 'vhs-band', 'grain-burst', 'vignette-pump',
            'letterbox-snap', 'starburst', 'shockwave'],
  scene: ['lightning', 'confetti', 'glyph-pop'],
};
const ORIGINAL_CAT = {
  zoom: 'geometry', flash: 'color', shake: 'geometry',
  burst: 'scene', chroma: 'color', glow: 'overlay',
};

test('registry: 46 entries with unique ids', () => {
  const { FX_REGISTRY } = loadLogic(HTML);
  assert.equal(FX_REGISTRY.length, 46);
  assert.equal(new Set(FX_REGISTRY.map(e => e.id)).size, 46);
});

test('registry: canonical ids — all 40 new effects and the original six', () => {
  const { FX_REGISTRY } = loadLogic(HTML);
  const ids = new Set(FX_REGISTRY.map(e => e.id));
  for (const cat of Object.keys(NEW_IDS)) {
    for (const id of NEW_IDS[cat]) assert.ok(ids.has(id), `missing ${id}`);
  }
  for (const id of Object.keys(ORIGINAL_CAT)) assert.ok(ids.has(id), `missing ${id}`);
});

test('registry: exact category counts (new 12/10/8/7/3, originals mapped)', () => {
  const { FX_REGISTRY } = loadLogic(HTML);
  const byId = new Map(FX_REGISTRY.map(e => [e.id, e]));
  for (const [cat, ids] of Object.entries(NEW_IDS)) {
    for (const id of ids) assert.equal(byId.get(id)?.cat, cat, `${id} → ${cat}`);
  }
  for (const [id, cat] of Object.entries(ORIGINAL_CAT)) {
    assert.equal(byId.get(id)?.cat, cat, `${id} → ${cat}`);
  }
  const count = cat => FX_REGISTRY.filter(e => e.cat === cat).length;
  assert.equal(count('color'), 14);
  assert.equal(count('geometry'), 12);
  assert.equal(count('temporal'), 8);
  assert.equal(count('overlay'), 8);
  assert.equal(count('scene'), 4);
});

test('registry: every entry has a name, a valid kind, and a boolean heavy flag', () => {
  const { FX_REGISTRY } = loadLogic(HTML);
  for (const e of FX_REGISTRY) {
    assert.equal(typeof e.name, 'string', `${e.id} name`);
    assert.ok(e.name.length > 0, `${e.id} name non-empty`);
    assert.ok(['pulse', 'continuous', 'scheduled'].includes(e.kind), `${e.id} kind ${e.kind}`);
    assert.equal(typeof e.heavy, 'boolean', `${e.id} heavy`);
  }
});

test('mulberry32: deterministic per seed, in [0,1), seeds diverge', () => {
  const { mulberry32 } = loadLogic(HTML);
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const seqA = Array.from({ length: 8 }, () => a());
  const seqB = Array.from({ length: 8 }, () => b());
  const seqC = Array.from({ length: 8 }, () => c());
  assert.deepEqual(seqA, seqB, 'same seed, same sequence');
  assert.notDeepEqual(seqA, seqC, 'different seed, different sequence');
  for (const v of seqA) assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
});

test('latencyMs: FFT window center plus one rAF', () => {
  const { latencyMs } = loadLogic(HTML);
  // 1024/44100 s ≈ 23.22 ms, + 16 ms ≈ 39.22 ms
  assert.ok(Math.abs(latencyMs(2048, 44100) - 39.22) < 0.1, `${latencyMs(2048, 44100)}`);
  assert.ok(Math.abs(latencyMs(2048, 48000) - 37.33) < 0.1, `${latencyMs(2048, 48000)}`);
});

test('sliceOffsets: deterministic, right length, bounded, not flat', () => {
  const { sliceOffsets } = loadLogic(HTML);
  const a = sliceOffsets(7, 12, 40);
  assert.deepEqual(a, sliceOffsets(7, 12, 40), 'deterministic per seed');
  assert.notDeepEqual(a, sliceOffsets(8, 12, 40), 'seed changes offsets');
  assert.equal(a.length, 12);
  for (const v of a) assert.ok(Math.abs(v) <= 40, `|${v}| ≤ 40`);
  assert.ok(new Set(a).size > 1, 'offsets vary');
});

test('wedgeAngles: n evenly spaced wedge starts from 0', () => {
  const { wedgeAngles } = loadLogic(HTML);
  const w = wedgeAngles(6);
  assert.equal(w.length, 6);
  assert.equal(w[0], 0);
  const step = Math.PI * 2 / 6;
  for (let i = 1; i < 6; i++) {
    assert.ok(Math.abs(w[i] - i * step) < 1e-12, `wedge ${i}`);
  }
});

test('posterizeCurve: quantizes into levels, clamps input', () => {
  const { posterizeCurve } = loadLogic(HTML);
  assert.equal(posterizeCurve(0, 4), 0);
  assert.equal(posterizeCurve(1, 4), 1);
  assert.equal(posterizeCurve(0.4, 2), 0);
  assert.equal(posterizeCurve(0.6, 2), 1);
  assert.ok(Math.abs(posterizeCurve(0.5, 3) - 0.5) < 1e-12, 'mid level of 3');
  assert.equal(posterizeCurve(1.5, 4), 1, 'clamps high');
  assert.equal(posterizeCurve(-0.5, 4), 0, 'clamps low');
});

// ---------- fx slice 2 — beat grid phase lock ----------

// Feed a train of onsets through the grid, one stepGrid call per onset.
const feedGrid = (stepGrid, times, bpm, opts) => {
  let g = null;
  for (const t of times) g = stepGrid(g, t, bpm, t, opts);
  return g;
};
const beatTrain = (bpm, n, jitter = 0) => Array.from(
  { length: n },
  (_, i) => i * (60000 / bpm) + (jitter ? Math.sin(i * 7.3) * jitter : 0),
);

test('stepGrid: first onset seeds the anchor; bpm sets the period', () => {
  const { stepGrid } = loadLogic(HTML);
  const g = stepGrid(null, 1000, 120, 1000);
  assert.equal(g.anchorMs, 1000);
  assert.equal(g.periodMs, 500);
  assert.equal(g.onsetCount, 1);
  assert.equal(g.confident, false, 'one onset is not confidence');
});

test('stepGrid: 120 BPM train with ±10 ms jitter → confident, phase on the true grid', () => {
  const { stepGrid } = loadLogic(HTML);
  const g = feedGrid(stepGrid, beatTrain(120, 8, 10), 120);
  assert.equal(g.confident, true, '8 onsets + bpm → confident');
  // anchor must sit on the true beat closest to the last onset (3500 ms)
  assert.ok(Math.abs(g.anchorMs - 3500) <= 25, `anchor ${g.anchorMs} near 3500`);
});

test('stepGrid: onset 40 ms late inside the ±90 ms window re-locks by lerp 0.35', () => {
  const { stepGrid } = loadLogic(HTML);
  let g = feedGrid(stepGrid, beatTrain(120, 8), 120);   // clean → anchor exactly 3500
  assert.equal(g.anchorMs, 3500);
  g = stepGrid(g, 4040, 120, 4040);                     // predicted 4000, off +40
  assert.ok(Math.abs(g.anchorMs - 4014) < 1e-9, `anchor ${g.anchorMs} = 4000 + 0.35·40`);
});

test('stepGrid: off-grid onsets are ignored by a confident clock', () => {
  const { stepGrid } = loadLogic(HTML);
  let g = feedGrid(stepGrid, beatTrain(120, 8), 120);
  const count = g.onsetCount;
  g = stepGrid(g, 4250, 120, 4250);   // 250 ms from both neighbors — outside ±90
  assert.equal(g.anchorMs, 3500, 'anchor untouched');
  assert.equal(g.onsetCount, count + 1, 'onset still counted');
  assert.equal(g.confident, true);
});

test('stepGrid: free-runs through a 3 s quiet gap without losing the clock', () => {
  const { stepGrid } = loadLogic(HTML);
  let g = feedGrid(stepGrid, beatTrain(120, 8), 120);
  g = stepGrid(g, null, 120, 6400);   // frame tick 2.9 s after the last onset
  assert.equal(g.confident, true, 'still confident inside 4 s');
  assert.equal(g.anchorMs, 3500, 'clock untouched while free-running');
  assert.equal(g.periodMs, 500);
});

test('stepGrid: confidence lapses after 4 s without onsets and needs 8 fresh onsets', () => {
  const { stepGrid } = loadLogic(HTML);
  let g = feedGrid(stepGrid, beatTrain(120, 8), 120);
  g = stepGrid(g, null, 120, 7600);   // 4.1 s after the last onset
  assert.equal(g.confident, false, 'confidence lapsed');
  g = stepGrid(g, 8000, 120, 8000);   // one onset is not enough to re-confirm
  assert.equal(g.confident, false, 'needs 8 fresh onsets');
  assert.equal(g.onsetCount, 1);
});

test('stepGrid: opts.latencyMs shifts onset timestamps back before phase math', () => {
  const { stepGrid, latencyMs } = loadLogic(HTML);
  const L = latencyMs(2048, 44100);
  const raw = feedGrid(stepGrid, beatTrain(120, 8), 120);
  const comp = feedGrid(stepGrid, beatTrain(120, 8), 120, { latencyMs: L });
  assert.ok(Math.abs((raw.anchorMs - comp.anchorMs) - L) < 1e-9,
    `anchor shifted back by exactly ${L} ms`);
});

test('stepGrid: returns new state without mutating the input', () => {
  const { stepGrid } = loadLogic(HTML);
  const g = feedGrid(stepGrid, beatTrain(120, 8), 120);
  const snapshot = JSON.parse(JSON.stringify(g));
  stepGrid(g, 4040, 120, 4040);
  stepGrid(g, null, 120, 9999);
  assert.deepEqual(JSON.parse(JSON.stringify(g)), snapshot);
});

// ---------- fx slice 3 — grid events ----------

// 8 clean onsets at 120 BPM → anchor 3500, period 500, anchor beat #7.
const lockedGrid = stepGrid => feedGrid(stepGrid, beatTrain(120, 8), 120);

test('gridEvents: beats crossed between two timestamps, in order', () => {
  const { stepGrid, gridEvents } = loadLogic(HTML);
  const ev = gridEvents(lockedGrid(stepGrid), 3600, 5100);
  assert.deepEqual(ev.map(e => e.timeMs), [4000, 4500, 5000]);
  assert.deepEqual(ev.map(e => e.beatIndex), [8, 9, 10]);
});

test('gridEvents: half-open windows never double-fire a beat', () => {
  const { stepGrid, gridEvents } = loadLogic(HTML);
  const g = lockedGrid(stepGrid);
  // boundary lands exactly on the 4000 ms beat: it belongs to the first window
  const a = gridEvents(g, 3600, 4000);
  const b = gridEvents(g, 4000, 5100);
  assert.deepEqual(a.map(e => e.timeMs), [4000]);
  assert.deepEqual(b.map(e => e.timeMs), [4500, 5000]);
});

test('gridEvents: every 4th beat is a bar with the right barIndex', () => {
  const { stepGrid, gridEvents } = loadLogic(HTML);
  const ev = gridEvents(lockedGrid(stepGrid), 3500, 7500);   // beats 8..15
  assert.equal(ev.length, 8);
  const bars = ev.filter(e => e.isBar);
  assert.deepEqual(bars.map(e => e.beatIndex), [8, 12]);
  assert.deepEqual(bars.map(e => e.barIndex), [2, 3]);
  for (const e of ev) assert.equal(e.barIndex, Math.floor(e.beatIndex / 4));
});

test('gridEvents: silent unless the grid is confident', () => {
  const { stepGrid, gridEvents } = loadLogic(HTML);
  let g = lockedGrid(stepGrid);
  g = stepGrid(g, null, 120, 7600);   // lapse
  assert.deepEqual(gridEvents(g, 3600, 5100), []);
  assert.deepEqual(gridEvents(stepGrid(null, 0, 120, 0), 0, 5000), [], 'one onset, no confidence');
});

test('gridEvents: degenerate or reversed windows yield nothing', () => {
  const { stepGrid, gridEvents } = loadLogic(HTML);
  const g = lockedGrid(stepGrid);
  assert.deepEqual(gridEvents(g, 5000, 5000), []);
  assert.deepEqual(gridEvents(g, 5100, 3600), []);
});

// ---------- fx slice 4 — shuffle conductor ----------

test('dealHand: deterministic per seed', () => {
  const { dealHand, FX_REGISTRY } = loadLogic(HTML);
  const all = FX_REGISTRY.map(e => e.id);
  assert.deepEqual(dealHand(FX_REGISTRY, 5, all), dealHand(FX_REGISTRY, 5, all));
});

test('dealHand: deals 4–6 effects from a full pool', () => {
  const { dealHand, FX_REGISTRY } = loadLogic(HTML);
  const all = FX_REGISTRY.map(e => e.id);
  for (let seed = 0; seed < 12; seed++) {
    const hand = dealHand(FX_REGISTRY, seed, all);
    assert.ok(hand.length >= 4 && hand.length <= 6, `seed ${seed}: ${hand.length}`);
    assert.equal(new Set(hand).size, hand.length, 'no duplicates');
  }
});

test('dealHand: at most 2 per category and at most 2 heavy', () => {
  const { dealHand, FX_REGISTRY } = loadLogic(HTML);
  const all = FX_REGISTRY.map(e => e.id);
  const byId = new Map(FX_REGISTRY.map(e => [e.id, e]));
  for (let seed = 0; seed < 40; seed++) {
    const hand = dealHand(FX_REGISTRY, seed, all).map(id => byId.get(id));
    const perCat = {};
    let heavies = 0;
    for (const e of hand) {
      perCat[e.cat] = (perCat[e.cat] ?? 0) + 1;
      if (e.heavy) heavies++;
    }
    for (const [cat, n] of Object.entries(perCat)) {
      assert.ok(n <= 2, `seed ${seed}: ${n} from ${cat}`);
    }
    assert.ok(heavies <= 2, `seed ${seed}: ${heavies} heavy`);
  }
});

test('dealHand: draws only from the enabled pool', () => {
  const { dealHand, FX_REGISTRY } = loadLogic(HTML);
  const enabled = ['hue-spin', 'kaleidoscope', 'echo-trails', 'scanlines',
                   'lightning', 'zoom', 'posterize', 'shockwave'];
  for (let seed = 0; seed < 12; seed++) {
    for (const id of dealHand(FX_REGISTRY, seed, enabled)) {
      assert.ok(enabled.includes(id), `seed ${seed} dealt disabled ${id}`);
    }
  }
});

test('dealHand: different seeds eventually deal different hands', () => {
  const { dealHand, FX_REGISTRY } = loadLogic(HTML);
  const all = FX_REGISTRY.map(e => e.id);
  const first = JSON.stringify(dealHand(FX_REGISTRY, 0, all));
  assert.ok(
    Array.from({ length: 20 }, (_, s) => s + 1)
      .some(s => JSON.stringify(dealHand(FX_REGISTRY, s, all)) !== first),
    'twenty consecutive seeds never changed the hand');
});

test('dealHand: a pool smaller than 4 deals the whole pool', () => {
  const { dealHand, FX_REGISTRY } = loadLogic(HTML);
  const enabled = ['hue-spin', 'shockwave'];
  const hand = dealHand(FX_REGISTRY, 3, enabled);
  assert.deepEqual([...hand].sort(), [...enabled].sort());
});

test('ringIndex: wraps backward through a 12-slot ring', () => {
  const { ringIndex } = loadLogic(HTML);
  assert.equal(ringIndex(5, 0, 12), 5);
  assert.equal(ringIndex(0, 1, 12), 11);
  assert.equal(ringIndex(3, 15, 12), 0);   // wraps a full lap and a bit
  assert.equal(ringIndex(7, 3, 12), 4);
});

// ---------- fx slice 5 — app integration (structural) ----------

const appScript = () => {
  const html = readFileSync(HTML, 'utf8');
  // the app script is the <script> block without the id="logic" attribute
  const blocks = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .filter(m => !(m[1] ?? '').includes('id="logic"'));
  assert.equal(blocks.length, 1, 'exactly one app script block');
  return blocks[0][2];
};

test('structure: logic block exports the fx-pack surface', () => {
  const logic = loadLogic(HTML);
  for (const fn of ['stepGrid', 'gridEvents', 'dealHand', 'mulberry32',
                    'latencyMs', 'sliceOffsets', 'wedgeAngles',
                    'posterizeCurve', 'ringIndex']) {
    assert.equal(typeof logic[fn], 'function', `${fn} must be a function`);
  }
  assert.ok(Array.isArray(logic.FX_REGISTRY), 'FX_REGISTRY is data');
});

test('structure: both script blocks parse in Node', () => {
  const html = readFileSync(HTML, 'utf8');
  const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 2, 'logic block + app block');
  for (const [, src] of blocks) assert.doesNotThrow(() => new Function(src));
});

test('structure: HUD gains drawer, shuffle toggle and beat-locked dot', () => {
  const html = readFileSync(HTML, 'utf8');
  assert.match(html, /id="drawer"/, 'effects drawer');
  assert.match(html, /id="shuffle"[^>]*type="checkbox"/, 'shuffle toggle');
  assert.match(html, /id="beatdot"/, 'beat dot next to the BPM readout');
  assert.match(html, /id="drawerbtn"/, 'drawer button');
});

test('structure: keys r/e/0/9 bound; the 1-6 effect keys are retired', () => {
  const app = appScript();
  for (const k of ['r', 'e', '0', '9']) {
    assert.ok(app.includes(`e.key === '${k}'`), `key ${k} bound`);
  }
  assert.ok(!app.includes("e.key >= '1'"), 'numeric effect keys retired');
});

test('structure: app drives the registry pipeline through the grid', () => {
  const app = appScript();
  for (const call of ['FX_REGISTRY', 'stepGrid(', 'gridEvents(',
                      'dealHand(', 'latencyMs(']) {
    assert.ok(app.includes(call), `app uses ${call}`);
  }
  assert.match(app, /checkbox/, 'drawer rows carry checkboxes');
});

test('structure: performance caps — 600 particles, 12-frame ring', () => {
  const app = appScript();
  assert.match(app, /PARTICLE_CAP\s*=\s*600/);
  assert.match(app, /RING_SIZE\s*=\s*12/);
});

// ---------- fx slice 6 — transport controls (design addendum) ----------

test('formatTime: m:ss with zero-padded seconds; degenerate input → 0:00', () => {
  const { formatTime } = loadLogic(HTML);
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(5.4), '0:05');
  assert.equal(formatTime(59.9), '0:59');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(600), '10:00');
  assert.equal(formatTime(NaN), '0:00');
  assert.equal(formatTime(Infinity), '0:00');
  assert.equal(formatTime(-3), '0:00');
});

test('seekTarget: clamps the jump into [0, duration]', () => {
  const { seekTarget } = loadLogic(HTML);
  assert.equal(seekTarget(10, 100, 5), 15);
  assert.equal(seekTarget(10, 100, -5), 5);
  assert.equal(seekTarget(2, 100, -30), 0);
  assert.equal(seekTarget(98, 100, 30), 100);
});

test('seekTarget: degenerate duration holds the current position', () => {
  const { seekTarget } = loadLogic(HTML);
  assert.equal(seekTarget(12, NaN, 5), 12);     // metadata not loaded yet
  assert.equal(seekTarget(12, Infinity, 5), 12); // streams have no timeline
  assert.equal(seekTarget(-4, 0, 5), 0);
});

test('structure: transport bar with play/pause, seek bar and time readout', () => {
  const html = readFileSync(HTML, 'utf8');
  assert.match(html, /id="transport"/, 'transport bar');
  assert.match(html, /id="playbtn"/, 'play/pause button');
  assert.match(html, /id="seek"[^>]*type="range"/, 'scrubbable seek bar');
  assert.match(html, /id="time"/, 'elapsed/total readout');
});

test('structure: arrow keys seek through the pure helpers', () => {
  const app = appScript();
  assert.ok(app.includes("'ArrowRight'"), 'ArrowRight bound');
  assert.ok(app.includes("'ArrowLeft'"), 'ArrowLeft bound');
  assert.ok(app.includes('seekTarget('), 'app uses seekTarget');
  assert.ok(app.includes('formatTime('), 'app uses formatTime');
});

// ---------- fps diagnostics — frame pacing stats ----------

test('snapRefreshMs: snaps an observed interval to the nearest standard refresh period', () => {
  const { snapRefreshMs } = loadLogic(HTML);
  assert.equal(snapRefreshMs(16.9), 1000 / 60);   // jittery 60 Hz
  assert.equal(snapRefreshMs(8.2), 1000 / 120);   // 120 Hz display
  assert.equal(snapRefreshMs(34), 1000 / 30);     // sustained half-rate
});

test('snapRefreshMs: degenerate input → null', () => {
  const { snapRefreshMs } = loadLogic(HTML);
  assert.equal(snapRefreshMs(0), null);
  assert.equal(snapRefreshMs(-5), null);
  assert.equal(snapRefreshMs(NaN), null);
});

test('missedVsync: on-pace and jittery frames miss nothing', () => {
  const { missedVsync } = loadLogic(HTML);
  const base = 1000 / 60;
  assert.equal(missedVsync(base, base), 0);
  assert.equal(missedVsync(base * 1.4, base), 0); // rounding gives ~half-period tolerance
  assert.equal(missedVsync(base, 0), 0);          // no base estimate yet → never counts
});

test('missedVsync: doubled / tripled frame time = 1 / 2 missed vsyncs', () => {
  const { missedVsync } = loadLogic(HTML);
  const base = 1000 / 60;
  assert.equal(missedVsync(base * 2, base), 1);
  assert.equal(missedVsync(base * 3.1, base), 2);
});

test('frameStats: empty window → zeroed stats, no base estimate', () => {
  const { frameStats } = loadLogic(HTML);
  assert.deepEqual(frameStats([]),
    { fps: 0, avgMs: 0, p95Ms: 0, maxMs: 0, baseMs: null, dropped: 0 });
});

test('frameStats: steady 60 fps window → fps 60, base 60 Hz, zero drops', () => {
  const { frameStats } = loadLogic(HTML);
  const base = 1000 / 60;
  const s = frameStats(Array(120).fill(base));
  assert.ok(Math.abs(s.fps - 60) < 1e-9, `fps ${s.fps}`);
  assert.equal(s.baseMs, base);
  assert.ok(Math.abs(s.avgMs - base) < 1e-9, `avg ${s.avgMs}`); // summation float dust
  assert.equal(s.p95Ms, base);
  assert.equal(s.maxMs, base);
  assert.equal(s.dropped, 0);
});

test('frameStats: spikes register as missed vsyncs and lift p95/max', () => {
  const { frameStats } = loadLogic(HTML);
  const base = 1000 / 60;
  // 58 clean frames + a doubled and a tripled one → 1 + 2 missed
  const s = frameStats(Array(58).fill(base).concat([base * 2, base * 3]));
  assert.equal(s.dropped, 3);
  assert.equal(s.maxMs, base * 3);
  assert.equal(s.baseMs, base);     // p10 ignores the spikes
  assert.ok(s.fps < 60);
});

test('frameStats: sustained half-rate reads as a 30 Hz base, not as drops', () => {
  const { frameStats } = loadLogic(HTML);
  // every frame 33.3 ms: honest readout is "running at 30", dropped stays 0
  const s = frameStats(Array(90).fill(1000 / 30));
  assert.equal(s.baseMs, 1000 / 30);
  assert.equal(s.dropped, 0);
  assert.ok(Math.abs(s.fps - 30) < 1e-9);
});

// ---------- webgl slice 1 — pass plan: order, gating, minimal plan ----------

const planInput = (over = {}) => ({
  active: new Set(), pulses: {}, bass: 0, treble: 0, tSec: 0,
  scheduled: { mirrorOn: false, tileN: 2, lbOpen: true, frozen: false, stutterBack: 0 },
  ...over,
});

test('buildPassPlan: empty active set → single base pass', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const plan = buildPassPlan(planInput());
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, 'base');
  assert.equal(plan[0].program, 'base');
});

test('buildPassPlan: category order base → color → temporal → overlay', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const plan = buildPassPlan(planInput({
    active: new Set(['hue-spin', 'duotone', 'echo-trails', 'glow']),
    pulses: { 'hue-spin': 1 },
  }));
  const ids = plan.map(p => p.id);
  const at = id => ids.indexOf(id);
  assert.equal(at('base'), 0);
  assert.ok(at('color') > at('base'), 'color fold after base');
  assert.ok(at('duotone') > at('color'), 'heavy color after the fold');
  assert.ok(at('echo-trails') > at('duotone'), 'temporal after color');
  assert.ok(at('overlay') > at('echo-trails'), 'overlay last');
});

test('buildPassPlan: pulse members below the gate are dropped from folds', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const plan = buildPassPlan(planInput({
    active: new Set(['hue-spin', 'flash']),
    pulses: { 'hue-spin': 0.001, flash: 0.5 },
  }));
  const color = plan.find(p => p.id === 'color');
  assert.ok(color, 'fold pass present while one member is live');
  assert.deepEqual(color.members, ['flash']);
});

test('buildPassPlan: fold pass disappears when every member decays', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const plan = buildPassPlan(planInput({
    active: new Set(['flash', 'starburst']),
    pulses: { flash: 0.0, starburst: 0.001 },
  }));
  assert.equal(plan.find(p => p.id === 'color'), undefined);
  assert.equal(plan.find(p => p.id === 'overlay'), undefined);
});

test('buildPassPlan: gated individual pulse passes appear only above the gate', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const lo = buildPassPlan(planInput({
    active: new Set(['channel-swap']), pulses: { 'channel-swap': 0.01 } }));
  const hi = buildPassPlan(planInput({
    active: new Set(['channel-swap']), pulses: { 'channel-swap': 0.5 } }));
  assert.equal(lo.find(p => p.id === 'channel-swap'), undefined);
  assert.ok(hi.find(p => p.id === 'channel-swap'));
});

test('buildPassPlan: continuous effects ride activation alone, no pulse needed', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const plan = buildPassPlan(planInput({ active: new Set(['thermal', 'kaleidoscope']) }));
  assert.ok(plan.find(p => p.id === 'thermal'));
});

test('buildPassPlan: deterministic — identical input, deep-equal plan', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const input = planInput({
    active: new Set(['hue-spin', 'echo-trails', 'shockwave', 'neon-edge']),
    pulses: { 'hue-spin': 0.7, shockwave: 0.4 }, bass: 0.5, treble: 0.2, tSec: 12.5,
  });
  assert.deepEqual(buildPassPlan(input), buildPassPlan(input));
});

// ---------- webgl slice 2 — fold uniforms + geometry matrix ----------

test('colorFoldUniforms: no live members → neutral transfer', () => {
  const { colorFoldUniforms } = loadLogic(HTML);
  const u = colorFoldUniforms([], {}, { bass: 0, treble: 0, tSec: 0, hueBase: 0 });
  assert.deepEqual(u, { brightness: 1, saturation: 1, hue: 0, gray: 0,
                        contrast: 1, invert: 0, flash: 0, levels: 0 });
});

test('colorFoldUniforms: bleach-burn and sat-pump combine multiplicatively', () => {
  const { colorFoldUniforms } = loadLogic(HTML);
  // bleach P=0.5 → brightness 1.75, sat ×0.625; sat-pump P=1 → sat ×3.6
  const u = colorFoldUniforms(['bleach-burn', 'sat-pump'],
    { 'bleach-burn': 0.5, 'sat-pump': 1 }, { bass: 0, treble: 0, tSec: 0, hueBase: 0 });
  assert.ok(Math.abs(u.brightness - 1.75) < 1e-9);
  assert.ok(Math.abs(u.saturation - 0.625 * 3.6) < 1e-9);
});

test('colorFoldUniforms: hue-spin adds the pulse kick onto the beat-stepped base', () => {
  const { colorFoldUniforms } = loadLogic(HTML);
  const u = colorFoldUniforms(['hue-spin'], { 'hue-spin': 0.5 },
    { bass: 0, treble: 0, tSec: 0, hueBase: 120 });
  assert.equal(u.hue, 120 + 22.5);
});

test('colorFoldUniforms: invert-strobe is a hard threshold at pulse 0.5', () => {
  const { colorFoldUniforms } = loadLogic(HTML);
  const ctx = { bass: 0, treble: 0, tSec: 0, hueBase: 0 };
  assert.equal(colorFoldUniforms(['invert-strobe'], { 'invert-strobe': 0.4 }, ctx).invert, 0);
  assert.equal(colorFoldUniforms(['invert-strobe'], { 'invert-strobe': 0.9 }, ctx).invert, 1);
});

test('colorFoldUniforms: color-drain and flash pass their pulses through', () => {
  const { colorFoldUniforms } = loadLogic(HTML);
  const u = colorFoldUniforms(['color-drain', 'flash'],
    { 'color-drain': 0.7, flash: 0.5 }, { bass: 0, treble: 0, tSec: 0, hueBase: 0 });
  assert.equal(u.gray, 0.7);
  assert.ok(Math.abs(u.flash - 0.5 * 0.38) < 1e-9);
});

test('overlayFoldUniforms: neutral when nothing is live', () => {
  const { overlayFoldUniforms } = loadLogic(HTML);
  const u = overlayFoldUniforms([], {}, { treble: 0, tSec: 0, lbPos: 0 });
  assert.deepEqual(u, { glow: 0, scanlines: 0, vhs: 0, grain: 0,
                        vignette: 0, letterbox: 0, starburst: 0, shockwave: 0 });
});

test('overlayFoldUniforms: pulse members scale, letterbox follows eased position', () => {
  const { overlayFoldUniforms } = loadLogic(HTML);
  const u = overlayFoldUniforms(
    ['grain-burst', 'vignette-pump', 'letterbox-snap'],
    { 'grain-burst': 0.6, 'vignette-pump': 0.3 },
    { treble: 0, tSec: 0, lbPos: 0.42 });
  assert.ok(Math.abs(u.grain - 0.3) < 1e-9);      // P × 0.5
  assert.equal(u.vignette, 0.3);
  assert.equal(u.letterbox, 0.42);
});

test('geometryMatrix: nothing live → identity', () => {
  const { geometryMatrix } = loadLogic(HTML);
  assert.deepEqual(geometryMatrix({ pulses: {}, active: new Set(), joltDir: 1,
                                    mirrorOn: false, shake: [0, 0] }),
                   [1, 0, 0, 0, 1, 0, 0, 0, 1]);
});

test('geometryMatrix: zoom pulse scales about center', () => {
  const { geometryMatrix } = loadLogic(HTML);
  const m = geometryMatrix({ pulses: { zoom: 1 }, active: new Set(['zoom']),
                             joltDir: 1, mirrorOn: false, shake: [0, 0] });
  assert.ok(Math.abs(m[0] - 1.07) < 1e-9);
  assert.ok(Math.abs(m[4] - 1.07) < 1e-9);
});

test('geometryMatrix: mirror flips x; shake lands in the translation slots', () => {
  const { geometryMatrix } = loadLogic(HTML);
  const m = geometryMatrix({ pulses: {}, active: new Set(['mirror-flip']),
                             joltDir: 1, mirrorOn: true, shake: [0.02, -0.01] });
  assert.equal(m[0], -1);
  assert.ok(Math.abs(m[6] - 0.02) < 1e-9);
  assert.ok(Math.abs(m[7] + 0.01) < 1e-9);
});

test('buildPassPlan: fold passes now carry synthesized uniforms; base carries the matrix', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const plan = buildPassPlan(planInput({
    active: new Set(['flash', 'zoom']), pulses: { flash: 1, zoom: 1 }, hueBase: 0,
  }));
  assert.ok(Math.abs(plan.find(p => p.id === 'color').uniforms.flash - 0.38) < 1e-9);
  assert.ok(Math.abs(plan[0].uniforms.matrix[0] - 1.07) < 1e-9);
});

// ---------- webgl slice 4 — non-affine geometry programs ----------

test('buildPassPlan: geometry replacements select the base program variant', () => {
  const { buildPassPlan, sliceOffsets } = loadLogic(HTML);
  const kal = buildPassPlan(planInput({ active: new Set(['kaleidoscope']) }));
  assert.equal(kal[0].program, 'kaleido');

  const tile = buildPassPlan(planInput({
    active: new Set(['tile-grid']),
    scheduled: { mirrorOn: false, tileN: 3, lbOpen: true, frozen: false, stutterBack: 0 },
  }));
  assert.equal(tile[0].program, 'tile');
  assert.equal(tile[0].uniforms.tiles, 3);

  const sg = buildPassPlan(planInput({
    active: new Set(['slice-glitch']), pulses: { 'slice-glitch': 0.5 }, sliceSeed: 42,
  }));
  assert.equal(sg[0].program, 'slice');
  assert.deepEqual(sg[0].uniforms.offsets, sliceOffsets(42, 14, 35));

  const vs = buildPassPlan(planInput({
    active: new Set(['v-slice']), pulses: { 'v-slice': 1 }, sliceSeed: 42,
  }));
  assert.equal(vs[0].program, 'vslice');
  assert.deepEqual(vs[0].uniforms.offsets, sliceOffsets(43, 14, 70));
});

test('buildPassPlan: replacement priority matches the 2D chain (kaleido wins)', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const plan = buildPassPlan(planInput({
    active: new Set(['kaleidoscope', 'tile-grid', 'slice-glitch']),
    pulses: { 'slice-glitch': 1 },
  }));
  assert.equal(plan[0].program, 'kaleido');
});

test('buildPassPlan: pixelate rides any variant as a block-size uniform', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const alone = buildPassPlan(planInput({
    active: new Set(['pixelate']), pulses: { pixelate: 1 } }));
  assert.equal(alone[0].program, 'base');
  assert.ok(Math.abs(alone[0].uniforms.block - 29) < 1e-9);   // 3 + P·26

  const ridden = buildPassPlan(planInput({
    active: new Set(['pixelate', 'kaleidoscope']), pulses: { pixelate: 1 } }));
  assert.equal(ridden[0].program, 'kaleido');
  assert.ok(Math.abs(ridden[0].uniforms.block - 29) < 1e-9);

  const decayed = buildPassPlan(planInput({
    active: new Set(['pixelate']), pulses: { pixelate: 0.001 } }));
  assert.equal(decayed[0].uniforms.block, 0);
});

test('structure: GLSL registered for each geometry program variant', () => {
  const app = appScript();
  for (const key of ['kaleido', 'tile', 'slice', 'vslice']) {
    assert.match(app, new RegExp(`${key}:\\s*\`#version 300 es`), `${key} shader`);
  }
  assert.ok(app.includes('uBlock'), 'pixelate quantization uniform in base variants');
});

// ---------- webgl slice 5 — color passes ----------

test('buildPassPlan: chroma rides the bass — omitted quiet, sized loud', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const quiet = buildPassPlan(planInput({ active: new Set(['chroma']), bass: 0.01 }));
  assert.equal(quiet.find(p => p.id === 'chroma'), undefined,
    'sub-pixel split is not worth a pass');
  const loud = buildPassPlan(planInput({ active: new Set(['chroma']), bass: 0.5 }));
  assert.ok(Math.abs(loud.find(p => p.id === 'chroma').uniforms.amount - 15) < 1e-9);
});

test('buildPassPlan: channel-swap mix follows the pulse, capped at 1', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const half = buildPassPlan(planInput({
    active: new Set(['channel-swap']), pulses: { 'channel-swap': 0.5 } }));
  assert.ok(Math.abs(half.find(p => p.id === 'channel-swap').uniforms.mix - 0.6) < 1e-9);
  const full = buildPassPlan(planInput({
    active: new Set(['channel-swap']), pulses: { 'channel-swap': 1 } }));
  assert.equal(full.find(p => p.id === 'channel-swap').uniforms.mix, 1);
});

test('structure: GLSL registered for every color program', () => {
  const app = appScript();
  for (const key of ['color', 'duotone', 'thermal', 'sepia-ghost',
                     'channel-swap', 'neon-edge', 'chroma']) {
    assert.match(app, new RegExp(`['"]?${key}['"]?:\\s*\`#version 300 es`),
      `${key} shader`);
  }
});

// ---------- webgl slice 6 — temporal passes ----------

test('buildPassPlan: frozen hold collapses the plan to the freeze pass', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const frozen = buildPassPlan(planInput({
    active: new Set(['freeze-frame', 'thermal', 'glow']),
    scheduled: { mirrorOn: false, tileN: 2, lbOpen: true, frozen: true, stutterBack: 0 },
  }));
  assert.deepEqual(frozen, [{ id: 'freeze-frame', program: 'freeze', uniforms: {} }]);
  // frozen flag without the effect active (hand moved on) → normal plan
  const lapsed = buildPassPlan(planInput({
    active: new Set(['thermal']),
    scheduled: { mirrorOn: false, tileN: 2, lbOpen: true, frozen: true, stutterBack: 0 },
  }));
  assert.ok(lapsed.find(p => p.id === 'thermal'));
});

test('buildPassPlan: stutter-loop needs both pulse and ring depth', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const sched = back => ({ mirrorOn: false, tileN: 2, lbOpen: true, frozen: false, stutterBack: back });
  const live = buildPassPlan(planInput({
    active: new Set(['stutter-loop']), pulses: { 'stutter-loop': 0.5 }, scheduled: sched(3) }));
  assert.equal(live.find(p => p.id === 'stutter-loop').uniforms.back, 3);
  const faded = buildPassPlan(planInput({
    active: new Set(['stutter-loop']), pulses: { 'stutter-loop': 0.1 }, scheduled: sched(3) }));
  assert.equal(faded.find(p => p.id === 'stutter-loop'), undefined);
  const shallow = buildPassPlan(planInput({
    active: new Set(['stutter-loop']), pulses: { 'stutter-loop': 0.5 }, scheduled: sched(0) }));
  assert.equal(shallow.find(p => p.id === 'stutter-loop'), undefined);
});

test('buildPassPlan: strobe-black fires above 0.25 on even frames only', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const mk = (P, frameNo) => buildPassPlan(planInput({
    active: new Set(['strobe-black']), pulses: { 'strobe-black': P }, frameNo }));
  const hit = mk(0.5, 4).find(p => p.id === 'strobe-black');
  assert.ok(Math.abs(hit.uniforms.strobe - 0.75) < 1e-9);   // min(1, P·1.5)
  assert.equal(mk(0.5, 5).find(p => p.id === 'strobe-black'), undefined);
  assert.equal(mk(0.2, 4).find(p => p.id === 'strobe-black'), undefined);
});

test('structure: temporal GLSL programs and feedback capture exist', () => {
  const app = appScript();
  for (const key of ['echo-trails', 'time-smear', 'motion-ghost', 'droste',
                     'strobe-black', 'interlace-roll', 'freeze', 'stutter-loop']) {
    assert.match(app, new RegExp(`['"]?${key}['"]?:\\s*\`#version 300 es`),
      `${key} shader`);
  }
  assert.ok(app.includes('copyTexSubImage2D'), 'feedback/ring capture via texture copy');
});

// ---------- webgl slice 7 — overlay pass ----------

test('buildPassPlan: overlay fold carries eased letterbox and pulse strengths', () => {
  const { buildPassPlan } = loadLogic(HTML);
  const plan = buildPassPlan(planInput({
    active: new Set(['letterbox-snap', 'shockwave']),
    pulses: { shockwave: 0.4 },
    scheduled: { mirrorOn: false, tileN: 2, lbOpen: true, lbPos: 0.8,
                 frozen: false, stutterBack: 0 },
  }));
  const ov = plan.find(p => p.id === 'overlay');
  assert.equal(ov.uniforms.letterbox, 0.8);
  assert.equal(ov.uniforms.shockwave, 0.4);
});

test('structure: overlay GLSL exists and samples the noise texture', () => {
  const app = appScript();
  assert.match(app, /overlay:\s*`#version 300 es/, 'overlay shader');
  assert.ok(app.includes('uNoise'), 'noise sampler uniform');
  assert.ok(app.includes('texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, noiseCv)'),
    'static noise tile uploaded once from the generated canvas');
});

// ---------- webgl slice 8 — sprite layer + GL demo scene ----------

test('hslToRgb: primaries and a half-lit teal', () => {
  const { hslToRgb } = loadLogic(HTML);
  assert.deepEqual(hslToRgb(0, 1, 0.5), [1, 0, 0]);
  assert.deepEqual(hslToRgb(120, 1, 0.5), [0, 1, 0]);
  const teal = hslToRgb(180, 1, 0.25);
  assert.ok(Math.abs(teal[0]) < 1e-9 && Math.abs(teal[1] - 0.5) < 1e-9
         && Math.abs(teal[2] - 0.5) < 1e-9);
});

// stride: [cx, cy, w, h, rot, r, g, b, alpha, cell] × instances
const STRIDE = 10;

test('packSprites: a burst particle becomes one additive soft-circle instance', () => {
  const { packSprites } = loadLogic(HTML);
  const p = { kind: 'burst', x: 100, y: 80, r: 2, age: 0.25, life: 1, hue: 0, vx: 0, vy: 0 };
  const { add, norm } = packSprites([p], [], []);
  assert.equal(add.length, STRIDE);
  assert.equal(norm.length, 0);
  const f = 0.75;
  assert.equal(add[0], 100);
  assert.equal(add[1], 80);
  assert.ok(Math.abs(add[2] - 2 * (0.5 + f) * 6) < 1e-9, 'glow skirt sizing');
  assert.ok(Math.abs(add[8] - f * 0.9) < 1e-9, 'alpha fades with age');
  assert.equal(add[9], 0);                                  // cell 0 = soft circle
});

test('packSprites: confetti is a normal-blend rotated rect', () => {
  const { packSprites } = loadLogic(HTML);
  const p = { kind: 'confetti', x: 10, y: 20, r: 4, rot: 1.2, age: 0.5, life: 2,
              hue: 200, vx: 0, vy: 0 };
  const { add, norm } = packSprites([p], [], []);
  assert.equal(add.length, 0);
  assert.equal(norm.length, STRIDE);
  assert.equal(norm[2], 8);                                 // w = 2r
  assert.ok(Math.abs(norm[3] - 4.4) < 1e-9);                // h = 1.1r
  assert.equal(norm[4], 1.2);
  assert.equal(norm[9], 1);                                 // cell 1 = solid rect
});

test('packSprites: bolt segments become oriented additive bars', () => {
  const { packSprites } = loadLogic(HTML);
  const bolt = { segs: [[0, 0, 30, 40], [30, 40, 30, 100]], age: 0.07, life: 0.28 };
  const { add } = packSprites([], [bolt], []);
  assert.equal(add.length, 2 * STRIDE);
  assert.equal(add[0], 15);                                 // first seg midpoint
  assert.equal(add[1], 20);
  assert.ok(Math.abs(add[2] - 58) < 1e-9, 'length 50 + glow pad 8');
  assert.ok(Math.abs(add[4] - Math.atan2(40, 30)) < 1e-9);
  assert.equal(add[9], 2);                                  // cell 2 = soft bar
});

test('packSprites: glyphs pop from their atlas cell', () => {
  const { packSprites } = loadLogic(HTML);
  const g = { ci: 3, x: 50, y: 60, size: 100, age: 0.3, life: 0.6, hue: 305 };
  const { add } = packSprites([], [], [g]);
  const f = 0.5, pop = 1.35 - f * 0.35;
  assert.ok(Math.abs(add[2] - 100 * pop) < 1e-9);
  assert.equal(add[8], f);
  assert.equal(add[9], 3 + 3);                              // glyph cells start at 3
});

test('structure: instanced sprite layer, direct video upload, GL demo scene', () => {
  const app = appScript();
  assert.ok(app.includes('drawArraysInstanced'), 'instanced sprite draws');
  assert.ok(app.includes('gl.ONE, gl.ONE'), 'additive blend group');
  assert.match(app, /texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA, gl\.RGBA, gl\.UNSIGNED_BYTE, video\)/,
    'video uploads straight to GL — no 2D canvas relay');
  assert.ok(app.includes('gl.LINES'), 'demo scene bars/prism as GL lines');
});

// ---------- webgl slice 9 — 2D pipeline removal ----------

test('structure: the Canvas2D render pipeline is gone', () => {
  const app = appScript();
  assert.ok(!app.includes('function render('), 'old render() deleted');
  assert.ok(!/\bctx\./.test(app), 'no main-canvas 2d usage left');
  assert.ok(!app.includes('drawImage'), 'no 2D blits anywhere');
  const gen2d = app.match(/getContext\('2d'\)/g) ?? [];
  assert.equal(gen2d.length, 2, 'exactly noise + atlas generation use 2d canvases');
});

test('structure: save-png re-renders the unpreserved GL frame on demand', () => {
  const app = appScript();
  assert.ok(app.includes('toDataURL'), 'save still produces a PNG');
  assert.ok(app.includes('lastPlan'), 'redraw-then-capture path exists');
});

// ---------- webgl slice 3 — GL skeleton (structural) ----------

test('structure: main canvas runs WebGL2, not 2d', () => {
  const app = appScript();
  assert.ok(app.includes("getContext('webgl2'"), 'webgl2 context requested');
  assert.ok(!app.includes("canvas.getContext('2d')"),
    'main canvas must no longer request a 2d context (one context type per canvas)');
});

test('structure: needs-WebGL2 fallback and context-loss recovery exist', () => {
  const html = readFileSync(HTML, 'utf8');
  assert.match(html, /id="nogl"/, 'fallback message element');
  const app = appScript();
  assert.ok(app.includes('webglcontextlost'), 'context-lost handler bound');
  assert.ok(app.includes('webglcontextrestored'), 'context-restored handler bound');
});

test('structure: app script is syntactically valid JS', () => {
  // execution needs a DOM; parsing does not — catches edit damage early
  assert.doesNotThrow(() => new Function(appScript()));
});

test('structure: the frame loop renders through the pass plan', () => {
  const app = appScript();
  assert.ok(app.includes('buildPassPlan('), 'frame loop builds the plan');
  assert.ok(app.includes('function glRender'), 'pass executor exists');
  assert.ok(app.includes('texImage2D'), 'source frame uploaded as a texture');
});

test('structure: perf panel exists and the app loop feeds it', () => {
  const html = readFileSync(HTML, 'utf8');
  assert.match(html, /id="perf"/, 'perf panel element');
  const app = appScript();
  assert.ok(app.includes('frameStats('), 'app uses frameStats');
  assert.ok(app.includes('missedVsync('), 'app uses missedVsync');
  assert.ok(app.includes("'f'"), 'f key toggles the panel');
});
