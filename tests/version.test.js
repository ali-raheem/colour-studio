'use strict';
// scripts/build_version.py stamps js/version.js and sw.js's VERSION together, so the two can
// never point at different builds. Runs the script against a scratch copy of the repo so `node
// --test` never rewrites the real sw.js as a side effect of testing. (js/version.js itself is
// gitignored and regenerated before every deploy — see the last test below.)
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');

// The files build_version.py hashes for its content-hash fallback (i.e. when it's NOT run inside
// a git checkout). Deliberately excludes sw.js and the script itself — sw.js is the script's own
// output, so hashing it would make the result depend on its own previous run.
const HASH_FILES = [
  'index.html', 'style.css',
  'js/color.js', 'js/names.js', 'js/palettes.js', 'js/app.js',
  'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];
// What a *scratch* copy needs on top of that so the script can actually run there: itself, and
// the sw.js it's going to stamp.
const COPY_FILES = [...HASH_FILES, 'sw.js', 'scripts/build_version.py'];

function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colour-studio-version-test-'));
  for (const rel of COPY_FILES) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, rel), dest);
  }
  return dir;
}

function runBuildVersion(dir) {
  execFileSync('python3', ['scripts/build_version.py'], { cwd: dir, stdio: 'pipe' });
}

// Mirrors build_version.py's own version algorithm exactly (git commit if `root` is a checkout,
// else a content hash of HASH_FILES), so the freshness test below can check the real repo without
// running the script against it — which would rewrite the real sw.js as a side effect of testing.
function expectedVersion(atRoot) {
  try {
    const out = execFileSync('git', ['-C', atRoot, 'rev-parse', '--short=10', 'HEAD'], { stdio: 'pipe' }).toString().trim();
    if (out) return out;
  } catch (_) { /* not a git repo (or no commits yet) — fall through to the content hash */ }
  const h = crypto.createHash('sha256');
  for (const rel of [...HASH_FILES].sort()) {
    h.update(rel);
    h.update(fs.readFileSync(path.join(atRoot, rel)));
  }
  return h.digest('hex').slice(0, 10);
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

test('the real repo’s js/version.js is current (not gitignored-and-forgotten)', () => {
  // js/version.js is gitignored (see .gitignore) — it's a deploy-time artifact, not a committed
  // file, so `git status` can never catch it going stale. This is the test that can: it fails
  // loudly if the file on disk doesn't match what the script would produce for HEAD right now,
  // instead of silently deploying stale code.
  const versionPath = path.join(root, 'js/version.js');
  assert.ok(fs.existsSync(versionPath), 'js/version.js is missing — run `python3 scripts/build_version.py`');

  const onDisk = fs.readFileSync(versionPath, 'utf8').match(/"version":\s*"([^"]+)"/)[1];
  assert.equal(
    onDisk, expectedVersion(root),
    'js/version.js is stale for the current commit/files — run `python3 scripts/build_version.py` before deploying'
  );
});
