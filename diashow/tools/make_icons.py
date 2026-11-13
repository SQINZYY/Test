"""Erzeugt die PNG-Launcher-Icons (für Android 7, ab Android 8 wird das Vektor-Icon genutzt)."""
import math
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'res')
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
BG = (26, 20, 38)
CORAL, AMBER, DARK, PAPER = (255, 122, 89), (255, 193, 94), (200, 72, 58), (255, 253, 248)


def rot(points, deg, cx, cy):
    a = math.radians(deg)
    return [(cx + (x - cx) * math.cos(a) - (y - cy) * math.sin(a), cy + (x - cx) * math.sin(a) + (y - cy) * math.cos(a)) for x, y in points]


def draw(px):
    s = 4  # Supersampling
    n = px * s
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=BG)
    # Koordinaten im 108er-Raster des Vektor-Icons, auf die 72er-Fläche (66dp-Zone) skaliert
    k = n / 72
    o = 18  # (108 - 72) / 2

    def p(x, y):
        return ((x - o) * k, (y - o) * k)

    back = rot([(29, 32), (79, 32), (79, 76), (29, 76)], -13, 54, 54)
    d.polygon([p(x, y) for x, y in back], fill=AMBER)
    d.rounded_rectangle([*p(29, 32), *p(79, 76)], radius=3 * k, fill=PAPER)
    d.rectangle([*p(33, 36), *p(75, 66)], fill=CORAL)
    d.polygon([p(33, 66), p(44, 53), p(51, 59), p(60, 48), p(75, 63), p(75, 66)], fill=DARK)
    d.ellipse([*p(63, 39), *p(71, 47)], fill=AMBER)
    d.ellipse([*p(63, 60), *p(85, 82)], fill=BG)
    d.ellipse([*p(65, 62), *p(83, 80)], fill=CORAL)
    d.polygon([p(71, 66), p(79.5, 71), p(71, 76)], fill=(255, 255, 255))
    return im.resize((px, px), Image.LANCZOS)


for name, px in SIZES.items():
    folder = os.path.join(ROOT, 'mipmap-' + name)
    os.makedirs(folder, exist_ok=True)
    draw(px).save(os.path.join(folder, 'ic_launcher.png'), optimize=True)
if len(sys.argv) > 1:
    draw(512).save(sys.argv[1])
