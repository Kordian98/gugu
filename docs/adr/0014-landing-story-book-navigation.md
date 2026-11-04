# ADR 0014: The GuGu Studio landing story navigates as a book after scroll-driven doors

- Status: proposed (owner judges the feel on :8094 before merge)
- Date: 2026-11-04
- Owner: design-system (topic 02, milestone 02-LANDING-FLOW)

## Context

The v4 landing (`apps/app/features/landing/flow/`) is one photoreal, pinned scene: hero door portal → walk
→ front desk before|after → treatment room → back office → switching. It was driven by "one wheel/swipe =
one transition": a wheel or touch listener (`chapters.ts`, `passive: false`) tweened the scroller for
3.4–7 s and swallowed every input meanwhile. The owner found moving by scroll or click "clunky, downright
infuriating"; clicking a chapter (a long eased jump) felt right.

Measured on main (`14bf9b3`, Playwright, Chromium + WebKit, see `docs/qa/02-landing-flow/README.md`):
four trackpad swipes advanced one beat (120/120 wheel events prevented), a reverse swipe mid-transition
never reversed, ten mouse notches advanced one beat, every touch move was prevented (no iOS momentum),
keyboard did nothing (the page scrolls inside the RN Web ScrollView div, which has no focus), and each
beat took 3.9–6.3 s to settle. The design-system skill also forbids scroll-jacking.

A first rework made scroll position drive the story continuously (Apple product pages) with a gentle
directional settle. The owner then asked for a different model: "mega robust, like a book".

## Decision (final, owner 2026-11-04, after three iterations on :8094)

1. **Static hero above the stage.** The hero is a static block (`flow/StaticHero.tsx`): the same copy and
   arched door window as the stage at journey time 0, with the doors closed. It is never animated.
2. **Intro once per visit.** The first small scroll at the hero commits to the intro: ≥ 60 px of wheel
   (one notch), a ≥ 36 px swipe, Start, or a key. The page then jumps invisibly to the identical stage, and
   the doors + walk-in to Front desk page 1 play at the original pace (7 s). Scroll and swipe input is
   ignored while it plays (no skip, no double trigger). Below the threshold nothing happens. A visitor who
   reaches the stage another way (scrollbar, or coming from below after a nav link) gets the intro once the
   scroll rests there.
3. **Nothing reverses.** After the intro, scrolling is plain page scrolling. Up shows the static hero.
   Down returns to the book on the page the visitor left, already rendered, then continues past it.
   Page 1 has no Prev.
4. **Book pages** (`flow/book.ts`, `PAGES` in `timelines.ts`): Front desk before · after · treatment room
   ×3 · office · Insights · pay & commissions · switching, counted "n / 9". They turn only by Next/Prev, HUD chapters (Front
   desk, Treatment room, Back office, Switch; Arrive is gone), keys while the hero or story is in view, or
   one swipe per page. A turn plays the existing timeline at the original pacing and never stops
   half-way. Pressing Next / → again during a forward turn (or Prev / ← during a backward one) speeds it up to finish within 0.45 s and never skips a page; the opposite direction reverses it. Turns use an out-ease so they react at once (owner). Chapter jumps
   keep the old distance-based duration.
5. **No before/after divider.** The handle and drag were removed. Before → after is the original sweep
   (photo split + gradient line + scene content), played by Next ("Xem sau khi dùng"), a key or a swipe.
6. **Signposting:** counter, per-page HUD bars filling with journey time (Front desk's first bar fills
   during the intro), first-view hints (hero: "scroll or Start"; Front desk: "Next or →"), Prev, and a
   Next label that crossfades the moment a turn starts. "Finish journey" scrolls to the first section
   after the story.
7. **Reduced motion:** the intro and every turn are 0.5 s crossfades.
8. **Sizing:** the stage and static hero are one scroller viewport high (`--sv` = `clientHeight`), because
   the page scrolls inside the RN Web ScrollView.

## Scroll capture: requested, then revoked (owner, 2026-11-04)

The design-system skill says "never scroll-jack". This ADR deliberately captures scroll in three narrow
places, because the product owner asked for exactly that on 2026-11-04 (relayed by the coordinator):

- "mega robust, like a book": "one fast, unlucky scroll can blow through the whole section";
- "Mouse wheel and trackpad no longer drive the story. … Momentum flicks therefore can't wreck it";
- "A small scroll from the hero, about 10% … commits to the full first animation … During the intro,
  further scroll input is ignored. It must not skip or double-trigger";
- "Scrolling up from any page never reverses pages or replays animations. It is plain page scrolling."

The captures are: (1) at the static hero before the intro, wheel and swipe are held until the threshold
commits the intro; (2) wheel and swipe are ignored while the intro plays (≈ 7 s); (3) at the dock, the
remainder of a gesture that started on the other side is absorbed, once.

**Revoked the same day** after the owner tried it at `acfda28`: "Don't block scrolling inside the story …
Normal page scrolling must always work, including while the story is in view." Since then:

- after the intro, wheel, trackpad and touch are never captured; a vertical swipe scrolls the page and
  only a HORIZONTAL swipe turns a page (the stage is `touch-action: pan-y`);
- a "Center view" button ("Căn giữa câu chuyện", fixed at the top) appears while the journey is partly
  out of the viewport and smoothly re-docks it;
- "Skip the story" is removed (scrolling is free); "Finish journey" stays on the last page;
- keys: only ← / → turn pages; ↑ ↓ PgUp PgDn Space are plain page scrolling (design re-review B2);
- scroll, swipes, ← and chapters are ignored while the intro plays (B1); Next / → / ↓ again speed it up
  (owner, later the same day);
- only the intro keeps its narrow capture (the small-scroll threshold at the hero and the ≈ 7 s intro
  itself), which the owner asked for separately;
- the hero's one call to action is a plaque at the foot of the arch ("Cuộn xuống hoặc bấm Bắt đầu để
  bước vào" + Start); it disappears after the first walk-in and never returns.

## Perspectives (owner, 2026-11-04)

The story has three perspectives in the same pinned stage: the salon owner's walk (the book), the
client's Zalo chat and the owner's AI assistant. Tabs at the top switch between them; the hero plaque and
the last salon page link to them. Side perspectives are scripted stepped chats with their own Next/Prev
(← / →, horizontal swipe). The book is inactive meanwhile (no keys, swipes or intro). No language model is
called from the public page (keys, cost and abuse limits would need a server endpoint).

## Mobile (≤ 899 px): Instagram-style stories (owner, 2026-11-04)

Phones do not get the book. `MobileJourney.tsx` is rendered only when the viewport is < 900 px; desktop
renders `Journey` exactly as before and never receives a mobile rule (`mobile.css.ts` is injected by the
mobile component only, and all of it sits inside the mobile media query).

First cut (same day): vertical full-screen sections with mandatory scroll snap. The owner replaced it with
the feel of Instagram stories, which is what ships:

- **Tap right = next, tap left (left third) = back**, anywhere on the page except real controls
  (buttons, links, a slider's own box). The earnings card is not a control: a tap on its text or empty
  areas turns the page (owner, 2026-11-05). A clear horizontal swipe does the same; ← / → too; hidden
  Prev / Next buttons appear on keyboard focus and a polite live region announces the page.
- **Vertical scrolling is ordinary page scrolling.** No snapping, no capture: a page may be taller than
  the screen (payroll on 360×640, landscape) and you read it by scrolling; you can scroll out of the story
  up to the hero or down to pricing at any time. The next page starts at its top.
- Only the current page is in the layout (`.mj-u.cur`), so the story is one screen in the page flow,
  between the hero and the free-year band. Next on the last page scrolls on to the free-year band; back on
  the first page scrolls up to the hero.
- Pages: front desk (the street → reception walk plays ONCE per page load as the intro, when the story is
  first on screen) → the same desk "after" (the WHOLE screen wipes, as on desktop: photo, copy, pings,
  chips and gains of the "before" scene give way to the complete "after" scene behind a glowing edge) → treatment room
  (walk 2) → three facts, each with one real CRM crop → office (walk 3) → "This month" (real overview
  card) → earnings estimate (big sliders) → Insights → payroll → switching → the client's Zalo chat
  (5 steps) → the AI assistant (4 steps). A chat step is a page; its messages type in on arrival.
- **Bar:** sticky segments per chapter (Front desk, Treatment room, Office, Switching, Client, AI) fill
  page by page, with the chapter name and "n / 21"; tapping a segment opens that chapter.
- **Frames:** portrait walk frames (720×1280) on one canvas per walk; portrait before/after stills cut
  from the 16:9 stills at the walk frames' own crop (x = 60 %, 644×1144, `public/studio/photo/m/`);
  landscape phones use the 16:9 frames and stills. Nothing is shown above 1.15× its pixels.
- **Liquid glass (owner, 2026-11-05):** each page is laid out like an app screen inside ONE full-screen
  glass panel under the chapter bar: headline, short text, then a large screenshot, chat or calculator.
  The photo or walk shows through as a blurred (32 px), saturated (1.8×), tinted mood; faces no longer
  matter. Rim highlight and inner light; `glass` tokens. Text on glass is ink / ink2 only: AA over any
  backdrop (tokens.test.ts, worst case glass over black), measured ≥ 8.6:1 for ink2 over the real frames.
  The chapter bar, toasts, zoom pill and center pill use the same glass. The chevron folds the panel to
  its title. Short phones only drop duplicates (eyebrow under a tag, second Zalo note); a long page scrolls.
- **Screenshots:** never a shrunken desktop screen: `m-*` crops from `scripts/landing-screens.mjs` at a
  phone (390) or small-tablet (600 / 768) viewport at 3×, shown at about 1:1, srcset 2×/3×. A tap on the
  picture turns the page like everywhere else; the caption's "Zoom" button opens a full-screen viewer
  (pinch 1–4×, drag, double-tap, Close / Esc / backdrop / back gesture; focus returns to the button).
- **Perspectives:** not a phone inside the phone: a full-width Zalo chat (salon OA header, quick replies)
  with GuGu Studio toasts for what the salon's system just did; the AI chat with phone-sized visuals. The
  salon story comes first (default); the client and AI chapters follow it.
- **Sliders:** 44 px hit box, 36 px thumb, a filled lilac700 track (≥ 3:1 against the unfilled part) and
  a value label riding above the thumb; `touch-action: none`: a slider drag never scrolls or turns.
- **Center view (phones too):** while the story is partly out of the viewport (12–97 % of the screen),
  a glass "Căn giữa câu chuyện" pill smoothly scrolls it back to fill the screen. It steps aside while
  the page scrolls and comes back once scrolling settles, at the lowest spot of the screen where no text
  line, control or picture is under it (thumb zone first; the gap between the story and the next
  section otherwise).
- **Reduced motion:** no walks (final frames), no wipe, no typing, no entrance or tap flash.

## Consequences

- No gesture is swallowed except the remainder of a flick at the dock, which is intended.
- Touch (desktop-size touch screens): on a docked page only a horizontal swipe turns a page. Phones use the
  stories model above (tap right / left; vertical scrolling is never captured). Previously you left the story through "Finish
  journey", "Skip", a swipe up on the last page, or a swipe down on Front desk page 1 (up to the hero).
- One page sequence (`PAGES` in `timelines.ts`) is the single source for HUD, counter, keys and swipes.
- The nav (top of the page) scrolls away the moment the intro jumps to the stage.
- Not verified on a physical iPhone or iPad: the dock clamp writes `scrollTop` during iOS momentum.
