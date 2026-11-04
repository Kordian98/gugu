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
- **Section order (owner, 2026-11-04):** story → "GuGu Studio Basic" free-year band (`#fl-free`) → pricing (the buying assistant, `#pricing`) → case studies (`#fl-cases`) → final CTA → footer. The business-type tiles (`flow.biz`, `.bz`) are gone from web; native still shows `Businesses`.
- **Stage height** = scroller `clientHeight` via `--sv` (no vh/svh/dvh mismatch inside the RN Web ScrollView).
- **Phones (≤ 899 px):** `MobileJourney.tsx` + `MobileChat.tsx` + `mobile.css.ts` + `zoom.ts`: Instagram-style stories (tap right / left, free vertical scroll), sticky chapter bar, chats stepped by tap, phone crops with a Zoom viewer (`m-*` in `screens.ts`). Desktop never renders or receives it (ADR 0014 "Mobile").
- **Phones, liquid glass (owner, 2026-11-05; real translucency 02-LANDING-GLASS):** every page is one inset glass panel 12 px from the screen edges (safe areas respected; the owner tried edge-to-edge glass on text pages and preferred the margin), headline → text → large screenshot. The glass is really see-through (iOS 26 style, `liquidGlass` tokens): tint 0.34 → 0.22 white over `blur(30px) saturate(1.7) brightness(1.06)`, specular 1 px rim, gradient refraction border, inner sheen and bottom shade. Legibility comes from a feathered local veil behind the content column (`.mj-body::before`, masked, clipped to the panel) and a soft halo on headings, never from panel opacity. Chapter bar, zoom pill, center pill and chat toasts use the denser chip glass (0.60 → 0.50, blur 22); the toast inside a panel is glass-on-glass without a second blur. At most three blurred layers overlap (bar + panel + one chip); the hidden "before" scene stops rendering after the wipe; blur never animates. Playwright WebKit does not composite `backdrop-filter`; real iOS Safari is verified in the iOS Simulator (`?mj=<page>&mjqa=notext,noglass`, dev only). Story chrome (chapter bar, center pill) fades out once < 30 % of the story is in view and returns on the way back. Chats carry their chapter alone (no copy card; visually hidden heading + step text for screen readers; the "illustrative chat" note is a system line at the top of the log). The switching page animates the AI setup (price list → scan sweep → services fill row by row with toggles → "N services created"); base styles are the finished state, so reduced motion shows the final list. QA: `docs/qa/02-glass/README.md`.
- **Phones, owner iPhone round 2 (2026-11-05):** a 10 % scroll or swipe at the hero commits to the desktop-style intro (doors grow from the hero's arch on page 1, walk-in, Front desk; input locked while it plays; once per visit). Panels never fold (chevron, styles and `flow.m.fold` / `unfold` removed). Phones keep only pages that show the product working (19: demo 10, client 5, AI 4). The story bar is Instagram-style: one 3 px segment per page in three labelled 44 px group buttons (Demo · Khách hàng · Trợ lý AI; new key `flow.m.demo`). New token `motion.story.doors` (1200).
- **Phones, earlier glass pass (02-LANDING-CASES):** chapter bar, toasts, zoom pill and the new mobile "Căn giữa câu chuyện" pill share the glass. Before → after wipes the whole screen (two complete scenes, `.mj-scene`). Panel content is centred so short pages never look half empty; screenshots end on a whole row (`flow/cuts.ts`) and a tap on one opens the zoom viewer. Calculator: big slider (filled track, 14 px value bubble); the slider box plus 8 px never turns the page. The center pill is placed from a known list of content boxes, once per settled scroll. QA: `docs/qa/02-landing-mobile/README.md` → "Liquid glass".
- **QA and metrics:** `docs/qa/02-landing-flow/README.md`, `docs/qa/02-landing-mobile/README.md`.

**Tokens added earlier in 02-PRICING-ADVISOR:** `color.lineStrong` (#8E7B8A, ≥ 3:1 on white/canvas/tile for control borders), `gradient.glowInk` (every stop ≥ 4.3:1 on canvas/white: AA for large text only, never body text), `motion.bezier` (JS control points of `motion.ease`), `motion.spring.pop`, `opacity` (backdrop, disabled), `shadow` (card, raised). Contrast asserted in `tokens.test.ts`.

**Tokens added (02-LANDING-FLOW):** `motion` (fast 120 · base 200 · slow 320 · deliberate 500 ms, ease out/inOut), `color.danger`/`dangerInk`/`dangerTint`, `zalo`, `paper`/`paperLine`, `sheet`/`sheetLine`, `gradient.glowSoft` + `cssGradient()`.

## Landing case studies
`apps/app/features/landing/cases/` (owner, 2026-11-04/05), after pricing, in place of the business-type tiles. Web only (`CaseStudies.web.tsx`); `CaseStudies.tsx` keeps the native business tiles.
- **Four illustrative salons** (`data.ts`), invented names: Bông Gòn Nails, Lúa Hair, Sen Đá Spa, Nắng Lash & Brow. A visible label reads "Ví dụ minh hoạ — tên và số liệu là giả định" / "Illustrative examples: names and figures are hypothetical". No photos of people, no quotes.
- **Numbers:** three outcomes per salon, each from `estimate()` in `pricing/model.ts` with the salon's bookings/week, average price and staff (Basic: front-desk hours, owner hours, revenue kept), so they always match the buying assistant (`data.test.ts`). The note under the outcomes prints every input and assumption, including owner time (60 min commission + 20 min payroll per staff member, 60 min profit tally) from `ASSUMPTIONS`. Every feature named is in Basic.
- **Map** (`CaseMap.tsx`, `Glyph.tsx`): each salon draws its OWN old way (5 paper notes, crawling wires, the one wire where it goes wrong solid red with "!"): nails walk-ins + Zalo + a paper notebook → double bookings; hair a stylist's personal Zalo + a wall calendar + commission in Excel; spa phone calls + a paper room board + adding up at midnight; lashes Instagram + Zalo + a notebook → forgotten reminders → no-shows. "Sau" shows the four GuGu Studio steps that resolve those pains plus one line saying how. **Manual only:** it starts on "Trước"; the toggle or "Xem sau khi dùng GuGu Studio" switches it and plays the draw-on; never automatic.
- **Stack** (`Stack.tsx`): two or three real CRM screens per salon, exactly the features behind its outcomes, layered with offset and depth, glass rims, an entrance when shown and (desktop) a gentle pointer parallax and hover-to-front. Layers can be a window onto a region of a crop (readable at ≥ 0.8 scale, `sizes` follows, never upscaled). Nails: calendar + upcoming + Zalo OA card; hair: calendar + monthly payroll + one stylist's commission; spa: rooms & devices (`m-resources`, new capture) + Tháng này; lashes: Zalo OA card + appointments. The Zalo card is a labelled illustration (the demo salon's inbox capture is an empty state). Phones: two cards, each opens the zoom viewer.
- **Interaction:** desktop = tabs (`role=tablist`, ← → Home End, roving tabindex), all panels in one grid cell; inactive panels are `inert`. Phones = a scroll-snap carousel (pills + ‹ n / 4 › pager); the story changes once the snap settles, off-screen slides are `inert`, the track height follows the current story, vertical scrolling is never captured.
- **Motion:** `motion.duration` / `motion.ease` only (wire crawl and note wobble are multiples of `deliberate`); reduced motion shows the chosen state with no movement, no entrance, no parallax.
- **Contrast (AA):** eyebrow on canvas 5.08, body on canvas 8.09, dangerInk on dangerTint 5.57, ink2 on paper 13.8, white on Zalo blue 4.9 (large/semibold header); tab borders `lineStrong` (3.92:1). Map labels ≥ 14 px on phones.
- **QA:** `docs/qa/02-cases/README.md`.

## Landing pricing assistant (X27)
`apps/app/features/landing/Pricing.tsx` + `pricing/` (owner 2026-11-04/05: "a buying assistant, short and fun"; hard one-screen fit).
- **Questions** (`pricing/Questions.tsx`): three one-tap radio groups, all preselected by `DEFAULT_ANSWERS` (so every step shows its check; no "0 of 3" counter). Desktop: numbered steps on a rail with icon tiles (`pricing/Tiles.tsx`; fill + pop check when selected, hover lift, ≥ 3:1 borders). Phone: compact inline chips (`pricing/Choice.tsx`; short visible team labels keep the full accessible name). Roving tabindex + arrows/Home/End (`pricing/useRoving.ts`).
- **Recommendation** (`pricing/model.ts`): several locations → Ultra, AI → Pro, else Basic. A "Basic · Pro · Ultra" switch on the card (radio, "Gợi ý" badge on the suggestion) shows any plan with the same inputs without changing the answers. Ultra is priced as its own plan (699,000₫/month, 6,990,000₫/year; owner 2026-11-05); its CTA is the Pro trial with one short line.
- **Profile defaults** (`profileDefaults`): bookings/week and average price by team size; "Muốn trợ lý AI?" = Có adds 35 % bookings (assumption: such salons have more clients) and 3/4/5 h a month of owner time answered by Gu (counted on plans with the assistant only). "Nhiều cơ sở" asks nothing more: 2 locations by default (editable in "Cách tính"); bookings and staff scale with locations. Ultra-only savings (assumptions): merged reports 2 h per location a month (owner), shared calendar and client list 1 h per location a week fewer branch calls (front desk). Numbers typed in "Cách tính" replace the defaults for every plan.
- **Savings line:** "Bạn tiết kiệm khoảng X₫ mỗi tháng · sau khi đã trừ phí gói" (revenue kept − plan fee), then one hours line "~N giờ lễ tân + ~M giờ của chủ salon" (tap → "Cách tính" breakdown; hours are never converted into ₫), then the disclaimer. Owner hours: staff × (1 h commissions + 20 min payroll) + 1 h profit tally (+ assistant time).
- **Cost:** shared list prices (`@gugu/contracts`) and `planCost` (`@gugu/domain`); monthly/yearly segmented control. Basic: first year 0đ + from year two; Pro/Ultra: one "after the 14-day trial" cell.
- **Honesty:** unbuilt items keep a "Sắp có" tag in the "So sánh gói" sheet only (`pricing/Soon.tsx`); price and savings are shown as for a real plan. Payroll, commissions and Insights are ungated (every plan).
- **A11y:** one polite live summary (plan or "Đang xem" plan, why, cost); sheets are one labelled dialog, focus on Close, backdrop hidden; the pinned phone CTA sets `scroll-padding-bottom` and scrolls focused controls clear (`pricing/useFocusClearance.ts`, WCAG 2.4.11).
- **Motion:** count-up numbers, card pop + check on plan change, a brief lilac glow on every answer tap, tile check pop; all off with reduced motion (`pricing/anim.ts`).
- **Fit (measured, Chromium + WebKit, vi + en, every plan state):** 1440×900 and 1280×800 questions ≤ 687 px and card ≤ 797 px; 390×844 card ends ≥ 12 px above the pinned CTA; 360×640 section ≤ 843 px (under one extra screen).
- **QA:** screenshots `docs/qa/02-pricing-advisor/`.

**Tokens changed (02-LANDING-GLASS):** new `liquidGlass` (panelTop .34 / panelBottom .22, chipTop .60 / chipBottom .50, veil .58 paper, veilClear, well .76 paper, rim / rimSoft / rimClear, edge, shade, sheen, halo, blur 30, blurChip 22, saturate 1.7, brightness 1.06) for the phone story. `glass` keeps only what the case studies use on desktop and phones (chip, edge, edgeSoft, dark, darkEdge, blurChip, saturate), unchanged, so desktop is pixel-identical; tintTop, tint, solid, light and blur were removed (phone story only). `motion.story` gains `scan` (1300) and `row` (180) for the switching animation. Design review: `liquidGlass.solidPanel` (.92 paper) and `solidChip` (.94 white) for the near-solid fallbacks (no backdrop-filter support, `prefers-reduced-transparency: reduce`, `prefers-contrast: more`); chip text is ink only (ink2 on `chipBottom` over black is below AA, asserted). The package exports `@gugu/design-system/tokens` (tokens only, no React Native) so node tests can import token values. `tokens.test.ts`: panels stay translucent (0.2–0.5), panel + veil over black gives ink / ink2 AA, chips over black give ink AA, wells over black give ink2 AA.

**Tokens added (02-LANDING-CASES):** `glass` (tintTop, tint, chip, solid, edge, edgeSoft, light, dark, darkEdge, blur 32, blurChip 18, saturate 1.8). ink and ink2 on the glass tint composited over black pass AA (`tokens.test.ts`); body, eyebrow and lilac700 text must not sit directly on glass.

**Tokens added (02-PRICING-ADVISOR):** `space` scale (4 px base), `color.lineStrong` (#8E7B8A, ≥ 3:1 on white/canvas/tile), `gradient.glowInk` (≥ 4.3:1; large text only), `motion.bezier`, `motion.spring.pop`, `opacity`, `shadow` (card, raised); `Icon` gains `user`. Contrast asserted in `tokens.test.ts`.

## Decisions
- ADR 0014: landing story navigates as a book after scroll-driven doors.
