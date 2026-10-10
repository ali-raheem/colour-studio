# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Colour Studio: colour conversion, palettes, wheels and contrast checks as an offline PWA. There is no build step and there are no dependencies; plain ES modules load straight from `index.html`. `README.md` has the feature tour and project layout.

(The parent `../CLAUDE.md` describes the shoryuken.me workspace; the one above that is an unrelated Rust project.)

## Commands

```bash
node --test tests/*.test.js          # all tests (there is no package.json)
node --test tests/sw.test.js         # single file
python3 -m http.server 8080          # local preview
python3 scripts/build_version.py     # stamp js/version.js + sw.js VERSION (run before every deploy)
python3 scripts/make_icons.py        # regenerate icons/ (stdlib only)
```

## Versioning (read before committing or deploying)

`scripts/build_version.py` writes `js/version.js` (gitignored) and rewrites `VERSION` in `sw.js` from the current commit hash. `tests/version.test.js` fails if either is stale, so run it after committing and before testing a deploy. A one-line `VERSION` diff in `sw.js` after a deploy is expected: fold it into the next real commit, don't chase it with stamp-only commits.

## Shared-origin rules

Colour Studio is deployed at `/colours/` next to other apps on shoryuken.me:

- Cache names are `colour-studio-<VERSION>`; `activate` deletes only caches with that prefix.
- `sw.js` handles only requests inside `self.registration.scope` and reads only its own cache (`caches.open(CACHE)`), never `caches.match()`.
- localStorage keys are prefixed `colour-studio:`.
- Manifest `id` is `/colours/`. Never change it once released.
- Adding a file the page loads means adding it to `ASSETS` in `sw.js` (`tests/sw.test.js` checks this).

## Deployment

Live at https://shoryuken.me/colours/ (`/var/www/shoryuken.me/colours/`; see the server's `/var/www/shoryuken.me/CLAUDE.md`). Commit, run `scripts/build_version.py`, run the tests, then ship only the served files:

```bash
rsync -a --delete --chmod=D755,F644 index.html manifest.webmanifest sw.js style.css js icons root@185.163.204.17:/var/www/shoryuken.me/colours/
```

The cache is cache-first and versioned, so installed copies only update when `VERSION` changes. Precaching uses `cache: 'reload'` so Cloudflare's 4 h max-age on JS/CSS can't freeze an old file into a new cache.
