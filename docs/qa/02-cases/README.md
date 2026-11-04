# GuGu Studio landing: section order and case studies (02-LANDING-CASES)

Branch `design/02-cases`, preview http://localhost:8094/vi (LAN http://192.168.1.100:8094/vi). Design notes: `docs/domains/design-system.md` → "Landing case studies".

## Section order (owner, 2026-11-04)

Story → "GuGu Studio Basic" free-year band (`#fl-free`, the story exit target, unchanged) → **pricing** (buying assistant) → **case studies** (`#fl-cases`) → final CTA → footer. The business-type tiles ("Nail, tóc, spa hay mi: ghế kín hơn, bớt việc vặt") are removed from web (component, CSS, `flow.biz` keys, photo map entries). Native keeps `Businesses`. "Xem các gói" in the band still scrolls to pricing, which is now directly below.

## Case studies

Four illustrative salons: Hoa Mai Nails, Lúa Hair, White Lotus Spa, Nắng Lash & Brow. Each story has:

- a setup (team size, the old way);
- the animated "trước → sau" map, with a Trước/Sau toggle;
- three outcomes, each naming its feature;
- one real CRM crop: calendar, payroll, "Tháng này" or appointments.

The visible label reads "Ví dụ minh hoạ — tên và số liệu là giả định" / "Illustrative examples: names and figures are hypothetical". Every screenshot says it is a real GuGu Studio screen from the demo salon. There are no photos of people and no quotes.

Outcomes come from `estimate()` in `pricing/model.ts`, the same model as pricing (`cases/data.test.ts`):

| Salon | Inputs (bookings/week, price, staff) | Front desk | Owner | Kept / month |
|---|---|---|---|---|
| Hoa Mai Nails | 60, 250.000đ, 3 | ≈ 13 giờ | ≈ 5 giờ | ≈ 1.625.000đ (6,5 no-shows) |
| Lúa Hair | 90, 300.000đ, 5 | ≈ 20 giờ | ≈ 8 giờ | ≈ 2.925.000đ (9,8) |
| White Lotus Spa | 50, 450.000đ, 4 | ≈ 11 giờ | ≈ 6 giờ | ≈ 2.441.000đ (5,4) |
| Nắng Lash & Brow | 35, 300.000đ, 2 | ≈ 8 giờ | ≈ 4 giờ | ≈ 1.140.000đ (3,8) |

The Zalo inbox capture (`zalo.webp`) is an empty "Chưa kết nối" state, so Nắng shows the appointments list instead. A real inbox needs a connected OA in the demo DB (open question).

## Checks (Playwright; harnesses in the session scratchpad)

| Check | Result |
|---|---|
| Layout pass: Chromium + WebKit × 1440×900, 1280×800, 390×844, 360×640 × vi, en × 4 stories | no problems. Checked: order free → pricing → cases; map reaches "after"; after nodes inside the map and not overlapping; before notes inside and not overlapping; tag vs toggle; targets ≥ 44 px; no page overflow; no clipped name, setup or outcome |
| Desktop identical (hero, 10 book pages, client + AI views, free band, pricing, CTA, footer; 192 images vs a reference captured on `ec1ee88` first) | 190 identical within a 1 px shift. The other 2 are an 8 px WebKit capture stripe and one fractional edge row, where the neighbouring section changed |
| Mobile stories (every page, hero, free band; Chromium + WebKit, 390 + 360, vi + en; 184 images vs main :8097) | identical. Only the free-band shot at 390 differs, because pricing now shows under the band, as intended |
| Pricing one-screen fit (`fit.mjs` from 02-PRICING-ADVISOR, every plan state, Chromium + WebKit, vi + en, 4 sizes) | 112 / 112 OK |
| Desktop tabs | → / ← / Home / End move selection and focus (with wrap); inactive panels are `inert`; the section height is stable across tabs; the map replays on every switch (before → after) |
| Phone carousel | swipe, pager and pills switch stories; the counter updates; the track height = current story; a switch from below brings the pills back on screen; a vertical swipe over the carousel scrolls the page (537 px) |
| Reduced motion | map shows "after" at once, no wire animation, no transitions (Chromium + WebKit) |
| Contrast | eyebrow/canvas 5.08, body/canvas 8.09, dangerInk/dangerTint 5.57, ink2/paper 13.8, lilac300/ink 10.3; tab borders lineStrong 3.92 |

## Screenshots

- Desktop: `chromium-vi-1440-c{0..3}.webp` (after), `chromium-vi-1440-c0-before.webp`, `chromium-en-1280-c1.webp`, `webkit-en-1280-c2-before.webp`, `webkit-vi-1440-c3.webp`.
- Phones: `chromium-vi-390-c0-before.webp`, `chromium-vi-390-c0.webp`, `*-390-c*-shot.webp` (phone crops), `chromium-en-360-c3*.webp`, `webkit-vi-360-c3.webp`, `webkit-en-360-c2-before.webp`.

## Mobile fixes (owner, 2026-11-05)

These are the liquid glass, full-screen before → after, center pill and calculator changes. Details and the full check table are in `docs/qa/02-landing-mobile/README.md` → "Liquid glass". `mfix.mjs` passes on all 12 configurations: Chromium mobile and WebKit touch × 360, 390, 430 × vi, en. The desktop stays identical (same 192-image diff). The stories behaviour test matches main, step for step, at 390 and 360 in WebKit and at 390 in Chromium.

- Glass pages: `m-glass-chromium-vi-390-p{00,01,03,07,08,09,10,11}.webp`, `m-glass-webkit-en-360-p{00,01,05,08,10}.webp` (reduced motion, so final states).
- Before → after mid-wipe and end: `m-chromium-vi-390-wipe-mid.webp`, `m-chromium-vi-390-wipe-end.webp`, `m-webkit-en-430-wipe-mid.webp`.
- Calculator after a real drag: `m-chromium-vi-390-calc.webp`, `m-chromium-en-360-calc.webp`, `m-webkit-en-430-calc.webp`.
- Center pill, story half below / half above: `m-chromium-vi-390-center-{below,above}.webp`, `m-webkit-vi-360-center-above.webp`.
