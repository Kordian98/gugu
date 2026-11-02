# Hero AI prompts & consistency method

Starting templates for the HERO-2 pipeline on fal.ai. FLUX 3 edit takes natural language; refer to references as "image 1", "image 2" in the order of `image_urls`. FLUX 3 edit has no negative-prompt field, so fold the negative block into the prompt as "Avoid: …". Log every kept output in `design/hero/PROMPTS.md`.

## Style bible block (prepend to every still prompt)

```
Isometric 3/4 top-down miniature diorama, orthographic look, ~30° camera,
cute chibi stylized characters with soft clay shading, glossy jelly and translucent
glass materials, pastel palette: lilac #A98BEB, soft pink #F6B8CC, rose #EE8FB0,
cream #FBF6F3, gold accents #D8B06A, deep plum shadows #2A1426,
warm interior glow, pink and lilac bounce light, soft ambient occlusion,
high-end collectible toy look, clean cream background, crisp edges, 4k
```

## Negative block (append to every prompt / negative field)

```
text, letters, words, numbers, signage text, logo, watermark, signature, caption,
realistic photo faces, uncanny, extra fingers, deformed hands, harsh shadows,
oversaturated neon, cluttered, dark background, low resolution, blurry
```

## Templates

**Character sheet**
```
[style bible] character turnaround sheet, 6 chibi young Vietnamese characters for a
beauty salon: nail technician in lilac apron, client with long black hair, hair stylist
with hair dryer, client in salon chair, skincare client wearing a sheet mask, spa
therapist; front, three-quarter and side views, consistent proportions (2.5 heads tall),
plain cream background, evenly lit [negatives]
```

**Master diorama**
```
[style bible] a two-level beauty salon diorama on a curved lilac glass plinth with a
glossy staircase spilling toward the viewer; zones: nail station front-left with two
characters doing a manicure; hair area back-center with arched gold-framed mirrors and
styling chairs; skincare shelving and a facial bed back-right; spa massage bed with candles
right; reception front-right with a glossy pink desk and a curved pink sofa; a blank
brand wall with an empty neon frame; potted plants; floating glossy nail-polish bottle
and pink jelly heart near the edges [negatives]
```
fal: `blackforestlabs/flux-3/edit-image`, `image_urls` = [ref-01, character sheet]; say "match the style, palette and camera of image 1 and the characters of image 2".

**Zone crop (for loops)**
```
[style bible] close-up of the nail station from the diorama, same camera angle, same
characters and lighting as the reference image [negatives]
```
fal: `flux-3/edit-image` with the master as image 1 ("crop/zoom to the nail station, keep everything identical").

**Prop**
```
[style bible] single glossy translucent [lilac nail-polish bottle | pink jelly heart |
perfume bottle | pastel hair dryer | heart-shaped droplet], floating, isolated on
transparent background, soft rim light [negatives]
```

**Image-to-video (per zone)**
```
Subtle looping idle motion. The nail technician gently brushes polish, the client
blinks, steam rises softly from the tea cup, candle flickers. Camera locked, no zoom,
no new objects, keep the style and faces identical. Seamless loop: last frame matches
first frame.
```
fal: `kling/v4/image-to-video`, start image = end image = the zone crop, 5 s, 720p for exploration; 1080p only for finals.

## Consistency method
1. Lock the style bible text, palette hexes and camera words. Never paraphrase them.
2. Character sheet first; every later generation uses it as character reference.
3. Fixed seeds per asset family; record them.
4. Derive crops and zones from the master by image-to-image at low denoise, not from scratch.
5. If drift persists, train `fal-ai/flux-lora-fast-training` on approved outputs (license check first) and regenerate.
6. LUT colour grade all outputs to the palette as the final step.
7. Composite the official logo SVG last (after video), never generate it.

## Rejection checklist (reject the output if any is true)
- Any text-like glyphs, pseudo-letters, or a generated logo.
- Faces or hands change between frames; morphing, melting, or flicker.
- New objects appear or disappear in the loop; visible loop seam.
- Palette drifts away from the tokens (too saturated or too dark).
- Characters look photoreal, resemble a real person, or resemble known IP.
- Camera angle differs from the master.
