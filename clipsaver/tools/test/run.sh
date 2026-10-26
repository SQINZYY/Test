#!/usr/bin/env bash
# Testet die Klassen ohne Android-Abhängigkeit auf dem PC (Java 17+). Aufruf: ./tools/test/run.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/build/test"
JSON="$ROOT/.build-tools/libs/json.jar"
mkdir -p "$OUT" "$(dirname "$JSON")"
[ -s "$JSON" ] || curl -sSfL -o "$JSON" https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar
SRC="$ROOT/app/java/de/clipsaver/app"
javac -nowarn -encoding UTF-8 -cp "$JSON" -d "$OUT" \
  "$SRC"/{Links,Http,Json,TikTok,YouTubePosts,Formats,MediaSniffer,Cookies}.java "$ROOT/tools/test/Tests.java"
java -Dstdout.encoding=UTF-8 -cp "$OUT:$JSON" de.clipsaver.app.Tests "$ROOT/tools/test/fixtures"
