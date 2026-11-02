# 02 — Design system, brand, homepage 3D hero

**Owner agent:** `.claude/agents/design-system.md` · **Reviewer:** `.claude/agents/design-reviewer.md`
**Skills:** `.claude/skills/design-system/`, `.claude/skills/3d-hero/`
**Domain doc:** `docs/domains/design-system.md`
**Master prompt sections:** 3.2, 6 (+ touchpoints in 7, 13, 22, 23) · **Extras:** 3D beauty-salon hero, gen-z / Awwwards-level visual, ultra-readable CRM.
**Art direction:** **Lilac Glow**, derived from `design/hero-references/ref-01-homepage-lilac-diorama.png` (analysis: `design/hero-references/README.md`). Owner brief: *mobile friendly, the site must feel ALIVE, gen-z, matching this vibe.*

GuGu needs one design system that powers two very different moods inside a single universal Expo app: a **bold, playful marketing/marketplace surface** (where the 3D hero lives) and a **calm, high-legibility operational surface** (salon CRM, admin). This spec defines tokens, typography, motion, components, the 3D hero pipeline, and the guardrails that keep both moods coherent.

---

## 1. Scope

### In
- Brand foundations: art direction, logo usage rules (logo itself is a design deliverable, not code), color, type, iconography, illustration/3D style.
- Design tokens in `packages/design-system` (platform-agnostic TS source → NativeWind theme + web CSS variables).
- Two surface **modes** sharing tokens: `expressive` (public, customer) and `calm` (business, staff, admin).
- Light + dark themes (dark fully specified; shipping dark for CRM is MVP, for marketing is post-MVP if time).
- Motion system (durations, easings, springs, choreography rules, reduced motion).
- Component library listed in master prompt 3.2, plus: `Chip`, `SegmentedControl`, `Toast`, `Sheet` (responsive modal/bottom sheet), `DataTable` (web), `StatCard`, `Sparkline`, `ChatBubble`/`AgentMessage` (topic 08), `ZaloButton` (topic 09), `PriceTag` (VND), `Stepper` (booking flow).
- Responsive breakpoints and layout primitives (`Screen`, `Stack`, `Grid`, `Container`, `Sidebar`).
- Homepage **3D hero**: art direction slot, tech approach per platform, asset pipeline, performance budget, fallbacks.
- Accessibility baseline (WCAG 2.2 AA target) and localized a11y labels hook-up (strings come from topic 03).

### Out
- Page-level IA and content of homepage/search/salon pages → topic 10 (this topic provides the hero component + layout primitives).
- CRM screen flows → topic 07 (this topic provides calm-mode components, calendar visual spec, table spec).
- Translation content → topic 03 (this topic MUST NOT contain UI strings).
- Native build config → topic 13.

---

## 2. Gap analysis

| # | Gap / problem in master prompt | Decision |
|---|---|---|
| G1 | "Gen Z, playful" and "avoid excessive decorative elements" conflict with the new Awwwards/3D hero requirement. | Two surface modes. Expressive mode allows bold type, 3D, scroll choreography **only on public/marketing routes**. Calm mode forbids decoration in operational UI. Enforced by component props (`mode`) and reviewer agent. |
| G2 | No typeface decision; many trendy display/script fonts lack Vietnamese glyphs (stacked diacritics like ặ, ỗ, ừ break or clip). The ref-01 look needs a high-contrast serif and a handwritten script, and most popular choices (Bodoni Moda, Instrument Serif, DM Serif Display, Caveat, Shadows Into Light) ship **no Vietnamese subset** (checked via Google Fonts CSS API, 2026-11-02). | Three roles, all with Vietnamese subsets: display **Playfair Display** (alt: Noto Serif Display), UI **Be Vietnam Pro**, script **Playwrite VN** (alt: Dancing Script). Final pick after the glyph + line-height test (§4.2). |
| G13 | Ref-01 bakes English text into 3D signage and uses English script slogans; Vietnamese is the default locale. | Only the brand wordmark is baked into 3D. Zone labels, slogans and script accents are live i18n text overlaid on the scene. |
| G14 | "Alive" is not specified and could blow the performance budget (characters, particles, refraction). | Aliveness spec (§5.5): cheap idle loops (transform/vertex-baked, no skinning-heavy rigs), scroll-driven camera, hotspots, micro-interactions. All inside the §5.4 budgets with tiered downgrades. |
| G3 | "Dark mode readiness" undefined. | Semantic tokens from day one (`bg.surface`, `fg.muted`…) — no raw hex in components. Dark theme values defined in MVP. |
| G4 | No motion spec; Awwwards-level feel is mostly motion. | Motion tokens + choreography rules (§4.4), Reanimated on native, same tokens on web. |
| G5 | 3D hero not in prompt; no platform strategy, no perf budget, Vietnamese mobile networks are a stated priority (§25). | Web: React Three Fiber, lazy-loaded after LCP, poster-first. Native: **pre-rendered video loop by default**, real-time 3D only behind a feature flag after device testing (§5). Hard budgets (§5.4). |
| G6 | References for the hero not yet provided. | **Received** (ref-01, 2026-11-02). Intake process (§5.1) stays for future references; HERO-2 brief defined (§5.6). |
| G7 | NativeWind version: v5 (Tailwind v4) is still labelled pre-release in its docs; v4 is stable. | Tokens are authored in TS, not in Tailwind config, so we can generate either. Start on the latest stable NativeWind compatible with the chosen Expo SDK; topic 01 owns the final pin. |
| G8 | R3F native story changed: v10 moves RN support into `@react-three/native` (previously `@react-three/fiber/native`), requires React 19 / RN ≥ 0.78; expo-gl on iOS rides on deprecated OpenGL ES. | Do not make native 3D an MVP dependency. Re-evaluate at topic 13 device-testing milestone (also consider WebGPU via `react-native-wgpu`). |
| G9 | Component list lacks AI-agent, Zalo, data-viz and table primitives needed by topics 07/08/09. | Added (see Scope). |
| G10 | No accessibility targets. | WCAG 2.2 AA contrast, 44×44pt touch targets, focus rings on web, screen-reader labels via i18n keys, reduced motion honored everywhere. |
| G11 | No rule for VND/number display in components. | `PriceTag` and number components take values + use topic 03 formatters; never format inline. |
| G12 | "Iconography" unspecified. | One icon set (Lucide via `lucide-react-native`, tree-shaken) + custom brand icons for categories as SVG. Verify RN-Web compatibility at implementation. |

---

## 3. Refined requirements

### 3.1 Brand & art direction
- R1. Single art direction: **Lilac Glow**. A cream canvas, pastel lilac/pink/peach, plum-black ink for contrast, editorial serif headlines with one gradient word, handwritten script accents, glossy jelly/glass 3D objects, and an isometric salon diorama. Source of truth: `design/hero-references/README.md`.
- R2. Expressive mode follows ref-01 closely. Calm mode (CRM) inherits the palette and UI sans only: cream/pearl surfaces, plum ink, lilac as the single accent. No serif display headlines in data views, no script, no 3D, no gradients.
- R3. Brand must read as local Vietnamese Gen Z lifestyle without clichés (no conical-hat/lotus stock imagery). Copy in script accents is Vietnamese-first.
- R3a. Contrast comes from plum-black ink, never from saturated pastels. Pastels never carry text; text on pastel is ink.

### 3.2 Tokens
- R4. Token tiers: **primitive** (raw scales) → **semantic** (`color.bg.canvas`, `color.fg.default`, `color.accent.solid`, `color.status.success.bg`…) → **component** (only where needed).
- R5. Components MUST consume semantic tokens only. Raw hex/px in component code fails review.
- R6. Token categories: color, typography (family, size, line-height, weight, letter-spacing), spacing (4-pt base), radius, border, shadow/elevation (native `elevation` + iOS shadow + web `box-shadow` from one definition), z-index, opacity, motion, breakpoints.
- R7. Booking status colors (pending, confirmed, checked_in, completed, cancelled_*, no_show) are semantic tokens shared with topic 06/07 and pass AA on both themes; status is never conveyed by color alone (icon + label).
- R8. Surface modes: `expressive` and `calm` select different typography scales, radius, density and motion intensity from the same primitive set.
- R8a. Initial primitives from ref-01 (approximate; DS-2 finalizes them with the contrast check):

| Primitive | Hex | Semantic use (light) |
|---|---|---|
| `cream.50` | `#FBF6F3` | `bg.canvas` |
| `blush.100` | `#F6ECEC` | `bg.subtle`, tiles |
| `white` | `#FFFFFF` | `bg.surface` (cards, search card) |
| `lilac.100` | `#EEE7FC` | `accent.subtle` |
| `lilac.300` | `#CDBBF5` | `accent.selected` (selected tile) |
| `lilac.500` | `#A98BEB` | `accent.solid` decorative, gradient start |
| `lilac.700` | `#7B5CCB` | `accent.fg` (icons/links on cream, AA) |
| `pink.300` | `#F6B8CC` | decorative, 3D |
| `rose.500` | `#EE8FB0` | gradient mid, script accent |
| `peach.400` | `#F6A88A` | gradient end |
| `gold.400` | `#D8B06A` | metallic details (3D, badges) |
| `plum.950` | `#2A1426` | `fg.default`, `action.primary.bg` |
| `plum.600` | `#5E4659` | `fg.body` |
| `plum.400` | `#8E7A8B` | `fg.muted` (check AA at small sizes; fall back to plum.600) |
| `star.500` | `#E9A23B` | rating |

- `gradient.glow`: `90deg, lilac.500 → rose.500 (55%) → peach.400`. Text-fill on ≤ 2 headline words; never body text, never calm mode.
- Radii: `sm 12`, `md 16` (inputs), `lg 24` (cards/tiles), `xl 28` (search card, sheets), `pill 999` (buttons, chips).
- Shadow `soft`: `0 12px 40px` plum.950 @ 8% (plus native elevation equivalent). No hard shadows.
- Dark theme: plum-950-based canvas (`#1A0E18`), lilac/pink accents lifted for AA; defined in DS-2, shipped for CRM first.

### 3.3 Typography
- R9. Every font in the system MUST pass the Vietnamese test string (in skill) at all shipped weights with no clipping at the tokenized line-height.
- R10. Minimum body size 16 on mobile (expressive), 14 allowed in calm-mode dense tables on desktop only.
- R11. Fonts loaded via `expo-font` on native; on web self-hosted with `latin`, `latin-ext`, `vietnamese` subsets, `font-display: swap`, preloaded primary weight only.
- R12. Three families max: display serif, UI sans, script. Initial bundle ships UI sans (≤ 4 weights) + display (1 variable file or ≤ 2 weights). Script loads lazily (accents only).
- R12a. Expressive type scale (mobile → desktop, fluid `clamp`): `display.xl` 44→96, `display.lg` 36→64, `display.md` 28→44 (serif, weight 800–900, tracking −3%, leading 1.0 — raise if diacritics clip); `eyebrow` 12→13 uppercase sans, tracking +18%; `script` 18→28, rotated −6° to −12°; body 16→18.
- R12b. Script text is live text (localizable), ≤ 5 words, decorative, `aria-hidden` when it duplicates meaning.

### 3.4 Layout & responsiveness
- R13. Breakpoints: `sm` <390, `md` 390–767, `lg` 768–1023 (tablet), `xl` 1024–1439, `2xl` ≥1440.
- R14. Business/admin on `xl+` use sidebar + content; on mobile use bottom tabs. Public pages use a top nav on `lg+`, bottom tabs on mobile.
- R15. No horizontal scroll at 320 px width.

### 3.5 Motion
- R16. Motion tokens: `instant 0`, `fast 120ms`, `base 200ms`, `slow 320ms`, `deliberate 500ms`; easings `standard`, `enter`, `exit`, `emphasized`; springs `snappy`, `gentle`, `bouncy` (bouncy only in expressive mode).
- R17. Calm mode: only `fast`/`base` transitions, no parallax, no bouncy springs.
- R18. Respect reduced motion: `prefers-reduced-motion` (web) and `AccessibilityInfo.isReduceMotionEnabled` / Reanimated `useReducedMotion` (native). When on: no autoplay 3D/video, crossfades instead of movement.
- R19. Haptics (native) on: booking confirmed, slot selected, destructive confirm — via one `haptics` helper, never inline.

### 3.6 Components
- R20. Each component ships: variants, sizes, states (default, hover (web), pressed, focused, disabled, loading, error), dark theme, RTL-safe layout (future-proof), a11y role/label props taking i18n keys or already-translated strings, and a story/preview.
- R21. Platform files (`.web.tsx` / `.native.tsx`) only when behavior differs (e.g. `Sheet`: bottom sheet native, dialog/side panel desktop web; `DataTable`: web-only rich table, native list fallback; `Calendar`).
- R22. Loading/Empty/Error/Skeleton components are mandatory building blocks used by every data screen (master rule §29).

### 3.7 3D hero — see §5.

### 3.8 Accessibility
- R23. WCAG 2.2 AA contrast for text and essential UI; focus visible on web; keyboard operable on web; touch targets ≥44×44.
- R24. The 3D hero is decorative: `aria-hidden`, does not trap focus, page is fully usable with it absent; the hero headline/search is real text (SEO, topic 10).

---

## 4. Proposed technical approach

### 4.1 Package layout
```
packages/design-system/
  src/tokens/        primitives.ts, semantic.light.ts, semantic.dark.ts, modes.ts, motion.ts
  src/build/         generate-nativewind-theme.ts, generate-css-vars.ts
  src/components/    Button/, Input/, Sheet/{Sheet.tsx,Sheet.native.tsx,Sheet.web.tsx}, ...
  src/hooks/         useTheme, useMode, useReducedMotion, useBreakpoint
  src/hero/          (thin wrapper; heavy 3D lives in apps/app/features/hero to keep the package light)
```
- Tokens authored in TS (single source) → generated NativeWind theme and web CSS variables. Theme switching via CSS variables on web and NativeWind `vars()` / color-scheme on native.
- Animation: `react-native-reanimated` (required by NativeWind anyway) + `react-native-gesture-handler`; Moti optional, not required.
- Preview/catalog: Storybook for React Native (on-device + web) — verify current version at setup; fallback: a hidden `/[locale]/(dev)/catalog` route in dev builds only.
- Visual regression: Playwright screenshots of the catalog route on web (topic 13 wires CI).

### 4.2 Typography
Vietnamese subset availability was checked against the Google Fonts CSS API (2026-11-02):

| Role | Primary | Alternate | Rejected (no Vietnamese) |
|---|---|---|---|
| Display serif | **Playfair Display** (variable wght 400–900 + italic, `vietnamese` subset) | **Noto Serif Display** (variable wght + wdth: condensed cut closer to ref-01; `vietnamese`) · Fraunces (softer, fallback) | Bodoni Moda, Instrument Serif, DM Serif Display, Young Serif, Gloock |
| UI sans | **Be Vietnam Pro** (400/500/600/700) | n/a | n/a |
| Script | **Playwrite VN** (designed for Vietnamese handwriting, variable 100–400, thin pen look like ref-01) | Dancing Script · Charm · Pangolin · Patrick Hand | Caveat, Shadows Into Light, Gochi Hand, Nothing You Could Do |

- Final pick at DS-1 via the glyph test (`.claude/skills/design-system/references/vietnamese-typography.md`). The test must cover **stacked marks at display sizes with tight leading** (Ặ, Ỗ, Ữ in uppercase-start headlines like "Đặt lịch").
- If a paid face is preferred later, it must ship full Vietnamese and a web+app embedding license.
- Line-height tokens ≥1.4 for body; display starts at 1.0 for the ref-01 look and is raised per font until the test passes (tested, not assumed).

### 4.3 Data viz (for CRM dashboards and the AI agent)
- One chart primitive set (`StatCard`, `Sparkline`, `BarChart`, `LineChart`, `Donut`) rendered with `react-native-svg` (works on web via RN-Web) — verify a maintained chart lib (e.g. Victory Native XL uses Skia; check RN-Web support) before committing; fallback is hand-built SVG primitives.
- Charts consume a declarative **ChartSpec** (type, series, units, locale) so the AI agent (topic 08) can return a spec, and the UI renders it — the agent never returns HTML/images.
- Chart palette: categorical tokens validated for CVD and both themes.

### 4.4 Motion choreography (expressive)
- Page entry: staggered fade+rise (≤ 8 items, 40 ms stagger).
- Scroll on web: hero → content transition driven by scroll progress (CSS scroll-driven animations where supported, else IntersectionObserver); never scroll-jacking.
- Shared-element feel between salon card → salon page via layout transitions where platform supports; graceful no-op otherwise.
- Hero-specific aliveness lives in §5.5; the page-level micro-interactions below apply to all expressive screens:
  - **Heart / save:** tap → scale 1 → 1.25 → 1 spring (`bouncy`) + 6–8 tiny heart particles (CSS/Reanimated, not WebGL) + haptic (native). Undo state reverses without particles.
  - **Cards:** hover (web) lifts 4 px + shadow `soft` → `soft-lg`, photo zooms 1.03 inside the radius; press (native) scales 0.98.
  - **Category tiles:** selected tile fills lilac.300 with the arrow button sliding in; icon wiggles once (±6°) on select.
  - **Buttons:** primary ink pill has an arrow that nudges 3 px on hover/press.
  - **Gradient word:** slow 8–12 s background-position drift on the gradient text (web; static on reduced motion).
  - **Script accents:** stroke "draw-on" (SVG path or clip reveal) once when scrolled into view.
  - **Floating glossy objects** (heart, bottles) near section edges: 4–6 s sine float ±6 px + slight rotation; rendered as pre-rendered transparent images/WebP or Lottie, **not** additional WebGL canvases.

## 5. 3D hero

### 5.0 Hero composition

**Desktop (`xl+`)** follows ref-01: text column left (eyebrow, 2-line serif headline with gradient word, subcopy, 2 CTAs, 3 trust chips, script accent); the diorama bleeds off the top-right; the search card overlaps the diorama's lower-left; a "scroll to explore" cue sits on the plinth staircase.

**Mobile (360–430 px), mobile-first. This is the primary design target:**
```
┌──────────────────────────┐
│ gugu            🔍  ☰    │  nav 56px; Sign in/Get started live in the menu
│ BEAUTY FOR A BRIGHTER YOU│  eyebrow
│ Your beauty era          │  display.xl 44px, 2–3 lines, gradient on last word
│ starts here.             │
│ ┌──────────────────────┐ │
│ │  DIORAMA  (4:3 crop, │ │  full-bleed, ~48–55svh max; camera framed tighter
│ │  bleeds to edges)    │ │  on 2–3 zones; floating heart/bottle at edge
│ │   ┌────────────────┐ │ │
│ └───┤  SEARCH CARD   ├─┘ │  overlaps diorama bottom by 48–64px
│     │ 📍 Location  › │   │  rows = 52px touch targets
│     │ 💅 Service   › │   │
│     │ 📅 Date      › │   │
│     │ [ Find my glow→]│  │  ink pill, full width
│     └────────────────┘   │
│ ◀ Verified · Easy · Real ▶│  trust chips, horizontal scroll
│ ‹ Nails Hair Skin Brows ›│  category tiles, scroll-snap, 2 visible + peek
└──────────────────────────┘
```
- Subcopy is shortened or moved under the search card on `sm`. Only the primary CTA is visible; "Become a beauty pro" moves to the menu and a later section.
- When the search card scrolls out of view, a sticky bottom "Find my glow" pill appears (above the tab bar in the native app).
- Script accent sits beside the category row, not in the hero, to keep the first viewport clean.
- Headline + search card must be visible within the first viewport on a 360×740 device (diorama may be partly cropped).
- Tablet (`lg`): headline above, diorama + search card side by side.

### 5.1 Reference intake
**Status: references received.** ref-01 (`design/hero-references/ref-01-homepage-lilac-diorama.png`) analyzed in `design/hero-references/README.md`; it sets the art direction and the scene.

Process for any further references:
1. Product owner drops references into `design/hero-references/` with a note per reference: *what to take* (mood, camera, palette, objects, interaction).
2. Design-system agent appends an analysis to `design/hero-references/README.md` and updates the hero brief (§5.6) in `docs/domains/design-system.md#hero`.
3. Product owner approves → modeling (Blender, by a 3D artist or licensed assets, license recorded in `design/hero-assets/LICENSES.md`).
4. Implementation per §5.2–5.5.

### 5.2 Web
- `@react-three/fiber` + `@react-three/drei` + `three`, loaded via dynamic `import()` **after** first paint / LCP, only on `lg+` or capable mobile devices (heuristic: `navigator.hardwareConcurrency`, `deviceMemory`, `saveData`, `connection.effectiveType`, WebGL2 availability).
- Poster image (AVIF/WebP, same framing as frame 0 of the scene) is the LCP element; canvas fades in over it.
- Pause rendering when off-screen (`frameloop="demand"` + IntersectionObserver) and when tab hidden.
- Expo web static/SSR (topic 10): canvas is client-only; server renders poster + text.

### 5.3 Native (iOS/Android)
- **Default (MVP): pre-rendered loop** exported from the same Blender scene → `expo-video` (H.264/HEVC MP4, muted, looped, ~6–8 s), poster frame first; static image when reduced motion, data saver, or low-end device.
- **Optional (flagged, post-MVP):** real-time 3D via `@react-three/native` (R3F v10; requires React 19, RN ≥0.78, `expo-gl`) or WebGPU via `react-native-wgpu`. Enabled only after device-lab profiling on mid/low Android (topic 13).

### 5.4 Asset pipeline & budgets
- Blender → glTF 2.0 → `gltf-transform` optimize: Draco or Meshopt geometry compression, KTX2 (Basis UASTC for normals, ETC1S for color) textures, texture max 1024² (2048² only for one hero atlas), merged materials, baked lighting into textures (no realtime shadows).
- Budgets (web, mobile-class device):
  - Hero JS (three + r3f + drei subset) lazy chunk ≤ 250 KB gzip; zero 3D JS in the initial bundle.
  - Model + textures ≤ 1.5 MB total transferred; ≤ 100k triangles; ≤ 30 draw calls.
  - Poster ≤ 120 KB; native video ≤ 1.5 MB (720p mobile, 1080p tablet).
  - LCP ≤ 2.5 s on throttled "Fast 3G/4G slow" Moto G-class profile; CLS 0; no main-thread long task > 200 ms caused by hero init.
  - Sustained 60 fps desktop, ≥ 30 fps mid-range mobile; otherwise auto-downgrade to poster.
- CDN: assets served from object storage behind Cloudflare with long-cache immutable hashes (topic 13).
- The aliveness features (§5.5) are **inside** these budgets. Characters and idle loops count toward the triangle, draw-call and model-size limits.

### 5.5 Aliveness spec ("the site must feel ALIVE")
Tiered so every device gets some life, and only capable ones get real-time 3D.

| Layer | Behavior | Tech (web) | Cost control |
|---|---|---|---|
| **Idle loops in diorama** | Nail tech's hand brushes polish; stylist's dryer bobs; facial-mask client breathes; steam curls from tea cup / spa bowl; candle flicker; neon wordmark flicker every ~8 s; plants sway; ceiling lights pulse softly | Rigid-part transform tweens + 2–4 baked clips (glTF animations, ≤ 2 s loops), steam = 1 animated sprite/alpha-card, flicker = emissive intensity uniform | No physics, no particle systems > 50 sprites, max 3 skinned characters with ≤ 20 bones (prefer rigid parts), all clips share one `AnimationMixer` |
| **Floating glossy objects** | Polish bottle, perfume, heart drift ±6–10 px and rotate ±4° on 4–6 s sine loops; some sit outside the canvas | Inside canvas: shader-light "jelly" material (MeshPhysicalMaterial with transmission **only on desktop tier**; mobile tier uses matcap + fresnel fake). Outside canvas: pre-rendered WebP/AVIF sprites with CSS float | Transmission is expensive; max 2 transmissive meshes, desktop only |
| **Scroll-driven camera** | First 100–150% of viewport scroll: camera dollies from wide iso view into the diorama and slightly orbits (≤ 15°), plinth staircase leads into the category section, canvas fades/pins out | Scroll progress → camera spline (drei `ScrollControls` or own IntersectionObserver + lerp); CSS scroll-driven animations for DOM layers | Never scroll-jacks; native scroll stays; disabled on reduced motion |
| **Pointer / gyro parallax** | Diorama tilts ≤ 3° toward cursor; floating objects counter-move | Pointer → damped rotation; gyro on mobile only after a user gesture (permission on iOS) | Damped lerp, no per-frame React state |
| **Zone hotspots** | Nails, Hair, Skin care, Spa/massage, Reception: hover/tap → zone glows (emissive outline), camera eases toward it, localized label pill + "Explore nails →" link appears | Raycast on low-poly invisible hit meshes; labels are **DOM** elements (real `<a>` to category routes, i18n text) positioned via projected coordinates; also listed as a visible link row for keyboard/screen readers | Hit meshes ≤ 5, no per-hover re-render of the scene graph |
| **Page micro-interactions** | Hearts, cards, tiles, CTAs, gradient drift, script draw-on (§4.4) | DOM/CSS/Reanimated | Not WebGL |

**Device tiers (web):**
- **T0 Static:** reduced motion, `saveData`, 2G/slow-3G, no WebGL2 → poster image + CSS micro-interactions limited to state changes (no loops).
- **T1 Lite:** mobile / low cores / ≤ 4 GB memory → R3F scene with matcap materials, idle loops at reduced rate, no transmission, DPR capped at 1.5, scroll camera on, gyro opt-in.
- **T2 Full:** desktop/capable → transmission jelly objects (max 2), DPR ≤ 2, full idle loops, pointer parallax.
- Runtime FPS monitor: sustained < 30 fps for 2 s → drop one tier (T2→T1→T0); never upgrade mid-session.

**Native (iOS/Android):** rendered video loop of the **same** diorama (camera slowly orbiting, idle loops visible, 6–8 s seamless), poster first. Hotspots become a row of category chips below the video (no tap-on-video). Floating objects and micro-interactions via Reanimated. Reduced motion / data saver → static poster.

### 5.6 HERO-2 brief (scene production)
Input: ref-01 + `design/hero-references/README.md`. Output: Blender source, optimized `.glb`, posters, native videos, manifest.
1. **Scene:** isometric salon diorama on a curved lilac glass plinth with a staircase spilling down-front. Zones as in ref-01: Nails (left front), Hair (back center, arched gold mirrors), Skin care (back right, shelving + facial bed), Spa/massage (right, treatment bed + candles), Reception/lounge (front right, glossy desk + curved pink sofa). Brand wall with the **gugu wordmark only** (no other baked text; neon zone signs are blank shapes or icons).
2. **Characters:** 5–6 stylized young Vietnamese characters (stylists + clients), clay/toy shading, not photoreal, no resemblance to real people or existing IP. Rigid-part rigs preferred; ≤ 3 skinned.
3. **Materials:** lilac/pink/cream/gold from the token table (§3.2 R8a), baked lighting + AO; one "jelly" material in two variants (physical transmission for T2, matcap+fresnel for T1).
4. **Floating props (separate objects):** nail-polish bottle, perfume bottle, heart, hair dryer, heart drop. Each exported both in-scene and as 1024² transparent renders for DOM sprites.
5. **Animations:** idle clips per §5.5 as named glTF actions (`nails_idle`, `hair_idle`, `skin_idle`, `spa_idle`, `steam`, `flicker`, `plants`), all seamless, ≤ 2 s or loopable multiples of 6 s.
6. **Cameras:** `cam_desktop_wide`, `cam_mobile_tight` (4:3, 2–3 zones), `cam_scroll_path` (spline), `cam_zone_<name>` targets for hotspots.
7. **Hit meshes:** `hit_nails`, `hit_hair`, `hit_skin`, `hit_spa`, `hit_reception` (invisible, low-poly).
8. **Exports:** `.glb` per tier (T1 lite / T2 full) via the 3d-hero pipeline; posters from `cam_desktop_wide` (16:10) and `cam_mobile_tight` (4:3) frame 0; native loops 720p phone / 1080p tablet, H.264 + HEVC.
9. **Budgets:** §5.4, measured and recorded in `design/hero-assets/MANIFEST.md`.
10. **Review gates:** clay-render storyboard (no textures) → PO approval → textured stills → PO approval → animation playblast → PO approval → optimization + budget check.

---

## 6. Acceptance criteria
- AC1. `packages/design-system` builds with zero TS errors in strict mode; tokens generate NativeWind theme + CSS vars from one source.
- AC2. Lint rule / reviewer check: no raw color hex, px font sizes or hardcoded strings in `apps/app` or design-system components (except token files).
- AC3. All 3.2 + added components exist with listed states, light/dark, and appear in the catalog on iOS, Android and web.
- AC4. Vietnamese test string renders without clipping in every font/weight/size token on all three platforms (screenshot test).
- AC5. All text/token pairs used by components meet WCAG AA (automated contrast check in CI over semantic tokens).
- AC6. Reduced-motion on → no autoplay hero motion, no bouncy springs, verified on web and native.
- AC7. Hero: web LCP element is the poster; Lighthouse mobile perf ≥ 85 on homepage with hero; hero chunk not in initial bundle; budget checks in CI fail the build on regressions.
- AC8. Native hero shows video loop with poster, falls back to static image on low-end/reduced-motion; no `expo-gl` dependency in MVP build.
- AC9. Calm mode: CRM screens use calm components only (reviewer agent check), body text ≥14 px desktop / 16 px mobile, no decorative motion.
- AC10. Agent `ChartSpec` renders identically from a fixture on web and native.

## 7. Dependencies
- **01** monorepo, Expo SDK / NativeWind / Reanimated versions, package boundaries.
- **03** all strings + formatters (VND, dates, numbers) consumed by components.
- **07** calm-mode screens, calendar and table requirements.
- **08** AgentMessage, ChartSpec contract.
- **09** Zalo button/brand usage rules (Zalo brand guidelines).
- **10** homepage IA, SEO rendering of hero text/poster, salon page layouts.
- **13** Storybook/visual regression in CI, device lab, CDN, EAS assets.

## 8. Suggested sub-milestones
1. **DS-1** Lilac Glow foundations: finalize palette from ref-01 + contrast check, typeface glyph test for display/UI/script picks, mobile hero composition in Figma. *(design, no code; art direction already chosen)*
2. **DS-2** Token source + generators + theme provider + modes + dark theme.
3. **DS-3** Core primitives: Button, Input, Text, Icon, Card, Badge, Avatar, Chip, Skeleton, Loading/Empty/Error.
4. **DS-4** Composite: Sheet, Select, SearchInput, Tabs/TabBar, Toast, Stepper, Rating, ImageGallery, PriceTag.
5. **DS-5** Scheduling: DatePicker, TimeSlotPicker, Calendar (native + web variants, visual spec for topic 07).
6. **DS-6** Calm-mode data: DataTable (web), StatCard, charts + ChartSpec, AgentMessage.
7. **DS-7** Catalog + visual regression + contrast CI.
8. **HERO-1** ✅ References received (ref-01) and analyzed. Remaining: PO answers asset requests (`design/hero-references/README.md#asset-requests-for-the-product-owner`), mainly logo SVG, motion refs and character direction.
9. **HERO-2** Scene production per the brief in §5.6 (Blender scene, characters, idle clips, cameras, hit meshes, tiered `.glb`, posters, native videos).
10. **HERO-3** Web R3F hero with device tiers, scroll camera, hotspots, budgets in CI; native video hero; page micro-interactions (§4.4).
11. **HERO-4** (post-MVP, flagged) native real-time 3D evaluation.

## 9. AI-first deliverables
- `.claude/agents/design-system.md` — builds tokens/components/hero.
- `.claude/agents/design-reviewer.md` — read-only reviewer: tokens-only, a11y, no hardcoded strings, calm vs expressive mode misuse, motion/reduced-motion, budgets.
- `.claude/skills/design-system/SKILL.md` — add token, add component, platform split rules, checklists.
- `.claude/skills/3d-hero/SKILL.md` — reference intake, asset pipeline, budgets, fallbacks.
- `docs/domains/design-system.md` — durable reference (skeleton now).
- Component catalog doubles as machine-readable inventory: each component exports a `meta` object (name, variants, props summary, mode) so agents can discover components without reading source.

## 10. Product AI-agent surface
The design system does not expose agent tools; it **renders agent output**:
- `AgentMessage` (text, streaming state, citations to records like bookings/customers as tappable chips, error/limit states).
- `ChartSpec` renderer (bar/line/donut/stat; units incl. VND, count, percent; locale-aware) — topic 08 tools return data + ChartSpec, never markup.
- `ActionConfirmCard` for agent-proposed write actions (topic 08): shows diff/summary, confirm/cancel, requires explicit tap.
- Untrusted text (customer notes, reviews, Zalo messages) quoted in agent answers renders as plain text, never as rich/markdown links.

## 11. Open questions for the product owner
1. Is the "gugu" wordmark in ref-01 final? Please send the vector logo (see asset requests).
2. Hotspots on the diorama zones linking to category pages are assumed (§5.5). Confirm?
3. Budget for a 3D artist vs. in-house/AI-assisted modeling? The diorama with 5–6 animated characters is the largest single design cost.
3a. Characters: stylized chibi (as ref-01) or more adult proportions?
3b. Display serif: Playfair Display (classic) vs Noto Serif Display condensed (closer to ref-01). Pick after the DS-1 specimen sheet?
4. Is dark mode required for the public marketplace at launch, or only for CRM?
5. Should the native app show the hero at all (video loop) or a simpler native home focused on search?
6. Brand display typeface: open to a paid/custom font if it handles Vietnamese well?
