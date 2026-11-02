# 02 — Design system, brand, homepage hero (AI-produced living diorama)

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
- Themes: expressive surfaces (public, marketplace, customer app) are **light only**; calm surfaces (salon CRM, platform admin) ship **light + dark** (X18).
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
| G14 | "Alive" is not specified and could blow the performance budget (characters, particles, refraction). | Aliveness spec (§5.6): AI image-to-video idle loops, scroll-driven camera, hotspots, micro-interactions. All inside the §5.5 budgets with tiered downgrades. |
| G3 | "Dark mode readiness" undefined. | Semantic tokens from day one. **X18 (supersedes q44/q77): public site, marketplace and customer app are light-only; dark mode exists only in the SaaS panel (salon CRM, platform admin).** |
| G4 | No motion spec; Awwwards-level feel is mostly motion. | Motion tokens + choreography rules (§4.4), Reanimated on native, same tokens on web. |
| G5 | 3D hero not in prompt; no platform strategy, no perf budget, Vietnamese mobile networks are a stated priority (§25). No 3D-artist budget (PO q51). | **AI-produced 2.5D living diorama**: AI stills + image-to-video loops + layered parallax + DOM hotspots on web; video loop on native; R3F only if image-to-3D passes a quality gate (§5.2–5.7). Hard budgets (§5.5). |
| G6 | References for the hero not yet provided. | **Received** (ref-01 + branding, 2026-11-02). Intake process (§5.1) stays for future references; HERO-2 brief defined (§5.7). |
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
- R3b. **Logo (final, PO q50):** SVGs in `design/branding/`. A lilac butterfly-petal mark with a plum "eye" dot, plus a rounded "gugu" wordmark. Colors match tokens exactly: `#A98BEB` = `lilac.500`, `#2A1426` = `plum.950`; the on-dark wordmark uses `#F6B8CC` = `pink.300`. Usage rules and platform derivations (app icon, Android adaptive/themed icon, favicon set, splash, Zalo OA avatar): `design/branding/README.md`. Logo components in the design system (`Logo`, `LogoMark`) render the SVGs verbatim and pick the variant by theme.

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
- Dark theme (calm surfaces only, X18): plum-950-based canvas (`#1A0E18`), lilac/pink accents lifted for AA.

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
- R20. Each component ships: variants, sizes, states (default, hover (web), pressed, focused, disabled, loading, error), dark theme (calm-mode components only), RTL-safe layout (future-proof), a11y role/label props taking i18n keys or already-translated strings, and a story/preview.
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
| Display serif | **Noto Serif Display** (variable wght 100–900 + wdth 62.5–100%, italic, `vietnamese`). Used at wght 800–900, wdth ≈ 75–87.5%: the condensed high-contrast cut matches ref-01's tight editorial headlines and feels current/gen-z rather than classic | Playfair Display (wght 400–900, `vietnamese`) · a paid face only if it ships full Vietnamese + web/app license (q44 allows paid) | Bodoni Moda, Instrument Serif, DM Serif Display, Young Serif, Gloock |
| UI sans | **Be Vietnam Pro** (400/500/600/700) | n/a | n/a |
| Script | **Playwrite VN** (designed for Vietnamese handwriting, variable 100–400, thin pen look like ref-01) | Dancing Script · Charm · Pangolin · Patrick Hand | Caveat, Shadows Into Light, Gochi Hand, Nothing You Could Do |

- **Decision (PO q53 delegated the pick):** Noto Serif Display. Confirmed by the DS-1 glyph test (`.claude/skills/design-system/references/vietnamese-typography.md`). The test must cover **stacked marks at display sizes with tight leading** (Ặ, Ỗ, Ữ in uppercase-start headlines like "Đặt lịch").
- Paid fonts are allowed (PO q44). A paid display face may replace Noto Serif Display only if it ships full Vietnamese, has a web + app embedding license and wins a side-by-side specimen review.
- Line-height tokens ≥1.4 for body; display starts at 1.0 for the ref-01 look and is raised per font until the test passes (tested, not assumed).

### 4.3 Data viz (for CRM dashboards and the AI agent)
- One chart primitive set (`StatCard`, `Sparkline`, `BarChart`, `LineChart`, `Donut`) rendered with `react-native-svg` (works on web via RN-Web) — verify a maintained chart lib (e.g. Victory Native XL uses Skia; check RN-Web support) before committing; fallback is hand-built SVG primitives.
- Charts consume a declarative **ChartSpec** (type, series, units, locale) so the AI agent (topic 08) can return a spec, and the UI renders it — the agent never returns HTML/images.
- Chart palette: categorical tokens validated for CVD and both themes.

### 4.4 Motion choreography (expressive)
- Page entry: staggered fade+rise (≤ 8 items, 40 ms stagger).
- Scroll on web: hero → content transition driven by scroll progress (CSS scroll-driven animations where supported, else IntersectionObserver); never scroll-jacking.
- Shared-element feel between salon card → salon page via layout transitions where platform supports; graceful no-op otherwise.
- Hero-specific aliveness lives in §5.6; the page-level micro-interactions below apply to all expressive screens:
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
│ │  DIORAMA  (4:5 crop, │ │  full-bleed, ~48–55svh max; camera framed tighter
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
2. Design-system agent appends an analysis to `design/hero-references/README.md` and updates the hero brief (§5.7) in `docs/domains/design-system.md#hero`.
3. Product owner approves → AI production per §5.7 (outputs and licenses recorded in `design/hero/`).
4. Implementation per §5.3–5.6.

### 5.2 Production model: AI-generated, no 3D artist (PO answer q51)
There is no 3D-artist budget, so the hero is produced with **AI tools on fal.ai** (roadmap X15). The primary deliverable is a **2.5D "living diorama"**: AI-rendered chibi isometric diorama stills, AI image-to-video loops that make it feel alive, and layered parallax plus DOM hotspots on the web. Real-time 3D (image-to-3D → R3F) is an **optional upgrade**, used only if it passes a quality gate (§5.7 step 9).

All generation runs on **fal.ai** (PO q78: GuGu already has a fal account). Endpoint IDs below were checked on fal.ai on 2026-11-02. Models change fast, so confirm the ID, price and schema on the model page before each production run and log the exact ID in `PROMPTS.md`.

| Stage | Primary fal endpoint | Alternates on fal | Commercial use |
|---|---|---|---|
| Character sheet, master diorama, crops, props, edits (style + character reference) | `blackforestlabs/flux-3/edit-image`: 1–10 reference images (`image_urls`), `resolution` `512sq`…`4k`, `aspect_ratio`, ≈ $0.048 per 1K image | `fal-ai/flux-2-flex`; `fal-ai/flux-pro/kontext` (single-image edits, $0.04) | Tagged "Commercial use / Partner" on fal |
| Consistency fallback (only if drift persists) | `fal-ai/flux-lora-fast-training` → `fal-ai/flux-lora` | n/a | FLUX.1 [dev] base: fal markets outputs as commercial, but BFL's dev weights license is non-commercial. **Check fal's terms before use; prefer multi-reference FLUX 3** |
| Image → video idle loops (start = end frame → seamless) | `kling/v4/image-to-video`: start, optional middle, **end image**, 3–30 s, 720p ($0.157/s) / 1080p ($0.235/s) | `minimax/h3/image-to-video` (first + last frame); `bytedance/seedance-2.5/us/image-to-video` (end-frame control) | Kling v4 tagged "Commercial use / Partner"; check the others |
| Upscale stills | `fal-ai/aura-sr` (4×, faithful) | `fal-ai/creative-upscaler` (adds detail, can drift), `fal-ai/esrgan` | Check model page |
| Background removal (props) | `fal-ai/birefnet/v2` | `fal-ai/bria/background/remove` | Check model page |
| Segmentation (zone masks, layers) | `fal-ai/sam2` | newer SAM if listed | Check model page |
| Depth (parallax grouping) | `fal-ai/image-preprocessors/depth-anything/v2` | `fal-ai/imageutils/marigold-depth` | Check model page |
| Image → 3D (optional gate) | `fal-ai/trellis-2` | Hunyuan3D Pro image-to-3D | Check model page |

Compositing, loop crossfades, grading, encoding and the logo layer are done locally (ffmpeg / DaVinci Resolve), not on fal.

**Licensing rule:** fal's general terms claim no IP in outputs, put use at the customer's risk, and note third-party models may carry their own terms. A model is used for shipped assets only if its fal page shows **"Commercial use"**. Record the model page URL + tag in `design/hero/LICENSES.md` at generation time. Characters must not resemble real people or existing IP. The official logo SVG is **composited in post**, never generated.

**API key (`FAL_KEY`):**
- Supplied only as the environment variable `FAL_KEY`, loaded from the git-ignored repo-root `.env` (or the shell). Never committed, printed, logged, or written into `PROMPTS.md`; secret scanning in CI (topic 13).
- Used only by offline production scripts in `design/hero/scripts/`. **Never** in `apps/app` (no `EXPO_PUBLIC_*`, no client bundle) and never in the `apps/api` runtime.
- Inputs uploaded to fal storage are design references only (no customer/personal data). Output URLs are temporary; scripts download results immediately.
- If a CI job ever generates assets, the key lives in GitHub Actions secrets on a manual-trigger workflow only.

**Cost control:** explore at `512sq`/`1k` and 5 s 720p, then re-render or upscale keepers only. First production pass target < $15; full production estimate $60–100. Scripts log cost per call in `PROMPTS.md`.

### 5.3 Web: 2.5D living diorama (default)
Layer stack inside the hero frame (bottom → top):
1. **Poster** (AVIF/WebP, LCP element): the master still for the current breakpoint (`desktop` 16:10, `mobile` 4:5 tight crop).
2. **Loop video**: a full-frame seamless loop of the same still (6–8 s, muted, `playsinline`, starts after LCP/idle, crossfades over the poster at an identical frame). WebM (VP9/AV1) + MP4 (H.264) sources.
3. **Zone glow masks**: one pre-rendered soft-glow PNG/WebP per zone (Nails, Hair, Skin care, Spa, Reception), blended (`screen`) on hover/tap/focus.
4. **Foreground floating props**: transparent sprites (polish bottle, perfume, heart, hair dryer, heart drop) outside/overlapping the frame, CSS/Reanimated float + pointer parallax.
5. **DOM hotspots**: positioned by % coordinates over the frame; localized label pill + real `<a>` to the category route; also rendered as a keyboard-reachable link row.
6. **Live text overlays**: script accents and any zone names (i18n; nothing baked except the wordmark).

Motion: pointer/gyro parallax translates layers 2–5 by depth (≤ 12 px, damped); scroll drives a fake camera dolly (scale 1 → 1.15 + translate toward the reception/staircase, CSS scroll-driven animation or IntersectionObserver + rAF), then the hero unpins into the category row. No three.js in this path; hero JS ≤ 15 KB gzip.

Expo web static/SSR (topic 10): server renders poster + text + hotspot links; video/parallax are client-only.

### 5.4 Native (iOS/Android)
- `expo-video` loop of the **mobile crop** video, poster first; floating prop sprites via Reanimated; hotspots become category chips below the frame (no tap-on-video).
- Static poster on reduced motion, data saver or low-end device.
- Real-time native 3D stays out of MVP (see G8).

### 5.5 Budgets (unchanged targets, re-expressed for 2.5D)
| Item | Budget |
|---|---|
| Hero JS (2.5D path) | ≤ 15 KB gzip; zero three.js in initial bundle |
| Poster | ≤ 120 KB per breakpoint |
| Loop video (web + native) | ≤ 1.5 MB per breakpoint (720p mobile crop, 1080p desktop/tablet) |
| Zone masks total | ≤ 100 KB |
| Floating sprites total | ≤ 300 KB (≤ 1024² each, WebP/AVIF) |
| Optional R3F path (only if §5.7 step 9 passes) | lazy chunk ≤ 250 KB gzip; model + textures ≤ 1.5 MB; ≤ 100k tris; ≤ 30 draw calls |
| Homepage LCP (throttled mid-range mobile) | ≤ 2.5 s, CLS 0, no hero long task > 200 ms |
| Frame rate | 60 fps desktop, ≥ 30 fps mid mobile, else drop a tier |

CDN: object storage behind Cloudflare, content-hashed immutable URLs (topic 13).

### 5.6 Aliveness spec ("the site must feel ALIVE")
| Layer | Behavior | How (AI pipeline) |
|---|---|---|
| Idle life in the diorama | Nail tech brushes polish, stylist's dryer bobs, mask client breathes, steam from tea/spa bowl, candle + neon flicker, plants sway, lights pulse | Image-to-video per zone crop with low motion strength and first = last frame; composited back into the master with masks; one seamless full-frame loop |
| Floating glossy objects | Bottles/heart drift ±6–10 px, rotate ±4°, 4–6 s sine | Transparent AI renders + CSS/Reanimated |
| Scroll camera | Dolly into the diorama over the first 100–150% viewport scroll | CSS transform on the layer stack |
| Pointer / gyro parallax | Depth-based layer offset ≤ 12 px | Depth map → 3–4 layer groups |
| Zone hotspots | Hover/tap/focus → zone glow + label pill + link | Glow masks from SAM 2 segmentation |
| Page micro-interactions | Hearts, cards, tiles, CTA arrows, gradient drift, script draw-on (§4.4) | DOM/CSS/Reanimated |

**Device tiers (web):**
- **T0 Static**: reduced motion, `saveData`, 2G/slow-3G → poster + hotspot links + state-change micro-interactions only.
- **T1 Lite**: mobile / low-end → poster → loop video, scroll dolly, floating props, tap hotspots; parallax only after gyro opt-in.
- **T2 Full**: desktop → all of T1 + pointer parallax + hover glow (+ optional R3F scene if approved).
- FPS monitor: sustained < 30 fps for 2 s drops one tier; never upgrades mid-session.

### 5.7 HERO-2 brief: AI production pipeline (fal.ai)
Input: ref-01, `design/hero-references/README.md`, logo SVGs in `design/branding/`. Output in `design/hero/`: `STYLE.md`, `characters/`, `master/`, `crops/`, `loops/`, `props/`, `web/` (optimized deliverables), `PROMPTS.md`, `LICENSES.md`, `MANIFEST.md`, `scripts/`.

1. **Style bible** (`design/hero/STYLE.md`): palette hexes (§3.2 R8a), materials, lighting, camera, negative list. Prompt templates: `.claude/skills/3d-hero/references/ai-prompts.md`.
2. **Character sheet**: `flux-3/edit-image` with ref-01 as reference; 5–6 chibi young Vietnamese characters. Becomes the character reference.
3. **Master diorama**: `flux-3/edit-image`, `image_urls` = [ref-01, character sheet]; zones as in ref-01 (Nails, Hair, Skin care, Spa, Reception, brand wall left blank). Explore at 1K; keep the best; re-render the keeper at 2K–4K or upscale with `fal-ai/aura-sr`.
4. **Clean-up**: edit passes (master as image 1) to remove pseudo-text and fix hands/faces; grade to palette; composite the official logo SVG on the brand wall.
5. **Crops**: desktop 16:10 and mobile **4:5** tight crop (2–3 zones), via `aspect_ratio` re-renders or outpainting.
6. **Layers & masks** (HERO-3 prep): `fal-ai/sam2` zone masks, `depth-anything/v2` depth → parallax groups.
7. **Living loops**: 2–3 zone crops → `kling/v4/image-to-video` with start image = end image, 5 s 720p; reject morphing, flicker, drift; crossfade the seam locally; encode H.264 MP4 + WebM within budgets.
8. **Props**: 2–3 glossy props via `flux-3/edit-image`, cut out with `fal-ai/birefnet/v2`, exported as transparent WebP.
9. **Optional 3D gate**: `fal-ai/trellis-2` on props first. Adopt R3F only if it matches the master side by side, fits the R3F budgets, and the PO approves.
10. **Reproducibility**: `PROMPTS.md` logs per kept output: fal endpoint, request ID, prompt, refs, seed (if exposed), settings, cost, file. Sizes vs budgets in `MANIFEST.md`.
11. **Review gates**: character sheet → master → crops → loops → budgets; PO approves in the tracker.

Prompt templates live in `.claude/skills/3d-hero/references/ai-prompts.md`.

---

## 6. Acceptance criteria
- AC1. `packages/design-system` builds with zero TS errors in strict mode; tokens generate NativeWind theme + CSS vars from one source.
- AC2. Lint rule / reviewer check: no raw color hex, px font sizes or hardcoded strings in `apps/app` or design-system components (except token files).
- AC3. All 3.2 + added components exist with listed states, light (and dark for calm-mode components), and appear in the catalog on iOS, Android and web.
- AC4. Vietnamese test string renders without clipping in every font/weight/size token on all three platforms (screenshot test).
- AC5. All text/token pairs used by components meet WCAG AA (automated contrast check in CI over semantic tokens).
- AC6. Reduced-motion on → no autoplay hero motion, no bouncy springs, verified on web and native.
- AC7. Hero: web LCP element is the poster; Lighthouse mobile perf ≥ 85 on homepage with hero; no three.js in the default 2.5D path; budget checks (§5.5) in CI fail the build on regressions; all AI outputs logged in `PROMPTS.md` and `LICENSES.md`.
- AC8. Native hero shows video loop with poster, falls back to static image on low-end/reduced-motion; no `expo-gl` dependency in MVP build.
- AC11. Logo usage follows `design/branding/README.md` (clear space, min sizes, on-dark variant); app icon, adaptive icon, favicon set and splash are generated from the delivered SVGs.
- AC12. Expressive screens always render light (`color-scheme: light`), even with OS dark mode; calm screens support light + dark (X18).
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
2. **DS-2** Token source + generators + theme provider + modes + dark theme for calm surfaces.
3. **DS-3** Core primitives: Button, Input, Text, Icon, Card, Badge, Avatar, Chip, Skeleton, Loading/Empty/Error.
4. **DS-4** Composite: Sheet, Select, SearchInput, Tabs/TabBar, Toast, Stepper, Rating, ImageGallery, PriceTag.
5. **DS-5** Scheduling: DatePicker, TimeSlotPicker, Calendar (native + web variants, visual spec for topic 07).
6. **DS-6** Calm-mode data: DataTable (web), StatCard, charts + ChartSpec, AgentMessage.
7. **DS-7** Catalog + visual regression + contrast CI.
8. **HERO-1** ✅ References (ref-01) and branding (logo + icon SVGs) received and analyzed; PO decisions q50–q53 applied. Remaining asset requests are P1/P2 (motion refs, portraits, category imagery).
9. **HERO-2** AI production pipeline per §5.7: style bible → chibi character sheet → master diorama → clean-up + logo composite → crops → layers/masks → living loops → props → optional 3D gate. PO gates in the tracker.
10. **HERO-3** Web 2.5D living diorama (poster → loop video, parallax, scroll dolly, hotspots, tiers, budgets in CI; light only); native video hero; page micro-interactions (§4.4).
11. **HERO-4** (optional) R3F upgrade if the §5.7 step 9 gate passes; native real-time 3D stays post-MVP.

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
Answered (tracker): q50 wordmark final (SVGs in `design/branding/`) · q51 no 3D-artist budget → AI pipeline · q52 chibi characters · q53 display serif delegated → Noto Serif Display · q44 dark mode in marketplace at launch, paid font allowed.

Defaults taken (from q07 zones + recommendation): zone hotspots link to category pages; native apps show the video-loop hero.

Also answered: q76 on-dark icon with pink `#F6B8CC` dot (yes, used in the dark CRM) · q78 production runs on the existing fal.ai account · **X18 (supersedes q44/q77): public site, marketplace and customer app are light-only; dark mode exists only in the SaaS panel (salon CRM, platform admin).** Homepage hero = the ref-01 diorama itself, cleaned and looped (PO direction); prototype in `design/prototypes/homepage/`.

No open design questions at the moment.
