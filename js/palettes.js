/*
 * Palette generators.
 *
 * generate(baseRgb, { wheel, size, spread }) → groups of palettes.
 *
 * `wheel` decides what "rotate the hue by 180°" means:
 *   ryb    – the painter's wheel (red/yellow/blue primaries). Complement of red is green.
 *   hsl    – the screen wheel (red/green/blue primaries). Complement of red is cyan.
 *   oklch  – a perceptual wheel: hue moves, lightness stays put.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./color.js'));
  else root.Palettes = factory(root.Colour);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  const { clamp, mod } = C;

  /* ---------- wheels ---------- */

  // [RYB hue, RGB hue] control points, piecewise-linear between them.
  const RYB_TABLE = [
    [0, 0], [30, 15], [60, 30], [90, 45], [120, 60], [150, 90], [180, 120],
    [210, 180], [240, 240], [270, 262], [300, 275], [330, 320], [360, 360],
  ];

  function interp(x, from, to) {
    x = mod(x, 360);
    for (let i = 0; i < RYB_TABLE.length - 1; i++) {
      const a = RYB_TABLE[i], b = RYB_TABLE[i + 1];
      if (x >= a[from] && x <= b[from]) {
        const t = b[from] === a[from] ? 0 : (x - a[from]) / (b[from] - a[from]);
        return a[to] + t * (b[to] - a[to]);
      }
    }
    return x;
  }

  const rgbHueToRyb = (h) => interp(h, 1, 0);
  const rybHueToRgb = (h) => interp(h, 0, 1);

  /** Rotate a colour around the chosen wheel by `angle` degrees (clockwise). */
  function rotate(rgb, angle, wheel) {
    if (!angle) return { ...rgb };
    if (wheel === 'oklch') {
      const o = C.rgbToOklch(rgb);
      return C.oklchToRgb(o.L, o.C, o.h + angle);
    }
    const hsl = C.rgbToHsl(rgb);
    const h = wheel === 'ryb' ? rybHueToRgb(rgbHueToRyb(hsl.h) + angle) : hsl.h + angle;
    return C.hslToRgb({ h, s: hsl.s, l: hsl.l });
  }

  /* ---------- swatches ---------- */

  function sw(rgb, extra) {
    const p = C.rgb8(rgb);
    return { ...p, hex: C.toHex(p), ...extra };
  }

  const ratio = (a, b) => (Math.round(C.contrast(a, b) * 10) / 10).toFixed(1) + ':1';

  /* ---------- builders ---------- */

  function harmony(base, wheel, angles, roles) {
    return angles.map((a, i) =>
      sw(a === 0 ? base : rotate(base, a, wheel), {
        angle: a,
        isBase: a === 0,
        role: roles ? roles[i] : undefined,
      })
    );
  }

  function analogousAngles(n, spread) {
    const centre = Math.floor((n - 1) / 2);
    return Array.from({ length: n }, (_, i) => (i - centre) * spread);
  }

  function lightnessRamp(base, n) {
    const o = C.rgbToOklch(base);
    const lo = 0.22, hi = 0.96;
    // Put the base where its own lightness falls, then space the rest evenly on each side of it.
    let k = Math.round(((hi - o.L) / (hi - lo)) * (n - 1));
    k = clamp(k, n > 2 ? 1 : 0, n > 2 ? n - 2 : n - 1);
    const L0 = clamp(o.L, lo + 0.02, hi - 0.02);
    return Array.from({ length: n }, (_, i) => {
      if (i === k) return sw(base, { isBase: true });
      const L = i < k ? hi - ((hi - L0) * i) / k : L0 - ((L0 - lo) * (i - k)) / (n - 1 - k);
      return sw(C.oklchToRgb(L, o.C, o.h));
    });
  }

  function mixRamp(base, target, n, maxT) {
    return Array.from({ length: n }, (_, i) => {
      const t = n === 1 ? 0 : (i / (n - 1)) * maxT;
      return i === 0 ? sw(base, { isBase: true }) : sw(C.mix(base, target, t));
    });
  }

  function toneRamp(base, n) {
    const o = C.rgbToOklch(base);
    return Array.from({ length: n }, (_, i) => {
      const t = n === 1 ? 0 : (i / (n - 1)) * 0.9;
      return i === 0 ? sw(base, { isBase: true }) : sw(C.oklchToRgb(o.L, o.C * (1 - t), o.h));
    });
  }

  /** Sample n colours along a multi-stop path, interpolating hue-aware in OKLCH. */
  function gradient(stops, n) {
    const segs = stops.length - 1;
    return Array.from({ length: n }, (_, i) => {
      const u = n === 1 ? 0 : (i / (n - 1)) * segs;
      const s = Math.min(Math.floor(u), segs - 1);
      return C.mixHue(stops[s], stops[s + 1], u - s);
    });
  }

  function moods(base) {
    const o = C.rgbToOklch(base);
    const chromatic = o.C > 0.012;
    const sat = chromatic ? clamp(o.C / Math.max(C.maxChroma(o.L, o.h), 1e-4), 0, 1) : 0;
    const at = (L, share) => {
      const Lc = clamp(L, 0.05, 0.98);
      return C.oklchToRgb(Lc, C.maxChroma(Lc, o.h) * share, o.h);
    };
    const vibL = clamp(o.L, 0.5, 0.78);
    return [
      sw(at(0.91, sat * 0.5), { role: 'Pastel' }),
      sw(at(o.L, sat * 0.35), { role: 'Muted' }),
      sw(base, { role: 'Yours', isBase: true }),
      sw(at(vibL, chromatic ? 0.95 : 0), { role: 'Vibrant' }),
      sw(at(o.L * 0.55, Math.min(1, sat * 1.1)), { role: 'Deep' }),
    ];
  }

  /** Very low-chroma neutral in the base's hue. */
  function neutralChroma(o) {
    return o.C < 0.01 ? 0 : clamp(o.C * 0.15, 0.006, 0.035);
  }

  function tintedNeutrals(base, n) {
    const o = C.rgbToOklch(base);
    const Cn = neutralChroma(o);
    return Array.from({ length: n }, (_, i) =>
      sw(C.oklchToRgb(0.97 - (0.77 * i) / (n - 1), Cn, o.h))
    );
  }

  function uiPalette(base, wheel) {
    const o = C.rgbToOklch(base);
    const Cn = neutralChroma(o);
    return [
      sw(C.oklchToRgb(0.975, Cn, o.h), { role: 'Background · 60%' }),
      sw(base, { role: 'Primary · 30%', isBase: true }),
      sw(rotate(base, 180, wheel), { role: 'Accent · 10%' }),
      sw(C.oklchToRgb(0.93, Cn * 1.3, o.h), { role: 'Surface' }),
      sw(C.oklchToRgb(0.24, Cn * 1.5, o.h), { role: 'Text' }),
    ];
  }

  const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const SCALE_L = [0.975, 0.94, 0.89, 0.82, 0.72, 0.63, 0.55, 0.47, 0.4, 0.33, 0.24];
  const SCALE_C = [0.12, 0.28, 0.5, 0.72, 0.9, 1, 1, 0.92, 0.8, 0.66, 0.5];

  function scale(base) {
    const o = C.rgbToOklch(base);
    let k = 0, best = Infinity;
    SCALE_L.forEach((L, i) => {
      const d = Math.abs(L - o.L);
      if (d < best) { best = d; k = i; }
    });
    return SCALE_STEPS.map((step, i) =>
      i === k
        ? sw(base, { role: String(step), isBase: true })
        : sw(C.oklchToRgb(SCALE_L[i], o.C * SCALE_C[i], o.h), { role: String(step) })
    );
  }

  /** The nearest colour along the lightness axis that clears `target` contrast against `bg`. */
  function accessible(bg, start, target) {
    const o = C.rgbToOklch(start);
    const lighter = C.bestText(bg) === C.WHITE;
    const step = lighter ? 0.02 : -0.02;
    const end = lighter ? 1 : 0; // pure white/black always clears 4.5:1 on any base
    let L = o.L;
    for (let guard = 0; guard < 60; guard++) {
      const cand = C.oklchToRgb(L, o.C, o.h);
      if (C.contrast(cand, bg) >= target) return cand;
      if ((lighter && L >= end) || (!lighter && L <= end)) return cand;
      L += step;
    }
    return C.oklchToRgb(end, o.C, o.h);
  }

  function contrastSet(base, wheel) {
    const o = C.rgbToOklch(base);
    const Cn = neutralChroma(o);
    const inkStart = C.bestText(base) === C.WHITE
      ? C.oklchToRgb(0.985, Cn, o.h)
      : C.oklchToRgb(0.2, Cn, o.h);
    const ink = accessible(base, inkStart, 4.5);
    const a = accessible(base, rotate(base, 180, wheel), 3);
    const b = accessible(base, rotate(base, 120, wheel), 3);
    return [
      sw(base, { role: 'Yours', isBase: true }),
      sw(ink, { role: `Text · ${ratio(ink, base)}` }),
      sw(a, { role: `Complement · ${ratio(a, base)}` }),
      sw(b, { role: `Triad · ${ratio(b, base)}` }),
    ];
  }

  /* ---------- public ---------- */

  function generate(baseRgb, opts = {}) {
    const wheel = opts.wheel || 'ryb';
    const n = clamp(Math.round(opts.size || 5), 2, 12);
    const spread = clamp(opts.spread || 30, 5, 90);
    const base = C.rgb8(baseRgb);
    const H = (id, name, desc, angles, extra = {}) => ({
      id, name, desc,
      colors: harmony(base, wheel, angles),
      wheel: { angles, closed: !!extra.closed },
    });
    const S = (id, name, desc, colors) => ({ id, name, desc, colors });

    const aAngles = analogousAngles(n, spread);
    const glideA = rotate(base, -40, 'oklch');
    const glideB = rotate(base, 40, 'oklch');

    return [
      {
        id: 'harmonies',
        title: 'Colour harmonies',
        desc: 'Classic relationships on the colour wheel.',
        palettes: [
          H('complementary', 'Complementary',
            'Opposites on the wheel. Maximum contrast and energy — let one lead and use the other sparingly.',
            [0, 180]),
          H('split', 'Split complementary',
            'Your colour plus the two neighbours of its complement. Strong contrast with less tension.',
            [0, 150, 210], { closed: true }),
          H('analogous', 'Analogous',
            'Neighbours on the wheel. Calm, cohesive and natural. Adjust the spread to taste.',
            aAngles),
          H('accented', 'Accented analogous',
            'A calm analogous trio with the complement as a single pop of contrast.',
            [-30, 0, 30, 180]),
          H('triadic', 'Triadic',
            'Three colours evenly spaced. Vibrant yet balanced — pick one to dominate.',
            [0, 120, 240], { closed: true }),
          H('tetradic', 'Tetradic (rectangle)',
            'Two complementary pairs. Rich and varied; works best with one clear dominant colour.',
            [0, 60, 180, 240], { closed: true }),
          H('square', 'Square',
            'Four colours evenly spaced. Bold and playful; balance warm against cool.',
            [0, 90, 180, 270], { closed: true }),
        ],
      },
      {
        id: 'scales',
        title: 'Scales & variations',
        desc: 'One hue, explored along lightness and intensity.',
        palettes: [
          S('mono', 'Monochromatic',
            'A single hue stepped through lightness. Always harmonious.',
            lightnessRamp(base, n)),
          S('tints', 'Tints',
            'Your colour mixed with white — lighter and softer.',
            mixRamp(base, C.WHITE, n, 0.85)),
          S('shades', 'Shades',
            'Your colour mixed with black — deeper and moodier.',
            mixRamp(base, C.BLACK, n, 0.8)),
          S('tones', 'Tones',
            'Same lightness, less intensity — the colour as it fades towards grey.',
            toneRamp(base, n)),
          S('moods', 'Moods',
            'The same hue with a different personality: pastel to deep.',
            moods(base)),
        ],
      },
      {
        id: 'gradients',
        title: 'Gradients',
        desc: 'Smooth blends, interpolated in OKLCH so they stay lively.',
        palettes: [
          S('grad-comp', 'To complement',
            'From your colour across the wheel to its opposite.',
            gradient([base, rotate(base, 180, wheel)], n).map((c, i) =>
              sw(c, { isBase: i === 0 }))),
          S('grad-glide', 'Analogous glide',
            'A gentle sweep through the neighbouring hues — good for backgrounds.',
            gradient([glideA, base, glideB], n).map((c) => sw(c))),
        ],
      },
      {
        id: 'design',
        title: 'Design systems & accessibility',
        desc: 'Practical palettes for interfaces, print and layouts.',
        palettes: [
          S('ui', 'Interface 60-30-10',
            'A classic proportion: 60% neutral background, 30% your primary, 10% accent.',
            uiPalette(base, wheel)),
          S('scale', 'UI scale 50–950',
            'An 11-step ramp for buttons, borders and backgrounds. Your colour sits at its nearest step.',
            scale(base)),
          S('neutrals', 'Tinted neutrals',
            'Greys with a hint of your hue — for backgrounds, borders and body text.',
            tintedNeutrals(base, n)),
          S('contrast', 'Accessible partners',
            'Text that reaches WCAG AA (4.5:1) on your colour, plus companions that clear the 3:1 needed for large text and UI elements.',
            contrastSet(base, wheel)),
        ],
      },
    ];
  }

  return { generate, rotate, rgbHueToRyb, rybHueToRgb, accessible };
});
