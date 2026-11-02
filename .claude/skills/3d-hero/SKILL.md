---
name: 3d-hero
description: Procedures, asset pipeline and performance budgets for GuGu's homepage 3D beauty-salon hero — reference intake, Blender → glTF/KTX2 optimization, React Three Fiber on web, video/static fallbacks on native, capability gating, budget checks. Use for any work in apps/app/features/hero or design/hero-*.
---

# 3D hero

The homepage hero is a glossy isometric 3D beauty-salon diorama in the **Lilac Glow** style (ref-01: `design/hero-references/README.md`). Zones: Nails, Hair, Skin care, Spa/massage, Reception. It must feel **alive** but is **decorative**: the page (headline, search, categories) must work and rank without it. Spec: `docs/tasks/02-design-system.md` §5 (composition §5.0, aliveness §5.5, HERO-2 brief §5.6).

## When to use
- Processing new hero references or updating the hero brief.
- Exporting/optimizing 3D assets, posters, or the native video loop.
- Changing the hero component, its loading logic, or its budgets.

## Invariants
- MUST NOT add three / R3F code to the initial bundle — dynamic `import()` only, after first paint/LCP.
- MUST render a poster image first (it is the LCP element); canvas fades in over it with identical framing.
- MUST be client-only (server/static render outputs poster + real text).
- MUST be `aria-hidden`, not focusable, and stop rendering off-screen or in a hidden tab.
- MUST fall back to poster on: reduced motion, `saveData`, slow `effectiveType`, no WebGL2, low `deviceMemory`/cores, or fps below threshold.
- Native MVP: MUST use `expo-video` loop (muted, looped) with poster → static image fallback. Real-time native GL (`@react-three/native` / `react-native-wgpu`) only behind a feature flag after device-lab profiling.
- Every third-party asset MUST have its license recorded in `design/hero-assets/LICENSES.md`.
- MUST NOT bake text into 3D except the brand wordmark. Zone labels/slogans are DOM i18n text; hotspot links are real `<a>` elements also listed as a keyboard-reachable link row.
- Mobile-first: headline + search card visible in the first viewport at 360×740; diorama uses `cam_mobile_tight`.
- Aliveness is tiered (T0 static / T1 lite / T2 full); transmission ("jelly" glass) only on T2, max 2 meshes; FPS < 30 for 2 s drops one tier.

## Aliveness tiers
| Tier | When | What runs |
|---|---|---|
| T0 Static | reduced motion, saveData, slow network, no WebGL2 | poster + state-change micro-interactions only |
| T1 Lite | mobile / ≤ 4 cores / ≤ 4 GB | R3F, matcap jelly, idle loops at reduced rate, DPR ≤ 1.5, scroll camera, gyro opt-in |
| T2 Full | capable desktop | transmission jelly (≤ 2), DPR ≤ 2, all idle loops, pointer parallax |
| Native | iOS/Android | video loop of the same diorama; category chips instead of hotspots |

Idle loops: named glTF actions (`nails_idle`, `hair_idle`, `skin_idle`, `spa_idle`, `steam`, `flicker`, `plants`), one shared `AnimationMixer`, ≤ 3 skinned characters (≤ 20 bones), sprites ≤ 50, no physics.

## Budgets (CI-enforced)
| Item | Budget |
|---|---|
| Hero JS lazy chunk (three + r3f + drei subset) | ≤ 250 KB gzip |
| Model + textures transferred | ≤ 1.5 MB |
| Triangles / draw calls | ≤ 100k / ≤ 30 |
| Textures | ≤ 1024² (one 2048² atlas max), KTX2 |
| Poster | ≤ 120 KB AVIF/WebP |
| Native video | ≤ 1.5 MB, 6–8 s loop, 720p phone / 1080p tablet |
| Homepage LCP (throttled mid-range mobile) | ≤ 2.5 s, CLS 0 |
| Frame rate | 60 fps desktop, ≥ 30 fps mid mobile, else downgrade |

## Procedures

### 1. Reference intake
1. PO adds references to `design/hero-references/` with `README.md` notes: what to take from each (mood, camera, palette, objects, interaction).
2. Write the hero brief in `docs/domains/design-system.md#hero`: scene objects, camera path, loop length, interaction (ambient vs hotspots), palette mapped to tokens, mobile framing.
3. Produce a storyboard (key frames) and get PO approval before modeling.

### 2. Asset pipeline
0. Follow the HERO-2 brief (spec §5.6): object/camera/hit-mesh/action naming, review gates (clay storyboard → textured stills → playblast → optimization).
1. Blender: model low-poly/stylized, bake lighting + AO into textures, no realtime shadows; keep materials ≤ 8. Export a T1 (lite) and a T2 (full) `.glb`.
2. Export glTF 2.0 (`.glb`).
3. Optimize with `gltf-transform` (CLI): dedup, prune, weld, merge materials, Draco or Meshopt geometry, KTX2 textures (UASTC for normal maps, ETC1S for color), resize to budget.
4. Render poster from the exact frame-0 camera; export AVIF + WebP.
5. Render the native loop (seamless) → MP4 H.264 (+ HEVC variant), muted.
6. Upload with content-hashed filenames to object storage behind CDN (immutable cache).
7. Record sizes in `design/hero-assets/MANIFEST.md`.

### 3. Web implementation
1. `HeroPoster` (server-safe) renders immediately.
2. After LCP/idle, capability check → `import('./HeroScene')`.
3. `HeroScene`: R3F `<Canvas>` with `frameloop="demand"` driven by visibility; drei loaders with KTX2/Draco/Meshopt decoders self-hosted.
4. Interaction: pointer parallax ≤ 3° (T2); gyro on mobile only after user gesture; scroll-driven camera along `cam_scroll_path` (no scroll-jacking); zone hotspots raycast on `hit_*` meshes → emissive glow + camera ease + DOM label pill with a real `<a>` to the category route.
5. FPS monitor → drop one tier when sustained < 30 fps for 2 s.

### 4. Native implementation
1. Poster image → `expo-video` loop when visible; pause when off-screen/app backgrounded.
2. Static only when reduced motion or data saver.

## Checklist (before PR)
- [ ] Bundle analyzer: no three/r3f in initial chunk.
- [ ] Budgets table measured and recorded in MANIFEST.
- [ ] Lighthouse mobile perf ≥ 85 on homepage.
- [ ] Reduced motion / save-data → poster only (tested).
- [ ] Off-screen and hidden-tab rendering paused.
- [ ] Licenses recorded.
- [ ] `design-reviewer` approved.
