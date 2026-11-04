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

## Liquid glass, full-screen before → after, center pill, calculator (owner, 2026-11-05; branch `design/02-cases`)

Owner priorities on phones: readable content first (large screenshots, comfortable copy), then a calm flow, then atmosphere.

- **Liquid glass:** each page is one full-screen glass panel under the chapter bar, laid out like an app screen: headline, short text, then a large screenshot, chat or calculator. The photo or walk shows through as a blurred (32 px), saturated (1.8×), tinted mood. The panel has a refraction rim and an inner light (`glass` tokens). Text on glass is ink or ink2 only. The chapter bar (a floating capsule), toasts (a notification that drops in and retracts), the zoom pill (on the picture) and the center pill use the same glass.
- **Before → after:** page 2 holds two complete scenes. The whole "before" screen (photo, copy, Zalo pings, the 12 badge, the CTA) wipes to the whole "after" screen (calm photo, "Vẫn thứ Bảy đó. Nhẹ nhàng.", gains, booked toast) behind a glowing edge, with the desktop wipe ease (1.1 s). Reduced motion shows "after" at once.
- **Center pill ("Căn giữa câu chuyện"):** it appears while the story covers 12–97 % of the screen, and a tap smoothly scrolls the story back to fill the screen. It steps aside while the page scrolls and comes back once scrolling settles, at the lowest spot where no text line, control or picture is under it: the thumb zone first, otherwise the gap between the story and the next section.
- **Calculator:**
  - big slider: 36 px thumb, a filled lilac700 track (≥ 3:1 against the unfilled part), and a value label above the thumb that never leaves the card;
  - only the slider's own 44 px box is excluded from tap-to-advance;
  - a tap on the card's text, label row or empty areas turns the page.

### Checks (`mfix.mjs`, real taps and drags: CDP touch in Chromium, mouse drag in WebKit)

Chromium mobile and WebKit touch × 360×640, 390×844, 430×932 × vi, en: **all pass** (12 / 12).

| Check | Result |
|---|---|
| Center pill: story half below / half above the viewport | shown; nothing under it (exact text-line and control boxes); a tap re-docks the story (top 0, bottom = screen), then the pill hides |
| Before → after | mid-wipe frame on page 2 shows both scenes split by the edge (clip at 11–21 %); "before" copy present under the wipe |
| Slider drag | value changes (e.g. 350.000 → 1.000.000), page stays |
| Tap on the slider track | no page turn |
| Tap on the card's empty right area / label row | advances one page |
| Glass contrast (text hidden; darkest backdrop pixel inside every glass panel of pages 1–12) | ink2 ≥ 8.66:1 (Chromium), ≥ 8.07:1 (WebKit); token test: ink and ink2 pass AA even with glass over black |
| Horizontal overflow | none |
