"""Erzeugt die PNG-Launcher-Icons (für Android 7, ab Android 8 wird das Vektor-Icon genutzt)."""
import math
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'res')
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
BG, RING, BLADE, GOLD = (26, 15, 36), (159, 103, 245), (245, 230, 200), (245, 158, 11)


def draw(px):
    s = 4  # supersampling
    n = px * s
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=BG)
    k = n / 72  # 72er-Raster = 66dp-Zone des Vektor-Icons (Mitte 36)
    c = 36 * k
    w = max(1, round(1.8 * k))
    r = 19 * k
    d.ellipse([c - r, c - r, c + r, c + r], outline=RING, width=w)
    for rot in (0, math.pi):
        pts = [(c + 15 * k * math.sin(rot + i * 2 * math.pi / 3), c - 15 * k * math.cos(rot + i * 2 * math.pi / 3)) for i in range(3)]
        d.polygon(pts, outline=RING + (110,), width=max(1, round(1.1 * k)))
    d.polygon([(c, 14 * k), (c + 3 * k, 18.5 * k), (c + 3 * k, 44 * k), (c - 3 * k, 44 * k), (c - 3 * k, 18.5 * k)], fill=BLADE)
    d.rounded_rectangle([c - 9 * k, 44 * k, c + 9 * k, 47 * k], radius=1.5 * k, fill=GOLD)
    d.rectangle([c - 1.5 * k, 47 * k, c + 1.5 * k, 54.5 * k], fill=GOLD)
    d.ellipse([c - 2.6 * k, 54 * k, c + 2.6 * k, 59.2 * k], fill=GOLD)
    return im.resize((px, px), Image.LANCZOS)


for name, px in SIZES.items():
    folder = os.path.join(ROOT, 'mipmap-' + name)
    os.makedirs(folder, exist_ok=True)
    draw(px).save(os.path.join(folder, 'ic_launcher.png'), optimize=True)
if len(sys.argv) > 1:
    draw(512).save(sys.argv[1])
