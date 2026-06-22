import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLogic } from '../_harness/logic.mjs';
import { appScript } from './_helpers.mjs';

const HTML = new URL('./index.html', import.meta.url).pathname;

// ---------- fx slice 5 — app integration (structural) ----------

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
