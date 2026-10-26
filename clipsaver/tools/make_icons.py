"""Erzeugt die PNG-Launcher-Icons (für Android 7, ab Android 8 wird das Vektor-Icon genutzt)."""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'res')
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
BG, PINK, CYAN, WHITE = (20, 20, 31), (255, 61, 110), (34, 211, 238), (255, 255, 255)


def draw(px):
    s = 4  # supersampling
    n = px * s
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=BG)
    k = n / 72  # Koordinaten im 72er-Raster (entspricht der 66dp-Zone des Vektor-Icons, Mitte = 36)
    w = max(1, round(3.4 * k))
    cx, cy, r = 36 * k, 32 * k, 17 * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=PINK)
    d.line([cx, 23 * k, cx, 39 * k], fill=WHITE, width=w)
    d.line([29 * k, 33 * k, cx, 40 * k, 43 * k, 33 * k], fill=WHITE, width=w, joint='curve')
    d.line([21 * k, 53 * k, 21 * k, 57 * k, 51 * k, 57 * k, 51 * k, 53 * k], fill=CYAN, width=w, joint='curve')
    return im.resize((px, px), Image.LANCZOS)


for name, px in SIZES.items():
    folder = os.path.join(ROOT, 'mipmap-' + name)
    os.makedirs(folder, exist_ok=True)
    draw(px).save(os.path.join(folder, 'ic_launcher.png'), optimize=True)
if len(sys.argv) > 1:
    draw(512).save(sys.argv[1])
