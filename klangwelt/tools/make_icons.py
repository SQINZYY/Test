"""Erzeugt die Icons: Windows (desktop/icon.ico + icon.png) und Android (PNG-Launcher-Icons bis Android 7).
Ab Android 8 nutzt die App das Vektor-Icon android/res/drawable/ic_launcher_foreground.xml.

Aufruf: python3 klangwelt/tools/make_icons.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
GREEN = (30, 215, 96)
DARK = (18, 18, 18)
# Fünf symmetrische Balken im 48er-Raster wie in web/icon.svg: (x, y, Höhe), Breite 4
BARS = [(9, 20, 8), (15.5, 15, 18), (22, 11, 26), (28.5, 15, 18), (35, 20, 8)]
BAR_W = 4


def draw(px, rounded_bg=False):
    s = 4  # Supersampling für glatte Kanten
    n = px * s
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = n / 48
    if rounded_bg:
        # Android-Launcher bis Version 7: dunkles abgerundetes Quadrat mit grünem Kreis
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=DARK)
        pad = n * 0.12
        d.ellipse([pad, pad, n - 1 - pad, n - 1 - pad], fill=GREEN)
        k = (n - 2 * pad) / 48
        off = pad
    else:
        d.ellipse([0, 0, n - 1, n - 1], fill=GREEN)
        off = 0
    for x, y, h in BARS:
        d.rounded_rectangle([off + x * k, off + y * k, off + (x + BAR_W) * k, off + (y + h) * k], radius=BAR_W / 2 * k, fill=DARK)
    return im.resize((px, px), Image.LANCZOS)


def main():
    desktop = os.path.join(ROOT, 'desktop')
    big = draw(256)
    big.save(os.path.join(desktop, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    draw(512).save(os.path.join(desktop, 'icon.png'), optimize=True)

    res = os.path.join(ROOT, 'android', 'res')
    for name, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        folder = os.path.join(res, 'mipmap-' + name)
        os.makedirs(folder, exist_ok=True)
        draw(px, rounded_bg=True).save(os.path.join(folder, 'ic_launcher.png'), optimize=True)


if __name__ == '__main__':
    main()
