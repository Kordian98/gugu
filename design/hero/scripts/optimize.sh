#!/usr/bin/env bash
# Build web deliverables for the homepage prototype into design/prototypes/homepage/assets/.
# Hero = ref-01 diorama, cleaned on fal.ai (design/hero/ref01/diorama-clean-v2.png, 2400x1695).
# The official logo is overlaid in the page from design/branding/ SVGs (never baked into the loop).
set -euo pipefail
HERO="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$HERO/../.." && pwd)"
OUT="$REPO/design/prototypes/homepage/assets"
mkdir -p "$OUT"
TMP=$(mktemp -d)

python3 - "$HERO" "$TMP" <<'EOF'
import sys
from PIL import Image
hero, tmp = sys.argv[1:3]
d = Image.open(f"{hero}/ref01/diorama-clean-v2.png").convert("RGB")
for w in (800, 1200, 1800):
    d.resize((w, round(w * d.height / d.width)), Image.LANCZOS).save(f"{tmp}/diorama-{w}.png")
# baked-logo still for OG/native/static use
b = Image.open(f"{hero}/ref01/diorama-logo-v1.png").convert("RGB")
b.resize((1200, round(1200 * b.height / b.width)), Image.LANCZOS).save(f"{tmp}/diorama-logo-1200.png")
for n in ("heart", "polish", "perfume"):
    p = Image.open(f"{hero}/props/cut-{n}.png").convert("RGBA")
    p = p.crop(p.getbbox())
    p.thumbnail((360, 360), Image.LANCZOS)
    p.save(f"{tmp}/prop-{n}.png")
for n in ("nails", "hair", "spa", "brows"):
    s = Image.open(f"{hero}/demo/salon-{n}.jpg").convert("RGB")
    s.thumbnail((720, 540), Image.LANCZOS)
    s.save(f"{tmp}/salon-{n}.png")
for n in ("skin", "nails", "hair"):
    g = Image.open(f"{hero}/demo/glow-{n}.jpg").convert("RGB")
    g.thumbnail((640, 800), Image.LANCZOS)
    g.save(f"{tmp}/glow-{n}.png")
EOF

for f in "$TMP"/*.png; do
  n=$(basename "$f" .png)
  case "$n" in
    prop-*) cwebp -quiet -q 82 -alpha_q 90 "$f" -o "$OUT/$n.webp" ;;
    *)      avifenc -q 52 -s 4 "$f" "$OUT/$n.avif" >/dev/null
            cwebp -quiet -q 76 "$f" -o "$OUT/$n.webp" ;;
  esac
done

# Hero loop: desktop 1280w and mobile 720w, H.264 (faststart) + VP9 WebM, no audio.
LOOP="$HERO/loops/loop-diorama-v1.mp4"
if [ -f "$LOOP" ]; then
  for w in 1280 720; do
    vf="scale=$w:-2:flags=lanczos,fps=24"
    ffmpeg -v error -y -i "$LOOP" -an -vf "$vf" -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 -preset slow -movflags +faststart "$OUT/diorama-loop-$w.mp4"
    ffmpeg -v error -y -i "$LOOP" -an -vf "$vf" -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 -deadline good "$OUT/diorama-loop-$w.webm"
  done
fi

# Official brand files, copied unmodified.
cp "$REPO"/design/branding/gugu-logo.svg "$REPO"/design/branding/gugu-logo-on-dark.svg \
   "$REPO"/design/branding/gugu-icon.svg "$REPO"/design/branding/gugu-logo-monochrome.svg "$OUT/"

rm -rf "$TMP"
ls -la "$OUT"
