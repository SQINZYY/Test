"""Erzeugt die PNG-Launcher-Icons für Standbild (Android 7; ab Android 8 wird das Vektor-Icon genutzt)."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'android', 'res')
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
BG, PAPER, ACCENT, INK = (21, 23, 28), (244, 242, 238), (199, 0, 99), (21, 23, 28)


def draw(px):
    s = 4  # Supersampling
    n = px * s
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=BG)
    # gleiche Koordinaten wie das Vektor-Icon, Ausschnitt 21–87 auf die volle Fläche gezogen
    k = n / 66
    m = lambda v: (v - 21) * k
    d.rounded_rectangle([m(31), m(29), m(67), m(79)], radius=2 * k, fill=PAPER)
    d.rectangle([m(34), m(32), m(64), m(61)], fill=ACCENT)
    d.polygon([(m(34), m(61)), (m(43), m(51)), (m(50), m(58)), (m(55), m(53)), (m(64), m(61))], fill=INK)
    d.rectangle([m(37), m(66), m(55), m(69.5)], fill=INK)
    d.rectangle([m(37), m(72), m(48), m(74)], fill=INK)
    w = max(1, round(2.2 * k))
    d.ellipse([m(72), m(26), m(82), m(36)], outline=PAPER, width=w)
    d.line([m(77), m(23), m(77), m(39)], fill=PAPER, width=w)
    d.line([m(69), m(31), m(85), m(31)], fill=PAPER, width=w)
    return im.resize((px, px), Image.LANCZOS)


for name, px in SIZES.items():
    folder = os.path.join(ROOT, 'mipmap-' + name)
    os.makedirs(folder, exist_ok=True)
    draw(px).save(os.path.join(folder, 'ic_launcher.png'))
print('Icons geschrieben')
