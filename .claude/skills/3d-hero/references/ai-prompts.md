# Hero AI prompts & consistency method

Starting templates for the HERO-2 pipeline. Adapt the syntax per tool (Midjourney parameters, Flux/ComfyUI fields, Gemini/OpenAI natural language). Log every kept output in `design/hero-assets/PROMPTS.md`.

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
References: ref-01 (style), approved character sheet (character), fixed seed.

**Zone crop (for loops)**
```
[style bible] close-up of the nail station from the diorama, same camera angle, same
characters and lighting as the reference image [negatives]
```
Image-to-image from the master crop, low denoise (0.25–0.4) to keep identity.

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
Settings: lowest motion strength that still reads, 4–8 s, first/last-frame or loop mode, same seed across retries.

## Consistency method
1. Lock the style bible text, palette hexes and camera words. Never paraphrase them.
2. Character sheet first; every later generation uses it as character reference.
3. Fixed seeds per asset family; record them.
4. Derive crops and zones from the master by image-to-image at low denoise, not from scratch.
5. If drift persists, train a Flux LoRA on approved outputs and regenerate.
6. LUT colour grade all outputs to the palette as the final step.
7. Composite the official logo SVG last (after video), never generate it.

## Rejection checklist (reject the output if any is true)
- Any text-like glyphs, pseudo-letters, or a generated logo.
- Faces or hands change between frames; morphing, melting, or flicker.
- New objects appear or disappear in the loop; visible loop seam.
- Palette drifts away from the tokens (too saturated or too dark).
- Characters look photoreal, resemble a real person, or resemble known IP.
- Camera angle differs from the master.
