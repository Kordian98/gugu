# GuGu Studio landing: section order and case studies (02-LANDING-CASES)

Branch `design/02-cases`, preview http://localhost:8094/vi (LAN http://192.168.1.100:8094/vi). Design notes: `docs/domains/design-system.md` → "Landing case studies".

## Section order (owner, 2026-11-04)

Story → "GuGu Studio Basic" free-year band (`#fl-free`, the story exit target, unchanged) → **pricing** (buying assistant) → **case studies** (`#fl-cases`) → final CTA → footer. The business-type tiles ("Nail, tóc, spa hay mi: ghế kín hơn, bớt việc vặt") are removed from web (component, CSS, `flow.biz` keys, photo map entries). Native keeps `Businesses`. "Xem các gói" in the band still scrolls to pricing, which is now directly below.

## Case studies

Four illustrative salons with invented names: Bông Gòn Nails, Lúa Hair, Sen Đá Spa, Nắng Lash & Brow (design review: no echoes of real brands or TV titles). Each story has:

- a setup (team size and this salon's old way);
- **its own "trước → sau" map**:
  - nails: walk-ins, Zalo messages and a paper notebook, ending in double bookings;
  - hair: a stylist's personal Zalo, a wall calendar and commission in Excel, ending in mistakes;
  - spa: phone calls, a paper room board and adding up at midnight, with double-booked beds;
  - lashes: Instagram, Zalo and a notebook, then forgotten reminders, then no-shows;
  - the wire where it goes wrong is solid red with a "!";
  - "Sau" shows the four GuGu Studio steps that resolve those pains, plus one line saying how;
- **a manual toggle only** (owner, 2026-11-05): it starts on "Trước" and switches only by the toggle or "Xem sau khi dùng GuGu Studio", which plays the draw-on;
- three outcomes, each naming its feature;
- **a stack of real CRM screens** of exactly those features:
  - nails: calendar, upcoming appointments and a Zalo OA card;
  - hair: calendar, monthly payroll and one stylist's commission;
  - spa: rooms and devices (new `m-resources` capture) and Tháng này;
  - lashes: a Zalo OA card and the appointment list.

  The layers have offset, depth and glass rims, an entrance, and a pointer parallax with hover-to-front on desktop. Phones show two cards, each zoomable.

The visible label reads "Ví dụ minh hoạ — tên và số liệu là giả định" / "Illustrative examples: names and figures are hypothetical". Captions say the screenshots are real GuGu Studio screens from the demo salon and that the Zalo card is an illustration: the demo salon's inbox capture is an empty "Chưa kết nối" state, see q108. There are no photos of people and no quotes.

**New capture:** `m-resources` (vi, en) via `scripts/landing-screens.mjs --only m-resources`. Beds, rooms and devices were added to the landing demo salon (own demo DB behind :3041) through the API, and gel/acrylic/art and lash/facial services now require a device or bed.

Outcomes come from `estimate()` in `pricing/model.ts`, the same model as pricing (`cases/data.test.ts`). The assumptions line lists every input, now including owner time: 60 min of commission and 20 min of payroll per staff member, plus 60 min for the month's profit.

| Salon | Inputs (bookings/week, price, staff) | Front desk | Owner | Kept / month |
|---|---|---|---|---|
| Bông Gòn Nails | 60, 250.000đ, 3 | ≈ 13 giờ | ≈ 5 giờ | ≈ 1.625.000đ (6,5 no-shows) |
| Lúa Hair | 90, 300.000đ, 5 | ≈ 20 giờ | ≈ 8 giờ | ≈ 2.925.000đ (9,8) |
| Sen Đá Spa | 50, 450.000đ, 4 | ≈ 11 giờ | ≈ 6 giờ | ≈ 2.441.000đ (5,4) |
| Nắng Lash & Brow | 35, 300.000đ, 2 | ≈ 8 giờ | ≈ 4 giờ | ≈ 1.140.000đ (3,8) |

## Checks (Playwright; harnesses in the session scratchpad)

| Check | Result |
|---|---|
| Layout pass: Chromium + WebKit × 1440×900, 1280×800, 390×844, 360×640 × vi, en × 4 stories | no problems. Checked: order free → pricing → cases; every map starts on "Trước" and has not switched by itself after 1.5 s; "Xem sau" switches it; the "after" nodes sit inside the map, don't overlap each other or the fix line; the "before" notes sit inside the map and don't overlap; title vs toggle; stack layers inside the column; map labels ≥ 14 px on phones; targets ≥ 44 px (zoom cards included); no page overflow; no clipped name, setup or outcome |
| Desktop identical (hero, 10 book pages, client + AI views, free band, pricing, CTA, footer; 192 images vs the `ec1ee88` reference) | unchanged within a 1 px shift. The 3 leftovers are a WebKit 8 px capture stripe and a 1 px fractional top edge on two footer shots (the case-studies section above changed height) |
| Mobile stories behaviour (`story.mjs`: taps, swipes, keys, chats, zoom, slider, scroll out; Chromium + WebKit; 360, 390, 430) | the same as main step by step, except the intended change: a tap on a screenshot opens the zoom viewer instead of turning the page |
| Pricing one-screen fit (`fit.mjs` from 02-PRICING-ADVISOR, every plan state, Chromium + WebKit, vi + en, 4 sizes) | 112 / 112 OK |
| Desktop tabs | → / ← / Home / End move selection and focus (with wrap); inactive panels are `inert`; the section height is stable across tabs; every map starts on "Trước" and stays there until "Sau" or "Xem sau" is pressed (checked 1.5 s after showing) |
| Phone carousel | swipe, pager and pills switch stories; the counter updates once the snap settles; off-screen slides are `inert`; the track height = current story; a switch from below brings the pills back on screen; a vertical swipe over the carousel scrolls the page |
| Reduced motion | the map shows the chosen state at once; no wire crawl, entrance or parallax; no transitions (Chromium + WebKit) |
| Contrast | eyebrow/canvas 5.08, body/canvas 8.09, dangerInk/dangerTint 5.57, ink2/paper 13.8, lilac300/ink 10.3, white on Zalo blue 4.9; tab borders lineStrong 3.92 |

## Screenshots

- Case studies, desktop: `cases-chromium-vi-1440-c{0..3}.webp` (after) and `cases-chromium-vi-1440-c{0,1,3}-before.webp`; `cases-webkit-en-1440-c2-before.webp`, `cases-webkit-en-1440-c3.webp`.
- Case studies, phones: `cases-chromium-vi-390-c0-before.webp`, `cases-chromium-vi-390-c0.webp`; the stacks `cases-chromium-vi-390-c{0,2}-shot.webp` and `cases-chromium-en-360-c3-shot.webp`; `cases-chromium-en-360-c1-before.webp`, `cases-webkit-vi-360-c2.webp`, `cases-webkit-en-390-c3-before.webp`.

## Mobile fixes (owner, 2026-11-05) and design review of `7ba7fdf`

These cover the liquid glass, the full-screen before → after, the center pill and the calculator, plus the review fixes:

- the "after" toast now sits in the panel under the gains;
- the center pill reads a known list of content boxes, once per settled scroll;
- the zoom pill sits bottom-right with 12 px of hit slop, and a tap on a screenshot opens zoom;
- slider near-misses (± 8 px) never turn the page;
- the value bubble is 14 px;
- crops end on whole rows;
- short pages are centred, and tall phones show all four Zalo notes;
- `.mc-copy` uses ink2, and the center pill honours reduced motion;
- toasts are near-opaque glass (`glass.solid`).

Details are in `docs/qa/02-landing-mobile/README.md` → "Liquid glass".

`mfix.mjs`, Chromium mobile + WebKit touch × 360, 390, 430 × vi, en: **12 / 12 pass**. It now also checks:

- the toast never overlaps the tag, eyebrow, headline, text or gains;
- a slider near-miss doesn't turn the page;
- the payroll crop ends on a row;
- a tap on a screenshot opens zoom and doesn't turn the page;
- short panels are centred (gap above ≈ gap below);
- under Chromium 4× CPU throttling, no long task after a scroll stops (0 ms, down from ~487 ms in the review);
- glass contrast for ink2 is ≥ 8.66:1 in Chromium and ≥ 8.07:1 in WebKit.

- Glass pages: `m-glass-chromium-en-430-p{00,01,07,08,09,10}.webp`, `m-glass-chromium-en-360-p{00,01,08,10}.webp` (reduced motion, so final states).
- Before → after mid-wipe and end: `m-chromium-vi-390-wipe-mid.webp`, `m-chromium-vi-390-wipe-end.webp`, `m-webkit-en-430-wipe-mid.webp`.
- Calculator after a real drag: `m-chromium-vi-390-calc.webp`, `m-chromium-en-360-calc.webp`, `m-webkit-en-430-calc.webp`.
- Center pill, story half below / half above: `m-chromium-vi-390-center-{below,above}.webp`, `m-webkit-vi-360-center-above.webp`.
