#!/usr/bin/env python3
"""
Export the landing walk-through as scroll-scrub frame sequences (GuGu Studio landing v4).

  python3 design/hero/scripts/walk_frames.py

Input:  design/hero/studio/photo/video/walk{1,2,3}-4k.mp4 (fal: Wan 3.0 first/last-frame walks, 4K-upscaled;
        request ids in scripts/runs.jsonl). Local only (gitignored).
Output: apps/app/public/studio/walk/w{1,2,3}/d/NNN.webp  desktop, full frame, 2048 px wide (weight budget:
                                                         ~4 MB per walk; slightly soft on @2x while moving)
        apps/app/public/studio/walk/w{1,2,3}/m/NNN.webp  mobile, 9:16 portrait crop (720×1280) that pans
                                                         along FOCUS so the subject stays in frame
Every 2nd source frame (90 per walk; the player cross-blends neighbours), written to a temp dir and swapped in atomically so a running
preview never sees a half-written sequence. Needs ffmpeg + Pillow + cwebp.
"""
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SRC = os.path.join(ROOT, "design/hero/studio/photo/video")
OUT = os.path.join(ROOT, "apps/app/public/studio/walk")
N = 90
# Horizontal focus (0..1 of frame width) per output frame index, piecewise linear.
FOCUS = {
    "w1": [(0, 0.5), (50, 0.5), (76, 0.6), (89, 0.6)],
    "w2": [(0, 0.6), (34, 0.5), (89, 0.5)],
    "w3": [(0, 0.5), (55, 0.5), (78, 0.4), (89, 0.4)],
}


def focus(seg: str, i: int) -> float:
    pts = FOCUS[seg]
    for (a, fa), (b, fb) in zip(pts, pts[1:]):
        if a <= i <= b:
            t = (i - a) / max(1, b - a)
            t = t * t * (3 - 2 * t)  # smoothstep: no sudden pans
            return fa + (fb - fa) * t
    return pts[-1][1]


def webp(img: Image.Image, path: str, q: int) -> None:
    tmp = path + ".png"
    img.save(tmp)
    subprocess.run(["cwebp", "-quiet", "-q", str(q), tmp, "-o", path], check=True)
    os.remove(tmp)


def main() -> None:
    segs = sys.argv[1:] or ["w1", "w2", "w3"]
    for seg in segs:
        src = os.path.join(SRC, f"walk{seg[1]}-4k.mp4")
        tmp = tempfile.mkdtemp()
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-vf", "select='not(mod(n\\,2))'",
             "-fps_mode", "vfr", os.path.join(tmp, "%03d.png")],
            check=True,
        )
        stage = os.path.join(OUT, f".{seg}.new")
        shutil.rmtree(stage, ignore_errors=True)
        for k in ("d", "m"):
            os.makedirs(os.path.join(stage, k))
        files = sorted(os.listdir(tmp))[:N]
        for i, f in enumerate(files):
            im = Image.open(os.path.join(tmp, f)).convert("RGB")
            w, h = im.size
            webp(im.resize((2048, round(h * 2048 / w)), Image.LANCZOS), os.path.join(stage, "d", f"{i + 1:03d}.webp"), 52)
            cw = round(h * 9 / 16)
            x = round(focus(seg, i) * w - cw / 2)
            x = max(0, min(w - cw, x))
            webp(im.crop((x, 0, x + cw, h)).resize((720, 1280), Image.LANCZOS), os.path.join(stage, "m", f"{i + 1:03d}.webp"), 55)
        shutil.rmtree(tmp)
        final = os.path.join(OUT, seg)
        old = os.path.join(OUT, f".{seg}.old")
        shutil.rmtree(old, ignore_errors=True)
        if os.path.exists(final):
            os.rename(final, old)
        os.rename(stage, final)
        shutil.rmtree(old, ignore_errors=True)
        print(seg, len(files))


if __name__ == "__main__":
    main()
