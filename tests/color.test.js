'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/color.js');
const N = require('../js/names.js');
const P = require('../js/palettes.js');

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} expected ${b} ± ${eps}, got ${a}`);
const rgbNear = (a, b, eps = 1, msg) => {
  near(a.r, b.r, eps, msg); near(a.g, b.g, eps, msg); near(a.b, b.b, eps, msg);
};

const SAMPLES = [
  { r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 }, { r: 231, g: 111, b: 81 }, { r: 42, g: 157, b: 143 }, { r: 128, g: 128, b: 128 },
  { r: 12, g: 200, b: 250 }, { r: 250, g: 240, b: 10 }, { r: 90, g: 30, b: 150 },
];

test('HSV/HSL/HWB/CMYK known values', () => {
  const orange = { r: 255, g: 136, b: 0 };
  const hsv = C.rgbToHsv(orange);
  near(hsv.h, 32, 0.1); near(hsv.s, 1, 1e-9); near(hsv.v, 1, 1e-9);
  const hsl = C.rgbToHsl(orange);
  near(hsl.h, 32, 0.1); near(hsl.s, 1, 1e-9); near(hsl.l, 0.5, 1e-9);
  const cmyk = C.rgbToCmyk(orange);
  near(cmyk.c, 0, 1e-9); near(cmyk.m, 0.467, 0.001); near(cmyk.y, 1, 1e-9); near(cmyk.k, 0, 1e-9);
  assert.deepEqual(C.rgbToCmyk({ r: 0, g: 0, b: 0 }), { c: 0, m: 0, y: 0, k: 1 });
  const hwb = C.rgbToHwb({ r: 51, g: 102, b: 153 });
  near(hwb.h, 210, 0.1); near(hwb.w, 0.2, 1e-9); near(hwb.b, 0.4, 1e-9);
});

test('round trips through every model', () => {
  for (const c of SAMPLES) {
    rgbNear(C.hsvToRgb(C.rgbToHsv(c)), c, 1e-6, 'hsv');
    rgbNear(C.hslToRgb(C.rgbToHsl(c)), c, 1e-6, 'hsl');
    rgbNear(C.hwbToRgb(C.rgbToHwb(c)), c, 1e-6, 'hwb');
    rgbNear(C.cmykToRgb(C.rgbToCmyk(c)), c, 1e-6, 'cmyk');
    rgbNear(C.labToRgb(C.rgbToLab(c)), c, 0.05, 'lab');
    rgbNear(C.lchToRgb(C.rgbToLch(c)), c, 0.05, 'lch');
    rgbNear(C.oklabToRgb(C.rgbToOklab(c)), c, 0.05, 'oklab');
    const o = C.rgbToOklch(c);
    rgbNear(C.oklchToRgb(o.L, o.C, o.h), c, 0.05, 'oklch');
  }
});

test('Lab (D50) reference values', () => {
  const white = C.rgbToLab({ r: 255, g: 255, b: 255 });
  near(white.L, 100, 0.01); near(white.a, 0, 0.01); near(white.b, 0, 0.01);
  // sRGB red in D50 Lab: 54.29, 80.80, 69.89 (Lindbloom / CSS Color 4)
  const red = C.rgbToLab({ r: 255, g: 0, b: 0 });
  near(red.L, 54.29, 0.05); near(red.a, 80.8, 0.1); near(red.b, 69.89, 0.1);
});

test('OKLab reference values', () => {
  const red = C.rgbToOklch({ r: 255, g: 0, b: 0 });
  near(red.L, 0.628, 0.001); near(red.C, 0.2577, 0.001); near(red.h, 29.23, 0.05);
  const white = C.rgbToOklab({ r: 255, g: 255, b: 255 });
  near(white.L, 1, 1e-4); near(white.a, 0, 1e-4);
});

test('OKLCH gamut mapping keeps lightness and stays in gamut', () => {
  const c = C.oklchToRgb(0.5, 0.35, 260); // far outside sRGB
  for (const k of ['r', 'g', 'b']) assert.ok(c[k] >= 0 && c[k] <= 255);
  near(C.rgbToOklch(c).L, 0.5, 0.01);
  assert.ok(C.maxChroma(0.5, 260) < 0.35);
});

test('CIEDE2000 matches published test pairs (Sharma et al.)', () => {
  const dE = (a, b) => C.deltaE2000({ L: a[0], a: a[1], b: a[2] }, { L: b[0], a: b[1], b: b[2] });
  near(dE([50, 2.6772, -79.7751], [50, 0, -82.7485]), 2.0425, 1e-4);
  near(dE([50, 3.1571, -77.2803], [50, 0, -82.7485]), 2.8615, 1e-4);
  near(dE([50, 2.5, 0], [50, 0, -2.5]), 4.3065, 1e-4);
  near(dE([50, 2.5, 0], [73, 25, -18]), 27.1492, 1e-4);
  near(dE([50, 2.5, 0], [50, 3.2592, 0.335]), 1.0, 1e-3);
  assert.equal(dE([60, 10, 10], [60, 10, 10]), 0);
});

test('contrast ratios follow WCAG', () => {
  near(C.contrast(C.WHITE, C.BLACK), 21, 1e-9);
  near(C.contrast(C.WHITE, C.WHITE), 1, 1e-9);
  near(C.contrast({ r: 119, g: 119, b: 119 }, C.WHITE), 4.48, 0.01); // #777 on white
  assert.equal(C.bestText({ r: 255, g: 255, b: 0 }), C.BLACK);
  assert.equal(C.bestText({ r: 0, g: 0, b: 128 }), C.WHITE);
});

test('formatting', () => {
  const c = { r: 231, g: 111, b: 81 };
  assert.equal(C.format('hex', c), '#E76F51');
  assert.equal(C.format('rgb', c), 'rgb(231, 111, 81)');
  assert.equal(C.format('hsl', c), 'hsl(12, 76%, 61%)');
  assert.equal(C.format('hsv', c), 'hsv(12, 65%, 91%)');
  assert.equal(C.format('cmyk', c), 'cmyk(0%, 52%, 65%, 9%)');
  assert.equal(C.format('decimal', { r: 255, g: 136, b: 0 }), '16746496');
  assert.equal(C.format('hex', { r: 0, g: 0, b: 0 }), '#000000');
  assert.match(C.format('lab', { r: 0, g: 0, b: 0 }), /^lab\(0 0 0\)$/); // no "-0"
});

test('parsing', () => {
  const orange = { r: 255, g: 136, b: 0 };
  assert.deepEqual(C.parse('#ff8800'), orange);
  assert.deepEqual(C.parse('FF8800'), orange);
  assert.deepEqual(C.parse('#f80'), orange);
  assert.deepEqual(C.parse('#ff8800cc'), orange);
  assert.deepEqual(C.parse('0xff8800'), orange);
  assert.deepEqual(C.parse('rgb(255, 136, 0)'), orange);
  assert.deepEqual(C.parse('rgb(255 136 0 / 50%)'), orange);
  assert.deepEqual(C.parse('rgb(100%, 0%, 0%)'), { r: 255, g: 0, b: 0 });
  assert.deepEqual(C.parse('255, 136, 0', 'rgb'), orange);
  rgbNear(C.parse('hsl(32, 100%, 50%)'), orange, 1);
  rgbNear(C.parse('32 100 50', 'hsl'), orange, 1);
  rgbNear(C.parse('hsv(32, 100%, 100%)'), orange, 1);
  rgbNear(C.parse('hsb(32, 100%, 100%)'), orange, 1);
  rgbNear(C.parse('hwb(32 0% 0%)'), orange, 1);
  rgbNear(C.parse('cmyk(0%, 47%, 100%, 0%)'), orange, 1);
  rgbNear(C.parse(C.format('lab', orange)), orange, 3);
  rgbNear(C.parse(C.format('lch', orange)), orange, 3);
  rgbNear(C.parse(C.format('oklch', orange)), orange, 1);
  assert.deepEqual(C.parse('16746496', 'decimal'), orange);
  assert.equal(C.parse('16777216', 'decimal'), null);
  for (const bad of ['', '  ', 'nope', '#12', '#gg0000', 'rgb(1,2)', 'rgb(a,b,c)', 'hsl()', null, undefined]) {
    assert.equal(C.parse(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(C.parse('300', 'rgb'), null);
  // out-of-range values clamp instead of failing
  assert.deepEqual(C.parse('rgb(300, -5, 0)'), { r: 255, g: 0, b: 0 });
});

test('format → parse is stable for every field', () => {
  for (const c of SAMPLES) {
    for (const id of ['hex', 'rgb', 'hsl', 'hsv', 'hwb', 'cmyk', 'lab', 'lch', 'oklch', 'decimal']) {
      const back = C.parse(C.format(id, c), id);
      assert.ok(back, `${id} of ${JSON.stringify(c)} should re-parse`);
      // Formatted text is rounded, so allow small drift (worst for hue-only rounding at low chroma).
      rgbNear(C.rgb8(back), c, id === 'hex' || id === 'rgb' || id === 'decimal' ? 0 : 6, id);
    }
  }
});

test('named colours', () => {
  assert.deepEqual(N.lookup('Tomato'), { r: 255, g: 99, b: 71 });
  assert.deepEqual(N.lookup('burnt sienna'), { r: 0xe9, g: 0x74, b: 0x51 });
  assert.deepEqual(N.lookup('Rebecca-Purple'), { r: 0x66, g: 0x33, b: 0x99 });
  assert.deepEqual(N.lookup('grey'), { r: 128, g: 128, b: 128 });
  assert.equal(N.lookup('not a colour'), null);
  const hexes = new Set();
  for (const e of N.all) {
    assert.ok(!hexes.has(e.name.toLowerCase()), 'unique names');
    hexes.add(e.name.toLowerCase());
  }
  // 148 CSS keywords = 139 distinct colours + aqua/fuchsia + 7 "grey" spellings
  assert.equal(N.all.filter((e) => e.kind === 'css').length, 139);
  assert.ok(N.all.filter((e) => e.kind === 'art').length >= 80);
  const hit = N.nearest({ r: 255, g: 99, b: 71 }, 3);
  assert.equal(hit[0].name, 'tomato');
  assert.equal(hit[0].dE, 0);
  assert.ok(hit[1].dE > 0 && hit[1].dE <= hit[2].dE);
  assert.equal(N.nearest({ r: 254, g: 0, b: 0 }, 1)[0].name, 'red');
});

test('RYB wheel: artist complements', () => {
  const hue = (rgb) => C.rgbToHsl(rgb).h;
  const red = { r: 255, g: 0, b: 0 };
  near(hue(P.rotate(red, 180, 'ryb')), 120, 1);            // red ↔ green
  near(hue(P.rotate(red, 180, 'hsl')), 180, 1);            // digital: red ↔ cyan
  near(hue(P.rotate({ r: 255, g: 128, b: 0 }, 180, 'ryb')), 240, 3); // orange ↔ blue
  near(hue(P.rotate({ r: 255, g: 255, b: 0 }, 180, 'ryb')), 275, 3); // yellow ↔ violet
  for (let h = 0; h < 360; h += 7) assert.ok(Math.abs(C.mod(P.rybHueToRgb(P.rgbHueToRyb(h)) - h + 180, 360) - 180) < 1e-6);
  // Rotating a full turn is the identity.
  for (const w of ['ryb', 'hsl', 'oklch']) rgbNear(P.rotate({ r: 231, g: 111, b: 81 }, 360, w), { r: 231, g: 111, b: 81 }, 1.5);
});

test('palette generator invariants', () => {
  for (const wheel of ['ryb', 'hsl', 'oklch']) {
    for (const size of [2, 3, 4, 5, 7, 9, 12]) {
      for (const base of SAMPLES) {
        const groups = P.generate(base, { wheel, size, spread: 30 });
        const ids = new Set();
        for (const g of groups) {
          for (const p of g.palettes) {
            assert.ok(!ids.has(p.id), 'unique palette ids');
            ids.add(p.id);
            assert.ok(p.colors.length >= 2, `${p.id} has colours`);
            for (const c of p.colors) {
              for (const k of ['r', 'g', 'b']) {
                assert.ok(Number.isInteger(c[k]) && c[k] >= 0 && c[k] <= 255, `${p.id}: ${JSON.stringify(c)}`);
              }
              assert.match(c.hex, /^#[0-9A-F]{6}$/);
            }
            const marked = p.colors.filter((c) => c.isBase);
            assert.ok(marked.length <= 1, `${p.id}: at most one base marker`);
            for (const m of marked) assert.equal(m.hex, C.toHex(base), `${p.id}: base swatch is the exact colour`);
            if (p.wheel) assert.equal(p.wheel.angles.length, p.colors.length);
          }
        }
        const byId = Object.fromEntries(groups.flatMap((g) => g.palettes).map((p) => [p.id, p]));
        // size-driven palettes honour the requested size
        for (const id of ['analogous', 'mono', 'tints', 'shades', 'tones', 'neutrals', 'grad-comp', 'grad-glide']) {
          assert.equal(byId[id].colors.length, size, `${id} size`);
        }
        assert.equal(byId.complementary.colors.length, 2);
        assert.equal(byId.triadic.colors.length, 3);
        assert.equal(byId.square.colors.length, 4);
        assert.equal(byId.scale.colors.length, 11);
        assert.equal(byId.moods.colors.length, 5);
      }
    }
  }
});

test('palette content sanity', () => {
  const base = { r: 231, g: 111, b: 81 };
  const g = Object.fromEntries(P.generate(base, { wheel: 'ryb', size: 5 }).flatMap((x) => x.palettes).map((p) => [p.id, p]));
  // monochromatic ramps go light → dark
  const L = g.mono.colors.map((c) => C.rgbToOklab(c).L);
  for (let i = 1; i < L.length; i++) assert.ok(L[i] < L[i - 1], 'mono descends in lightness');
  const baseIdx = g.mono.colors.findIndex((c) => c.isBase);
  assert.ok(baseIdx > 0 && baseIdx < 4, 'base sits inside the ramp');
  const gaps = (from, to) => { const out = []; for (let i = from + 1; i <= to; i++) out.push(L[i - 1] - L[i]); return out; };
  const darker = gaps(baseIdx, 4);
  for (const d of darker) near(d, darker[0], 0.02, 'even steps below the base');
  // tints get lighter, shades get darker
  const tl = g.tints.colors.map((c) => C.rgbToOklab(c).L);
  const sl = g.shades.colors.map((c) => C.rgbToOklab(c).L);
  for (let i = 1; i < 5; i++) { assert.ok(tl[i] > tl[i - 1]); assert.ok(sl[i] < sl[i - 1]); }
  // tones keep lightness but lose chroma
  const chroma = g.tones.colors.map((c) => C.rgbToOklch(c).C);
  for (let i = 1; i < 5; i++) assert.ok(chroma[i] < chroma[i - 1]);
  // accessible text passes AA and companions pass 3:1, on light and dark bases
  for (const b of [{ r: 231, g: 111, b: 81 }, { r: 20, g: 30, b: 80 }, { r: 250, g: 240, b: 200 }, { r: 120, g: 120, b: 120 }]) {
    const set = P.generate(b, { wheel: 'ryb', size: 5 }).flatMap((x) => x.palettes).find((p) => p.id === 'contrast');
    const [, text, ...partners] = set.colors;
    assert.ok(C.contrast(text, b) >= 4.5 - 0.05, `text AA on ${C.toHex(b)}: ${text.hex} = ${C.contrast(text, b).toFixed(2)}`);
    for (const c of partners) assert.ok(C.contrast(c, b) >= 3 - 0.05, `3:1 against ${C.toHex(b)}: ${c.hex} = ${C.contrast(c, b).toFixed(2)}`);
  }
  // scale is light → dark and places the base exactly once
  const sc = g.scale.colors.map((c) => C.rgbToOklab(c).L);
  for (let i = 1; i < sc.length; i++) assert.ok(sc[i] < sc[i - 1] + 1e-9);
  assert.equal(g.scale.colors.filter((c) => c.isBase).length, 1);
  // greys: hue-based palettes collapse to the same grey rather than throwing
  const grey = P.generate({ r: 128, g: 128, b: 128 }, { wheel: 'ryb', size: 5 }).flatMap((x) => x.palettes);
  assert.ok(grey.length > 10);
});
