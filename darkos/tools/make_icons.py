"""Erzeugt die PNG-Launcher-Icons von DarkOS (für Android 7; ab Android 8 wird das Vektor-Icon genutzt).

Aufruf: python3 darkos/tools/make_icons.py [vorschau-512.png]
"""
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'res')
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
VIOLET, PINK, CYAN, CORE = (192, 132, 252), (244, 114, 182), (34, 211, 238), (243, 232, 255)


def gradient_line(n, a, b):
    """Diagonaler Verlauf von a nach b als RGB-Bild."""
    g = Image.new('RGB', (n, n))
    px = g.load()
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * (n - 1))
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return g


def draw(px):
    s = 4  # Supersampling
    n = px * s
    k = n / 72  # 72er-Raster entspricht der sichtbaren Fläche des adaptiven Icons (108 - 2*18)
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))

    # Hintergrund: dunkles Violett mit Verlauf zur Mitte
    bg = Image.new('RGBA', (n, n), (5, 3, 11, 255))
    glow = Image.new('L', (n, n), 0)
    ImageDraw.Draw(glow).ellipse([n * 0.1, n * 0.05, n * 0.9, n * 0.85], fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(n * 0.18))
    bg.paste(Image.new('RGBA', (n, n), (43, 15, 82, 255)), (0, 0), glow)
    mask = Image.new('L', (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.24, fill=255)
    im.paste(bg, (0, 0), mask)

    def shape_layer(width, blur=0):
        layer = Image.new('L', (n, n), 0)
        d = ImageDraw.Draw(layer)
        o = 15  # Rahmen 33..75 im 108er-Raster -> 15..57 im 72er-Raster
        d.rounded_rectangle([o * k, o * k, (o + 42) * k, (o + 42) * k], radius=12 * k, outline=255, width=round(width * k))
        return layer.filter(ImageFilter.GaussianBlur(blur)) if blur else layer

    ring_glow = shape_layer(5, blur=n * 0.035)
    im.paste(gradient_line(n, VIOLET, PINK).convert('RGBA'), (0, 0), ring_glow.point(lambda v: v * 0.8))
    im.paste(gradient_line(n, VIOLET, PINK).convert('RGBA'), (0, 0), shape_layer(3.5))

    # "D"
    d_layer = Image.new('L', (n, n), 0)
    dd = ImageDraw.Draw(d_layer)
    w = round(3.5 * k)
    x0, y0, y1 = 29.5 * k, 26 * k, 46 * k
    cx, cy, r = x0 + 4.5 * k, (y0 + y1) / 2, 10 * k
    pts = [(x0, y1), (x0, y0), (cx, y0)]
    pts += [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in range(-90, 91, 6)]
    pts += [(x0, y1), (x0, y0)]
    dd.line(pts, fill=255, width=w, joint='curve')
    im.paste(Image.new('RGBA', (n, n), VIOLET + (255,)), (0, 0), d_layer.filter(ImageFilter.GaussianBlur(n * 0.03)))
    im.paste(Image.new('RGBA', (n, n), CORE + (255,)), (0, 0), d_layer)

    # Punkt oben rechts
    dot = Image.new('L', (n, n), 0)
    ImageDraw.Draw(dot).ellipse([(57 - 3.2) * k, (15 - 3.2) * k, (57 + 3.2) * k, (15 + 3.2) * k], fill=255)
    im.paste(Image.new('RGBA', (n, n), CYAN + (255,)), (0, 0), dot.filter(ImageFilter.GaussianBlur(n * 0.025)))
    im.paste(Image.new('RGBA', (n, n), CYAN + (255,)), (0, 0), dot)

    out = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out.resize((px, px), Image.LANCZOS)


for name, size in SIZES.items():
    folder = os.path.join(ROOT, 'mipmap-' + name)
    os.makedirs(folder, exist_ok=True)
    draw(size).save(os.path.join(folder, 'ic_launcher.png'), optimize=True)
if len(sys.argv) > 1:
    draw(512).save(sys.argv[1])
