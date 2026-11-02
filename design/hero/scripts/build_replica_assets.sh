#!/usr/bin/env bash
# Build assets for the 1:1 ref-01 homepage replica into design/prototypes/homepage/assets/.
set -euo pipefail
HERO="$(cd "$(dirname "$0")/.." && pwd)"; REPO="$(cd "$HERO/../.." && pwd)"
OUT="$REPO/design/prototypes/homepage/assets"; rm -rf "$OUT"; mkdir -p "$OUT"
UP="$HERO/ref01/up"; TMP=$(mktemp -d)
python3 - "$HERO" "$TMP" <<'PY'
import sys
from PIL import Image
hero, tmp = sys.argv[1:3]
up = f"{hero}/ref01/up"
d = Image.open(f"{hero}/ref01/diorama-base-v4.png").convert("RGB")      # 2400x1695, ref-01 framing, props + cut-off head removed
for w in (900, 1400, 2000):
    d.resize((w, round(w * d.height / d.width)), Image.LANCZOS).save(f"{tmp}/diorama-{w}.png")
def save(name, src, maxw, mode="RGB"):
    im = Image.open(src).convert(mode)
    if im.width > maxw: im = im.resize((maxw, round(maxw * im.height / im.width)), Image.LANCZOS)
    im.save(f"{tmp}/{name}.png")
for n in ("salon-1","salon-2","salon-3","salon-4","salon-5"): save(n, f"{up}/{n}.png", 720)
for n in ("glow-1","glow-2","glow-3"): save(n, f"{up}/{n}-clean.png", 1000)   # handwriting inpainted out (inpaint_ink.py); text is live HTML
# icons keyed to transparency (key_out.py) and placed on CSS-drawn circles/tiles
for n in ("cat-nails","cat-hair","cat-skin","cat-brows","cat-lashes","cat-massage","trust-shield","trust-cal","trust-star","ico-pin","ico-nail","ico-cal","avatars"):
    save(n, f"{up}/{n}-key.png", 400, "RGBA")
save("crown", f"{up}/crown-ink.png", 300, "RGBA")   # doodle ink extracted (extract_ink.py)
for n, src in (("heart3d", "heart3d-cut"), ("prop-polish", "prop-polish-blank-cut"), ("prop-perfume", "prop-perfume-cut")):
    im = Image.open(f"{up}/{src}.png").convert("RGBA"); im = im.crop(im.getbbox())
    im.thumbnail((520, 520), Image.LANCZOS); im.save(f"{tmp}/{n}.png")
PY
for f in "$TMP"/*.png; do n=$(basename "$f" .png)
  case "$n" in
    diorama-*) avifenc -q 60 -s 4 "$f" "$OUT/$n.avif" >/dev/null; cwebp -quiet -q 82 "$f" -o "$OUT/$n.webp" ;;
    heart3d|prop-*|cat-*|trust-*|ico-*|avatars|crown) cwebp -quiet -q 88 -alpha_q 100 "$f" -o "$OUT/$n.webp" ;;
    *) cwebp -quiet -q 86 "$f" -o "$OUT/$n.webp" ;;
  esac
done
LOOP="$HERO/loops/loop-diorama-v4.mp4"   # v2 + moving dryer region from v1 (feathered mask loops/dryer-mask.png)
for w in 1400 900; do
  vf="scale=$w:-2:flags=lanczos,fps=24"
  ffmpeg -v error -y -i "$LOOP" -an -vf "$vf" -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 22 -preset slow -movflags +faststart "$OUT/diorama-loop-$w.mp4"
  ffmpeg -v error -y -i "$LOOP" -an -vf "$vf" -c:v libvpx-vp9 -b:v 0 -crf 33 -row-mt 1 -deadline good "$OUT/diorama-loop-$w.webm"
done
cp "$REPO"/design/branding/gugu-logo.svg "$REPO"/design/branding/gugu-logo-monochrome.svg "$REPO"/design/branding/gugu-icon.svg "$OUT/"
rm -rf "$TMP"; du -sh "$OUT"; ls "$OUT" | wc -l
