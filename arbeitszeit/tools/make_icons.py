"""Erzeugt die PNG-Launcher-Icons (für Android 7; ab Android 8 wird das Vektor-Icon genutzt).

Aufruf: python3 arbeitszeit/tools/make_icons.py [vorschau-512.png]
"""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'res')
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
BG, WHITE, BADGE = (47, 91, 219), (255, 255, 255), (159, 240, 200)


def draw(px):
    s = 4  # Supersampling
    n = px * s
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=BG)
    # Gleiche Koordinaten wie das Vektor-Icon (108er-Raster), auf die 72er-Sicherheitszone skaliert
    k = n / 72
    off = (108 - 72) / 2

    def p(x, y):
        return ((x - off) * k, (y - off) * k)

    w = round(4.5 * k)
    r = 20 * k
    cx, cy = p(48, 54)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=WHITE, width=w)
    pts = [p(48, 41), p(48, 54), p(40.5, 49)]
    d.line(pts, fill=WHITE, width=w, joint='curve')
    for pt in pts:
        d.ellipse([pt[0] - w / 2, pt[1] - w / 2, pt[0] + w / 2, pt[1] + w / 2], fill=WHITE)
    bx, by = p(69, 60)
    br = 13.5 * k
    d.ellipse([bx - br, by - br, bx + br, by + br], fill=BG)
    br = 12 * k
    d.ellipse([bx - br, by - br, bx + br, by + br], fill=BADGE)
    cw = round(3.5 * k)
    chk = [p(63.5, 60.5), p(67.5, 64.5), p(74.5, 56.5)]
    d.line(chk, fill=BG, width=cw, joint='curve')
    for pt in (chk[0], chk[2]):
        d.ellipse([pt[0] - cw / 2, pt[1] - cw / 2, pt[0] + cw / 2, pt[1] + cw / 2], fill=BG)
    return im.resize((px, px), Image.LANCZOS)


for name, size in SIZES.items():
    folder = os.path.join(ROOT, 'mipmap-' + name)
    os.makedirs(folder, exist_ok=True)
    draw(size).save(os.path.join(folder, 'ic_launcher.png'), optimize=True)
if len(sys.argv) > 1:
    draw(512).save(sys.argv[1])
