"""Turn a flat-background crop of handwriting/doodle into a transparent PNG (ink colour + alpha).

Usage: python3 extract_ink.py IN OUT
alpha = how much darker a pixel is than the local background (95th percentile luminance).
"""
import sys
from PIL import Image
import numpy as np

src, out = sys.argv[1:3]
im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
L = 0.299 * im[..., 0] + 0.587 * im[..., 1] + 0.114 * im[..., 2]
bg, ink = np.percentile(L, 60), np.percentile(L, 2)
a = np.clip((bg - L - 10) / max(bg - ink - 10, 1) * 1.35, 0, 1) ** 0.8
mask = a > 0.75
color = np.median(im[mask], axis=0) if mask.any() else np.array([240, 150, 190])
rgba = np.zeros(im.shape[:2] + (4,), np.uint8)
rgba[..., :3] = color
rgba[..., 3] = (a * 255).astype(np.uint8)
Image.fromarray(rgba, "RGBA").save(out)
print(out, color.astype(int))
