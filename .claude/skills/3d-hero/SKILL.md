---
name: 3d-hero
description: AI production pipeline and runtime rules for GuGu's homepage hero, a chibi isometric beauty-salon "living diorama". Covers AI still generation with consistency (style/character refs, LoRA, seeds), clean-up and logo compositing, layers/masks, image-to-video loops, the optional image-to-3D/R3F gate, 2.5D web implementation (poster → loop video, parallax, scroll dolly, hotspots), native video, device tiers, dark-mode variant, budgets, prompt logging and licensing. Use for any work in apps/app/features/hero or design/hero-*.
---

# Hero: AI-produced living diorama

A glossy isometric chibi salon diorama in the **Lilac Glow** style (ref-01: `design/hero-references/README.md`). Zones: Nails, Hair, Skin care, Spa/massage, Reception. No 3D-artist budget (PO q51): everything is produced with AI tools on **fal.ai** (PO q78). Default output is **2.5D** (stills + video loops + layers); real-time R3F only if it passes the 3D gate. It must feel **alive** but is **decorative**: headline, search and categories work and rank without it. Spec: `docs/tasks/02-design-system.md` §5.0–5.7.

## When to use
- Generating, editing, or replacing any hero image, layer, mask, sprite, or loop video.
- Changing the hero component, its tiers, loading logic, or budgets.
- Evaluating image-to-3D output for the optional R3F path.

## fal.ai endpoints (checked 2026-11-02; re-check the model page before a run)
| Stage | Endpoint |
|---|---|
| Stills + edits with style/character refs | `blackforestlabs/flux-3/edit-image` (`image_urls` 1–10, `resolution`, `aspect_ratio`) |
| Single-image edit fallback | `fal-ai/flux-pro/kontext` |
| Consistency fallback | `fal-ai/flux-lora-fast-training` → `fal-ai/flux-lora` (check license first: FLUX.1 dev base) |
| Image → video loop | `kling/v4/image-to-video` (start = end image); alt `minimax/h3/image-to-video` |
| Upscale | `fal-ai/aura-sr` |
| Background removal | `fal-ai/birefnet/v2` |
| Segmentation / depth | `fal-ai/sam2` / `fal-ai/image-preprocessors/depth-anything/v2` |
| Image → 3D (gate) | `fal-ai/trellis-2` |

Only use a model for shipped assets if its fal page shows "Commercial use"; record URL + tag in `design/hero/LICENSES.md`.

## Invariants
- MUST read the fal key only from the `FAL_KEY` environment variable (repo-root `.env`, git-ignored). MUST NOT print, log, commit, or write it to any file, and MUST NOT use it in `apps/app` or `apps/api`. Generation runs only from `design/hero/scripts/`.
- MUST download fal outputs immediately (URLs expire) and log endpoint, request ID, prompt, refs, settings and cost per kept output.
- MUST explore cheap (1K stills, 5 s 720p video) and only re-render/upscale keepers.
- MUST log every kept AI output in `design/hero/PROMPTS.md` (tool, model/version, prompt, negative prompt, seed, refs, settings, file, date) and its terms in `LICENSES.md`. Only tools whose terms allow commercial use of outputs.
- MUST NOT let AI generate the logo or any text. Prompts include the no-text negative list; the official SVG from `design/branding/` is composited in post, and re-applied **after** video generation so it never warps.
- MUST keep characters chibi, stylized, not resembling real people or existing IP; consistent with the approved character sheet.
- MUST colour-grade outputs to the token palette (lilac.500 `#A98BEB`, pink.300 `#F6B8CC`, rose.500 `#EE8FB0`, cream `#FBF6F3`, gold `#D8B06A`, plum.950 `#2A1426`).
- MUST render the poster first (LCP element); video/parallax are client-only and start after LCP/idle.
- MUST keep hotspots as DOM: localized label + real `<a>` to the category route, also listed as a keyboard-reachable link row. Nothing but the wordmark is baked into imagery.
- MUST be mobile-first: headline + search card visible in the first viewport at 360×740; mobile uses the 4:5 tight crop.
- Public pages are light-only (X18): no dark hero variant.
- Current hero = the ref-01 diorama itself (PO): cleaned on fal.ai, looped with Kling, signage as live text fitted with `skewY` to the wall planes, official logo overlaid. See `design/prototypes/homepage/` and `design/hero/MANIFEST.md`.
- MUST honor tiers: T0 static (reduced motion, saveData, slow network) / T1 lite / T2 full; FPS < 30 for 2 s drops one tier.
- Native: `expo-video` loop of the mobile crop + poster; static on reduced motion/data saver. No `expo-gl` in MVP.

## Budgets (CI-enforced)
| Item | Budget |
|---|---|
| Hero JS, 2.5D path | ≤ 15 KB gzip; no three.js |
| Poster per breakpoint | ≤ 120 KB AVIF/WebP |
| Loop video per breakpoint (web + native) | ≤ 1.5 MB (720p mobile crop, 1080p desktop) |
| Zone glow masks total | ≤ 100 KB |
| Floating sprites total | ≤ 300 KB, ≤ 1024² each |
| Optional R3F path | chunk ≤ 250 KB gzip; model + textures ≤ 1.5 MB; ≤ 100k tris; ≤ 30 draw calls; KTX2 + Meshopt/Draco |
| Homepage LCP (throttled mid mobile) | ≤ 2.5 s, CLS 0 |
| Frame rate | 60 fps desktop, ≥ 30 fps mid mobile |

## Procedures

### A. Production (HERO-2)
1. **Style bible**: write/update `design/hero/STYLE.md` (palette, materials, lighting, camera, negatives). Templates: `references/ai-prompts.md`.
2. **Character sheet** (`flux-3/edit-image`, ref-01 as reference): generate 5–6 chibi Vietnamese characters with turnarounds using ref-01 as style reference; pick, clean up, PO approval (tracker). This sheet is the character reference from now on.
3. **Master diorama** (`flux-3/edit-image`, `image_urls` = [ref-01, character sheet]): explore at 1K; choose; re-render at 2K–4K or `aura-sr` upscale.
4. **Consistency upgrade (if drift appears)**: `fal-ai/flux-lora-fast-training` (license check first) on on approved outputs (character sheet + master + zone crops) and regenerate with it.
5. **Clean-up**: inpaint pseudo-text, hands, faces; LUT grade to palette; composite the logo SVG in perspective on the brand wall and reception desk.
6. **Crops**: desktop 16:10, mobile 4:5 tight (2–3 zones); outpaint as needed.
7. **Layers & masks**: `fal-ai/sam2` masks per zone + props; depth map (Depth Anything) → 3–4 parallax groups; inpaint behind lifted layers; export zone glow masks.
8. **Living loops**: `kling/v4/image-to-video` per zone crop (first frame = last frame, low motion, 4–8 s). Reject morphing faces, flicker, drift, new objects. Composite into the master with feathered masks in Resolve/AE; crossfade the seam; re-apply the logo layer; encode WebM (VP9/AV1) + MP4 (H.264) web, H.264/HEVC native.
9. **Props**: `flux-3/edit-image` + `fal-ai/birefnet/v2` → transparent 1024² renders of polish bottle, perfume, heart, hair dryer, heart drop.
10. **Optional 3D gate**: `fal-ai/trellis-2` (alt Hunyuan3D Pro) on props first, then diorama. Adopt R3F only if it matches the master side by side, fits the R3F budgets after `gltf-transform` optimize, and the PO approves.
11. **Record**: `PROMPTS.md`, `MANIFEST.md` (sizes vs budgets), `LICENSES.md`. Upload content-hashed files to object storage/CDN.
12. **PO gates** (tracker): character sheet → master still → crops + layers → loop video → budgets.

### B. Web implementation (HERO-3)
1. `HeroPoster` (server-safe): breakpoint poster + live headline/search + hotspot link row.
2. After LCP/idle, tier check (`prefers-reduced-motion`, `saveData`, `effectiveType`, `deviceMemory`, cores).
3. T1+: `<video muted loop playsinline>` crossfades over the poster at an identical frame; pause when off-screen or the tab is hidden.
4. Parallax: layers offset by depth ≤ 12 px (pointer on T2, gyro after a user gesture on T1), damped rAF, no per-frame React state.
5. Scroll dolly: CSS scroll-driven animation (fallback IntersectionObserver + rAF), scale 1 → 1.15 toward reception/staircase; never scroll-jack.
6. Hotspots: % positioned DOM pills; hover/tap/focus blends the zone glow mask (`mix-blend-mode: screen`); link to the category route.
7. Floating props: sprites with CSS/Reanimated sine float.
8. FPS monitor → drop tier.

### C. Native
Poster → `expo-video` loop (mobile crop) when visible; pause when off-screen/backgrounded; category chips below the frame; Reanimated floating props; static on reduced motion/data saver.

## Checklist (before PR)
- [ ] No three.js in the default path (bundle analyzer).
- [ ] Budgets measured and recorded in `MANIFEST.md`.
- [ ] Lighthouse mobile perf ≥ 85 on homepage.
- [ ] Reduced motion / save-data → poster only (tested).
- [ ] Off-screen and hidden-tab playback paused.
- [ ] No AI text artifacts; logo is the official SVG and unwarped in every frame.
- [ ] `PROMPTS.md` and `LICENSES.md` complete for every shipped asset.
- [ ] `design-reviewer` approved.

## References
- `references/ai-prompts.md`: style bible and prompt templates, consistency method, rejection checklist.
