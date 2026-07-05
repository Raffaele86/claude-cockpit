#!/usr/bin/env python3
"""Genera build/icon.ico per Claude Cockpit — tile scuro + prompt '>_' terracotta.
Nessuna dipendenza esterna oltre Pillow. Rendering a 1024 poi downscale LANCZOS."""
import os
from PIL import Image, ImageDraw

S = 1024
BG_TOP = (23, 26, 33)      # #171a21
BG_BOT = (13, 16, 21)      # #0d1015
BORDER = (43, 49, 64)      # #2b3140
ACCENT = (217, 138, 74)    # #d98a4a
ACCENT_HI = (233, 165, 110)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Gradiente verticale dentro un tile a bordi tondi.
radius = 200
grad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)
for y in range(S):
    t = y / (S - 1)
    c = tuple(round(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3))
    gd.line([(0, y), (S, y)], fill=c + (255,))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=255)
img.paste(grad, (0, 0), mask)

# Bordo.
d.rounded_rectangle([6, 6, S - 7, S - 7], radius=radius - 4, outline=BORDER + (255,), width=8)

def stroke(p0, p1, w, color):
    d.line([p0, p1], fill=color + (255,), width=w)
    r = w // 2
    for (x, y) in (p0, p1):
        d.ellipse([x - r, y - r, x + r, y + r], fill=color + (255,))

# Chevron ">" (prompt) a sinistra-centro.
w = 70
cx, cy = 385, S // 2
dx, dy = 150, 150
stroke((cx - dx // 2, cy - dy), (cx + dx // 2, cy), w, ACCENT)
stroke((cx + dx // 2, cy), (cx - dx // 2, cy + dy), w, ACCENT)

# Blocco cursore a destra.
cur_w, cur_h = 150, 60
cx2 = 560
d.rounded_rectangle([cx2, cy + 60, cx2 + cur_w, cy + 60 + cur_h], radius=16, fill=ACCENT_HI + (255,))

out_dir = os.path.dirname(os.path.abspath(__file__))
base = img.resize((256, 256), Image.LANCZOS)
sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
base.save(os.path.join(out_dir, "icon.ico"), format="ICO", sizes=sizes)
img.resize((256, 256), Image.LANCZOS).save(os.path.join(out_dir, "icon.png"))
print("icon.ico + icon.png scritti in", out_dir)
