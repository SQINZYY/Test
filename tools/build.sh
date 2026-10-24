#!/usr/bin/env bash
# Baut release/SetupBuilder.apk ohne Android Studio / Android SDK.
# Benötigt: Java (JDK 17+), Python 3 mit "cryptography", curl, unzip.
# Die Werkzeuge (aapt2, dx, Android-Klassen) werden einmalig von Maven Central geladen.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="$ROOT/.build-tools"
OUT="$ROOT/build"
VERSION_CODE="${VERSION_CODE:-4}"
VERSION_NAME="${VERSION_NAME:-1.3}"
MAVEN="https://repo1.maven.org/maven2"

fetch() { # url ziel
  [ -s "$2" ] && return
  echo "Lade $(basename "$2") …"
  for i in 1 2 3 4; do curl -sSfL -o "$2.tmp" "$1" && mv "$2.tmp" "$2" && return; sleep $((i * 2)); done
  echo "Download fehlgeschlagen: $1" >&2; exit 1
}

mkdir -p "$TOOLS"
fetch "$MAVEN/org/apktool/apktool-lib/3.0.3/apktool-lib-3.0.3.jar" "$TOOLS/apktool-lib.jar"
fetch "$MAVEN/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar" "$TOOLS/dx.jar"
fetch "$MAVEN/org/robolectric/android-all/9-robolectric-4913185-2/android-all-9-robolectric-4913185-2.jar" "$TOOLS/android-all.jar"
if [ ! -x "$TOOLS/aapt2" ]; then
  unzip -oqj "$TOOLS/apktool-lib.jar" prebuilt/linux/aapt2 prebuilt/android-framework.jar -d "$TOOLS"
  chmod +x "$TOOLS/aapt2"
fi

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$ROOT/release"

echo "Ressourcen …"
"$TOOLS/aapt2" compile --dir "$ROOT/app/res" -o "$OUT/res.zip"
"$TOOLS/aapt2" link -o "$OUT/base.apk" -I "$TOOLS/android-framework.jar" \
  --manifest "$ROOT/app/AndroidManifest.xml" -A "$ROOT/app/assets" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "$OUT/res.zip"

echo "Java …"
javac -nowarn -Xlint:-options --release 8 -encoding UTF-8 \
  -classpath "$TOOLS/android-all.jar" -d "$OUT/classes" \
  $(find "$ROOT/app/java" -name '*.java')
java -cp "$TOOLS/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 \
  --output="$OUT/classes.dex" "$OUT/classes"

echo "Packen & signieren …"
python3 "$ROOT/tools/sign_apk.py" "$OUT/base.apk" "$OUT/classes.dex" "$ROOT/release/SetupBuilder.apk" \
  "$ROOT/tools/debug-signing.p12" android

echo "Fertig: release/SetupBuilder.apk ($(du -h "$ROOT/release/SetupBuilder.apk" | cut -f1))"
