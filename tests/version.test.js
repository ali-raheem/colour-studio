'use strict';
// scripts/build_version.py stamps js/version.js and sw.js's VERSION together, so the two can
// never point at different builds. Runs the script against a scratch copy of the repo so `node
// --test` never rewrites the real js/version.js or sw.js as a side effect of testing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const TRACKED = [
  'index.html', 'style.css',
  'js/color.js', 'js/names.js', 'js/palettes.js', 'js/app.js',
  'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'sw.js', 'scripts/build_version.py',
];

function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colour-studio-version-test-'));
  for (const rel of TRACKED) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, rel), dest);
  }
  return dir;
}

function runBuildVersion(dir) {
  execFileSync('python3', ['scripts/build_version.py'], { cwd: dir, stdio: 'pipe' });
}

test('build_version.py writes a well-formed js/version.js and stamps sw.js to match', () => {
  const dir = scratchRepo();
  runBuildVersion(dir);

  const versionJs = fs.readFileSync(path.join(dir, 'js/version.js'), 'utf8');
  assert.match(versionJs, /^\/\/ AUTO-GENERATED/);
  assert.match(versionJs, /^window\.APP_VERSION = \{.*\};\s*$/m);

  const m = /window\.APP_VERSION = (\{.*\});/.exec(versionJs);
  const info = JSON.parse(m[1]);
  assert.match(info.version, /^[0-9a-f]{10}$/, 'version is a short lowercase hex hash');
  assert.ok(!Number.isNaN(new Date(info.built).getTime()), 'built is a valid timestamp');
  assert.match(info.built, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 'built is UTC ISO 8601');

  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  assert.match(sw, new RegExp(`const VERSION = 'v${info.version}';`), 'sw.js VERSION matches js/version.js');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('build_version.py is deterministic: same tracked files → same version', () => {
  const dir = scratchRepo();
  runBuildVersion(dir);
  const first = fs.readFileSync(path.join(dir, 'js/version.js'), 'utf8').match(/"version":\s*"([^"]+)"/)[1];

  // Rerun after only touching a file that ISN'T tracked — version must not change.
  fs.writeFileSync(path.join(dir, 'README.md'), 'irrelevant\n');
  runBuildVersion(dir);
  const second = fs.readFileSync(path.join(dir, 'js/version.js'), 'utf8').match(/"version":\s*"([^"]+)"/)[1];
  assert.equal(second, first);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('build_version.py changes version when a tracked file changes', () => {
  const dir = scratchRepo();
  runBuildVersion(dir);
  const before = fs.readFileSync(path.join(dir, 'js/version.js'), 'utf8').match(/"version":\s*"([^"]+)"/)[1];

  fs.appendFileSync(path.join(dir, 'style.css'), '/* touched */\n');
  runBuildVersion(dir);
  const after = fs.readFileSync(path.join(dir, 'js/version.js'), 'utf8').match(/"version":\s*"([^"]+)"/)[1];
  assert.notEqual(after, before);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('the real repo has a version stamp that is actually current', () => {
  // Guards against shipping a deploy where someone forgot to run the script: if the tracked files
  // don't match the committed js/version.js, this fails loudly instead of silently serving stale code.
  const versionPath = path.join(root, 'js/version.js');
  assert.ok(fs.existsSync(versionPath), 'js/version.js is missing — run `python3 scripts/build_version.py`');

  const dir = scratchRepo();
  runBuildVersion(dir);
  const fresh = fs.readFileSync(path.join(dir, 'js/version.js'), 'utf8').match(/"version":\s*"([^"]+)"/)[1];
  const committed = fs.readFileSync(versionPath, 'utf8').match(/"version":\s*"([^"]+)"/)[1];
  assert.equal(
    committed, fresh,
    'js/version.js is stale for the current tracked files — run `python3 scripts/build_version.py` before committing/deploying'
  );

  fs.rmSync(dir, { recursive: true, force: true });
});
