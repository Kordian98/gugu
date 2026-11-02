"""Composite the official GuGu logo (SVG rendered to PNG via rsvg-convert) onto a render.

Usage: python3 composite_logo.py IN LOGO_PNG OUT CX CY WIDTH SLOPE [GLOW_ALPHA]
SLOPE > 0: the logo baseline rises to the right (left-wall planes); SLOPE < 0: falls to the right.
Placements used are recorded in design/hero/MANIFEST.md.
"""
import sys
from PIL import Image, ImageFilter

src, logo_png, out = sys.argv[1:4]
cx, cy, w = (int(v) for v in sys.argv[4:7])
k = float(sys.argv[7])
glow_a = float(sys.argv[8]) if len(sys.argv) > 8 else 0.85

im = Image.open(src).convert("RGBA")
logo = Image.open(logo_png).convert("RGBA")
h = round(logo.height * w / logo.width)
logo = logo.resize((w, h), Image.LANCZOS)
H = h + round(abs(k) * w)
if k >= 0:   # left edge lower than right edge
    coeffs = (1, 0, 0, k, 1, -k * w)
else:        # left edge higher than right edge
    coeffs = (1, 0, 0, k, 1, 0)
sheared = logo.transform((w, H), Image.AFFINE, coeffs, resample=Image.BICUBIC)

pad = 28
layer = Image.new("RGBA", (w + 2 * pad, H + 2 * pad), (0, 0, 0, 0))
glow = Image.new("RGBA", sheared.size, (255, 214, 228, 0))
glow.putalpha(sheared.split()[3].point(lambda a: int(a * glow_a)))
layer.alpha_composite(glow, (pad, pad))
layer = layer.filter(ImageFilter.GaussianBlur(7))
layer.alpha_composite(sheared, (pad, pad))
im.alpha_composite(layer, (cx - w // 2 - pad, cy - H // 2 - pad))
im.convert("RGB").save(out)
