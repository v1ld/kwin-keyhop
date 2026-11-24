#!/usr/bin/env bash
# Installs (or upgrades) the KeyHop KWin script, enables it and loads it
# into the running KWin.
set -euo pipefail

ID=keyhop
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$ID"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
PKG="$DATA/kwin/scripts/$ID"
MAIN="$PKG/contents/code/main.js"

[ -f "$SRC/metadata.json" ] || { echo "Missing $SRC/metadata.json" >&2; exit 1; }
for tool in kpackagetool6 kwriteconfig6 kreadconfig6 busctl; do
  command -v "$tool" >/dev/null || { echo "$tool not found" >&2; exit 1; }
done

kpackagetool6 --type=KWin/Script --upgrade "$SRC" >/dev/null 2>&1 \
  || kpackagetool6 --type=KWin/Script --install "$SRC"
kwriteconfig6 --file kwinrc --group Plugins --key "${ID}Enabled" true
chmod 0644 "$PKG/metadata.json" 2>/dev/null || true

kwin() { busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting "$@"; }
kwin unloadScript s "$ID" >/dev/null 2>&1 || true
kwin loadScript ss "$MAIN" "$ID" >/dev/null
kwin start >/dev/null

echo "Installed to:        $PKG"
echo "kwinrc enabled flag: $(kreadconfig6 --file kwinrc --group Plugins --key "${ID}Enabled")"
echo "Loaded in KWin:      $(kwin isScriptLoaded s "$ID")"   # expect: b true
cat <<EOF2

Settings: System Settings > Window Management > KWin Scripts > KeyHop (configure button)
Log:      journalctl --user -b -f | grep keyhop
EOF2
