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

## Design review fixes (review of `ee82cbe`)

- **A stray `}`** closed `@media (max-width:899px)` early, leaving about 300 mobile rules outside the
  query. Desktop never showed them, because the sheet is injected only by the phone component, but it
  was wrong. Removed. `flow/mobile.css.test.ts` now asserts that the brace depth of `MOBILE_CSS` and
  `QA_CSS` first returns to 0 at the media query's own closing brace, and that nothing follows it.
- **Chip text:** `.mj-now small` (the "9 / 21" counter), `.mj-toast small` and `.mc-toast small` are now
  ink. `tokens.test.ts` records why: ink2 on `chipBottom` over black is below AA. A CSS test asserts the
  three selectors use ink.
- **Fallbacks:** under `@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:
  blur(1px)))`, `@media (prefers-reduced-transparency:reduce)` and `@media (prefers-contrast:more)`, the
  panel becomes near-solid paper (`solidPanel` .92) without the veil, and the chips become near-solid
  white (`solidChip` .94). Checked with Playwright `contrast: "more"`: the panel background is
  rgba(253,250,247,.92) and no gradient is applied.
- **Walks:** while `.walking` is on, the panel is `visibility: hidden` with no backdrop filter, so a 30 px
  blur is never recomputed over the moving canvas. The entrance animates the panel's inner wrapper
  (`.mj-body`, `.mj-fold`), not the blurred element. Checked: mid-walk the panel is hidden with
  `backdrop-filter: none`; after the walk the blur is back and the content is at opacity 1.
- **Nits:**
  - the stale `.mc-copy` selector is removed from the center pill's content list;
  - the switching rows use `nth-of-type`, and the last visible row has no bottom border (row 3 on
    short phones);
  - `SW.done` derives from `SW_ROWS.length` (`SW_ROWS` now lives in `mobile.css.ts`);
  - the QA CSS is a separate `QA_CSS`, injected only in `__DEV__`;
  - the veil, halo and switching values are named constants.
- **Not changed:** the chapter bar, center pill and chat toasts still fade with opacity and transform
  on the blurred element itself. They are small chips (56 px or less) and the fades run only on enter
  and exit. Moving the fade to an inner wrapper would leave an empty glass capsule on screen.

**Re-check after the fixes:**

| Check | Result |
|---|---|
| Contrast, every text line (21 pages × 360 / 390 / 430 × vi / en) | Chromium: 2,977 lines, 0 below AA. Playwright WebKit: 2,978 lines, 0 below AA. |
| Text on see-through glass | Chromium min 7.07:1; WebKit min 6.01:1 |
| Chapter bar | Chromium ≥ 8.65:1 (the counter is now ink); WebKit ≥ 6.01:1 (the counter ≥ 7.44:1) |
| Chrome, chats, switching tap and replay, overflow | all pass in every config |
| Desktop diff against the original reference | 6 of 192 images differ, each by 0–3 px, all in the Next button (noise) |
| `pnpm verify` | green |

## Owner iPhone round 2 (2026-11-05)

### 1. Scroll down from the hero plays the intro, as on desktop

- A scroll or swipe down at the hero of at least 10 % of the screen, or Start, commits to the whole
  intro, once per visit:
  1. the hero copy and plaque step aside (200 ms);
  2. the page jumps to the identical door window on page 1 (same frame, same place on screen);
  3. the doors grow to the full screen (`motion.story.doors`, 1.2 s, ease-out cubic, clip-path only);
  4. the walk-in plays (2.6 s);
  5. Front desk page 1 appears.
- While it plays, scrolling is locked: `overflow: hidden` on the scroller, which also stops iOS
  momentum, plus non-passive `touchmove` and `wheel` handlers. Taps, swipes, keys and bar taps are
  ignored.
- Below the threshold nothing happens. Scrolling back up shows the static hero, and the intro never
  replays.
- Reduced motion goes straight to page 1.
- A test (`intro.mjs`) covers Chromium mobile with real CDP touch scroll gestures and Playwright WebKit
  with the wheel, at 360 / 390 / 430 in vi and en. It checks that:
  - a 4 % swipe does nothing;
  - a 14 % swipe docks the story (track top 0) with the doors clip running;
  - a further 80 % swipe and a tap during the intro are ignored;
  - page 1 is on after the walk;
  - a second swipe at the hero just scrolls;
  - Start does the same (also with reduced motion).
  Result: **12 / 12 configs pass**. Images: `intro/chromium-*`.
- **iOS Simulator Safari** (iPhone 17 Pro, iOS 26), `intro/ios-*`: doors → full frame → walk-in →
  page 1 with the glass and the new bar. Synthetic touch can't be sent to the Simulator from this
  session: it can't be brought to the front, and posting mouse events could land in other apps. The
  run therefore uses the dev hook `?mjqa=swipe`, a smooth 15 % scroll from the hero. That fires the same
  `scroll` trigger a finger swipe does in Safari.

### 2. Panels never fold

The chevron, the folding state and its styles are gone. `flow.m.fold` and `flow.m.unfold` are removed
from vi and en.

### 3. Only pages that show the product working

Final phone list, 19 pages:

| # | Group | Page |
|---|---|---|
| 1 | Demo | Front desk, before (walk 1 is the intro) |
| 2 | Demo | Front desk, after (full-screen wipe) |
| 3 | Demo | Treatment room · "0 double bookings" + calendar crop (walk 2 plays into it) |
| 4 | Demo | Treatment room · "1 list" + appointments crop |
| 5 | Demo | Treatment room · "≈ 10 minutes" + services crop |
| 6 | Demo | Office · "Tháng này" overview card (walk 3 plays into it) |
| 7 | Demo | Earnings estimate (sliders) |
| 8 | Demo | Insights + crop |
| 9 | Demo | Payroll + crop |
| 10 | Demo | Switching (animated AI setup) |
| 11–15 | Khách hàng | Client's Zalo chat, 5 steps |
| 16–19 | Trợ lý AI | AI assistant chat, 4 steps |

Removed on phones: "Mọi ghế, mọi giờ, trong một lịch" (treatment room summary) and "Cả salon trong một
màn hình" (office summary). Their walks now play into the first real page of each room.

### 4. Instagram-style story bar

- There is one 3 px segment per page (19). Seen pages and the current page are filled; the rest are
  empty.
- The segments sit in three labelled groups with a 10 px gap: "Demo" (10), "Khách hàng" (5) and
  "Trợ lý AI" (4). The English labels are "Demo", "Your clients" and "AI assistant".
- Each group is one 44 px button (label plus segments) that opens the group's first page. The current
  group's label is semibold, and every label is ink.
- The bar keeps the chip glass and still hides when less than 30 % of the story is in view.
- Test results (`intro.mjs`): 3 groups and 19 segments; each group is 44 px tall; a tap on "Trợ lý AI"
  opens page 16 and a tap on the first segment of "Khách hàng" opens page 11; after that tap the
  segments read 11 filled, then 8 empty. Images: `intro/bar-*`.

### Re-check after round 2

| Check | Result |
|---|---|
| Contrast, every text line (19 pages × 360 / 390 / 430 × vi / en) | Chromium: 2,984 lines, 0 below AA, text on see-through glass ≥ 7.07:1. WebKit: 2,985 lines, 0 below AA, ≥ 6.29:1. |
| Chrome hide/show, chats (no caption, hidden step text, tap advances), switching tap and replay, overflow | pass in all 12 configs |
| Intro and bar (`intro.mjs`) | 12 / 12 pass |
| Regression suite (`mfix.mjs`) | 12 / 12 pass |
| Desktop diff against the original reference | 6 of 192 images differ, each by 0–3 px, all in the Next button (noise) |

## Dev-only QA hooks

`?mj=<page>` opens a story page, `?mjqa=notext,noglass` strips text or glass, and `?mjqa=swipe`
scrolls 15 % down from the hero, which triggers the intro the way a swipe would. They work only in
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
