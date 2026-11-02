"""Hide the cut-off head behind the counter (right side of the ref-01 diorama) without fal.ai:
1) tight Telea inpaint of the head, 2) clone of the scene's own potted plant (keyed leaves) on top,
so the spot reads as a plant growing behind the basin, like the existing one. Writes base-v4 + video mask."""
import cv2, numpy as np
img = cv2.imread('ref01/diorama-base-v3.png'); h, w = img.shape[:2]
m = np.zeros((h, w), np.uint8)
cv2.ellipse(m, (1955, 466), (44, 38), 0, 0, 360, 255, -1)
cv2.rectangle(m, (1914, 445), (1938, 498), 255, -1)
base = cv2.inpaint(img, m, 5, cv2.INPAINT_NS)
# plant clone (source bbox in base-v3 px)
src = img[448:540, 2088:2226].copy()
hsv = cv2.cvtColor(src, cv2.COLOR_BGR2HSV)
b, g, r = [src[..., i].astype(int) for i in range(3)]
leaf = ((g > r + 4) & (g > b - 6)) | (hsv[..., 2] < 95)
leaf = leaf.astype(np.uint8) * 255
leaf = cv2.morphologyEx(leaf, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
leaf = cv2.GaussianBlur(leaf, (0, 0), 0.8)
s = 0.86
src = cv2.resize(src, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
leaf = cv2.resize(leaf, (src.shape[1], src.shape[0]), interpolation=cv2.INTER_AREA)
ph, pw = src.shape[:2]
cx, by = 1952, 503            # plant centre x / bottom y at the basin edge
x0, y0 = cx - pw // 2, by - ph
a = leaf.astype(np.float32)[..., None] / 255
roi = base[y0:y0 + ph, x0:x0 + pw].astype(np.float32)
base[y0:y0 + ph, x0:x0 + pw] = (src * a + roi * (1 - a)).astype(np.uint8)
cv2.imwrite('ref01/diorama-base-v4.png', base)
vm = np.zeros((h, w), np.uint8); vm[y0 - 6:y0 + ph + 6, x0 - 6:x0 + pw + 6] = 255
vm = cv2.bitwise_or(vm, cv2.dilate(m, np.ones((9, 9), np.uint8)))
cv2.imwrite('ref01/head-mask.png', cv2.GaussianBlur(vm, (0, 0), 4))
cv2.imwrite('/private/tmp/claude-501/-Users-kordiangoldman-repos-gugu/4d17276d-b612-47fd-811d-105b2f677f17/scratchpad/head6.png', cv2.resize(base[380:560, 1780:2080], (900, 540)))
print('ok', x0, y0, pw, ph)
