#!/usr/bin/env bash
# Builds dist/Aurora-Setup-<version>.exe without npm.
# Works on Linux/macOS/WSL/Git-Bash. Needs: curl, unzip, python3, and either `makensis` on PATH
# or it downloads the portable NSIS used by electron-builder.
#
#   bash scripts/build-win.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/.cache"
DIST="$ROOT/dist"
VERSION="$(python3 -c "import json;print(json.load(open('$ROOT/package.json'))['version'])")"
ELECTRON="$(python3 -c "import json;print(json.load(open('$ROOT/package.json'))['aurora']['electronVersion'])")"
APPDIR="$DIST/Aurora-win32-x64"
mkdir -p "$CACHE" "$DIST"

fetch() { # url dest
  if [ ! -s "$2" ]; then echo "  downloading $(basename "$2")"; curl -fL --retry 3 -o "$2.part" "$1" && mv "$2.part" "$2"; fi
}

echo "==> Aurora $VERSION (Electron $ELECTRON)"
fetch "https://github.com/electron/electron/releases/download/v$ELECTRON/electron-v$ELECTRON-win32-x64.zip" "$CACHE/electron-v$ELECTRON-win32-x64.zip"
# always grab the newest yt-dlp so downloads keep working
rm -f "$CACHE/yt-dlp.exe"
fetch "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" "$CACHE/yt-dlp.exe"

echo "==> Staging app"
rm -rf "$APPDIR"
mkdir -p "$APPDIR"
unzip -q "$CACHE/electron-v$ELECTRON-win32-x64.zip" -d "$APPDIR"
mv "$APPDIR/electron.exe" "$APPDIR/Aurora.exe"
rm -f "$APPDIR/resources/default_app.asar"
mkdir -p "$APPDIR/resources/app" "$APPDIR/resources/bin"
cp -r "$ROOT/package.json" "$ROOT/src" "$ROOT/assets" "$APPDIR/resources/app/"
cp "$ROOT/LICENSE" "$APPDIR/resources/app/" 2>/dev/null || true
cp "$CACHE/yt-dlp.exe" "$APPDIR/resources/bin/yt-dlp.exe"
# trim locales we don't need (keeps English)
find "$APPDIR/locales" -name '*.pak' ! -name 'en-US.pak' ! -name 'en-GB.pak' -delete

echo "==> Building installer"
MAKENSIS="$(command -v makensis || true)"
if [ -z "$MAKENSIS" ]; then
  NSISDIR="$CACHE/nsis"
  if [ ! -x "$NSISDIR/linux/makensis" ]; then
    fetch "https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z" "$CACHE/nsis.7z"
    SEVENZ="$(command -v 7z || command -v 7zz || true)"
    if [ -z "$SEVENZ" ]; then
      fetch "https://github.com/ip7z/7zip/releases/download/24.09/7z2409-linux-x64.tar.xz" "$CACHE/7z.tar.xz"
      mkdir -p "$CACHE/7z" && tar -xf "$CACHE/7z.tar.xz" -C "$CACHE/7z"
      SEVENZ="$CACHE/7z/7zz"
    fi
    mkdir -p "$NSISDIR" && "$SEVENZ" x -y -o"$NSISDIR" "$CACHE/nsis.7z" >/dev/null
    chmod +x "$NSISDIR/linux/makensis"
  fi
  export NSISDIR
  case "$(uname -s)" in
    Darwin) MAKENSIS="$NSISDIR/mac/makensis" ;;
    MINGW*|MSYS*|CYGWIN*) MAKENSIS="$NSISDIR/Bin/makensis.exe" ;;
    *) MAKENSIS="$NSISDIR/linux/makensis" ;;
  esac
fi
cd "$ROOT/build"
"$MAKENSIS" -V2 -DVERSION="$VERSION" -DAPPDIR="$APPDIR" -DOUTFILE="$DIST/Aurora-Setup-$VERSION.exe" installer.nsi
ls -lh "$DIST/Aurora-Setup-$VERSION.exe"
echo "==> Done: dist/Aurora-Setup-$VERSION.exe"
