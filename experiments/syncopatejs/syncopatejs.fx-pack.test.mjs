import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from '../_harness/logic.mjs';

const HTML = new URL('./index.html', import.meta.url).pathname;

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
