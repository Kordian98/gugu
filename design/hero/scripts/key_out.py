"""Remove a flat background from an icon crop: alpha from colour distance (CIE Lab) to the background,
then un-premultiply edge pixels against that background so there is no halo.

Usage: python3 key_out.py IN OUT [lo] [hi]   (deltaE ramp; defaults 3 and 14)
The background colour is the median of the crop border, so crops must have a flat margin.
"""
import sys
import numpy as np
from PIL import Image
from skimage import color

src, out = sys.argv[1:3]
lo = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
hi = float(sys.argv[4]) if len(sys.argv) > 4 else 14.0
rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255
h, w = rgb.shape[:2]
b = max(2, int(min(h, w) * 0.04))
border = np.concatenate([rgb[:b].reshape(-1, 3), rgb[-b:].reshape(-1, 3), rgb[:, :b].reshape(-1, 3), rgb[:, -b:].reshape(-1, 3)])
bg = np.median(border, axis=0)
lab = color.rgb2lab(rgb)
d = np.linalg.norm(lab - color.rgb2lab(bg.reshape(1, 1, 3)), axis=2)
a = np.clip((d - lo) / (hi - lo), 0, 1)
safe = np.maximum(a, 1e-3)[..., None]
fg = np.clip((rgb - (1 - a[..., None]) * bg) / safe, 0, 1)
outimg = np.dstack([fg, a]) * 255
Image.fromarray(outimg.astype(np.uint8), "RGBA").save(out)
print(out, "bg", (bg * 255).astype(int))
