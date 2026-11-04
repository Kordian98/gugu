# Design system (domain doc)

Durable reference for GuGu's design system: tokens, surface modes, typography, motion, components, charts, and the homepage 3D hero. Read this before changing UI. Task spec: `docs/tasks/02-design-system.md`. Procedures: `.claude/skills/design-system/`, `.claude/skills/3d-hero/`.

> Status: skeleton — sections are filled in as implementation lands.

## Art direction
**Lilac Glow**, derived from ref-01 (`design/hero-references/ref-01-homepage-lilac-diorama.png`). Full analysis, palette, typography, 3D language, do-not-copy list and asset requests: `design/hero-references/README.md`. Fonts: Noto Serif Display condensed (display, decided), Be Vietnam Pro (UI), Playwrite VN (script); confirmed by the DS-1 glyph test. Themes (X18): public/customer light-only; CRM/admin light + dark.

## Brand assets
Logo + icon SVGs (final): `design/branding/`. Usage rules, clear space, minimum sizes, and app icon/adaptive icon/favicon/splash derivations: `design/branding/README.md`.

## Surface modes
| Mode | Route groups | Character |
|---|---|---|
| expressive | `(public)`, `(customer)` | bold type, playful motion, 3D hero |
| calm | `(business)`, `(staff)`, `(admin)` | dense, legible, minimal motion |

## Tokens
_File map: `packages/design-system/src/tokens/`. Tables of semantic tokens (light/dark) go here._

## Typography
_Families, weights, scale, line-heights. Vietnamese rules: `.claude/skills/design-system/references/vietnamese-typography.md`._

## Motion
_Duration/easing/spring tokens and choreography rules._

## Components
_Inventory table: name · modes · platform split · status · catalog link._

- `checkableA11y(role, checked, { disabled? })` (`src/a11y.ts`) returns the a11y props for any pressable switch, checkbox or radio: `role` + `aria-checked` (+ `aria-disabled`), plus `accessibilityState` for native. Always use it instead of a bare `accessibilityState={{ checked }}`, because react-native-web drops that and screen readers on web never hear the state.

## Charts & agent output
_ChartSpec contract (shared with topic 08), AgentMessage, ActionConfirmCard._

## Hero
References received (ref-01). Produced with AI tools on fal.ai (no 3D artist). Current brief: `docs/tasks/02-design-system.md` §5.0 (mobile composition), §5.2 (AI tool options), §5.3 (2.5D web), §5.5 (budgets), §5.6 (aliveness tiers), §5.7 (HERO-2 AI pipeline). Prompt templates: `.claude/skills/3d-hero/references/ai-prompts.md`. This section will hold the approved storyboard, asset manifest link (`design/hero/MANIFEST.md`) and measured budgets once HERO-2 starts.

## Studio landing (web story)
`apps/app/features/landing/flow/`: one pinned photoreal stage, one GSAP timeline (`timelines.ts`, paused), driven by `book.ts` (ADR 0014).
- **Navigation:** a static hero (`StaticHero.tsx`) sits above the stage. The first small scroll plays the intro once (doors + walk-in to Front desk). After that, scrolling is plain page scrolling (nothing reverses) and the story is a book of 9 pages: Next/Prev, HUD chapters, keys, one swipe per page. The dock catches flicks. Reduced motion uses crossfades.
- **Pages:** front desk before · after · treatment room ×3 (one fact + one cropped CRM screen + a callout each) · office · Insights · pay & commissions (payroll, ADR-0016) · switching (old system → GuGu Studio, 1.6× slower).
- **Perspectives:** `Perspectives.tsx` + `ChatStory.tsx`: client (Zalo OA booking) and AI assistant (Pro) as scripted stepped chats in the same stage, switched by tabs, the hero plaque and the last salon page.
- **After the story:** `FreeYear` band (X25: Basic free for the first year, then 99,000 VND/month), where Finish and Skip land.
- **Stage height** = scroller `clientHeight` via `--sv` (no vh/svh/dvh mismatch inside the RN Web ScrollView).
- **QA and metrics:** `docs/qa/02-landing-flow/README.md`.

**Tokens added (02-LANDING-FLOW):** `motion` (fast 120 · base 200 · slow 320 · deliberate 500 ms, ease out/inOut), `color.danger`/`dangerInk`/`dangerTint`, `zalo`, `paper`/`paperLine`, `sheet`/`sheetLine`, `gradient.glowSoft` + `cssGradient()`.

## Landing pricing assistant (X27)
`apps/app/features/landing/Pricing.tsx` + `pricing/` (owner 2026-11-04: "a buying assistant, short and fun").
- **Questions:** three one-tap radio chip rows (`pricing/Choice.tsx`, `checkableA11y("radio")`, 44 px): team (just me / 2–5 / 6+), AI assistant (yes / not now), locations (1 / several). Defaults answer at once (Basic). Bookings per week and average price default from the team size (`TEAM_DEFAULTS`) and can be changed in "Cách tính".
- **Recommendation** (`pricing/model.ts`): several locations → Ultra (`salon.max_locations`), AI → Pro (`ai.agent.enabled`), else Basic. One-line why. Other plans: compact rows on desktop, "So sánh gói" bottom sheet everywhere.
- **Cost:** shared list prices from `@gugu/contracts` (`PLAN_MONTHLY_PRICE_VND`) and `planCost` from `@gugu/domain`; monthly/yearly segmented control (yearly = 10 × monthly). Basic: first year 0đ + from year two; Pro/Ultra: one "after the 14-day trial" cell.
- **Estimate:** net per month = revenue kept − plan cost per month, plus hours freed; labelled as an illustrative estimate, not money GuGu pays. Assumptions (4.33 weeks, 3 min per booking, 10 % no-shows, 25 % fewer with reminders) are shown step by step in the "Cách tính" sheet (`RoiCalculator.tsx`).
- **Layout:** desktop questions | result, fits 1280×800; phone fits 390×844 after snapping (CTA pinned with CSS sticky, section is a scroll-snap point), 360×640 within one scroll. Sheets: RN `Modal` (bottom sheet on phones, dialog on desktop).
- **Motion:** numbers count up (`useCountUp`, `motion.duration.deliberate`, ease-out), result card pops and the check draws in on plan change (`usePop`); all off with reduced motion.
- **QA:** screenshots `docs/qa/02-pricing-advisor/` (Chromium + WebKit, 1440/1280/390/360, vi/en, `flow-*` = interactions and sheets).

## Decisions
- ADR 0014: landing story navigates as a book after scroll-driven doors.
