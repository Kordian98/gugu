# 02 · Landing on phones (≤ 899 px)

Concept and rules are in ADR-0014, section "Mobile". `before/` shows the previous mobile book (390×844,
Chromium, vi). `after/` shows the Instagram-style stories (390×844 vi + en, 360×640 WebKit, landscape
844×390).

## Model (owner, 2026-11-04)

The first cut used vertical full-screen sections with mandatory scroll snap. The owner replaced it the
same day with the feel of Instagram stories:

- tap right = next, tap left (left third) = back, a horizontal swipe does the same, and so do ← / →;
- vertical scrolling is ordinary page scrolling, so a page can be taller than the screen and you can
  scroll out of the story at any time;
- the next page starts at its top;
- next on the last page scrolls on to the free-year band, and back on the first page scrolls up to the
  hero.

## Desktop is unchanged

Reference set taken before any mobile change: every page (hero, p0–p9), every step of both
perspectives and every screen below the stage. Matrix: 1440 and 1280, Chromium and WebKit, vi and en
(200 images). Captured again after the change and pixel-diffed (a pixel counts as different if any
channel moves by more than 8):

- **Noise baseline** (two captures of the same build): 6 of 200 images differ, each by 1–3 px, all in
  the Next button.
- **After the mobile work:** 2 of 200 images differ, by 1 px each, in the same Next button. Desktop is
  identical.
- **Later change:** the owner-requested copy fix `flow.calc.out` ("thu lại" → "giữ lại mỗi tháng (ước
  tính)") changes the office calculator label on desktop too. That change is intended.

## Mobile matrix

Sizes: 360×640, 375×667, 390×844, 393×852, 430×932 and 844×390, in Chromium (mobile emulation, touch)
and WebKit (touch), in vi and en. That is 504 page checks.

Per page, the checks are:

- no horizontal overflow;
- nothing under the chapter bar;
- nothing cut at the bottom of a page that fits the screen;
- body text ≥ 16 px;
- no image shown above 1.15× its pixels.

Results:

- **Portrait:** every page fits one screen at every size, including 360×640.
- **Landscape (844×390):** six pages are taller than the screen (hero, before, earnings, Insights,
  payroll, switching). They scroll, which the stories model allows.
- **WebKit:** a 1 px rounding offset on chat pages, fixed with a rounded scroll target.
- **Errors:** no page errors. The `/me` CORS error comes from the dev API environment and is not caused
  by the landing.

## Interaction tests (Playwright)

Chromium tests use real CDP touch events; WebKit tests use touch taps, wheel and keys.

- **Taps:**
  - three right taps go 0 → 3 and a left tap goes back one page;
  - a tap on the left part of a screenshot goes back;
  - a tap on the copy card's text goes forward.
- **Zoom:**
  - the caption's Zoom button opens the viewer;
  - a pinch zooms to 3.5× (CDP two-finger touch in Chromium, pointer events in WebKit);
  - Escape closes the viewer and focus returns to the button.
- **Scrolling:**
  - inside a long page (payroll) you scroll freely, and the next tap starts the next page at its top;
  - from the middle of the story you can scroll out upwards to the hero;
  - next on the last page lands on the free-year band, and below it the page scrolls freely.
- **Chats:** a tap on a client chat page brings the next step (2 → 6 messages, typed in).
- **Slider:** a horizontal drag changes the value (350,000 → 1,250,000) and does not scroll or turn the
  page.
- **Intro:** the walk-in plays once, the first time the story is on screen.
- **fps** (frame times while the intro walk plays and during swipes):
  - Chromium: p50 8.3 ms, p95 10 ms, no frame over 33 ms;
  - WebKit (headless 60 Hz): p50 17 ms, p95 19 ms.

## Phone crops

`scripts/landing-screens.mjs` now has `vp` shots, taken at a phone or small-tablet viewport at 3×:

- `m-month` uses the "Tháng này" card (`card`);
- `m-insights` uses a `span` of the first six KPI cards;
- `m-payroll`;
- `m-appointments` at 390 px;
- `m-calendar` at 768 px (staff columns with chair holds);
- `m-services` at 600 px (the 390 px services screen overlaps, and the app should fix that).

## New copy keys (`i18n:vi-review`)

`flow.m.*`: `tapNext`, `tapBack`, `zoom`, `zoomHint`, `close`, `fold`, `unfold`, `monthShot`, `monthH`,
`monthB`, `swTitle`. Also `flow.calc.out` = "giữ lại mỗi tháng (ước tính)" / "kept per month
(estimate)".

## Not verified

- No test on a physical iPhone or Android phone yet; it should be tried on LAN at
  http://192.168.1.100:8094/vi.
- The profit figure differs between the desktop overview crop (19.27M ₫) and the phone "Tháng này" crop
  (18.21M ₫). Both are real captures of the same demo salon, taken hours apart. They line up if both are
  retaken at the same time.
