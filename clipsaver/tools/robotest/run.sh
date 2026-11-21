#!/usr/bin/env bash
# Robolectric-Smoke-Test der Android-Teile: App-Start, Oberfläche aus den Assets, Download-Dienst, Browser.
# Braucht Gradle 8, JDK 21 und Internet (Maven Central, GitHub für androidx.test:monitor).
# Vorher ./tools/build.sh ausführen (liefert build/classes und build/base.apk).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
[ -d "$DIR/../../build/classes" ] || { echo "Erst ./tools/build.sh ausführen"; exit 1; }
if [ ! -d "$DIR/.android-test/runner/monitor" ]; then
  git clone -q --depth 1 --filter=blob:none --sparse https://github.com/android/android-test.git "$DIR/.android-test"
  git -C "$DIR/.android-test" sparse-checkout set runner/monitor
fi
cd "$DIR" && gradle --no-daemon -q test "$@"
