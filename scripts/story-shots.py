#!/usr/bin/env python3
"""Builds the story "place" shots for the GuGu Studio landing (apps/app/assets/studio/shots/).

File-drop workflow: put a final high-resolution image at design/hero/studio/final/<shot>.png (or .jpg/.webp)
and re-run `python3 scripts/story-shots.py`. Without a final file, a TEMPORARY placeholder is cropped from
the ref-01 diorama at native resolution. manifest.json records pixel size and `placeholder: true/false`;
the landing never displays a shot above ~1.15x its native pixels (devicePixelRatio aware).
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "design/hero/ref01/diorama-base-v4.png"  # 2400x1695
FINAL = ROOT / "design/hero/studio/final"
OUT = ROOT / "apps/app/assets/studio/shots"

# name: (placeholder crop box in base pixels, final target width)
SHOTS = {
    "entrance": ((0, 0, 2400, 1695), 3200),
    "reception": ((1380, 820, 2380, 1560), 3200),
    "rooms": ((260, 120, 1560, 1000), 3200),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    base = Image.open(BASE).convert("RGB")
    manifest = {}
    for name, (box, target_w) in SHOTS.items():
        final = next((p for p in FINAL.glob(f"{name}.*")), None) if FINAL.exists() else None
        if final:
            im = Image.open(final).convert("RGB")
            if im.width > target_w:
                im = im.resize((target_w, round(target_w * im.height / im.width)), Image.LANCZOS)
            placeholder = False
        else:
            im = base.crop(box)
            placeholder = True
        im.save(OUT / f"{name}.webp", quality=84, method=6)
        manifest[name] = {"w": im.width, "h": im.height, "placeholder": placeholder}
        print(name, im.size, "placeholder" if placeholder else "final")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
