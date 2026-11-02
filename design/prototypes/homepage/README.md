# Homepage prototype: ref-01 replica

Self-contained HTML/CSS/JS replica of the homepage reference `design/hero-references/ref-01-homepage-lilac-diorama.png`: desktop is 1:1, with a mobile adaptation. It is a design reference for porting into `apps/app`, not production code.

## Run on localhost

```bash
cd design/prototypes/homepage
python3 -m http.server 8765      # any static server; relative paths, no build step
# http://localhost:8765            ?lang=vi / ?lang=en to force a language
```

The language switch is the **EN/VI circle in the navbar**; the choice is saved in localStorage. Light theme only, even when the OS is in dark mode (X18). External host: Google Fonts only (Noto Serif Display, Be Vietnam Pro, Patrick Hand, Barlow Condensed; all ship Vietnamese).

## How it is built

- **Desktop artboard** uses ref-01 pixel coordinates (2048 wide), scaled with `--u = min(100vw, 2048px) / 2048`. Every block sits at the position measured from the reference.
- **Sections (only those in ref-01):**
  - navbar
  - hero copy
  - diorama with search card and scroll cue
  - category tiles with social-proof card and 3D heart
  - "The spots everyone is saving" with 5 cards
  - "Your next glow-up" with 3 image cards
- **Diorama:** the ref-01 diorama, cleaned on fal.ai: UI, lettering and floating props removed (`design/hero/ref01/diorama-base-v4.png`; the cut-off head behind the counter is replaced by a cloned plant (`design/hero/scripts/hide_head.py`)). Its own framing and scale are kept.
  - A 5 s seamless Kling loop autoplays (muted, loop, playsinline) over the poster.
  - Floating polish/perfume/heart are separate cut-outs with bob animation and mouse parallax.
- **Signage and handwriting are live text in both languages**, so EN and VI look identical:
  - Neon signs and plinth text use `skewY` angles measured from the isometric wall planes in ref-01.
  - The official logo (`design/branding/`) is overlaid on the wall and the reception desk.
  - Handwriting is set in Patrick Hand; hearts are hand-drawn SVG strokes, not the ♡ glyph.
  - "More Self Love Please" writes itself line by line (SVG stroke draw-on, then ink fill), replayed on every language switch.
  - Nothing is a pasted pixel patch.
- **Icons:**
  - Category, trust and search-row icons and the avatars are cropped from ref-01, upscaled (AuraSR) and keyed to transparency (`design/hero/scripts/key_out.py`).
  - They sit on CSS-drawn circles, so there are no background mismatches.
- **Glow-up images:** handwriting was inpainted out of the reference crops; the captions are live text.
- **Reduced motion / data saver / 2G:** poster only, no animations.

## QA (`qa/`)

| File | What |
|---|---|
| `compare-desktop-en.webp`, `compare-desktop-vi.webp` | ref-01 (left) vs page at 1932×1932 (right) |
| `compare-signage-en.webp`, `compare-signage-vi.webp` | zoomed sign-by-sign comparison with ref-01 |
| `desktop-1932-en.webp`, `desktop-1932-vi.webp` | full desktop renders |
| `mobile-390-en.webp`, `mobile-390-vi.webp` | full-page mobile renders |
| `handwriting-frames.webp` | handwriting animation frames, EN and VI |

Checked: the video plays (`currentTime` advances), the language toggle works both ways on desktop and mobile, there is no horizontal overflow at 390 px, and there are no console errors.

## Known open items
- Social-proof avatars are still the low-res crops from ref-01; HQ portraits pending (fal.ai balance).
- Moving the big hair dryer higher/right is pending (needs fal.ai: re-edit + new loop).

## Deliberate deviations from ref-01

- The wall and desk signs use the **official logo** (mark + wordmark) instead of the AI-drawn "gugu" lettering.
- "gugu" on the polish bottle is the official monochrome logo overlay.
- Neon/handwritten lettering is a real font fitted to the wall planes, not the reference pixels. It is very close but not stroke-identical.
- Demo salon names, ratings and "District 1/3" labels are copied from the reference as demo data. Production uses post-2025 area labels (topic 10 §3.6.1).
- VI copy is a **draft** pending the Vietnamese reviewer (q49).

Assets are built by `design/hero/scripts/build_replica_assets.sh`. Sources, log and licenses: `design/hero/MANIFEST.md`, `PROMPTS.md`, `LICENSES.md`.
