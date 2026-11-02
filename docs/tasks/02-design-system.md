# 02 — Design system, brand, homepage 3D hero

**Owner agent:** `.claude/agents/design-system.md` · **Reviewer:** `.claude/agents/design-reviewer.md`
**Skills:** `.claude/skills/design-system/`, `.claude/skills/3d-hero/`
**Domain doc:** `docs/domains/design-system.md`
**Master prompt sections:** 3.2, 6 (+ touchpoints in 7, 13, 22, 23) · **Extras:** 3D beauty-salon hero, gen-z / Awwwards-level visual, ultra-readable CRM.

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
| G2 | No typeface decision; many trendy display fonts lack Vietnamese glyphs (stacked diacritics like ặ, ỗ, ừ break or clip). | Typeface shortlist MUST pass a Vietnamese glyph + line-height test (see §4.2). Default: **Be Vietnam Pro** (OFL, designed for Vietnamese, 9 static weights) for UI text; a display face chosen in art-direction phase only if it passes the test. |
| G3 | "Dark mode readiness" undefined. | Semantic tokens from day one (`bg.surface`, `fg.muted`…) — no raw hex in components. Dark theme values defined in MVP. |
| G4 | No motion spec; Awwwards-level feel is mostly motion. | Motion tokens + choreography rules (§4.4), Reanimated on native, same tokens on web. |
| G5 | 3D hero not in prompt; no platform strategy, no perf budget, Vietnamese mobile networks are a stated priority (§25). | Web: React Three Fiber, lazy-loaded after LCP, poster-first. Native: **pre-rendered video loop by default**, real-time 3D only behind a feature flag after device testing (§5). Hard budgets (§5.4). |
| G6 | References for the hero not yet provided. | Explicit **reference intake process** (§5.1); hero work blocked on it, everything else is not. |
| G7 | NativeWind version: v5 (Tailwind v4) is still labelled pre-release in its docs; v4 is stable. | Tokens are authored in TS, not in Tailwind config, so we can generate either. Start on the latest stable NativeWind compatible with the chosen Expo SDK; topic 01 owns the final pin. |
| G8 | R3F native story changed: v10 moves RN support into `@react-three/native` (previously `@react-three/fiber/native`), requires React 19 / RN ≥ 0.78; expo-gl on iOS rides on deprecated OpenGL ES. | Do not make native 3D an MVP dependency. Re-evaluate at topic 13 device-testing milestone (also consider WebGPU via `react-native-wgpu`). |
| G9 | Component list lacks AI-agent, Zalo, data-viz and table primitives needed by topics 07/08/09. | Added (see Scope). |
| G10 | No accessibility targets. | WCAG 2.2 AA contrast, 44×44pt touch targets, focus rings on web, screen-reader labels via i18n keys, reduced motion honored everywhere. |
| G11 | No rule for VND/number display in components. | `PriceTag` and number components take values + use topic 03 formatters; never format inline. |
| G12 | "Iconography" unspecified. | One icon set (Lucide via `lucide-react-native`, tree-shaken) + custom brand icons for categories as SVG. Verify RN-Web compatibility at implementation. |

---

## 3. Refined requirements

### 3.1 Brand & art direction
- R1. Produce 2–3 art-direction routes as moodboards (Figma) before tokens are finalized. Candidate directions to explore:
  - **"Saigon soft-pop"** — warm candy palette (lychee pink, mango, matcha), chunky rounded type, soft 3D clay objects.
  - **"Neon night market"** — dark base, electric accents, glossy chrome 3D, high-contrast editorial type.
  - **"Clean glow"** — off-white, pearl/iridescent 3D, restrained single accent; most premium, safest for CRM.
- R2. Product owner picks one route; the hero references (§5.1) must match the route.
- R3. Brand must read as local Vietnamese lifestyle without clichés (no conical-hat/lotus stock imagery by default).

### 3.2 Tokens
- R4. Token tiers: **primitive** (raw scales) → **semantic** (`color.bg.canvas`, `color.fg.default`, `color.accent.solid`, `color.status.success.bg`…) → **component** (only where needed).
- R5. Components MUST consume semantic tokens only. Raw hex/px in component code fails review.
- R6. Token categories: color, typography (family, size, line-height, weight, letter-spacing), spacing (4-pt base), radius, border, shadow/elevation (native `elevation` + iOS shadow + web `box-shadow` from one definition), z-index, opacity, motion, breakpoints.
- R7. Booking status colors (pending, confirmed, checked_in, completed, cancelled_*, no_show) are semantic tokens shared with topic 06/07 and pass AA on both themes; status is never conveyed by color alone (icon + label).
- R8. Surface modes: `expressive` and `calm` select different typography scales, radius, density and motion intensity from the same primitive set.

### 3.3 Typography
- R9. Every font in the system MUST pass the Vietnamese test string (in skill) at all shipped weights with no clipping at the tokenized line-height.
- R10. Minimum body size 16 on mobile (expressive), 14 allowed in calm-mode dense tables on desktop only.
- R11. Fonts loaded via `expo-font` on native; on web self-hosted with `latin`, `latin-ext`, `vietnamese` subsets, `font-display: swap`, preloaded primary weight only.
- R12. Max 2 families, max 4 weights shipped in the initial bundle.

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
- UI text: Be Vietnam Pro (400/500/600/700). Display: decided by art direction; candidates must pass the Vietnamese test (e.g. check Google Fonts "Vietnamese" filter first).
- Line-height tokens ≥1.4 for body, ≥1.15 for display to avoid diacritic clipping (tested, not assumed).

### 4.3 Data viz (for CRM dashboards and the AI agent)
- One chart primitive set (`StatCard`, `Sparkline`, `BarChart`, `LineChart`, `Donut`) rendered with `react-native-svg` (works on web via RN-Web) — verify a maintained chart lib (e.g. Victory Native XL uses Skia; check RN-Web support) before committing; fallback is hand-built SVG primitives.
- Charts consume a declarative **ChartSpec** (type, series, units, locale) so the AI agent (topic 08) can return a spec, and the UI renders it — the agent never returns HTML/images.
- Chart palette: categorical tokens validated for CVD and both themes.

### 4.4 Motion choreography (expressive)
- Page entry: staggered fade+rise (≤ 8 items, 40 ms stagger).
- Scroll on web: hero → content transition driven by scroll progress (CSS scroll-driven animations where supported, else IntersectionObserver); never scroll-jacking.
- Shared-element feel between salon card → salon page via layout transitions where platform supports; graceful no-op otherwise.

## 5. 3D hero

### 5.1 Reference intake (blocking for hero only)
1. Product owner drops references into `design/hero-references/` (images, videos, links in `README.md`) with a note per reference: *what to take* (mood, camera, palette, objects, interaction).
2. Design-system agent produces a one-page **hero brief** in `docs/domains/design-system.md#hero` (scene, objects, camera path, loop length, interaction, palette mapped to tokens) + a static storyboard.
3. Product owner approves the brief → 3D modeling (Blender, by a 3D artist or sourced CC0/licensed assets — license recorded in `design/hero-assets/LICENSES.md`).
4. Implementation per §5.2–5.4.

Working scene concept until references arrive: a stylized, toy-like mini salon (chair, mirror with ring light, nail station, plants, product bottles) as a slowly rotating diorama; subtle cursor/gyro parallax; category hotspots (nails/hair/spa) that link to category pages.

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
1. **DS-1** Art-direction routes + typeface test → PO picks route. *(design, no code)*
2. **DS-2** Token source + generators + theme provider + modes + dark theme.
3. **DS-3** Core primitives: Button, Input, Text, Icon, Card, Badge, Avatar, Chip, Skeleton, Loading/Empty/Error.
4. **DS-4** Composite: Sheet, Select, SearchInput, Tabs/TabBar, Toast, Stepper, Rating, ImageGallery, PriceTag.
5. **DS-5** Scheduling: DatePicker, TimeSlotPicker, Calendar (native + web variants, visual spec for topic 07).
6. **DS-6** Calm-mode data: DataTable (web), StatCard, charts + ChartSpec, AgentMessage.
7. **DS-7** Catalog + visual regression + contrast CI.
8. **HERO-1** Reference intake → hero brief → storyboard (blocked on references).
9. **HERO-2** Blender scene + optimized glTF + poster + native video export.
10. **HERO-3** Web R3F hero with capability gating, budgets in CI; native video hero.
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
1. Which art-direction route (or other)? Any existing logo/brand assets?
2. Hero references — and is the hero allowed to be interactive (hotspots linking to categories) or purely ambient?
3. Budget for a 3D artist vs. sourced/licensed assets?
4. Is dark mode required for the public marketplace at launch, or only for CRM?
5. Should the native app show the hero at all (video loop) or a simpler native home focused on search?
6. Brand display typeface: open to a paid/custom font if it handles Vietnamese well?
