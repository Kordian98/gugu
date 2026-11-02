# Hero asset manifest

What exists, where it came from, and how it measures against the budgets in `docs/tasks/02-design-system.md` §5.5. Generation log: `PROMPTS.md`. Licenses: `LICENSES.md`.

## Shipping set (used by `design/prototypes/homepage/`)

Direction (PO, 2026-11-02): **use the ref-01 diorama itself**, cleaned, gently alive. No new diorama, no real-time 3D.

| Asset | Source | Web output (`design/prototypes/homepage/assets/`) | Size | Budget |
|---|---|---|---|---|
| Diorama still (clean, no lettering) | ref-01 crop → `ref01/diorama-clean-v1.png` → `ref01/diorama-clean-v2.png` (2400×1695) via FLUX 3 edit (UI + pseudo-text removed) | `diorama-800/1200/1800.avif` + `.webp` | 33 / 58 / 97 KB AVIF | poster ≤ 120 KB ✅ |
| Diorama still with logo baked (for OG / native / static) | `ref01/diorama-logo-v1.png` = clean-v2 + official `gugu-logo.svg` composited (`scripts/composite_logo.py`) | `diorama-logo-1200.avif/.webp` | 59 KB AVIF | ✅ |
| Living loop (5 s, start = end frame) | `loops/loop-diorama-v1.mp4` (Kling v4, 1712×1208) from clean-v2 | `diorama-loop-1280.{webm,mp4}`, `diorama-loop-720.{webm,mp4}` | 185 / 248 KB (1280), 98 / 112 KB (720) | loop ≤ 1.5 MB ✅ |
| Floating props (transparent) | `props/prop-heart-v1`, `prop-polish-v2`, `prop-perfume-v1` → BiRefNet cut-outs `props/cut-*.png` | `prop-*.webp` | 15–16 KB each | sprites ≤ 300 KB total ✅ |
| Logo overlays | `design/branding/*.svg` (official, unmodified) | `gugu-logo*.svg`, `gugu-icon.svg` | 2–7 KB | n/a |

Logo placement in 2400×1695 diorama space (used both for the baked still and the live CSS overlay):
- Wall sign: center (668, 330), width 250 px, baseline rising right (slope 0.22 → CSS `skewY(-12.4deg)`).
- Reception desk: center (1690, 1190), width 230 px, baseline falling right (slope −0.22 → `skewY(12.4deg)`).

Hotspot centers (same space): Nails (600, 768) · Hair (1380, 504) · Skin care (1656, 816) · Spa/lounge (1104, 984).
Mobile 4:5 crop: x 280–1636, full height (CSS `.scene { width: 177%; left: -20.6% }`).

## Demo content (prototype only, never real listings)

| Asset | Source | Web output |
|---|---|---|
| Salon covers ×4 | `demo/salon-{nails,hair,spa,brows}.jpg` (FLUX 3, photoreal interiors, no people) | `salon-*.avif/.webp`, 20–29 KB AVIF |
| Glow-up editorial ×3 | `demo/glow-{skin,nails,hair}.jpg` (FLUX 3, chibi style, no real faces) | `glow-*.avif/.webp`, 14–18 KB AVIF |

## Explored, not shipped (kept for reference)

- `characters/chars-v1.png`: chibi character sheet (pre-pivot).
- `master/master-v1a/b`, `master-v2-clean`, `master-v3-logo`: new AI diorama in the ref-01 style (pre-pivot alternative).
- `crops/*`, `loops/loop-{nails,hair,skin}-v1.mp4`: zone crops and zone loops of that alternative master.

## Rebuild

```bash
# web deliverables (posters, loops, props, demo images, brand files)
bash design/hero/scripts/optimize.sh
# regenerate the generation log
python3 design/hero/scripts/prompts_md.py
```
Generation itself: `design/hero/scripts/fal.py` (reads `FAL_KEY` from env / git-ignored `.env`; never logs it).

## Known issues
- A few micro labels on the skincare shelf bottles still read as faint pseudo-text at 2400 px. Not legible at hero size; fix in a final clean-up pass.
- The loop moves the floating props more than the characters (props rotate/bob noticeably). Acceptable "alive" feel; a calmer re-roll is cheap if the PO prefers.
- A soft white swoosh remains in the top-left corner of the still; it fades into the page canvas through the stage edge fade.
