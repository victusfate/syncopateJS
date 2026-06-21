import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLogic } from '../_harness/logic.mjs';
import { appScript } from './_helpers.mjs';

const HTML = new URL('./index.html', import.meta.url).pathname;

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

test('structure: every __logic export the app uses is destructured', () => {
  // a name used but missing from the destructure is a ReferenceError at
  // runtime, invisible to the parse-only test above
  const app = appScript();
  const destructure = app.match(/const\s*\{([\s\S]*?)\}\s*=\s*globalThis\.__logic/);
  assert.ok(destructure, 'app destructures globalThis.__logic');
  const imported = new Set(destructure[1].split(',').map(s => s.trim()).filter(Boolean));
  const body = app.slice(destructure.index + destructure[0].length);
  for (const name of Object.keys(loadLogic(HTML))) {
    if (new RegExp(`\\b${name}\\b`).test(body)) {
      assert.ok(imported.has(name), `${name} is used by the app but not destructured`);
    }
  }
});

test('structure: top-level resize() runs after the GL state it drops', () => {
  // resize() → dropGlTemporal() reads gl and glFeedback at script top level;
  // if their let/const declarations come later, the TDZ throw kills the
  // whole app script before any event handler binds (dead page on load)
  const app = appScript();
  const callAt = app.search(/^resize\(\);/m);
  assert.ok(callAt > -1, 'top-level resize() call exists');
  for (const decl of ['let gl =', 'const glFeedback =']) {
    const at = app.indexOf(decl);
    assert.ok(at > -1 && at < callAt, `${decl.split(' ')[1]} declared before top-level resize()`);
  }
});
