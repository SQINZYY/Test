"""Erzeugt die PNG-Launcher-Icons (Android 7; ab Android 8 wird das Vektor-Icon genutzt).

Aufruf: python3 unterwegs/tools/make_icons.py [vorschau.png]
"""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'res')
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
BG = (15, 118, 110)
WHITE = (255, 255, 255)
GOAL = (253, 230, 138)


def draw(px):
    s = 4  # Supersampling
    n = px * s
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=BG)
    k = n / 76  # Ausschnitt 16..92 des 108er-Rasters vom Vektor-Icon

    def p(x, y):
        return ((x - 16) * k, (y - 16) * k)

    w = round(6 * k)
    # Weg: oben gerade, Bogen rechts, Mitte gerade, Bogen links, unten gerade
    d.line([p(44, 40), p(64, 40)], fill=WHITE, width=w)
    # PIL zeichnet Bögen nach innen: Rahmen um die halbe Strichbreite vergrößern
    d.arc([p(52, 37), p(76, 61)], start=-90, end=90, fill=WHITE, width=w)
    d.line([p(64, 58), p(44, 58)], fill=WHITE, width=w)
    d.arc([p(32, 55), p(56, 79)], start=90, end=270, fill=WHITE, width=w)
    d.line([p(44, 76), p(66, 76)], fill=WHITE, width=w)
    for x, y in ((44, 40), (64, 40), (64, 58), (44, 58), (44, 76), (66, 76)):
        cx, cy = p(x, y)
        d.ellipse([cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2], fill=WHITE)
    # Start (Ring) und Ziel (Punkt)
    cx, cy = p(37, 40)
    r = 7 * k
    d.ellipse([cx - r - 2.5 * k, cy - r - 2.5 * k, cx + r + 2.5 * k, cy + r + 2.5 * k], fill=WHITE)
    d.ellipse([cx - r + 2.5 * k, cy - r + 2.5 * k, cx + r - 2.5 * k, cy + r - 2.5 * k], fill=BG)
    cx, cy = p(72, 76)
    r = 8 * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOAL)
    return im.resize((px, px), Image.LANCZOS)


for name, px in SIZES.items():
    folder = os.path.join(ROOT, 'mipmap-' + name)
    os.makedirs(folder, exist_ok=True)
    draw(px).save(os.path.join(folder, 'ic_launcher.png'), optimize=True)
if len(sys.argv) > 1:
    draw(512).save(sys.argv[1])
