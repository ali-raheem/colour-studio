/*
 * Colour maths: conversions, parsing, formatting, contrast, mixing.
 *
 * Plain script (no modules) so the app also works when index.html is opened
 * straight from disk. Exposes `Colour` in the browser, module.exports in Node.
 *
 * Conventions
 *   rgb   {r,g,b}     0–255 (floats allowed internally; use rgb8() to round)
 *   hsv   {h,s,v}     h 0–360, s/v 0–1
 *   hsl   {h,s,l}     h 0–360, s/l 0–1
 *   oklch {L,C,h}     L 0–1, C ≈ 0–0.4, h 0–360
 *   lab   {L,a,b}     CIE Lab, D50 (matches CSS lab() and Photoshop)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Colour = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const mod = (x, n) => ((x % n) + n) % n;
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const round = (x, d = 0) => {
    const p = 10 ** d;
    return Math.round(x * p) / p;
  };

  /* ---------- sRGB helpers ---------- */

  function rgb8({ r, g, b }) {
    return {
      r: clamp(Math.round(r), 0, 255),
      g: clamp(Math.round(g), 0, 255),
      b: clamp(Math.round(b), 0, 255),
    };
  }

  function toLinear(c8) {
    const c = c8 / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function fromLinear(l) {
    const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
    return c * 255;
  }

  /* ---------- HSV / HSL / HWB / CMYK ---------- */

  function hueOf(r, g, b, max, d) {
    if (!d) return 0;
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return mod(h * 60, 360);
  }

  function fromHueChroma(h, c, m) {
    const hp = mod(h, 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    switch (Math.floor(hp)) {
      case 0: r = c; g = x; break;
      case 1: r = x; g = c; break;
      case 2: g = c; b = x; break;
      case 3: g = x; b = c; break;
      case 4: r = x; b = c; break;
      default: r = c; b = x; break;
    }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  function rgbToHsv({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    return { h: hueOf(r, g, b, max, d), s: max ? d / max : 0, v: max };
  }

  function hsvToRgb({ h, s, v }) {
    const c = v * s;
    return fromHueChroma(h, c, v - c);
  }

  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return { h: hueOf(r, g, b, max, d), s: clamp(s, 0, 1), l };
  }

  function hslToRgb({ h, s, l }) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    return fromHueChroma(h, c, l - c / 2);
  }

  function rgbToHwb(rgb) {
    const { h } = rgbToHsv(rgb);
    return {
      h,
      w: Math.min(rgb.r, rgb.g, rgb.b) / 255,
      b: 1 - Math.max(rgb.r, rgb.g, rgb.b) / 255,
    };
  }

  function hwbToRgb({ h, w, b }) {
    if (w + b >= 1) {
      const g = (w / (w + b)) * 255;
      return { r: g, g, b: g };
    }
    const p = fromHueChroma(h, 1, 0);
    const f = 1 - w - b;
    return { r: p.r * f + w * 255, g: p.g * f + w * 255, b: p.b * f + w * 255 };
  }

  function rgbToCmyk({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 };
    return {
      c: (1 - r - k) / (1 - k),
      m: (1 - g - k) / (1 - k),
      y: (1 - b - k) / (1 - k),
      k,
    };
  }

  function cmykToRgb({ c, m, y, k }) {
    return {
      r: 255 * (1 - c) * (1 - k),
      g: 255 * (1 - m) * (1 - k),
      b: 255 * (1 - y) * (1 - k),
    };
  }

  /* ---------- CIE Lab / LCH (D50) ---------- */

  const D50 = { x: 0.96422, y: 1.0, z: 0.82521 };
  const EPS = 216 / 24389;
  const KAPPA = 24389 / 27;

  function rgbToXyz50({ r, g, b }) {
    const R = toLinear(r), G = toLinear(g), B = toLinear(b);
    return {
      x: 0.4360747 * R + 0.3850649 * G + 0.1430804 * B,
      y: 0.2225045 * R + 0.7168786 * G + 0.0606169 * B,
      z: 0.0139322 * R + 0.0971045 * G + 0.7141733 * B,
    };
  }

  function xyz50ToRgb({ x, y, z }) {
    return {
      r: fromLinear(3.1338561 * x - 1.6168667 * y - 0.4906146 * z),
      g: fromLinear(-0.9787684 * x + 1.9161415 * y + 0.033454 * z),
      b: fromLinear(0.0719453 * x - 0.2289914 * y + 1.4052427 * z),
    };
  }

  function rgbToLab(rgb) {
    const { x, y, z } = rgbToXyz50(rgb);
    const f = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
    const fx = f(x / D50.x), fy = f(y / D50.y), fz = f(z / D50.z);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }

  function labToRgb({ L, a, b }) {
    const fy = (L + 16) / 116;
    const fx = a / 500 + fy;
    const fz = fy - b / 200;
    const fx3 = fx ** 3, fz3 = fz ** 3;
    const xr = fx3 > EPS ? fx3 : (116 * fx - 16) / KAPPA;
    const yr = L > KAPPA * EPS ? fy ** 3 : L / KAPPA;
    const zr = fz3 > EPS ? fz3 : (116 * fz - 16) / KAPPA;
    return clampRgb(xyz50ToRgb({ x: xr * D50.x, y: yr * D50.y, z: zr * D50.z }));
  }

  function labToLch({ L, a, b }) {
    const c = Math.hypot(a, b);
    return { L, C: c, h: c < 1e-4 ? 0 : mod(deg(Math.atan2(b, a)), 360) };
  }

  function lchToLab({ L, C, h }) {
    return { L, a: C * Math.cos(rad(h)), b: C * Math.sin(rad(h)) };
  }

  const rgbToLch = (rgb) => labToLch(rgbToLab(rgb));
  const lchToRgb = (lch) => labToRgb(lchToLab(lch));

  /* ---------- OKLab / OKLCH ---------- */

  function linearToOklab(R, G, B) {
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return {
      L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    };
  }

  function oklabToLinear({ L, a, b }) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  }

  function rgbToOklab(rgb) {
    return linearToOklab(toLinear(rgb.r), toLinear(rgb.g), toLinear(rgb.b));
  }

  function oklabToRgb(lab) {
    const [r, g, b] = oklabToLinear(lab);
    return clampRgb({ r: fromLinear(r), g: fromLinear(g), b: fromLinear(b) });
  }

  function rgbToOklch(rgb) {
    const { L, a, b } = rgbToOklab(rgb);
    const C = Math.hypot(a, b);
    return { L, C, h: C < 2e-4 ? 0 : mod(deg(Math.atan2(b, a)), 360) };
  }

  const oklchToLinear = (L, C, h) =>
    oklabToLinear({ L, a: C * Math.cos(rad(h)), b: C * Math.sin(rad(h)) });

  const inGamut = (lin) => lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

  function clampRgb({ r, g, b }) {
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) };
  }

  /** OKLCH → sRGB. Out-of-gamut colours have their chroma reduced (hue and lightness kept). */
  function oklchToRgb(L, Cc, h) {
    L = clamp(L, 0, 1);
    Cc = Math.max(0, Cc);
    let lin = oklchToLinear(L, Cc, h);
    if (!inGamut(lin)) {
      let lo = 0, hi = Cc;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (inGamut(oklchToLinear(L, mid, h))) lo = mid;
        else hi = mid;
      }
      lin = oklchToLinear(L, lo, h);
    }
    return clampRgb({ r: fromLinear(lin[0]), g: fromLinear(lin[1]), b: fromLinear(lin[2]) });
  }

  /** Largest chroma that still fits inside sRGB at this lightness and hue. */
  function maxChroma(L, h) {
    let lo = 0, hi = 0.4;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear(L, mid, h))) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Mix in OKLab: perceptually even, no muddy midpoints from sRGB maths. */
  function mix(a, b, t) {
    const A = rgbToOklab(a), B = rgbToOklab(b);
    return oklabToRgb({
      L: A.L + (B.L - A.L) * t,
      a: A.a + (B.a - A.a) * t,
      b: A.b + (B.b - A.b) * t,
    });
  }

  /** Mix in OKLCH along the shorter hue arc — keeps saturation through hue changes. */
  function mixHue(a, b, t) {
    const A = rgbToOklch(a), B = rgbToOklch(b);
    let ha = A.h, hb = B.h;
    if (A.C < 0.01) ha = hb;
    else if (B.C < 0.01) hb = ha;
    let dh = mod(hb - ha + 180, 360) - 180;
    if (Math.abs(dh) > 179.999) dh = 180;
    return oklchToRgb(A.L + (B.L - A.L) * t, A.C + (B.C - A.C) * t, ha + dh * t);
  }

  /* ---------- Contrast & difference ---------- */

  function luminance({ r, g, b }) {
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  const WHITE = { r: 255, g: 255, b: 255 };
  const BLACK = { r: 0, g: 0, b: 0 };

  function bestText(bg) {
    return contrast(bg, WHITE) >= contrast(bg, BLACK) ? WHITE : BLACK;
  }

  /** CIEDE2000 between two Lab colours (Sharma, Wu & Dalal 2005). */
  function deltaE2000(l1, l2) {
    const avgLp = (l1.L + l2.L) / 2;
    const c1 = Math.hypot(l1.a, l1.b), c2 = Math.hypot(l2.a, l2.b);
    const avgC = (c1 + c2) / 2;
    const G = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
    const a1p = (1 + G) * l1.a, a2p = (1 + G) * l2.a;
    const c1p = Math.hypot(a1p, l1.b), c2p = Math.hypot(a2p, l2.b);
    const avgCp = (c1p + c2p) / 2;
    const h1p = c1p === 0 ? 0 : mod(deg(Math.atan2(l1.b, a1p)), 360);
    const h2p = c2p === 0 ? 0 : mod(deg(Math.atan2(l2.b, a2p)), 360);

    let dhp = 0;
    if (c1p * c2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    let avgHp = h1p + h2p;
    if (c1p * c2p !== 0) {
      avgHp = Math.abs(h1p - h2p) > 180 ? (avgHp + (avgHp < 360 ? 360 : -360)) / 2 : avgHp / 2;
    }

    const T =
      1 - 0.17 * Math.cos(rad(avgHp - 30)) + 0.24 * Math.cos(rad(2 * avgHp)) +
      0.32 * Math.cos(rad(3 * avgHp + 6)) - 0.2 * Math.cos(rad(4 * avgHp - 63));
    const dLp = l2.L - l1.L;
    const dCp = c2p - c1p;
    const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp / 2));
    const SL = 1 + (0.015 * (avgLp - 50) ** 2) / Math.sqrt(20 + (avgLp - 50) ** 2);
    const SC = 1 + 0.045 * avgCp;
    const SH = 1 + 0.015 * avgCp * T;
    const dTheta = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2));
    const RC = 2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7));
    const RT = -Math.sin(rad(2 * dTheta)) * RC;
    return Math.sqrt(
      (dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH)
    );
  }

  /* ---------- Formatting ---------- */

  const hex2 = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0').toUpperCase();
  const toHex = (rgb) => '#' + hex2(rgb.r) + hex2(rgb.g) + hex2(rgb.b);
  const pct = (x, d = 0) => round(x * 100, d) + '%';
  const n1 = (x) => round(x, 1) + 0; // "+ 0" turns -0 into 0

  const FORMATTERS = {
    hex: (c) => toHex(c),
    rgb: (c) => {
      const p = rgb8(c);
      return `rgb(${p.r}, ${p.g}, ${p.b})`;
    },
    hsl: (c) => {
      const v = rgbToHsl(rgb8(c));
      return `hsl(${round(v.h)}, ${pct(v.s)}, ${pct(v.l)})`;
    },
    hsv: (c) => {
      const v = rgbToHsv(rgb8(c));
      return `hsv(${round(v.h)}, ${pct(v.s)}, ${pct(v.v)})`;
    },
    hwb: (c) => {
      const v = rgbToHwb(rgb8(c));
      return `hwb(${round(v.h)} ${pct(v.w)} ${pct(v.b)})`;
    },
    cmyk: (c) => {
      const v = rgbToCmyk(rgb8(c));
      return `cmyk(${pct(v.c)}, ${pct(v.m)}, ${pct(v.y)}, ${pct(v.k)})`;
    },
    lab: (c) => {
      const v = rgbToLab(rgb8(c));
      return `lab(${n1(v.L)} ${n1(v.a)} ${n1(v.b)})`;
    },
    lch: (c) => {
      const v = rgbToLch(rgb8(c));
      return `lch(${n1(v.L)} ${n1(v.C)} ${n1(v.h)})`;
    },
    oklch: (c) => {
      const v = rgbToOklch(rgb8(c));
      return `oklch(${pct(v.L, 1)} ${round(v.C, 3)} ${n1(v.h)})`;
    },
    decimal: (c) => String((rgb8(c).r << 16) | (rgb8(c).g << 8) | rgb8(c).b),
  };

  const format = (id, rgb) => FORMATTERS[id](rgb);

  /* ---------- Parsing ---------- */

  const NUM = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|°)?$/;

  function tokens(argString) {
    const out = [];
    for (const t of argString.split(/[\s,/]+/).filter(Boolean)) {
      const m = NUM.exec(t);
      if (!m) return null;
      out.push({ v: parseFloat(m[1]), pct: m[2] === '%' });
    }
    return out;
  }

  const fromHexDigits = (d) => {
    if (d.length === 3 || d.length === 4) d = [...d.slice(0, 3)].map((c) => c + c).join('');
    else d = d.slice(0, 6);
    const n = parseInt(d, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  /**
   * Parse a colour string. Understands #hex, rgb(), hsl(), hsv()/hsb(), hwb(),
   * cmyk(), lab(), lch(), oklch(). `context` names the field being edited, so
   * bare numbers ("255 128 0") are read in that model. Returns {r,g,b} or null.
   * Named colours live in names.js.
   */
  function parse(input, context) {
    if (input == null) return null;
    const s = String(input).trim().toLowerCase();
    if (!s) return null;

    if (context === 'decimal') {
      if (!/^\d{1,8}$/.test(s)) return null;
      const n = parseInt(s, 10);
      if (n > 0xffffff) return null;
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    const hex = /^(?:#|0x)?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
    if (hex && (context === 'hex' || context === undefined || s[0] === '#')) {
      return fromHexDigits(hex[1]);
    }

    let name, args;
    const fn = /^([a-z]+)\s*\(([^)]*)\)$/.exec(s);
    if (fn) {
      name = fn[1];
      args = fn[2];
    } else if (context && /^[\d\s,.%+\-/deg°]+$/.test(s)) {
      name = context;
      args = s;
    } else {
      return null;
    }

    const t = tokens(args);
    if (!t) return null;
    const need = name === 'cmyk' ? 4 : 3;
    if (t.length < need) return null;

    const unit = (x, full) => (x.pct ? (x.v / 100) * full : x.v);
    const frac = (x) => clamp(x.v / 100, 0, 1);

    switch (name) {
      case 'rgb':
      case 'rgba':
        return clampRgb({ r: unit(t[0], 255), g: unit(t[1], 255), b: unit(t[2], 255) });
      case 'hsl':
      case 'hsla':
        return clampRgb(hslToRgb({ h: t[0].v, s: frac(t[1]), l: frac(t[2]) }));
      case 'hsv':
      case 'hsb':
        return clampRgb(hsvToRgb({ h: t[0].v, s: frac(t[1]), v: frac(t[2]) }));
      case 'hwb':
        return clampRgb(hwbToRgb({ h: t[0].v, w: frac(t[1]), b: frac(t[2]) }));
      case 'cmyk':
        return clampRgb(cmykToRgb({ c: frac(t[0]), m: frac(t[1]), y: frac(t[2]), k: frac(t[3]) }));
      case 'lab':
        return labToRgb({ L: clamp(t[0].v, 0, 100), a: t[1].v, b: t[2].v });
      case 'lch':
        return lchToRgb({ L: clamp(t[0].v, 0, 100), C: Math.max(0, t[1].v), h: t[2].v });
      case 'oklch': {
        const L = t[0].pct || t[0].v > 1 ? t[0].v / 100 : t[0].v;
        const Cv = t[1].pct ? (t[1].v / 100) * 0.4 : t[1].v;
        return oklchToRgb(L, Cv, t[2].v);
      }
      default:
        return null;
    }
  }

  return {
    clamp, mod, round, rgb8, toHex, format, parse,
    toLinear, fromLinear,
    rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb, rgbToHwb, hwbToRgb, rgbToCmyk, cmykToRgb,
    rgbToLab, labToRgb, rgbToLch, lchToRgb,
    rgbToOklab, oklabToRgb, rgbToOklch, oklchToRgb, maxChroma,
    mix, mixHue, luminance, contrast, bestText, deltaE2000, WHITE, BLACK,
  };
});
