"""Erzeugt die PNG-Launcher-Icons (für Android 7, ab Android 8 wird das Vektor-Icon genutzt)."""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'res')
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
BG, FG, FG2 = (11, 42, 49), (45, 212, 191), (94, 234, 212)


def draw(px):
    s = 4  # supersampling
    n = px * s
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=BG)
    k = n / 72  # Koordinaten im 72er-Raster (entspricht der 66dp-Zone des Vektor-Icons)
    w = max(1, round(3.2 * k))
    d.rounded_rectangle([13 * k, 20 * k, 49 * k, 46 * k], radius=3 * k, outline=FG, width=w)
    d.polygon([(16 * k, 40 * k), (24 * k, 33 * k), (29 * k, 37 * k), (37 * k, 29 * k), (46 * k, 38 * k), (46 * k, 43 * k), (16 * k, 43 * k)], fill=(45, 212, 191, 90))
    d.line([31 * k, 46 * k, 31 * k, 53 * k], fill=FG, width=w)
    d.line([23 * k, 54 * k, 39 * k, 54 * k], fill=FG, width=w)
    d.rounded_rectangle([52 * k, 18 * k, 64 * k, 54 * k], radius=2 * k, outline=FG, width=w)
    for cy in (30, 41):
        d.ellipse([55.5 * k, (cy - 2.5) * k, 60.5 * k, (cy + 2.5) * k], fill=FG2)
    return im.resize((px, px), Image.LANCZOS)


for name, px in SIZES.items():
    folder = os.path.join(ROOT, 'mipmap-' + name)
    os.makedirs(folder, exist_ok=True)
    draw(px).save(os.path.join(folder, 'ic_launcher.png'), optimize=True)
if len(sys.argv) > 1:
    draw(512).save(sys.argv[1])
