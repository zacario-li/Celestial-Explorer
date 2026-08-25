#!/usr/bin/env bash
# Rebuilds ./CelestialExplorer.app from tools/icon.svg.
# Usage: bash tools/make-app.sh   (needs: node+playwright via node_modules, sips, iconutil)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/CelestialExplorer.app"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ rendering tools/icon.svg → 1024px PNG (headless Chromium)"
REPO="$ROOT" OUT="$TMP/icon-1024.png" node <<'EOF'
const pw = require(require('path').join(process.env.REPO, 'node_modules', 'playwright'));
const fs = require('fs');
(async () => {
  const html = fs.readFileSync(require('path').join(process.env.REPO, 'tools', 'icon.svg'), 'utf8');
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.setContent('<html style="margin:0"><body style="margin:0">' + html + '</body></html>');
  await page.waitForTimeout(300);
  await page.screenshot({ path: process.env.OUT });
  await browser.close();
  console.log('   rendered 1024x1024');
})();
EOF

echo "→ building iconset + .icns"
ICONSET="$TMP/icon.iconset"; mkdir -p "$ICONSET"
for s in 16 32 64 128 256 512; do
  sips -z "$s" "$s" "$TMP/icon-1024.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
done
declare -a pairs=("32 16@2x" "64 32@2x" "256 128@2x" "512 256@2x" "1024 512@2x")
for p in "${pairs[@]}"; do
  set -- $p
  sips -z "$1" "$1" "$TMP/icon-1024.png" --out "$ICONSET/icon_${2}.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$TMP/icon.icns"

echo "→ assembling $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$TMP/icon.icns" "$APP/Contents/Resources/icon.icns"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Celestial Explorer</string>
  <key>CFBundleDisplayName</key><string>Celestial Explorer</string>
  <key>CFBundleIdentifier</key><string>local.celestial-explorer</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

cat > "$APP/Contents/MacOS/launch" <<'LAUNCH'
#!/bin/bash
# Celestial Explorer launcher — double-click behavior:
#   * if :$PORT already serves  → just open the browser (idempotent)
#   * otherwise                 → start `node server.js` in a visible Terminal
#     (logs on screen, Ctrl+C stops the whole simulation) then open the browser.
# Resolve the repo: next to the app (repo-root copy) → $CELESTIAL_HOME → known path
REPO=""
for cand in "$(cd "$(dirname "$0")/../../.." 2>/dev/null && pwd)" "${CELESTIAL_HOME:-}"; do
  if [ -n "$cand" ] && [ -f "$cand/server.js" ]; then REPO="$cand"; break; fi
done
[ -z "$REPO" ] && REPO="/Users/stesha/code/lyw"
[ -f "$REPO/server.js" ] || { echo "Celestial Explorer: could not find service files (server.js) — try setting CELESTIAL_HOME=$PWD"; exit 1; }
PORT="${CELESTIAL_PORT:-3001}"
cd "$REPO"
if curl -s --max-time 1 "http://localhost:$PORT/" >/dev/null 2>&1; then
  open "http://localhost:$PORT/"
  exit 0
fi
osascript <<OSA
tell application "Terminal"
  activate
  do script "cd '$REPO' && echo '🚀 Celestial Explorer  starting on  http://localhost:$PORT   (Ctrl-C stops it)' && node server.js; echo 'server stopped — window closing…'; sleep 2"
end tell
OSA
sleep 2
open "http://localhost:$PORT/"
LAUNCH
chmod +x "$APP/Contents/MacOS/launch"

# refresh LaunchServices registration
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" >/dev/null 2>&1 || true
echo "✓ done: $APP"
