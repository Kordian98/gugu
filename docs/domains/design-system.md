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

## Charts & agent output
_ChartSpec contract (shared with topic 08), AgentMessage, ActionConfirmCard._

## Hero
References received (ref-01). Produced with AI tools on fal.ai (no 3D artist). Current brief: `docs/tasks/02-design-system.md` §5.0 (mobile composition), §5.2 (AI tool options), §5.3 (2.5D web), §5.5 (budgets), §5.6 (aliveness tiers), §5.7 (HERO-2 AI pipeline). Prompt templates: `.claude/skills/3d-hero/references/ai-prompts.md`. This section will hold the approved storyboard, asset manifest link (`design/hero/MANIFEST.md`) and measured budgets once HERO-2 starts.

## Studio landing (web story)
`apps/app/features/landing/flow/`: one pinned photoreal stage, one GSAP timeline (`timelines.ts`, paused), driven by `book.ts` (ADR 0014).
- **Navigation:** hero → doors open is scroll-scrubbed (door segment 1.2 screens). After that the story is a book of 10 pages (`PAGES`): Next/Prev, HUD chapters, keys, one swipe per page. Wheels and trackpads scroll past the story, and the dock catches flicks from either side. Reduced motion uses crossfaded turns with no door scrub.
- **Pages:** hero · arrived · front desk before · after · treatment room ×3 (one fact + one cropped CRM screen + a callout each) · office · Insights · switching (old system → GuGu Studio, 1.6× slower).
- **After the story:** `FreeYear` band (X25: Basic free for the first year, then 99,000 VND/month), where Finish and Skip land.
- **Stage height** = scroller `clientHeight` via `--sv` (no vh/svh/dvh mismatch inside the RN Web ScrollView).
- **QA and metrics:** `docs/qa/02-landing-flow/README.md`.

## Decisions
- ADR 0014: landing story navigates as a book after scroll-driven doors.
