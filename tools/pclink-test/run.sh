#!/usr/bin/env bash
# Testet "PC verbinden" ohne Handy und ohne Windows: startet PcLinkServer.java mit plain Java und führt
# den Befehl aus der App mit PowerShell 7 aus. stubs.ps1 simuliert die Windows-Befehle mit Beispiel-Hardware.
# Aufruf: tools/pclink-test/run.sh [pfad-zu-pwsh]   -> schreibt scan.json ins aktuelle Verzeichnis
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PWSH="${1:-pwsh}"
WORK="$(mktemp -d)"
javac -nowarn -d "$WORK" "$ROOT/tools/pclink-test/Harness.java" "$ROOT/app/java/de/setupbuilder/app/PcLinkServer.java"
(cd "$WORK" && java -cp "$WORK" Harness "$ROOT/app/assets/pclink.ps1" 20000 > server.log 2>&1 &)
for i in $(seq 1 40); do grep -q '^CMD' "$WORK/server.log" 2>/dev/null && break; sleep 0.5; done
CMD="$(grep '^CMD' "$WORK/server.log" | sed 's/^CMD //')"
echo "Befehl aus der App: $CMD"
(cd "$WORK" && "$PWSH" -NoProfile -Command ". '$ROOT/tools/pclink-test/stubs.ps1'; $CMD")
sleep 1
grep EVENT "$WORK/server.log"
cp "$WORK/scan.json" ./scan.json && echo "scan.json geschrieben"
