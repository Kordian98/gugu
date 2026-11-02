# Hero style bible: Lilac Glow living diorama

The fixed vocabulary for every hero generation. Copy these blocks verbatim into prompts; never paraphrase them. Source: ref-01 (`design/hero-references/ref-01-homepage-lilac-diorama.png`), palette tokens in `docs/tasks/02-design-system.md` §3.2, logo in `design/branding/`.

## Palette (tokens)
| Token | Hex | Role in the scene |
|---|---|---|
| lilac.500 | `#A98BEB` | plinth, walls, jelly glass |
| lilac.300 | `#CDBBF5` | light walls, highlights |
| pink.300 | `#F6B8CC` | furniture, heart, jelly props |
| rose.500 | `#EE8FB0` | accents, neon glow |
| cream.50 | `#FBF6F3` | background, floor tint |
| gold.400 | `#D8B06A` | mirror frames, lamps, metallic details |
| plum.950 | `#2A1426` | deepest shadows, hair, small details |

## Style block
```
Isometric 3/4 top-down miniature diorama, orthographic look, about 30 degree camera,
cute chibi stylized characters (about 2.5 heads tall) with soft clay shading, glossy jelly
and translucent glass materials, pastel palette: lilac #A98BEB, light lilac #CDBBF5,
soft pink #F6B8CC, rose #EE8FB0, cream #FBF6F3, gold accents #D8B06A, deep plum shadows #2A1426,
warm interior glow, pink and lilac bounce light, soft ambient occlusion,
high-end collectible toy look, clean cream background, crisp edges
```

## Avoid block (FLUX 3 edit has no negative field: append as "Avoid: …")
```
Avoid: any text, letters, words, numbers, signage lettering, logos, watermarks, captions;
realistic photographic faces; extra fingers; deformed hands; harsh shadows; oversaturated
neon; clutter; dark background; blur.
```

## Camera
- Master: isometric 3/4 top-down, the whole diorama visible, plinth curving, staircase spilling to the front-right.
- Desktop crop 16:10: full diorama, room on the left for headline/search.
- Mobile crop 4:5: tighter on Nails + Reception + Hair (2–3 zones).

## Characters (chibi, young Vietnamese)
1. Nail technician: black hair bun, lilac apron.
2. Nail client: long black hair, cream top.
3. Hair stylist: short bob, plum apron, pastel hair dryer.
4. Hair client: in a pink styling chair.
5. Skincare client: white sheet mask, headband, on facial bed.
6. Spa therapist / receptionist: cream uniform.

## Zones
Nails (left-front) · Hair (back-center, arched gold mirrors) · Skin care (back-right shelving + facial bed) · Spa (right, candles) · Reception/lounge (front-right, glossy pink desk, curved pink sofa) · brand wall (blank; the official logo is composited in post).
