"""Draws the demo video's foreground: a sun and layered mountain ridges, as a transparent PNG."""
import math
import random
import sys
from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 720
out = sys.argv[1]
random.seed(7)

img = Image.new('RGBA', (W, H), (0, 0, 0, 0))

glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
sx, sy = 820, 360
for r, a in [(190, 30), (130, 50), (90, 80)]:
    g.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(255, 214, 160, a))
glow = glow.filter(ImageFilter.GaussianBlur(40))
img.alpha_composite(glow)
ImageDraw.Draw(img).ellipse([sx - 62, sy - 62, sx + 62, sy + 62], fill=(255, 236, 200, 255))


def ridge(base, amp, rough, color, seed):
    rnd = random.Random(seed)
    phases = [rnd.uniform(0, 6.28) for _ in range(4)]
    pts = []
    for x in range(0, W + 8, 8):
        y = base
        for i, f in enumerate([1.3, 2.9, 6.1, 13.0]):
            y -= amp / (i + 1) ** rough * math.sin(x / W * f * math.pi + phases[i])
        pts.append((x, y))
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(layer).polygon(pts + [(W, H), (0, H)], fill=color)
    img.alpha_composite(layer)


ridge(470, 60, 1.2, (122, 58, 120, 235), 1)
ridge(520, 55, 1.1, (86, 38, 96, 245), 2)
ridge(585, 50, 1.0, (54, 24, 70, 255), 3)
ridge(650, 40, 0.9, (30, 14, 44, 255), 4)
img.save(out)
