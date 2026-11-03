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

## Final model (owner, 2026-11-04): doors by scroll, then a book

- **Doors:** hero → doors open → inside at the desk is scroll-scrubbed. Scrolling up closes the doors.
- **Page turns:** everything after moves only by Next/Prev, HUD chapters, keys (→ ↓ PgDn Space / ← ↑ PgUp Shift+Space while the story is in view), or one touch swipe per page.
- **Turns:** each turn plays the existing animation at its original pacing and never stops half-way. Next during a turn fast-forwards it and queues at most one page.
- **Wheel and trackpad:** they scroll past the story. The dock catches flicks: a fast flick at the hero lands exactly on page 1, and a flick up from below lands back on the book page you left.
- **Label:** Next morphs immediately (start the tour → next → see the after → … → finish journey). A counter (n / 10), a first-view hint and Prev were added.
- **Finish and Skip:** both scroll to the X25 band right after the story.
- **Reduced motion:** the same book, with page turns as short crossfades.

## Metrics (Playwright, real input simulation; headless, so frame times are relative)

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
- **Insights:** `after-p8-vi-*.webp`.
- **Front desk before:** `after-p2-*.webp`.
- **Hero with the hint:** `after-p0-*.webp`.
- **X25 band:** `after-free-year-*.webp`.

## Copy changes needing vi review (`i18n:vi-review`)

- **`flow.hud`:** `c2` (Phòng làm → Phòng dịch vụ), `c4` (Chuyển từ sổ/app cũ), `finish` (Kết thúc hành trình), `prev`, `page`, `hintKeys`, `hintTouch`.
- **`flow.features`:** `chip` (14:00 → 10:00, to match the visible booking), `callAppt`, `callSvc`. The `r4*` keys were removed (three facts only).
- **`flow.switch`:** `title`, `sub`, `st1`–`st4`, `oNb`, `oXl`, `oApp`. The copy says photo or screenshot only (the AI import has no text paste) and makes no client-import claim.
- **New sections:** `flow.insights.*` and `flow.free.*`.
- **`pricing`:** `trial`, `basicFree`, `basicThen`, `basic.items`.
- **Reminders:** `features.reminders.title` and `story.reminders.sub` now say Zalo only (q85/q86).

## Not verified

- A physical iPhone or iPad. The dock clamp writes `scrollTop` during iOS momentum.
- Real Safari, as opposed to Playwright WebKit.
- WebKit touch (Playwright has no WebKit touch-scroll synthesis).
