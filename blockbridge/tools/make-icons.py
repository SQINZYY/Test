"""Erzeugt das App-Symbol (zwei Blöcke mit Pfeilen) für Windows, Android und die Oberfläche.

Aufruf: python3 tools/make-icons.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
BG = (22, 35, 28, 255)
FG = (232, 239, 233, 255)

# Koordinaten wie im SVG-Logo (64er-Raster)
POLYS = [
    ([(8, 20), (22, 13), (36, 20), (22, 27)], (122, 209, 82)),
    ([(8, 20), (8, 36), (22, 43), (22, 27)], (138, 90, 51)),
    ([(22, 27), (22, 43), (36, 36), (36, 20)], (107, 68, 38)),
    ([(28, 38), (42, 31), (56, 38), (42, 45)], (108, 195, 239)),
    ([(28, 38), (28, 54), (42, 61), (42, 45)], (59, 127, 184)),
    ([(42, 45), (42, 61), (56, 54), (56, 38)], (44, 101, 150)),
]
ARROWS = [
    [(40, 12), (50, 12)], [(50, 12), (47, 9)], [(50, 12), (47, 15)],
    [(24, 52), (14, 52)], [(14, 52), (17, 55)], [(14, 52), (17, 49)],
]


def logo(size, scale=1.0, offset=(0, 0)):
    """Logo auf transparentem Grund; scale: Anteil der Fläche, die das 64er-Raster einnimmt."""
    s = 4
    n = size * s
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = n * scale / 64
    ox = (n - 64 * k) / 2 + offset[0] * n
    oy = (n - 64 * k) / 2 + offset[1] * n
    P = lambda pts: [(ox + x * k, oy + y * k) for x, y in pts]
    for pts, col in POLYS:
        d.polygon(P(pts), fill=col + (255,))
    w = max(1, round(2.8 * k))
    for seg in ARROWS:
        a, b = P(seg)
        d.line([a, b], fill=FG, width=w)
        for p in (a, b):
            d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=FG)
    return im


def app_icon(size, round_shape=False):
    s = 4
    n = size * s
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if round_shape:
        d.ellipse([0, 0, n - 1, n - 1], fill=BG)
    else:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=BG)
    big = logo(size, 0.78 if not round_shape else 0.7).resize((n, n), Image.LANCZOS)
    im.alpha_composite(big)
    return im.resize((size, size), Image.LANCZOS)


def save(im, *parts):
    p = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, optimize=True)


save(app_icon(512), 'assets', 'icon.png')
save(app_icon(256), 'assets', 'icon-256.png')
save(app_icon(64), 'src', 'icon.png')

# Android: klassische Symbole + adaptives Symbol (Vordergrund 108dp, Logo in der 66dp-Zone)
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, f in DENS.items():
    px = round(48 * f)
    save(app_icon(px), 'android', 'res', 'mipmap-' + name, 'ic_launcher.png')
    save(app_icon(px, True), 'android', 'res', 'mipmap-' + name, 'ic_launcher_round.png')
    fg = round(108 * f)
    save(logo(fg * 4, 0.6).resize((fg, fg), Image.LANCZOS), 'android', 'res', 'mipmap-' + name, 'ic_launcher_foreground.png')
print('Symbole erzeugt')

# Windows-Symbol: go-winres macht daraus alle Größen
save(app_icon(256), 'windows', 'winres', 'icon.png')
print('windows/winres/icon.png erzeugt')
