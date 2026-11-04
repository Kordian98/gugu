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

**Tokens added earlier in 02-PRICING-ADVISOR:** `color.lineStrong` (#8E7B8A, ≥ 3:1 on white/canvas/tile for control borders), `gradient.glowInk` (every stop ≥ 4.3:1 on canvas/white: AA for large text only, never body text), `motion.bezier` (JS control points of `motion.ease`), `motion.spring.pop`, `opacity` (backdrop, disabled), `shadow` (card, raised). Contrast asserted in `tokens.test.ts`.

**Tokens added (02-LANDING-FLOW):** `motion` (fast 120 · base 200 · slow 320 · deliberate 500 ms, ease out/inOut), `color.danger`/`dangerInk`/`dangerTint`, `zalo`, `paper`/`paperLine`, `sheet`/`sheetLine`, `gradient.glowSoft` + `cssGradient()`.

## Landing pricing assistant (X27)
`apps/app/features/landing/Pricing.tsx` + `pricing/` (owner 2026-11-04/05: "a buying assistant, short and fun"; hard one-screen fit).
- **Questions** (`pricing/Questions.tsx`): three one-tap radio groups, all preselected by `DEFAULT_ANSWERS` (so every step shows its check; no "0 of 3" counter). Desktop: numbered steps on a rail with icon tiles (`pricing/Tiles.tsx`; fill + pop check when selected, hover lift, ≥ 3:1 borders). Phone: compact inline chips (`pricing/Choice.tsx`; short visible team labels keep the full accessible name). Roving tabindex + arrows/Home/End (`pricing/useRoving.ts`).
- **Recommendation** (`pricing/model.ts`): several locations → Ultra, AI → Pro, else Basic. A "Basic · Pro · Ultra" switch on the card (radio, "Gợi ý" badge on the suggestion) shows any plan with the same inputs without changing the answers. Ultra is costed as Pro (`billedPlan`) until multi-location ships and says so (q106).
- **Profile defaults** (`profileDefaults`): bookings/week and average price by team size; "Muốn trợ lý AI?" = Có adds 35 % bookings (assumption: such salons have more clients) and 3/4/5 h a month of owner time answered by Gu (counted on plans with the assistant only). Numbers typed in "Cách tính" replace the defaults for every plan.
- **Savings line:** "Bạn tiết kiệm khoảng X₫ mỗi tháng · sau khi đã trừ phí gói" (revenue kept − plan fee), then one hours line "~N giờ lễ tân + ~M giờ của chủ salon" (tap → "Cách tính" breakdown; hours are never converted into ₫), then the disclaimer. Owner hours: staff × (1 h commissions + 20 min payroll) + 1 h profit tally (+ assistant time).
- **Cost:** shared list prices (`@gugu/contracts`) and `planCost` (`@gugu/domain`); monthly/yearly segmented control. Basic: first year 0đ + from year two; Pro/Ultra: one "after the 14-day trial" cell.
- **Honesty (q106 pending):** unbuilt items carry "Sắp có" (`pricing/Soon.tsx`); the Ultra CTA is the Pro trial. Payroll, commissions and Insights are ungated (every plan).
- **A11y:** one polite live summary (plan or "Đang xem" plan, why, cost); sheets are one labelled dialog, focus on Close, backdrop hidden; the pinned phone CTA sets `scroll-padding-bottom` and scrolls focused controls clear (`pricing/useFocusClearance.ts`, WCAG 2.4.11).
- **Motion:** count-up numbers, card pop + check on plan change, a brief lilac glow on every answer tap, tile check pop; all off with reduced motion (`pricing/anim.ts`).
- **Fit (measured, Chromium + WebKit, vi + en, every plan state):** 1440×900 and 1280×800 questions ≤ 685 px and card ≤ 794 px; 390×844 card ends ≥ 12 px above the pinned CTA; 360×640 section ≤ 845 px (under one extra screen).
- **QA:** screenshots `docs/qa/02-pricing-advisor/`.

**Tokens added (02-PRICING-ADVISOR):** `space` scale (4 px base), `color.lineStrong` (#8E7B8A, ≥ 3:1 on white/canvas/tile), `gradient.glowInk` (≥ 4.3:1; large text only), `motion.bezier`, `motion.spring.pop`, `opacity`, `shadow` (card, raised); `Icon` gains `user`. Contrast asserted in `tokens.test.ts`.

## Decisions
- ADR 0014: landing story navigates as a book after scroll-driven doors.
