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

test('structure: mobile — begin binds to click (touch activation), responsive layout', () => {
  const html = readFileSync(HTML, 'utf8');
  assert.match(html, /addEventListener\('click', begin\)/,
    'begin must bind to click — pointerdown carries no user activation on touch');
  assert.ok(!/addEventListener\('pointerdown', begin\)/.test(html),
    'begin must not bind to pointerdown');
  assert.match(html, /@media \(max-width: 640px\)/, 'small-screen media query');
  assert.match(html, /playsinline/, 'video plays inline on iOS');
  assert.match(html, /pointer: coarse/, 'coarse-pointer detection for touch copy');
});

test('structure: HUD has BPM readout, sensitivity slider, six chips, file input', () => {
  const html = readFileSync(HTML, 'utf8');
  assert.match(html, /id="bpm"/, 'BPM readout');
  assert.match(html, /id="sens"[^>]*type="range"/, 'sensitivity slider');
  assert.equal((html.match(/class="chip"/g) ?? []).length, 6, 'six effect chips');
  assert.match(html, /type="file"[^>]*accept="video\/\*"/, 'video file input');
});
