"""Local fallback inpainting (OpenCV Telea) for thin handwriting on smooth backgrounds.

Usage: python3 inpaint_ink.py IN OUT x0 y0 x1 y1 [mode]
Region is in fractions of the image. mode 'dark' (default) masks pixels much darker than their
blurred surroundings; 'light' masks pixels much lighter (e.g. white lettering).
"""
import sys
import cv2
import numpy as np

src, out = sys.argv[1:3]
x0, y0, x1, y1 = (float(v) for v in sys.argv[3:7])
mode = sys.argv[7] if len(sys.argv) > 7 else "dark"
img = cv2.imread(src)
h, w = img.shape[:2]
g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
bg = cv2.medianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), 31).astype(np.float32)
diff = (bg - g) if mode == "dark" else (g - bg)
mask = (diff > 18).astype(np.uint8) * 255
roi = np.zeros_like(mask); roi[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = 255
mask = cv2.bitwise_and(mask, roi)
mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
res = cv2.inpaint(img, mask, 9, cv2.INPAINT_TELEA)
cv2.imwrite(out, res)
print(out, int(mask.sum() / 255), "px masked")

# Smooth the filled area so it matches the soft background (feathered blend of a heavy blur).
if len(sys.argv) > 8 and sys.argv[8] == "smooth":
    soft = cv2.GaussianBlur(res, (0, 0), 22)
    feather = cv2.GaussianBlur(cv2.dilate(mask, np.ones((25, 25), np.uint8)), (0, 0), 14).astype(np.float32)[..., None] / 255
    res = (soft * feather + res * (1 - feather)).astype(np.uint8)
    cv2.imwrite(out, res)
