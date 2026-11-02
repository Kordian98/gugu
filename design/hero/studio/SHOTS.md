# GuGu Studio landing: story shot list (fal.ai, pending)

The story is a walk through the salon. Each "place" is its own high-resolution shot. The page never zooms a raster beyond about 1.15× its native pixels (devicePixelRatio aware). Until fal.ai works, `scripts/story-shots.py` crops **temporary placeholders** from `design/hero/ref01/diorama-base-v4.png`; they are flagged `placeholder: true` in `apps/app/assets/studio/shots/manifest.json`.

**Swapping in a final asset is a file drop:** save it as `design/hero/studio/final/<shot>.png` and run `python3 scripts/story-shots.py`.

## Consistency references (attach to every generation)

1. `design/hero/ref01/diorama-base-v4.png`: style, palette, lighting, characters.
2. `design/hero-references/ref-01-homepage-lilac-diorama.png`: art direction.
3. Approved shots from this list once they exist.

Style block and negatives: `.claude/skills/3d-hero/references/ai-prompts.md` (no text, no logos; the logo is composited in post).

| Shot | Chapter | Final size (≥2× display) | Current placeholder |
|---|---|---|---|
| `entrance` | dive: doors open onto the salon | 3200×2260 | full diorama, 2400×1695 |
| `reception` | pain1 / pain2: chaos at reception | 3200×2000 | crop, 1000×740 |
| `rooms` | reminders: treatment rooms, staff at work | 3200×2000 | crop, 1300×880 |
| `reception-calm` (new) | calm: the same reception, relaxed | 3200×2000 | uses `reception` |
| `notebook` (new, optional) | pain2: paper notebook on the desk | 2400×1600 | CSS notebook card |
| `door` (new, optional) | dive: the salon's front door | 3200×2000 | CSS doors |

## Prompts

FLUX 3 edit with `image_urls` = the references above, then upscale with `fal-ai/aura-sr` to the final size.

- **entrance**: "Eye-level view through the open double glass doors of the salon from image 1, looking in: the whole salon interior is visible, warm light, stylists and clients at work, same toy-like 3D style and palette. No text."
- **reception**: "Close-up of the reception desk of the salon in image 1, the chibi receptionist (black hair bun, lilac apron) looking at a smartphone full of chat notifications, an open paper notebook with scribbles, sticky notes, a ringing phone, two clients waiting on the curved pink sofa. Cute, slightly stressed, not dark. Same style. No readable text."
- **reception-calm**: "Same framing and characters as the reception shot, now calm: tidy desk, laptop open, the receptionist smiling while sending a message, a client arriving happily. Same style. No readable text."
- **rooms**: "Close-up of the nail station and hair area of the salon in image 1: the nail technician painting nails, the stylist drying a client's hair, soft warm light, depth of field. Same style. No text."
- **notebook**: "Top-down 3D render of an open paper appointment notebook on a glossy pink desk, scribbles with no legible words, sticky notes, a pen, a smartphone. Same palette. No legible text."
- **door**: "Front view of the salon's closed double glass doors with lilac frames and gold handles, soft interior glow behind the glass, same style as image 1. No text, no logo."

Estimated cost: about 6 edits at $0.05–0.10 plus upscales, roughly $1–2.
