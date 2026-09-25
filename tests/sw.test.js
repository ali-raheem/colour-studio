'use strict';
// Guards the offline promise: everything index.html loads must be precached,
// and everything precached must exist.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const swSource = read('sw.js');
const assets = [...swSource.slice(swSource.indexOf('const ASSETS'), swSource.indexOf('];')).matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('every precached asset exists', () => {
  assert.ok(assets.length > 8);
  for (const a of assets) {
    if (a === './') continue;
    assert.ok(fs.existsSync(path.join(root, a)), `missing ${a}`);
  }
});

test('everything index.html references is precached', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/\b(?:href|src)="([^"#]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:)/.test(u));
  assert.ok(refs.length >= 8);
  for (const r of refs) assert.ok(assets.includes(r), `${r} is used by index.html but not precached in sw.js`);
});

test('manifest icons are precached and real PNG/SVG files', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const icon of manifest.icons) {
    assert.ok(assets.includes(icon.src), `${icon.src} not precached`);
    const buf = fs.readFileSync(path.join(root, icon.src));
    if (icon.type === 'image/png') {
      assert.equal(buf.subarray(1, 4).toString(), 'PNG');
      const [w, h] = icon.sizes.split('x').map(Number);
      assert.equal(buf.readUInt32BE(16), w);
      assert.equal(buf.readUInt32BE(20), h);
    }
  }
  assert.ok(manifest.icons.some((i) => i.sizes === '192x192'));
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512'));
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  assert.equal(manifest.display, 'standalone');
});

test('scripts are listed in load order: color → names/palettes → version → app', () => {
  const html = read('index.html');
  const order = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['js/color.js', 'js/names.js', 'js/palettes.js', 'js/version.js', 'js/app.js']);
});
