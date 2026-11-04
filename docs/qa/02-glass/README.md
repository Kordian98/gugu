# 02 · Real liquid glass on phones, story chrome, caption-free chats, animated switching

Branch `design/02-glass` (owner review on iPhone, 2026-11-05). Phones only (≤ 899 px); desktop is
unchanged. Rules: ADR-0014 "Mobile"; tokens: `liquidGlass` in `packages/design-system/src/tokens.ts`.

## What the owner asked for

1. "This is not liquid glass. It isn't transparent at all; it should let the image behind show through."
2. Full-screen glass on text pages. Tried, then reverted at the owner's request the same day: every page
   is an inset panel again, 12 px from the screen edges, safe areas respected.
3. The chapter bar kept following the visitor over the free-year band, pricing and cases.
4. Client and AI chats: no copy captions; the chat carries the story.
5. Switching page: an animation that tells the AI setup instead of a static picture.

## Why the old glass looked opaque

- The panel tint was 0.84 → 0.78 white (chips 0.80, toasts 0.95). Over a 32 px blur that is almost
  white: the photo only survived as a faint wash (`before/chromium-*`).
- Nothing in the DOM broke `-webkit-backdrop-filter` on iOS. The Simulator renders the blur correctly
  with both the old and the new CSS. The fix is the tint, plus a different way to keep text readable.
- Playwright's WebKit build does not composite `backdrop-filter` at all, even on a minimal test page:
  `before/webkit-*` shows a sharp photo under a white veil. Real iOS Safari is therefore verified in the
  iOS Simulator (iPhone 17 Pro, iOS 26), see `ios/`.

## The new glass

| Layer | Value |
|---|---|
| Panel tint | white 0.34 (top) → 0.22 (bottom) with an inner sheen from the top-left |
| Backdrop | `blur(30px) saturate(1.7) brightness(1.06)`, `-webkit-` prefixed too; never animated |
| Rim | 1 px specular top highlight, a softer bottom rim, a 1.5 px gradient refraction border, a faint inner shade at the bottom, a 0.5 px outer edge, soft shadow |
| Legibility | a feathered paper veil (0.58) behind the content column only (`.mj-body::before`, masked on all four sides, clipped to the panel); a soft white halo on headings; text is ink / ink2 |
| Wells | Zalo pings, gains, AI setup box: paper 0.76 |
| Chips | chapter bar, zoom pill, center pill, chat toasts: white 0.60 → 0.50, blur 22 px; same rims |
| Glass on glass | the "booked" toast inside a panel: chip tint and rims, no second blur |

Nothing that would break `-webkit-backdrop-filter` is in the chain: no ancestor below opacity 1 at rest
(the page fade ends at 1), no `will-change`, no solid background on a blurred element. The photo sits
inside the same section as the panel, so the section's own `isolation` and `clip-path` (before → after
wipe) never cut it off from its backdrop.

## Blur actually renders

Sharpness inside the panel (mean |Laplacian|, text hidden) with the glass, divided by the same region
with the glass removed. 1.0 means no blur.

| Where | Ratio | Notes |
|---|---|---|
| iOS Simulator, Safari (`?mj=<page>&mjqa=notext` vs `notext,noglass`, CSS-pixel scale) | p0 0.14 · p1 0.21 · p2 0.05 · p6 0.06 | real iOS WebKit: blurred (`ios/blur-*`) |
| Chromium, 360 / 390 / 430 × vi / en, pages 1–12 | 0.13 – 0.65 (the soft "after" still is the highest) | blurred |
| Playwright WebKit, same matrix | 0.76 – 0.91 | not blurred: this engine does not composite backdrop filters |

## Readability (AA), every text line

Method (`glass.mjs`): for every page (21) at 360×640, 390×844 and 430×932, vi and en, collect each text
line box of the page, the chapter bar and the center pill. Hide all text (colour, fill and shadow), take a
screenshot, and rate each line's colour against the 1st percentile (dark text) or 99th percentile (light
text) of the backdrop under it. Large text (≥ 24 px, or ≥ 18.66 px bold) and icon glyphs need 3:1;
everything else needs 4.5:1. Reduced motion, so every element is at rest.

| Engine | Lines per config | Below AA | Text on see-through glass (backdrop varies with the photo) | Chapter bar |
|---|---|---|---|---|
| Chromium (blur rendered) | 435 – 533 | 0 | min 6.84:1, darkest backdrop luminance 0.35 | ≥ 6.80:1 |
| Playwright WebKit (no blur, a harsher case: sharp dark detail under the veil) | 435 – 533 | 0 | min 5.91:1, darkest backdrop luminance 0.30 | ≥ 5.91:1 |

- The lowest line overall is the "3 giờ" stat (large, dangerInk) at 3.48:1 in WebKit (needs 3:1); the
  lowest icon is the lilac ✦ in the AI setup box at 4.15:1 (needs 3:1).
- Each page has one backdrop at rest (walk pages end on their last frame, and the panel is hidden while
  a walk plays), so the brightest and darkest frames are the per-page extremes above.
- Token guarantee (`tokens.test.ts`): panel + veil over pure black gives ink and ink2 ≥ 4.5:1, chips over
  black give ink ≥ 4.5:1, wells over black give ink2 ≥ 4.5:1. Panels stay translucent (0.2–0.5 alpha).
- There is one glass theme (light). Expressive surfaces are light-only (X18); the zoom viewer keeps its
  dark glass on ink.

## Layout per page (owner: inset panel with a margin everywhere)

| Page | Panel |
|---|---|
| 1–12 (front desk, before → after, treatment room, three facts, office, this month, earnings, Insights, payroll, switching) | inset glass panel, 12 px from the screen edges (`max(12px, safe area)`), radius 28 |
| 13–21 (client and AI chats) | full-screen chat app; the Zalo or assistant header runs under the floating glass chapter bar, so the bar shows the blue header through it |
| Landscape phones | unchanged: the side card on the left |

## Story chrome

- The chapter bar fades and slides out (`--slow`, transform + opacity) once less than 30 % of the story
  (or of the screen, for a long page) is in view, and returns on the way back. A keyboard focus inside the
  bar brings it back (`:focus-within`). Reduced motion: no transition.
- The center pill follows the same 30 % rule (it used to appear from 12 %).
- Checked in every config: at 90 % and 50 % in view the bar is on; at 25 % and 10 % it is off (opacity 0)
  and the pill is hidden; scrolling back to 60 % brings it back; over the free-year band the bar's
  opacity is 0. Before: `before/*-free`; after: `after/*-free`.

## Chats without captions

- Removed on phones: eyebrow, step title, step body and the step dots. The chapter bar names the chapter
  ("Khách hàng" / "Trợ lý AI") and its segment fills step by step.
- Screen readers: a visually hidden `h3` (the section's `aria-labelledby` target) with the eyebrow, plus
  the step's "n / 5 · title · body". Keyboard page turns still move focus to it.
- The "illustrative chat" note (it also says clients pay at the salon) is now a small system line at the
  top of the log.
- The client chat keeps its GuGu Studio toasts (they fit under the header).
- A tap on a chat page still advances (checked in every config: page 13 → 14).

## Switching animation

Desktop equivalent, inside the panel (`switching/`):

1. The handwritten price list appears (0 – 320 ms).
2. A scan line sweeps it; "AI setup · Reading your price list…" with a filling progress bar
   (440 – 1740 ms, `motion.story.scan`).
3. The list morphs into a clean GuGu Studio services card that fills row by row: name, duration, price,
   and the toggle switching on (`motion.story.row`, 180 ms per row).
4. "10 services created · check and go live" (about 2.9 s).

- It plays each time the page opens and replays on re-entry.
- The base styles are the finished state, so reduced motion shows the final list with nothing moving.
- Only transform and opacity animate. The block is decorative (`aria-hidden`); the four steps below
  carry the meaning.
- A tap during the animation turns the page (checked in every config). At 360×640 and 375×667 the card
  shows three rows and fits one screen; four rows from 390×844 up.

## Desktop unchanged

Reference taken before any change (192 images: hero, p0–p9, every perspective step, the free-year band,
pricing, final CTA and footer; 1440 and 1280; Chromium and WebKit; vi and en), captured again at the end
and pixel-diffed (a pixel counts if any channel moves by more than 8). Result: 11 of 192 images differ,
each by 0–3 px, all in the antialiasing of the Next button. That is the same noise the 02-landing-mobile
baseline recorded (two captures of one build: 6 of 200, 1–3 px, Next button). Desktop CSS is untouched:
`glass` keeps the values the case studies use, and every changed rule is inside the mobile media query.

## Performance

Budget: no more than three blurred layers on screen, blur radius never animated, only transform and
opacity animate.

- **Blurred layers on screen** (`perf.mjs`, counted per page): at most 3, which is the chapter bar plus
  the panel plus one chip (zoom pill or center pill). Chats have 1–2. The hidden "before" scene of page 2
  stops rendering (`visibility: hidden`) once the wipe is over.
- **Frame times** (Chromium mobile emulation at 390×844 @3×; headless runs at 120 Hz, so 8.3 ms is a
  full-rate frame):

| Scenario | CPU 1× p50 / p95 / max | CPU 4× (mid-range phone) p50 / p95 / max · frames > 20 ms |
|---|---|---|
| 11 page turns by tap | 8.3 / 10.3 / 10 ms | 8.3 / 10.1 / 75 ms · 0.5 % |
| Switching animation (3.6 s) | 8.3 / 10.2 / 10 ms | 8.3 / 10.1 / 24 ms · 0.2 % |
| Touch scroll in and out of the story | 8.3 / 10.2 / 10 ms | 8.3 / 10.0 / 41 ms · 1.1 % |

CPU throttling does not slow the GPU compositor, which is where blur costs. Blur cost on a real
mid-range phone is still unmeasured (see "Not verified").

## Regression suite (`mfix.mjs`, real taps and drags)

Chromium mobile (CDP touch) and Playwright WebKit (touch), 360×640, 390×844 and 430×932, vi and en:
**12 / 12 pass**. The suite covers:

- the center pill: shown, never over content, re-docks the story;
- the before → after mid-wipe split;
- slider drag, track tap and near-miss (none of them turns the page);
- a tap on the card's empty area or label row advances;
- the payroll crop ends on a whole row, and a picture tap opens zoom;
- short panels are centred;
- no horizontal overflow;
- no long task after a scroll stops at 4× CPU (0 ms).

The old whole-panel "darkest pixel" contrast check no longer applies, because bare translucent glass is
meant to show dark parts of the photo. The per-line measurement above replaces it.

## Dev-only QA hooks

`?mj=<page>` opens a story page, and `?mjqa=notext,noglass` strips text or glass. Both work only in
`__DEV__`. They exist so the iOS Simulator, where no script can drive Safari, can verify the blur.

## Images

- `before/`: the old glass, Chromium and Playwright WebKit, 390×844 vi.
- `before-after-chromium-390.webp`: pages 1, 3, 9 and 12, old (left) and new (right) in each pair.
- `after/`: the new glass, Chromium (vi + en) and Playwright WebKit (vi), 390×844 (Playwright WebKit
  shows the tint without blur).
- `ios/`: iPhone 17 Pro Simulator (real iOS Safari) at the final state, plus the blur proof pairs
  (`blur-pNN-glass` / `blur-pNN-noglass`: the same frame with and without the glass).
- `switching/`: animation frames at 250, 900, 1500, 1950, 2300 and 3600 ms (360 and 390, vi and en).

## Not verified

- No physical iPhone or Android phone: the iOS Simulator renders with the Mac's GPU, so real-device
  frame rates still need the owner's check at http://192.168.1.100:8094/vi.
- Playwright WebKit cannot show the blur, so WebKit contrast is measured without it (the harsher case).
