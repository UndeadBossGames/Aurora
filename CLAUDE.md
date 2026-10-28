# Working on Aurora

Notes for anyone (human or AI) changing this repo.

## Workflow rules (requested by the owner)
- **Commit every change** as its own commit with a clear message, so any update can be rolled back.
- For a user-visible release: bump `version` in `package.json`, add a `CHANGELOG.md` entry, commit, then tag `vX.Y.Z` and push the tag. GitHub Actions builds the installer and attaches it to the Release.
- Never rewrite published history (no force-push to `main`). Undo with `git revert`.

## Layout
- `src/main/*`: Electron main process (Node). `downloader.js` wraps yt-dlp/ffmpeg; binaries live in `%APPDATA%\Aurora\bin` (yt-dlp is bundled in `resources/bin` and copied on first run; ffmpeg downloads on demand).
- `src/preload.js`: the only bridge to Node, exposed to the UI as `window.native`.
- `src/renderer/*`: plain HTML/CSS/JS, loaded as classic scripts in the order set in `index.html`. Globals: `State`, `Player`, `UI`, `App`, `Views`.
- User data: `%APPDATA%\Aurora\data\*.json` (profiles.json, tracks.json, settings.json, profile-<id>.json).

## Build
`bash scripts/build-win.sh` → `dist/Aurora-Setup-<version>.exe`. It needs only curl, unzip and python3. NSIS and Electron are downloaded from GitHub.
