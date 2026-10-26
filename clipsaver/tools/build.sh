#!/usr/bin/env bash
# Baut die ClipSaver-APKs ohne Android Studio / Android SDK:
#   release/ClipSaver.apk        – arm64-v8a (fast alle Handys ab ca. 2017)
#   release/ClipSaver-32bit.apk  – armeabi-v7a (ältere bzw. 32-Bit-Handys, z. B. Android Go)
# Benötigt: Java (JDK 17+), Python 3 mit "cryptography", curl, unzip.
# Werkzeuge und Bibliotheken werden einmalig von Maven Central geladen.
#
# Aufruf: ./tools/build.sh            (beide APKs)
#         ABIS=arm64-v8a ./tools/build.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="$ROOT/.build-tools"
OUT="$ROOT/build"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
ABIS="${ABIS:-arm64-v8a armeabi-v7a}"
YTDL_VERSION="0.18.1"  # youtubedl-android: yt-dlp + Python + QuickJS + FFmpeg fürs Handy
MIRRORS="https://maven-central.storage-download.googleapis.com/maven2 https://repo1.maven.org/maven2"

fetch() { # pfad-im-repo ziel
  [ -s "$2" ] && return
  echo "Lade $(basename "$2") …"
  for i in 1 2 3 4; do
    for m in $MIRRORS; do
      curl -sSfL -o "$2.tmp" "$m/$1" 2>/dev/null && mv "$2.tmp" "$2" && return
    done
    sleep $((i * 2))
  done
  echo "Download fehlgeschlagen: $1" >&2; exit 1
}

mkdir -p "$TOOLS"
fetch org/apktool/apktool-lib/3.0.3/apktool-lib-3.0.3.jar "$TOOLS/apktool-lib.jar"
fetch com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar "$TOOLS/dx.jar"
fetch org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar "$TOOLS/android-all-34.jar"
if [ ! -x "$TOOLS/aapt2" ]; then
  unzip -oqj "$TOOLS/apktool-lib.jar" prebuilt/linux/aapt2 prebuilt/android-framework.jar -d "$TOOLS"
  chmod +x "$TOOLS/aapt2"
fi

# Bibliotheken, die youtubedl-android zur Laufzeit braucht (Versionen wie in dessen POM;
# kotlin-stdlib-jdk7/-jdk8 werden nicht gebraucht und enthalten invokedynamic, das dx bei minSdk 24 nicht kann)
LIBS="$TOOLS/libs"
mkdir -p "$LIBS"
G=io/github/junkfood02/youtubedl-android
for a in library common ffmpeg; do
  fetch "$G/$a/$YTDL_VERSION/$a-$YTDL_VERSION.aar" "$LIBS/ytdl-$a.aar"
done
fetch org/jetbrains/kotlin/kotlin-stdlib/1.7.22/kotlin-stdlib-1.7.22.jar "$LIBS/kotlin-stdlib.jar"
fetch com/fasterxml/jackson/core/jackson-databind/2.11.4/jackson-databind-2.11.4.jar "$LIBS/jackson-databind.jar"
fetch com/fasterxml/jackson/core/jackson-core/2.11.4/jackson-core-2.11.4.jar "$LIBS/jackson-core.jar"
fetch com/fasterxml/jackson/core/jackson-annotations/2.11.4/jackson-annotations-2.11.4.jar "$LIBS/jackson-annotations.jar"
fetch commons-io/commons-io/2.5/commons-io-2.5.jar "$LIBS/commons-io.jar"
fetch org/apache/commons/commons-compress/1.12/commons-compress-1.12.jar "$LIBS/commons-compress.jar"

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/gen" "$OUT/aar" "$OUT/ytdl-res/raw" "$ROOT/release"

echo "Bibliotheken entpacken …"
for a in library common ffmpeg; do
  mkdir -p "$OUT/aar/$a"
  unzip -oq "$LIBS/ytdl-$a.aar" -d "$OUT/aar/$a"
done
# Von der Bibliothek wird nur res/raw/ytdlp (das yt-dlp-Programm) gebraucht
cp "$OUT/aar/library/res/raw/ytdlp" "$OUT/ytdl-res/raw/ytdlp"
LIBJARS="$OUT/aar/library/classes.jar:$OUT/aar/common/classes.jar:$OUT/aar/ffmpeg/classes.jar"
DEPJARS="$LIBS/kotlin-stdlib.jar:$LIBS/jackson-databind.jar:$LIBS/jackson-core.jar:$LIBS/jackson-annotations.jar:$LIBS/commons-io.jar:$LIBS/commons-compress.jar"

echo "Ressourcen …"
"$TOOLS/aapt2" compile --dir "$ROOT/app/res" -o "$OUT/res.zip"
"$TOOLS/aapt2" compile --dir "$OUT/ytdl-res" -o "$OUT/ytdl-res.zip"
"$TOOLS/aapt2" link -o "$OUT/base.apk" -I "$TOOLS/android-framework.jar" \
  --manifest "$ROOT/app/AndroidManifest.xml" -A "$ROOT/app/assets" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --java "$OUT/gen" --extra-packages com.yausername.youtubedl_android \
  "$OUT/res.zip" "$OUT/ytdl-res.zip"

echo "Java …"
javac -nowarn -Xlint:-options --release 8 -encoding UTF-8 \
  -classpath "$TOOLS/android-all-34.jar:$LIBJARS:$DEPJARS" -d "$OUT/classes" \
  $(find "$ROOT/app/java" "$OUT/gen" -name '*.java')
# dx kennt keine Java-9-Moduldateien (module-info.class), daher nur die Klassen übernehmen
for j in ${LIBJARS//:/ } ${DEPJARS//:/ }; do
  unzip -oq "$j" -x 'META-INF/*' -d "$OUT/classes"
done
rm -f "$OUT/classes/module-info.class"
mkdir -p "$OUT/dex"
java -Xmx2g -cp "$TOOLS/dx.jar" com.android.dx.command.Main --dex --multi-dex --min-sdk-version=24 \
  --output="$OUT/dex" "$OUT/classes"

for abi in $ABIS; do
  case "$abi" in
    arm64-v8a) name=ClipSaver ;;
    armeabi-v7a) name=ClipSaver-32bit ;;
    *) name="ClipSaver-$abi" ;;
  esac
  echo "Packen & signieren ($abi) …"
  python3 "$ROOT/tools/package_apk.py" "$OUT/base.apk" "$OUT/dex" "$abi" "$ROOT/release/$name.apk" \
    "$ROOT/tools/debug-signing.p12" android \
    "$OUT/aar/library/jni" "$OUT/aar/ffmpeg/jni"
  echo "Fertig: release/$name.apk ($(du -h "$ROOT/release/$name.apk" | cut -f1))"
done
