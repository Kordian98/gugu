# Hero & visual references

Reference images from the product owner that define GuGu's art direction. Each reference has an analysis: what to take, what not to copy. The binding spec is `docs/tasks/02-design-system.md`; procedures are in `.claude/skills/3d-hero/`.

Owner brief (2026-11-02): **mobile friendly, the site must feel ALIVE, gen-z, matching this vibe.**

---

## ref-01 — `ref-01-homepage-lilac-diorama.png`

A desktop homepage mock: a cream/lilac editorial page with a glossy isometric 3D salon diorama filling the top-right of the hero, a search card overlapping the diorama, category tiles, a "spots everyone is saving" salon carousel and an editorial "glow-up" strip. This reference **is the art direction** (it replaces the three earlier routes). Working name: **Lilac Glow**.

### Palette (approximate, sampled by eye from the image; finalize in DS-2 with a contrast check)

| Role | Approx. hex | Where it appears |
|---|---|---|
| Cream canvas | `#FBF6F3` | page background |
| Blush surface | `#F6ECEC` | card/tile backgrounds, soft panels |
| Pearl white | `#FFFFFF` | search card, salon cards |
| Lilac 100 | `#EEE7FC` | light tints, hover fills |
| Lilac 300 | `#CDBBF5` | selected category tile ("Nails") |
| Lilac 500 | `#A98BEB` | diorama walls/base, icons, gradient start |
| Lilac 700 | `#7B5CCB` | icon strokes, hairline accents (derived — needed for AA on cream) |
| Pink 300 | `#F6B8CC` | glossy heart, diorama furniture |
| Rose 500 | `#EE8FB0` | gradient mid, script accents, neon signage |
| Peach 400 | `#F6A88A` | gradient end ("glow-up.") |
| Gold 400 | `#D8B06A` | mirror frames, lamp light, small metallic details |
| Plum-black ink | `#2A1426` | headlines, primary buttons, nav CTA |
| Plum 600 | `#5E4659` | body text |
| Plum 400 | `#8E7A8B` | secondary/muted text, eyebrows |
| Star | `#E9A23B` | rating stars |

**Signature gradient** (headline word "here.", "glow-up."): `linear-gradient(90deg, #A98BEB 0%, #EE8FB0 55%, #F6A88A 100%)`, applied as text fill on one or two words per headline, never on body text.

Notes: the page is low-saturation pastel. Contrast comes from the **plum-black ink**, never from saturated color. Pastels never carry text; text on pastel is always plum-black.

### Typography

- **Display: editorial high-contrast serif**, very bold, tight tracking (≈ −3%), tight leading (≈ 0.95–1.0), huge sizes. Headlines mix ink with one gradient word. Candidates that ship Vietnamese (checked against the Google Fonts CSS API on 2026-11-02): **Playfair Display** (variable 400–900 + italic, vietnamese subset), **Noto Serif Display** (variable weight + width axes → condensed look closer to the ref, vietnamese subset). Not eligible: Bodoni Moda, Instrument Serif, DM Serif Display, Young Serif, Gloock (no Vietnamese subset).
- **UI sans:** clean geometric-humanist sans for nav, body, buttons, card text → **Be Vietnam Pro**.
- **Eyebrows:** small caps-like uppercase sans with wide tracking (≈ +18%), lilac or plum-400 ("BEAUTY FOR A BRIGHTER YOU").
- **Handwritten script accents:** thin, casual pen hand in rose/lilac, rotated −6° to −12°, with a hand-drawn heart/crown doodle ("More Self Love Please ♡"). Candidate: **Playwrite VN** (designed for Vietnamese handwriting, variable 100–400). Backups with a Vietnamese subset: Dancing Script, Charm, Pangolin, Patrick Hand. Not eligible: Caveat, Shadows Into Light, Gochi Hand, Nothing You Could Do (no Vietnamese).

### Shapes, radii, surfaces

- Large soft radii: cards ≈ 24 px, tiles ≈ 24–28 px, search card ≈ 28 px, pills/buttons fully rounded (999).
- Inputs inside the search card: 14–16 px radius, hairline border, leading icon, trailing chevron.
- Shadows: very soft, wide, low-opacity plum-tinted (`0 12px 40px rgba(42,20,38,0.08)`); no hard drop shadows.
- Organic background blobs in lilac/pink at low opacity behind the hero and section edges.
- Circular icon wells (pearl circle inside a blush tile) for category icons; icons are two-tone lilac/plum line + fill.

### 3D language

- **Glossy jelly/glass objects:** translucent pink/lilac materials with strong rim highlights and soft refraction: nail-polish bottle, perfume bottle, heart, hair dryer, a small heart drop. They float outside the diorama and overlap layout edges.
- **Isometric salon diorama** on a curved lilac glass plinth with a staircase spilling down toward "scroll to explore". Zones:
  - **Nails**: manicure table, two characters, neon "NAILS" sign.
  - **Hair**: arched gold mirrors, stylist + client, styling chairs.
  - **Skin care**: shelving with products, facial bed, character with a face mask.
  - **Spa / massage**: treatment bed, candles, plants.
  - **Reception / lounge**: glossy "gugu" reception desk, curved pink sofa, coffee table.
  - Brand wall: big "gugu" neon wordmark + script slogan.
- Characters: stylized chibi-ish young Vietnamese/Asian women, soft clay shading, not photoreal.
- Lighting: warm interior glow, gold accents, pink/lilac bounce; reads like a high-end toy.

### Layout blocks (top to bottom)

1. **Nav**: logo left, 3 links, search icon, Sign in (outline pill), Get started (ink pill).
2. **Hero**: eyebrow → 2-line display headline with gradient word → subcopy → primary ink CTA + outline CTA → 3 **trust chips** (Verified professionals · Easy booking · Real reviews) with icon wells → script accent. Right: diorama. **Search card** overlaps diorama bottom-left: tabs (Book a treatment / Find salons), rows Location · Service · Date, ink "Find my glow →" button. "Scroll to explore" cue.
3. **Category tiles**: 6 tiles (Nails selected in lilac with arrow button, Hair, Skin, Brows, Lashes, Massage) + a social-proof card (avatar stack "10K+", serif quote "Self care looks good on you.") with a large glossy 3D heart.
4. **"The spots everyone is saving"**: eyebrow + serif title + crown doodle; carousel arrows + "View all salons" pill; 5 salon cards (photo, heart toggle, name, rating + count, location, "From 300,000₫", ink "Book now").
5. **"Your next glow-up."**: editorial strip: serif title with gradient word, horizontal carousel of portrait/product tiles with handwritten script overlays.

### What NOT to copy

- **Baked-in English text in 3D**: signage like "BEAUTY LIVES HERE", "NAILS", "HAIR", "SKIN CARE", the plinth slogan. In the 3D scene only the **brand wordmark** may be baked. Zone labels and slogans must be live, localizable UI text (i18n keys) overlaid as hotspot labels, or omitted.
- **"District 1 / District 3, HCMC"** location labels: outdated after Vietnam's 2025 administrative reform (district level removed, provinces merged). Card location wording (ward/area name format) comes from topic 10's location model.
- **English script slogans** ("More Self Love Please", "Good Beauty Brighter You"): keep the device, localize the copy (vi first). Script is for ≤ 5-word accents only.
- **Fake ratings/counts and invented salon names** in the mock must never ship as real listings. Demo/seed data is clearly marked demo (topic 10).
- **Desktop composition as-is on mobile**: see the mobile-first composition in the spec (§5.0).
- Stock-photo faces: production imagery needs licensed photos with model releases (see asset requests).
- The diorama's characters must not resemble real people or existing IP.

---

## Asset requests for the product owner

Ordered by priority. Send files to `design/assets-inbox/<category>/`. For anything with people in it, include proof of license and a **model release** that allows commercial and advertising use in Vietnam, on web, in apps and in social media.

### P0: needed to start DS-2 / HERO-2

| # | Asset | Purpose | Format | Min resolution / aspect | Qty | Notes |
|---|---|---|---|---|---|---|
| 1 | **Logo / wordmark "gugu"** | brand everywhere, 3D neon sign, app icon | SVG (outlined) + source (AI/Figma) | vector | 1 set: full color, ink, white, monochrome | Confirm the ref-01 wordmark is final or a placeholder; clear-space and minimum-size rules if any |
| 2 | **App icon / symbol mark** | iOS/Android icon, favicon, Zalo OA avatar | SVG + 1024×1024 PNG | 1:1 | 1–2 options | Must read at 29 px |
| 3 | **Final approval of ref-01 palette** | tokens | n/a | n/a | n/a | Any brand colors from existing materials (hex) |
| 4 | **Motion references** | define "alive" | links / MP4 screen recordings | n/a | 5–10 | Sites, apps, TikToks, 3D loops you like; note what you like in each (speed, bounce, camera, cursor effects) |
| 5 | **Diorama character direction** | 3D characters | images / sketches | n/a | 3–6 | Style refs (chibi vs. stylized adult), diversity, outfits (áo dài details? uniforms?) |

### P1: needed for homepage & marketplace build

| # | Asset | Purpose | Format | Min resolution / aspect | Qty | Notes |
|---|---|---|---|---|---|---|
| 6 | **Editorial portraits** for the glow-up carousel | "Your next glow-up" strip, social posts | JPG/TIFF, sRGB | ≥ 2400 px long edge; 4:5 and 3:4 crops (safe area for script overlay) | 8–12 | Vietnamese / Southeast Asian Gen Z models, diverse skin tones and hair; natural glowy retouching; model release required |
| 7 | **Product / still-life shots** | editorial tiles, category headers | PNG with transparency + JPG | ≥ 2000 px; 1:1 and 4:5 | 6–10 | Generic/unbranded products or GuGu-branded mockups; no third-party logos |
| 8 | **Category imagery** | category pages, tiles, OG images | JPG | ≥ 2400×1600 (3:2) + 1:1 crop | 1–2 per category × 10 (nails, hair, barber, massage, spa, skincare, lashes, brows, makeup, treatments) | Close-up "process" shots in Vietnamese salon settings |
| 9 | **Demo salon interiors** | seed/demo data and staging only | JPG | ≥ 2000×1500 (4:3) + 16:9 cover | 5–10 salons × 4–6 photos | Must be **marked demo** in data and never presented as real listings in production; permission from the venue/photographer |
| 10 | **OG / social share templates** | link previews (Zalo, Facebook) | Figma or PSD | 1200×630 | 2–3 | vi and en text variants |

### P2: needed for app and CRM polish

| # | Asset | Purpose | Format | Min resolution / aspect | Qty | Notes |
|---|---|---|---|---|---|---|
| 11 | **Mobile app references** | native UX direction | screenshots / recordings | n/a | 5–10 | Apps whose feel you like (booking flows, tab bars, sheets) |
| 12 | **CRM / dashboard references** | calm-mode direction (topic 07) | screenshots | n/a | 5–10 | Tools salon owners already use or admire; what's confusing in them |
| 13 | **Illustrations / doodles** | empty states, script doodles (hearts, crowns, sparkles) | SVG | vector | 10–20 | Or approval for us to draw them in the ref-01 style |
| 14 | **Brand fonts** (if any purchased) | typography | OTF/WOFF2 + license | n/a | n/a | Must include full Vietnamese glyphs; license must cover web + app embedding |
| 15 | **Sound** (optional) | micro-interaction sounds (booking confirmed) | WAV | 48 kHz | 3–5 | Optional, off by default |

General rules for all assets: original files (no screenshots from social media), sRGB, no watermarks, license file per source in `design/assets-inbox/LICENSES.md`, Vietnamese context preferred (people, interiors, street/city backdrops), no recognizable third-party brands.
