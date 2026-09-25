/* Colour Studio — UI. Depends on Colour (color.js), Names (names.js), Palettes (palettes.js). */
(function () {
  'use strict';

  const C = window.Colour;
  const N = window.Names;
  const P = window.Palettes;

  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- storage (best effort: private windows can throw) ---------- */

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('colour-studio:' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem('colour-studio:' + key, JSON.stringify(value)); } catch (_) { /* ignore */ }
    },
  };

  /* ---------- state ---------- */

  const WHEELS = ['ryb', 'hsl', 'oklch'];
  const SIZES = [3, 4, 5, 6, 7, 9, 12];
  const DEFAULT_HEX = '#E76F51';

  const state = { h: 0, s: 0, v: 0, wheel: 'ryb', size: 5, spread: 30, saved: [] };

  function setFromRgb(rgb) {
    const p = C.rgbToHsv(C.rgb8(rgb));
    // Greys and black have no meaningful hue/saturation: keep what the user had.
    if (p.v < 1e-6) { p.h = state.h; p.s = state.s; }
    else if (p.s < 1e-6) p.h = state.h;
    state.h = p.h; state.s = p.s; state.v = p.v;
  }

  const getRgb = () => C.rgb8(C.hsvToRgb(state));
  const getHex = () => C.toHex(getRgb());

  function loadInitialState() {
    const prefs = store.get('prefs', {});
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const pickNum = (raw, list, fallback) => {
      const n = Number(raw);
      return list.includes(n) ? n : fallback;
    };

    const wheel = params.get('w') || prefs.wheel;
    state.wheel = WHEELS.includes(wheel) ? wheel : 'ryb';
    state.size = pickNum(params.get('n') || prefs.size, SIZES, 5);
    const spread = Number(params.get('a') || prefs.spread);
    state.spread = spread >= 10 && spread <= 60 ? Math.round(spread / 5) * 5 : 30;

    const saved = store.get('saved', []);
    state.saved = Array.isArray(saved) ? saved.filter((h) => /^#[0-9A-F]{6}$/.test(h)).slice(0, 30) : [];

    const rgb = C.parse(params.get('c') || '') || C.parse(prefs.hex || '') || C.parse(DEFAULT_HEX);
    setFromRgb(rgb);
  }

  /* ---------- toast & clipboard ---------- */

  const toastEl = $('#toast');
  let toastTimer = 0;

  function toast(message, action, ms = 2200) {
    toastEl.replaceChildren();
    const span = document.createElement('span');
    span.textContent = message;
    toastEl.append(span);
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', () => { hideToast(); action.run(); });
      toastEl.append(b);
    }
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? Math.max(ms, 5000) : ms);
  }
  function hideToast() {
    toastEl.classList.remove('show');
  }

  async function copyText(text, label) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.append(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
      ta.remove();
    }
    toast(ok ? `Copied ${label || text}` : 'Copy failed — select the text and copy manually');
  }

  /* ---------- fields ---------- */

  const FIELDS = [
    { id: 'hex', label: 'HEX' },
    { id: 'rgb', label: 'RGB' },
    { id: 'hsl', label: 'HSL' },
    { id: 'hsv', label: 'HSV' },
    { id: 'hwb', label: 'HWB' },
    { id: 'cmyk', label: 'CMYK' },
    { id: 'lab', label: 'LAB' },
    { id: 'lch', label: 'LCH' },
    { id: 'oklch', label: 'OKLCH' },
    { id: 'decimal', label: 'INT' },
  ];

  const valuesEl = $('#values');
  const inputs = {};

  for (const f of FIELDS) {
    const row = document.createElement('div');
    row.className = 'value-row';
    row.innerHTML =
      `<label for="f-${f.id}">${f.label}</label>` +
      `<input id="f-${f.id}" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off">` +
      `<button type="button" class="copy-btn" data-field="${f.id}" aria-label="Copy ${f.label}" title="Copy ${f.label}">` +
      `<svg class="ico"><use href="#i-copy"/></svg></button>`;
    valuesEl.append(row);
    inputs[f.id] = $('input', row);
  }

  function commitField(id, text, final) {
    const input = inputs[id];
    const t = text.trim();
    if (!t) { input.removeAttribute('aria-invalid'); return false; }
    // Don't jump around on partial hex while typing: wait for 6 digits or a name (or Enter/blur).
    if (id === 'hex' && !final && /^#?[0-9a-f]{0,5}$/i.test(t)) return false;
    const rgb = C.parse(t, id) || N.lookup(t);
    if (!rgb) {
      if (final || id !== 'hex') input.setAttribute('aria-invalid', 'true');
      return false;
    }
    input.removeAttribute('aria-invalid');
    setFromRgb(rgb);
    scheduleRender(id);
    return true;
  }

  for (const f of FIELDS) {
    const input = inputs[f.id];
    input.addEventListener('input', () => commitField(f.id, input.value, false));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    input.addEventListener('blur', () => {
      commitField(f.id, input.value, true);
      input.value = C.format(f.id, getRgb());
      input.removeAttribute('aria-invalid');
    });
    input.addEventListener('focus', () => input.select());
  }

  valuesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const id = btn.dataset.field;
    copyText(C.format(id, getRgb()), FIELDS.find((f) => f.id === id).label);
  });

  /* ---------- picker ---------- */

  const sv = $('#sv');
  const svThumb = $('#sv-thumb');
  const hueInput = $('#hue');
  const nativeInput = $('#native');
  const previewEl = $('#preview');
  const toolbarChip = $('.toolbar-chip');
  const root = document.documentElement;

  function svFromPointer(e) {
    const r = sv.getBoundingClientRect();
    state.s = C.clamp((e.clientX - r.left) / r.width, 0, 1);
    state.v = 1 - C.clamp((e.clientY - r.top) / r.height, 0, 1);
    scheduleRender();
  }

  sv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    sv.setPointerCapture(e.pointerId);
    sv.focus({ preventScroll: true });
    svFromPointer(e);
    e.preventDefault();
  });
  sv.addEventListener('pointermove', (e) => {
    if (sv.hasPointerCapture(e.pointerId)) svFromPointer(e);
  });

  sv.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const moves = { ArrowLeft: ['s', -step], ArrowRight: ['s', step], ArrowUp: ['v', step], ArrowDown: ['v', -step] };
    const m = moves[e.key];
    if (!m) return;
    state[m[0]] = C.clamp(state[m[0]] + m[1], 0, 1);
    scheduleRender();
    e.preventDefault();
  });

  hueInput.addEventListener('input', () => {
    state.h = Number(hueInput.value);
    scheduleRender();
  });

  nativeInput.addEventListener('input', () => {
    const rgb = C.parse(nativeInput.value);
    if (rgb) { setFromRgb(rgb); scheduleRender(); }
  });

  /** Jump to another colour (from a swatch, name, saved chip…), with a one-step undo. */
  function jumpTo(hex, { undo = true, keyboard = false } = {}) {
    const rgb = C.parse(hex);
    if (!rgb) return;
    const before = { h: state.h, s: state.s, v: state.v };
    const beforeHex = getHex();
    setFromRgb(rgb);
    if (getHex() === beforeHex) return;
    scheduleRender();
    if (keyboard) $('#toolbar-base').focus({ preventScroll: true });
    if (undo) {
      toast(`Now using ${C.toHex(rgb)}`, {
        label: 'Undo',
        run: () => { Object.assign(state, before); scheduleRender(); },
      });
    }
  }

  function randomColour() {
    state.h = Math.random() * 360;
    state.s = 0.4 + Math.random() * 0.5;
    state.v = 0.55 + Math.random() * 0.4;
    scheduleRender();
  }

  $('#random-btn').addEventListener('click', randomColour);
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'r' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable) return;
    randomColour();
  });

  if ('EyeDropper' in window) {
    const eyedropper = $('#eyedropper-btn');
    eyedropper.hidden = false;
    eyedropper.addEventListener('click', async () => {
      try {
        const res = await new window.EyeDropper().open();
        const rgb = C.parse(res.sRGBHex);
        if (rgb) { setFromRgb(rgb); scheduleRender(); }
      } catch (_) { /* cancelled */ }
    });
  }

  /* ---------- saved colours ---------- */

  const savedWrap = $('#saved-wrap');
  const savedList = $('#saved-list');
  const saveBtn = $('#save-btn');

  saveBtn.addEventListener('click', () => {
    const hex = getHex();
    const i = state.saved.indexOf(hex);
    if (i >= 0) state.saved.splice(i, 1);
    else state.saved = [hex, ...state.saved].slice(0, 30);
    store.set('saved', state.saved);
    renderSaved();
    toast(i >= 0 ? `Removed ${hex}` : `Saved ${hex}`);
  });

  $('#clear-saved').addEventListener('click', () => {
    if (!state.saved.length) return;
    const backup = state.saved;
    state.saved = [];
    store.set('saved', state.saved);
    renderSaved();
    toast('Cleared saved colours', {
      label: 'Undo',
      run: () => { state.saved = backup; store.set('saved', backup); renderSaved(); },
    });
  });

  savedList.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) jumpTo(chip.dataset.hex, { undo: false });
  });

  function renderSaved() {
    const hex = getHex();
    const isSaved = state.saved.includes(hex);
    saveBtn.setAttribute('aria-pressed', String(isSaved));
    $('span', saveBtn).textContent = isSaved ? 'Saved' : 'Save';
    savedWrap.hidden = state.saved.length === 0;
    savedList.innerHTML = state.saved
      .map(
        (h) =>
          `<button type="button" class="chip" style="--c:${h}" data-hex="${h}" title="${h}" aria-label="Use saved colour ${h}"${
            h === hex ? ' aria-current="true"' : ''
          }></button>`
      )
      .join('');
  }

  /* ---------- names & contrast ---------- */

  function renderNames(rgb, list) {
    $('#names').innerHTML = list
      .map((e) => {
        const dist = e.dE < 0.05 ? 'exact match' : `ΔE ${e.dE.toFixed(1)}`;
        return (
          `<button type="button" class="name-btn" data-hex="${e.hex}" style="--c:${e.hex}" ` +
          `title="${esc(e.name)} (${e.kind === 'css' ? 'CSS keyword' : 'artist name'})">` +
          `<span class="name-chip"></span><span class="name-text">` +
          `<strong${e.kind === 'css' ? ' class="mono"' : ''}>${esc(e.name)}</strong>` +
          `<small>${e.hex} · ${dist}</small></span></button>`
        );
      })
      .join('');
  }

  function contrastTile(label, fg, bg) {
    const ratio = C.contrast(fg, bg);
    const tests = [
      ['AA', ratio >= 4.5],
      ['AAA', ratio >= 7],
      ['AA large', ratio >= 3],
    ];
    return (
      `<div class="contrast-tile" style="background:${C.toHex(bg)};color:${C.toHex(fg)}">` +
      `<div class="sample">Aa<small>${label}</small></div>` +
      `<div class="ratio">${ratio.toFixed(2)} : 1</div>` +
      `<div class="badges">${tests
        .map(([n, ok]) => `<span class="badge${ok ? '' : ' fail'}">${n} ${ok ? '✓' : '✕'}</span>`)
        .join('')}</div></div>`
    );
  }

  function renderContrast(rgb) {
    $('#contrast').innerHTML =
      contrastTile('White text', C.WHITE, rgb) + contrastTile('Black text', C.BLACK, rgb);
  }

  /* ---------- palettes ---------- */

  const WHEEL_NOTES = {
    ryb: 'Artist wheel (RYB): hues rotate the way painters mix them, so red’s complement is green and orange’s is blue.',
    hsl: 'Digital wheel (RGB): hues rotate around the screen’s RGB wheel, so red’s complement is cyan.',
    oklch: 'Perceptual wheel (OKLCH): hues rotate while perceived lightness stays put, so every colour in a harmony has similar visual weight.',
  };
  const SIZE_NOTE =
    'Also sets how many colours appear in Analogous (above) and in Tinted neutrals and both gradients (further down).';

  let palettesById = {};

  const inkFor = (c) => (C.bestText(c) === C.WHITE ? '#fff' : '#000');

  function swatchHtml(c) {
    const label = c.role ? `${c.hex}, ${c.role}` : c.hex;
    return (
      `<div class="sw${c.isBase ? ' is-base' : ''}" style="--c:${c.hex};--ink:${inkFor(c)}">` +
      `<button type="button" class="sw-use" data-hex="${c.hex}" aria-label="Use ${esc(label)} as your colour">` +
      `<span class="sw-hex">${c.hex}</span>${c.role ? `<span class="sw-role">${esc(c.role)}</span>` : ''}</button>` +
      `<button type="button" class="sw-copy" data-copy="${c.hex}" aria-label="Copy ${c.hex}" title="Copy ${c.hex}">` +
      `<svg class="ico"><use href="#i-copy"/></svg></button></div>`
    );
  }
  const swatchesHtml = (p) => p.colors.map(swatchHtml).join('');

  // Hue ring: 24 sectors, the base colour at the top, rotating clockwise.
  const RING_N = 24;
  const ringColours = (rgb, wheel) =>
    Array.from({ length: RING_N }, (_, i) => C.toHex(C.rgb8(P.rotate(rgb, (i * 360) / RING_N, wheel))));

  function ringSectors(colours) {
    const cx = 32, cy = 32, R = 29, r = 18, step = 360 / RING_N;
    const pt = (rad, a) => [cx + rad * Math.sin((a * Math.PI) / 180), cy - rad * Math.cos((a * Math.PI) / 180)];
    return colours
      .map((fill, i) => {
        const a0 = i * step - step / 2 - 0.4, a1 = i * step + step / 2 + 0.4;
        const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [x2, y2] = pt(r, a1), [x3, y3] = pt(r, a0);
        return (
          `<path fill="${fill}" d="M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}` +
          `L${x2.toFixed(2)} ${y2.toFixed(2)}A${r} ${r} 0 0 0 ${x3.toFixed(2)} ${y3.toFixed(2)}Z"/>`
        );
      })
      .join('');
  }

  function wheelSvg(p, sectorsSvg) {
    const pos = (a) => {
      const t = (a * Math.PI) / 180;
      return [32 + 23.5 * Math.sin(t), 32 - 23.5 * Math.cos(t)];
    };
    const pts = p.wheel.angles.map(pos);
    const list = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const shape =
      pts.length >= 3 && p.wheel.closed
        ? `<polygon points="${list}"/>`
        : `<polyline points="${list}"/>`;
    const dots = p.colors
      .map((c, i) => {
        const [x, y] = pts[i];
        const r = c.isBase ? 6.4 : 5;
        return (
          `<circle class="dot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}" fill="${c.hex}" stroke="#fff" stroke-width="1.6"/>` +
          `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r + 0.8}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width=".7"/>`
        );
      })
      .join('');
    return (
      `<svg class="wheel-svg" viewBox="0 0 64 64" aria-hidden="true">${sectorsSvg}` +
      `<g fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" opacity=".9">${shape}</g>` +
      `<g fill="none" stroke="#000" stroke-width="1" stroke-linejoin="round" stroke-linecap="round" opacity=".55">${shape}</g>` +
      `${dots}</svg>`
    );
  }

  // The Analogous spread only ever changes the Analogous card below, so its control lives right on
  // that card instead of in a page-wide settings panel — see the "settings near what they change"
  // note on .group-controls in style.css.
  const spreadControlHtml = () =>
    `<div class="pal-control"><label for="spread">Spread <output id="spread-out">${state.spread}°</output></label>` +
    `<input id="spread" type="range" min="10" max="60" step="5" value="${state.spread}"></div>`;

  function cardHtml(p, sectorsSvg) {
    return (
      `<article class="card pal" data-pid="${p.id}">` +
      `<div class="pal-head"><div class="pal-head-main"><div><h4>${esc(p.name)}<span class="count">${p.colors.length} colours</span></h4>` +
      `<p>${esc(p.desc)}</p></div><div class="wheel-slot">${p.wheel ? wheelSvg(p, sectorsSvg) : ''}</div></div>` +
      `${p.id === 'analogous' ? spreadControlHtml() : ''}</div>` +
      `<div class="swatches">${swatchesHtml(p)}</div>` +
      `<div class="pal-actions"><span>Copy</span>` +
      `<button type="button" data-pal-copy="hex">HEX</button>` +
      `<button type="button" data-pal-copy="css">CSS</button>` +
      `<button type="button" data-pal-copy="json">JSON</button></div></article>`
    );
  }

  const wheelControlHtml = () => `
    <fieldset class="control group-controls">
      <legend>Colour wheel</legend>
      <div class="seg" role="radiogroup" aria-label="Colour wheel">
        <label><input type="radio" name="wheel" value="ryb"${state.wheel === 'ryb' ? ' checked' : ''}><span>Artist <small>RYB</small></span></label>
        <label><input type="radio" name="wheel" value="hsl"${state.wheel === 'hsl' ? ' checked' : ''}><span>Digital <small>RGB</small></span></label>
        <label><input type="radio" name="wheel" value="oklch"${state.wheel === 'oklch' ? ' checked' : ''}><span>Perceptual <small>OKLCH</small></span></label>
      </div>
    </fieldset>`;

  const sizeControlHtml = () => `
    <fieldset class="control group-controls">
      <legend>Colours per palette</legend>
      <div class="seg" role="radiogroup" aria-label="Colours per palette">
        ${SIZES.map((v) => `<label><input type="radio" name="size" value="${v}"${state.size === v ? ' checked' : ''}><span>${v}</span></label>`).join('')}
      </div>
    </fieldset>`;

  // Each group's own controls sit in ITS head, right above the one card that proves they work —
  // Complementary visibly reacts to the wheel, Monochromatic visibly reacts to size — instead of a
  // single settings panel sitting over palettes that may not respond to it at all.
  const GROUP_CONTROLS = { harmonies: wheelControlHtml, scales: sizeControlHtml };
  const GROUP_NOTES = {
    harmonies: () => `<p class="control-note" id="wheel-note">${WHEEL_NOTES[state.wheel]}</p>`,
    scales: () => `<p class="control-note">${SIZE_NOTE}</p>`,
  };

  function groupHtml(g, sectorsSvg) {
    const controls = GROUP_CONTROLS[g.id] ? GROUP_CONTROLS[g.id]() : '';
    const note = GROUP_NOTES[g.id] ? GROUP_NOTES[g.id]() : '';
    return (
      `<section class="group" aria-labelledby="g-${g.id}" data-gid="${g.id}">` +
      `<div class="group-head"><div class="group-head-text"><h3 id="g-${g.id}">${esc(g.title)}</h3><p>${esc(g.desc)}</p></div>${controls}</div>` +
      note +
      `<div class="cards">${g.palettes.map((p) => cardHtml(p, sectorsSvg)).join('')}</div></section>`
    );
  }

  const setText = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };

  function patchSwatch(el, c) {
    el.style.setProperty('--c', c.hex);
    el.style.setProperty('--ink', inkFor(c));
    el.classList.toggle('is-base', !!c.isBase);
    const use = el.firstElementChild;
    const copy = el.lastElementChild;
    use.dataset.hex = c.hex;
    use.setAttribute('aria-label', `Use ${c.role ? `${c.hex}, ${c.role}` : c.hex} as your colour`);
    setText(use.children[0], c.hex);
    if (c.role) setText(use.children[1], c.role);
    copy.dataset.copy = c.hex;
    copy.setAttribute('aria-label', `Copy ${c.hex}`);
    copy.title = `Copy ${c.hex}`;
  }

  const cardKey = (p) => {
    const roles = p.colors.map((c) => (c.role ? 1 : 0)).join('');
    const wheel = p.wheel ? p.wheel.angles.join(',') + (p.wheel.closed ? 'c' : '') : '';
    return `${p.colors.length}:${roles}:${wheel}`;
  };

  // Group heads and card shells (including the wheel/size/spread controls embedded in them) are
  // built ONCE, the first time renderPalettes() runs, and never rebuilt again — only a card's
  // `.swatches` grid and its `<svg>` wheel are ever replaced, and only when their own shape changed.
  // That's what stops a control from being yanked out from under an active drag: dragging the
  // Analogous spread slider changes the Analogous card's own swatches/wheel, never the slider itself.
  const cardKeys = {};

  function patchCard(p, host, ringFills, sectorsSvgFn) {
    const card = host.querySelector(`[data-pid="${p.id}"]`);
    setText(card.querySelector('.count'), `${p.colors.length} colours`);

    const key = cardKey(p);
    const changed = cardKeys[p.id] !== key;
    cardKeys[p.id] = key;

    const swatches = card.querySelector('.swatches');
    if (changed || swatches.children.length !== p.colors.length) {
      swatches.innerHTML = swatchesHtml(p);
    } else {
      [...swatches.children].forEach((el, i) => patchSwatch(el, p.colors[i]));
    }

    if (p.wheel) {
      const slot = card.querySelector('.wheel-slot');
      if (changed || !slot.firstElementChild) {
        slot.innerHTML = wheelSvg(p, sectorsSvgFn());
      } else {
        slot.querySelectorAll('.wheel-svg path').forEach((el, i) => el.setAttribute('fill', ringFills[i]));
        slot.querySelectorAll('.wheel-svg .dot').forEach((el, i) => el.setAttribute('fill', p.colors[i].hex));
      }
    }
  }

  let skeletonBuilt = false;

  function renderPalettes() {
    const rgb = getRgb();
    const groups = P.generate(rgb, { wheel: state.wheel, size: state.size, spread: state.spread });
    const ringFills = ringColours(rgb, state.wheel);
    const host = $('#palette-groups');
    const byId = {};
    groups.forEach((g) => g.palettes.forEach((p) => { byId[p.id] = p; }));
    palettesById = byId;

    if (!skeletonBuilt) {
      const sectorsSvg = ringSectors(ringFills);
      host.innerHTML = groups.map((g) => groupHtml(g, sectorsSvg)).join('');
      groups.forEach((g) => g.palettes.forEach((p) => { cardKeys[p.id] = cardKey(p); }));
      skeletonBuilt = true;
      return;
    }

    // Most renders (dragging the SV square or hue slider) never touch a wheel's geometry, so the
    // sector markup is only built if some card actually turns out to need it.
    let sectorsSvg = null;
    const sectorsSvgFn = () => sectorsSvg || (sectorsSvg = ringSectors(ringFills));
    groups.forEach((g) => g.palettes.forEach((p) => patchCard(p, host, ringFills, sectorsSvgFn)));
  }

  // Rebuilding ~90 swatches and 8 wheels is the expensive part of an update. While a slider is
  // being dragged, refresh palettes at most every PALETTE_INTERVAL ms; the trailing call always
  // lands on the final colour.
  const PALETTE_INTERVAL = 100;
  let paletteTimer = 0;
  let lastPaletteAt = 0;

  function schedulePalettes() {
    if (paletteTimer) return;
    const wait = Math.max(0, PALETTE_INTERVAL - (performance.now() - lastPaletteAt));
    paletteTimer = setTimeout(() => {
      paletteTimer = 0;
      lastPaletteAt = performance.now();
      renderPalettes();
    }, wait);
  }

  const slug = (s) => s.split('·')[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function cssVarName(c, i) {
    const role = c.role || '';
    if (/^\d+$/.test(role)) return `color-${role}`; // scale steps: color-500
    const s = slug(role);
    if (s === 'yours') return 'base';
    return s || `color-${i + 1}`;
  }

  function paletteText(p, fmt) {
    const hexes = p.colors.map((c) => c.hex);
    if (fmt === 'json') return JSON.stringify(hexes);
    if (fmt === 'css') {
      const used = new Set();
      const lines = p.colors.map((c, i) => {
        const base = cssVarName(c, i);
        let name = base, k = 2;
        while (used.has(name)) name = `${base}-${k++}`;
        used.add(name);
        return `  --${name}: ${c.hex};`;
      });
      return `:root {\n${lines.join('\n')}\n}`;
    }
    return hexes.join(', ');
  }

  const paletteHost = $('#palette-groups');
  paletteHost.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.sw-copy');
    if (copyBtn) return copyText(copyBtn.dataset.copy);
    const use = e.target.closest('.sw-use');
    if (use) return jumpTo(use.dataset.hex, { keyboard: e.detail === 0 });
    const pal = e.target.closest('[data-pal-copy]');
    if (pal) {
      const p = palettesById[pal.closest('.pal').dataset.pid];
      const fmt = pal.dataset.palCopy;
      copyText(paletteText(p, fmt), `${p.name} (${fmt.toUpperCase()})`);
    }
  });

  // Wheel/size/spread controls live inside the (now permanent) palette skeleton, so they're bound
  // once via delegation on the host rather than looked up by id.
  paletteHost.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'wheel') {
      state.wheel = t.value;
      setText($('#wheel-note'), WHEEL_NOTES[state.wheel]);
      scheduleRender();
    } else if (t.name === 'size') {
      state.size = Number(t.value);
      scheduleRender();
    }
  });
  paletteHost.addEventListener('input', (e) => {
    if (e.target.id !== 'spread') return;
    state.spread = Number(e.target.value);
    setText($('#spread-out'), state.spread + '°');
    scheduleRender();
  });

  $('#toolbar-base').addEventListener('click', () => window.scrollTo({ top: 0 }));

  $('#names').addEventListener('click', (e) => {
    const b = e.target.closest('.name-btn');
    if (b) jumpTo(b.dataset.hex);
  });

  /* ---------- render loop ---------- */

  let rafId = 0;
  let skipField = null;

  function scheduleRender(skip) {
    skipField = skip || null;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      render();
    });
  }

  let urlTimer = 0;
  function persist(immediately) {
    clearTimeout(urlTimer);
    const write = () => {
      const params = new URLSearchParams({
        c: getHex().slice(1), w: state.wheel, n: String(state.size), a: String(state.spread),
      });
      try { history.replaceState(null, '', '#' + params); } catch (_) { /* ignore */ }
      store.set('prefs', { hex: getHex(), wheel: state.wheel, size: state.size, spread: state.spread });
    };
    if (immediately) write();
    else urlTimer = setTimeout(write, 250);
  }

  function render(sync) {
    const rgb = getRgb();
    const hex = C.toHex(rgb);
    const ink = inkFor(rgb);

    // Custom properties inherit, so setting these on :root would restyle the whole page on every
    // drag frame. Scope them to the handful of elements that use them.
    const pureHue = C.toHex(C.rgb8(C.hsvToRgb({ h: state.h, s: 1, v: 1 })));
    previewEl.style.setProperty('--base', hex);
    previewEl.style.setProperty('--base-ink', ink);
    toolbarChip.style.setProperty('--base', hex);
    sv.style.setProperty('--hue', pureHue);
    hueInput.style.setProperty('--hue', pureHue);

    const near = N.nearest(rgb, 8);
    const best = near[0];
    $('#preview-name').textContent =
      (best.dE < 0.05 ? '' : '≈ ') + best.name + (best.kind === 'css' ? ' (CSS)' : '');
    $('#preview-hex').textContent = hex;
    $('#toolbar-hex').textContent = hex;

    svThumb.style.left = state.s * 100 + '%';
    svThumb.style.top = (1 - state.v) * 100 + '%';
    svThumb.style.background = hex;
    sv.setAttribute('aria-valuemin', '0');
    sv.setAttribute('aria-valuemax', '100');
    sv.setAttribute('aria-valuenow', String(Math.round(state.s * 100)));
    sv.setAttribute(
      'aria-valuetext',
      `Saturation ${Math.round(state.s * 100)}%, brightness ${Math.round(state.v * 100)}%`
    );
    hueInput.value = Math.round(state.h) % 361;
    hueInput.setAttribute('aria-valuetext', `${Math.round(state.h)} degrees`);
    nativeInput.value = hex.toLowerCase();

    for (const f of FIELDS) {
      if (f.id !== skipField) {
        inputs[f.id].value = C.format(f.id, rgb);
        inputs[f.id].removeAttribute('aria-invalid');
      }
    }

    renderNames(rgb, near);
    renderContrast(rgb);
    renderSaved();
    $('#grey-note').hidden = C.rgbToOklch(rgb).C >= 0.015;
    if (sync) renderPalettes();
    else schedulePalettes();
    persist(false);
  }

  /* ---------- share, theme ---------- */

  $('#share-btn').addEventListener('click', () => {
    persist(true);
    copyText(location.href, 'link');
  });

  const themeBtn = $('#theme-btn');
  const savedTheme = store.get('theme', null);
  if (savedTheme === 'light' || savedTheme === 'dark') root.dataset.theme = savedTheme;
  themeBtn.addEventListener('click', () => {
    const dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme', root.dataset.theme);
  });

  /* ---------- install & offline ---------- */

  const installBtn = $('#install-btn');
  let installEvent = null;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    if (!standalone) installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    try { await installEvent.userChoice; } catch (_) { /* ignore */ }
    installEvent = null;
    installBtn.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    installBtn.hidden = true;
    toast('Installed — find it with your other apps');
  });

  const canRegisterSW =
    'serviceWorker' in navigator &&
    (location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname));

  if (canRegisterSW) {
    const hadController = !!navigator.serviceWorker.controller;
    let updateRequested = false;

    const offer = (worker) =>
      toast('A new version is ready', {
        label: 'Reload',
        run: () => { updateRequested = true; worker.postMessage({ type: 'SKIP_WAITING' }); },
      }, 15000);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // First-ever install also fires this (clients.claim); only reload for a user-approved update.
      if (hadController && updateRequested) location.reload();
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('sw.js')
        .then((reg) => {
          if (reg.waiting && hadController) offer(reg.waiting);
          reg.addEventListener('updatefound', () => {
            const worker = reg.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
            });
          });
          return navigator.serviceWorker.ready;
        })
        .then(() => { $('#offline-pill').hidden = false; })
        .catch(() => { /* offline support is a bonus; the app still works */ });
    });
  }

  // Ask the browser to exempt this origin's storage (the SW cache, saved colours, prefs) from
  // "clear least-recently-used site data" eviction under disk pressure — the scenario the offline
  // promise is actually for. Best-effort and silent: Chromium auto-grants for an installed/
  // frequently-visited PWA with no prompt; other browsers may ignore it or ask. Either way the app
  // still works offline without it, just with a (usually theoretical) risk of the cache being cleared.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted()
      .then((already) => (already ? true : navigator.storage.persist()))
      .catch(() => { /* not critical */ });
  }

  /* ---------- build info ---------- */

  const buildInfo = $('#build-info');
  if (window.APP_VERSION && window.APP_VERSION.version) {
    const { version, built } = window.APP_VERSION;
    const when = new Date(built);
    const whenText = Number.isNaN(when.getTime())
      ? built
      : when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    buildInfo.textContent = `Build ${version} · ${whenText}`;
    buildInfo.title = 'Content hash of the app’s files, stamped when it was last deployed.';
  } else {
    buildInfo.textContent = 'Build: dev (unversioned)';
  }

  /* ---------- go ---------- */

  loadInitialState();
  render(true);
  persist(true);
})();
