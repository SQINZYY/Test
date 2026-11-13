"""Lädt reine Python-Wheels (py3-none-any) fester Versionen von PyPI und prüft ihre SHA-256-Summe.

Aufruf: python3 fetch_wheels.py <ziel-ordner> name==version ...
Für gallery-dl in der App (assets/gdl): gallery-dl und requests mit Abhängigkeiten.
"""
import hashlib
import json
import os
import sys
import urllib.request


def fetch(dest, spec):
    name, version = spec.split('==')
    with urllib.request.urlopen('https://pypi.org/pypi/%s/%s/json' % (name, version), timeout=60) as r:
        info = json.load(r)
    for f in info['urls']:
        if f['packagetype'] == 'bdist_wheel' and f['filename'].endswith('-none-any.whl'):
            path = os.path.join(dest, f['filename'])
            if not os.path.exists(path):
                print('Lade %s …' % f['filename'])
                with urllib.request.urlopen(f['url'], timeout=120) as r:
                    data = r.read()
                if hashlib.sha256(data).hexdigest() != f['digests']['sha256']:
                    raise SystemExit('Prüfsumme falsch: ' + f['filename'])
                with open(path + '.tmp', 'wb') as out:
                    out.write(data)
                os.replace(path + '.tmp', path)
            return f['filename']
    raise SystemExit('Kein reines Wheel für ' + spec)


def main():
    dest = sys.argv[1]
    os.makedirs(dest, exist_ok=True)
    wanted = {fetch(dest, spec) for spec in sys.argv[2:]}
    for name in os.listdir(dest):
        if name.endswith('.whl') and name not in wanted:
            os.remove(os.path.join(dest, name))


if __name__ == '__main__':
    main()
