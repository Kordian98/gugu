# GuGu Studio landing: navigation feel (02-LANDING-FLOW)

Branch `design/02-landing-flow`, preview http://localhost:8094/vi. Decision record: `docs/adr/0014-landing-story-book-navigation.md`.

## Diagnosis (main `14bf9b3`, before any change)

The story stepped "one gesture = one transition" (`flow/chapters.ts`). These made it clunky:

1. **Swallowed input.** A non-passive wheel/touch listener started a 3.4–7 s scroll tween and called `preventDefault` on every wheel/touch event until 260 ms after the tween ended. Four trackpad swipes advanced one beat (120/120 wheel events prevented). Ten mouse notches also advanced one beat.
2. **Momentum fights the page.** Trackpad momentum keeps sending wheel events for about 1 s. They were eaten while busy, and the tail that survived the 260 ms grace triggered a second, unintended step.
3. **No reversal.** A reverse swipe during a transition was ignored (reverse response: none).
4. **Unknown distance.** One flick played a 7 s scripted animation, so there was no proportional feedback.
5. **Touch killed iOS momentum.** Every `touchmove` was prevented (74/74), with one step per touch.
6. **Keyboard dead.** The page scrolls inside the RN Web ScrollView div, which never has focus, so PgDn, Space and arrows did nothing.
7. **Slow settling.** Every beat took 3.9–6.3 s before the page accepted input again.

The HUD chapter jump felt good because it was a single long eased tween, with nothing fighting it.

## Final model (owner, 2026-11-04): intro once, then a book

- **Static hero:** doors closed. The first small scroll (one wheel notch, a short swipe, Start or a key) plays the intro once: doors + walk-in to Front desk page 1. Input is ignored while it plays; below the threshold nothing happens.
- **Scrolling:** after the intro it is plain page scrolling. Up shows the static hero, down returns to the book on the same page, then past it. Nothing reverses or replays. The dock catches flicks from either side.
- **Pages:** 9 (Front desk before → switching; the back office has overview, Insights and pay & commissions), counted "n / 9". They turn by Next/Prev, the HUD chapters (Arrive removed), keys or one swipe per page. Turns play the original animations at their original pacing.
- **Divider:** removed. Before → after is the original sweep, played by Next ("Xem sau khi dùng").
- **Finish and Skip:** both go to the X25 band.
- **Reduced motion:** crossfades.

### Once-per-visit run (Chromium desktop)

| Step | Result |
|---|---|
| 30 px of wheel at the hero | nothing |
| One wheel notch | intro starts; a 200 px/frame flick during it is ignored; lands on Front desk 1/8; 0 frames > 25 ms (859) |
| Flick up / flick down | static hero / back on the same page |
| Next on page 1 | label "Tiếp theo" at 120 ms, page 2/8 |
| Swipe down at the dock | scrolls past; flick up from below catches at the book (same page) |
| → ← HUD last, Finish | +1, −1, 8/8, next section |
| Static hero "Tiếp tục hành trình" | back to the book on page 8 |

## Earlier metrics (Playwright, real input simulation; headless, so frame times are relative)

### Before

| Scenario (Chromium desktop) | Result |
|---|---|
| 1 trackpad swipe (momentum) from hero | 1 beat, input blocked 3.9 s, 58/79 wheel events prevented |
| 4 trackpad swipes | still 1 beat (120/120 prevented) |
| Reverse swipe mid-transition | never reverses |
| 10 mouse notches | 1 beat, 6.2 s |
| PgDn / Space / ↓ / PgUp | nothing moves |
| Touch swipe (mobile) | 74/74 touchmoves prevented, 6.3 s |
| HUD first → last | 6.3 s, 17 frames > 25 ms |
| WebKit desktop, 1 swipe | 12 frames > 25 ms |

### After (`docs/qa/02-landing-flow`, harness `book.mjs`)

| Scenario | Chromium desktop | WebKit desktop | Chromium mobile (touch) | WebKit mobile |
|---|---|---|---|---|
| Fast flick at hero | lands on page 1 (y = dock) | page 1 | touch fling → page 1 | n/a (no touch synth) |
| New swipe down at dock | scrolls past the story | scrolls past | n/a | n/a |
| Flick up from below | lands on the book (same page) | same | n/a | n/a |
| 12 mouse notches from hero | page 1, stops at dock | page 1 | n/a | n/a |
| Next × 10 (label at 120 ms) | label already the next one; every page in order; Finish → next section | same | same | same |
| Triple-click Next | +2 pages (one turn + one queued), never more | same | same | same |
| → / ← / PgDn | +1 / −1 / +1 | same | same | same |
| Touch swipe up / left / right | n/a | n/a | +1 / +1 / −1 page | n/a |
| HUD last chapter / first chapter | page 10 / hero (doors close) | same | same | same |
| Frames during a full Next run | 0 > 50 ms, 2 > 25 ms (4 275 frames) | 1 > 50 ms, 4 > 25 ms (2 227) | 0 > 25 ms (4 417) | 0 > 25 ms (2 229) |
| Reduced motion | crossfade turns (~1 s each), no door scrub | n/a | n/a | n/a |

All pages are reachable forward and backward by Next/Prev, keys, swipes and the HUD.

## Screenshots

- **Treatment room before:** `before-treatment-vi-{1440,1280,390}.webp`.
- **Treatment room after:** `after-p4…p6-vi-{1440,1280,390}.webp`, one fact and one cropped CRM screen with a callout per page.
- **Switch before:** `before-switch-vi-*.webp`.
- **Switch after:** `after-p9-vi-*.webp`, migration from notebook / spreadsheet / old app with 4 real steps.
- **Insights:** `after-p8-vi-*.webp`. "Phễu Zalo" is the Zalo statistics card in the CRM Insights (bot funnel, lost reasons, reminders).
- **Front desk before:** `after-p2-*.webp`.
- **Hero with the hint:** `after-p0-*.webp`.
- **X25 band:** `after-free-year-*.webp`.
- **Pay & commissions:** `after-payroll-vi-{1440,1280,390}.webp`.
- **Static hero:** `after-static-hero-vi-1440.webp`. **Review fixes:** `after-review-*.webp`.

## Owner corrections at `acfda28` (2026-11-04)

- **Prev fixed.** React re-renders were resetting the static `disabled` / `aria-label` props on Prev and Next. They are now set only at runtime. Prev goes back one page with the reverse animation on every page, with ← and PgUp as well (Chromium + WebKit, desktop + mobile).
- **No scroll capture after the intro.** Wheel and vertical swipes scroll the page; horizontal swipes turn pages. The "Căn giữa câu chuyện" button appears while the story is offset and re-docks it.
- **Skip removed.**
- **Hero CTA is a plaque at the foot of the arch,** with Start. It is gone after the first walk-in.

## Design review fixes (after `f7c8e5b`)

- Next has an `aria-label` for the current label. Its label spans and arrow are `aria-hidden`, and Prev is disabled on page 1.
- Every non-current page panel is `inert`. A visually hidden polite live region (`flow.hud.pageSr`) updates on settle, and the visible counter is `aria-hidden`. Focus moves to the X25 heading after Finish/Skip.
- The phone HUD has two rows, so chapter buttons are 81×44 with visually hidden names. Prev, Skip and links are ≥ 44 px.
- A stray `}` in `flow.css.ts` was breaking every later mobile rule (HUD layout, Insights centring, swipes). It is removed.
- Small text on photos is plum ink (`ink2`), and the front-desk veil is 0.86. Headings use `text-wrap: balance`, paragraphs `pretty`.
- Layout fixes: the citation sits above the first-view hint, the calendar callout points at the 10:00 booking, and the number/h3 spacing is fixed. Insights and payroll fit 390×844.
- Reduced motion: no shimmer, and exit/dock scrolls jump.
- New tokens: `motion`, `danger*`, `zalo`, `paper*`, `sheet*`, `gradient.glowSoft` + `cssGradient`. Raw hex in the landing feature dropped from 108 on main to 48.
- Insights and payroll figures go through `Intl` / `formatVND`. 99,000 VND comes from one constant via `{{price}}`. The Basic card CTA says "Bắt đầu miễn phí".

## Copy changes needing vi review (`i18n:vi-review`)

- **`flow.hud`:** `c2` (Phòng làm → Phòng dịch vụ), `c4` (Chuyển từ sổ/app cũ), `finish` (Kết thúc hành trình), `prev`, `page`, `hintKeys`, `hintTouch`.
- **`flow.features`:** `chip` (14:00 → 10:00, to match the visible booking), `callAppt`, `callSvc`. The `r4*` keys were removed (three facts only).
- **`flow.switch`:** `title`, `sub`, `st1`–`st4`, `oNb`, `oXl`, `oApp`. The copy says photo or screenshot only (the AI import has no text paste) and makes no client-import claim.
- **New sections:** `flow.insights.*`, `flow.free.*`, `flow.payroll.*` (pay & commissions page), `flow.hud.resume`, `flow.hud.pageSr`, `pricing.basicCta`.
- **`pricing`:** `trial`, `basicFree`, `basicThen`, `basic.items`.
- **Reminders:** `features.reminders.title` and `story.reminders.sub` now say Zalo only (q85/q86).
- **Trial (q96):** `hero.note`, `cta.title`, `cta.body` and `pricing.trial` lead with the free Basic year and mention the 14-day Pro trial second.

## Not verified

- A physical iPhone or iPad. The dock clamp writes `scrollTop` during iOS momentum.
- Real Safari, as opposed to Playwright WebKit.
- WebKit touch (Playwright has no WebKit touch-scroll synthesis).

_2026-11-04 correction: Arrive is no longer a separate page; the tables above were measured with 10 pages (an extra "arrived" page). The rerun with 9 pages is in the commit message._
