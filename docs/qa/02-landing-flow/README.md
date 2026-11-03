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

## Design re-review of `acfda28` (fixed)

- **B1:** every input (keys, Next, Prev, chapters, wheel, swipes) is ignored while the intro plays. Verified: ↓ PgDn Space → plus Next plus a chapter click during the intro still land on page 1.
- **B2:** ↑ ↓ PgUp PgDn Space scroll the page and never turn it. Only ← / →, Next/Prev, chapters and horizontal swipes turn pages. ↓ on page 1 scrolls, with no before → after.
- **Contrast:** the margin pill and the AI-setup labels are ink on lilac100.
- **Net-profit row:** `nowrap`, and stacked on phones.
- **Next:** 44 px tall on phones.
- **Formatting:** `formatPercent` and signed `formatVND`; "tự tính" no longer splits.
- **Short screens (≤ 760 px):** compact layout; the office disclaimer and the Switch eyebrow stay above the HUD at 360 × 740.
- **Payroll p5** is kept on phones.
- **Decorative CRM chrome** is `aria-hidden`.
- **Intro threshold:** 6 % of the viewport (at least 40 px), and nudges add up.
- **Harness:** Prev on every page plus ← / → / PgUp / PgDn / touch, in Chromium desktop and mobile and in WebKit desktop: all pass.

## Treatment-room crops: sharp, never upscaled (owner, 2026-11-04)

- **Fresh captures:** real screens of the seeded, set-up demo salon (own DB `landing_gugu_payroll`, API :3041, web :8098) via `scripts/landing-screens.mjs`. Calendar, appointments and services are cropped to the detail at 3× device pixels (2580 / 3294 / 2736 px wide), each with a 2× companion (`-2x.webp`).
- **`srcset` + `sizes`:** derived from the displayed width (box width × crop aspect ÷ box aspect). `width`/`height` attributes give the ratio before lazy load, which fixes a 0 px image on phones.
- **Measured upscale** (displayed device px ÷ chosen file px; ≤ 1.15 required): 1440@2× 0.76–1.00, 1280@1× 0.44–0.52, 390@3× 0.60–0.82, 360@3× 0.59–0.82.

## Three perspectives (owner, 2026-11-04)

- **Tabs at the top of the story:** "Chủ salon · Khách hàng · Trợ lý AI". They show after the intro, or whenever a side perspective is open.
- **Ways in:** the hero plaque has "Hoặc xem góc nhìn: Khách hàng · Trợ lý AI". The last salon page has "Xem góc nhìn của khách" and "Xem trợ lý AI" next to "Kết thúc hành trình".
- **Client perspective (5 steps):** booking in the salon's own Zalo OA. The bot speaks as the salon; real free slots; phone share; confirmation (pay at the salon); 24 h / 2 h reminder with "Tôi sẽ đến / Đổi giờ / Hủy"; "Gặp nhân viên" hand-off.
- **AI perspective (5 steps, Pro):** only what the read tools do: bookings count, utilization, revenue estimated vs recorded, and month profit as totals (no per-person pay). The privacy firewall refuses a message containing a client's phone number.
- **Both are scripted:** no model is called from the landing. A live demo would need a server endpoint with rate and cost limits.
- **Shared mechanics:** each side view has its own Next/Prev; ← / → while shown; one horizontal swipe per step. Messages type in one by one, and a press completes the step first (one press, one step). Last-step buttons lead to the other perspectives or finish. With reduced motion, messages appear at once.
- **Book scope:** the salon book ignores keys and swipes while a side view is open, and never starts the intro from a side view.
- **Office copy fix:** the "AI assistant" card no longer claims a free-slot lookup or drafted replies (the assistant has no such tool).

## Pricing and business types rebuilt (owner, 2026-11-04)

- **Pricing:** headline "Thêm giờ rảnh, thêm doanh thu. Năm đầu miễn phí." (gradient on two words). A "Salon của bạn" bar takes two numbers. Every plan card then shows a live gradient benefit (+N giờ, +revenue kept each month) right under the price and above its CTA. The CTAs carry the benefit: "Lấy lại N giờ/tháng · miễn phí" and "Thử Pro 14 ngày · miễn phí". Assumptions and disclaimer sit under the cards.
- **Business types:** one grid, no swiping. Per business, one big illustrative result plus the feature behind it, with a source note.
- **Turns:** a press in the second half of a turn (or the intro) completes it and turns one page on; an early press speeds the turn up.

## Pricing: what you get back vs what you put in (owner, 2026-11-04)

- **`RoiCalculator`** sits under the plan cards. Two steppers (bookings per week, average price, with 44 px buttons) drive three tiles: time back per month, revenue kept per month and "what you pay in year one: 0đ". A verdict line follows, then the disclaimer.
- **Assumptions** (all in the on-page note): about 3 minutes of admin per booking; 10 % no-shows, 25 % fewer with reminders (BMJ Open 2016, clinics); Basic free for the first year, then {{price}}/month. "Illustrative estimate, not a promise; your salon's results may differ."

## Final retake after payroll UX (main `96cdd79`)

- **Fresh capture:** own DB `landing_gugu_payroll`, re-seeded with `seed-payroll-demo.mjs`; owner signed in, setup finished (no checklist anywhere; the script fails if one appears).
- **Pay page = the whole feature:**
  - the full payroll month screen: tabs, month, "Tải CSV / Tải Excel", "Chốt bảng lương", summary (to pay, projected, real employer cost), table and the tax note;
  - the per-person drawer slides in over it (pay rule, commission per completed service, "Sửa lương");
  - phones show the drawer only.
- **Office laptop:** the overview crop below the "Tháng này" card (team timeline, upcoming, recent activity). The seeded month estimate is −19,047,029 ₫, so it is not shown in marketing.
- **Refreshed with the same seed:** Insights KPIs, timeline, calendar, appointments and services crops.
- **The error the owner saw on :8094:** the capture script wrote images in place, and the running Metro picked up half-written files ("Image asset … cannot be an empty file"). Now files are written in a temp dir and renamed atomically (images and manifest), and the script fails on any error overlay or "Server Error" instead of capturing it. The floating assistant bubble is hidden in captures.
- **Intro speed-up:** Next / → / ↓ again during the intro speeds it up (owner); scroll, ← and chapters are still ignored.

## Back office uses real screens (owner, 2026-11-04)

- **Insights page:** a real crop of the app's Insights screen ("Phân tích & báo cáo", 30 days: completed bookings, new and returning clients, estimated revenue, recorded at the salon, estimated gross margin).
- **Pay page:** a real crop of the payroll screen (per person: pay type, base, commission, adjustments, totals).
- **Capture:** both come from the seeded demo salon on my own DB at 3× with srcset. The CRM-styled mocks are gone.
- **"Tháng này" is not used yet:** the seeded month shows a negative estimated profit, which is wrong for marketing.
- **Final payroll screenshots:** to come via the coordinator after `crm/07-payroll-ux` merges.
- **Bug fixed:** the Insights animation also targeted the payroll window (shared classes), so on Insights an empty payroll window covered the real one. The selectors are now scoped to `.ov-i`.
- **Turns react at once:** an out-ease, with the same durations; the intro keeps its in-out ease. Pressing Next or → again during a forward turn (or ← during a backward one) speeds it up to finish within 0.45 s, without skipping a page.

## No card, no payment method (owner, 2026-11-04)

- **"Không cần thẻ hay thanh toán khi đăng ký"** is in the hero note, the X25 band, the Basic card and the final CTA.
- **The X25 band explains the flow:** email sign-up → 14-day Pro trial → Basic free for 12 months → then {{price}}/month. "We contact you before anything is due; nothing is charged automatically." There is no other payment promise.
- **After the intro:** only the trailing momentum of the gesture that triggered it is swallowed (≤ 450 ms). A new wheel, trackpad, touch or key gesture scrolls past page 1 at once.

## CRM screenshots

- **Checklist cut from `overview` and `kpis` (vi + en), owner 2026-11-04.** The onboarding checklist ("Thiết lập bằng AI trong vài phút") was removed by cutting its band and stitching the real screen back together; the sidebar stays intact. The manifest sizes are updated. This is interim, until the full retake.
- **One-command retake: `scripts/landing-screens.mjs`.** It seeds the payroll demo plus the demo salon on your own DB, signs in, presses "go live" so the checklist disappears, fails if the checklist is still on any screen, and captures overview / timeline / upcoming / kpis / calendar (+crop) / appointments (+crop) / services (+crop) / Insights (+ "Tháng này") / payroll / Zalo in vi and en.
- **Retake timing:** waiting for `crm/07-payroll-ux` to merge and the Insights screens to be final. The CRM-styled Insights and payroll mocks will then be replaced by the real screens.
- **Not run yet:** the script has not run end to end. It needs an API on its own DB plus this branch's web server; it passes `node --check`.

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
