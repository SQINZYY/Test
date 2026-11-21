#!/usr/bin/env bash
# Baut release/BlockBridge.exe (Windows 10/11, 64 Bit) – auch unter Linux/macOS.
# Benötigt: Node.js (für die Oberfläche) und Go 1.22+. Die EXE nutzt die in Windows
# eingebaute Edge-WebView2, deshalb ist sie nur wenige MB groß.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"

node "$ROOT/tools/build-web.mjs"
rm -rf "$ROOT/windows/web"
cp -r "$ROOT/dist" "$ROOT/windows/web"

cd "$ROOT/windows"
sed -i.bak -E "s/\"(file_version|product_version|version)\": \"[0-9.]+\"/\"\1\": \"$VERSION.0\"/; s/\"(FileVersion|ProductVersion)\": \"[0-9.]+\"/\"\1\": \"$VERSION\"/" winres/winres.json && rm -f winres/winres.json.bak
go run github.com/tc-hib/go-winres@v0.3.3 make --in winres/winres.json --out rsrc --arch amd64
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w -X main.version=$VERSION" -o "$ROOT/../release/BlockBridge.exe" .
echo "Fertig: release/BlockBridge.exe ($(du -h "$ROOT/../release/BlockBridge.exe" | cut -f1))"
