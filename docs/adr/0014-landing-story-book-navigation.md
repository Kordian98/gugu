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

## Decision

1. **Doors stay scroll-driven.** The track is one "door segment" (1.2 screens) plus the pinned stage.
   Its scroll position scrubs journey time 0 → page 1 (inside, at the desk) with a 70 ms smoother;
   scrolling up closes the doors again.
2. **Everything after is a book of explicit page turns** (`flow/book.ts`): Next/Prev, HUD chapters,
   keys (→ ↓ PgDn Space / ← ↑ PgUp Shift+Space while the story is in view and focus is not in a
   field), one touch swipe = one page while docked. A turn plays the existing GSAP timeline from one
   composed page to the next at the original pacing (`PAGES[i].dur`). It never stops half-way. Next during
   a turn fast-forwards the turn (≤ 0.45 s) and queues at most one page. Prev reverses. Chapter jumps keep
   the old distance-based duration (`clamp(Δt·14, 1.2, 6) s`).
3. **Wheels and trackpads never turn pages.** Past the dock they scroll the page natively past the story.
4. **The dock catches gestures from the other side.** A wheel stream or touch that starts above the dock
   cannot cross it, and neither can one that starts below. A flick at the hero therefore lands exactly on
   page 1, and a flick up from the sections below lands on the book at the page the visitor left. An
   upward gesture that starts at the dock on a later page first turns the book back to page 1. The
   scrollbar is free.
5. **Media gate:** a turn waits (≤ 2.5 s) until the walk it plays through has ≥ 50 % of its frames, and
   walks chain-preload in the background.
6. **Signposting:** counter "n / 10", per-page HUD bars filling with journey time, a first-view hint
   (keys on fine pointers, swipe on touch), a Prev button, and a Next label that crossfades and morphs
   its width the moment a turn starts (start the tour · next · see the after · finish journey).
   "Finish journey" and "Skip" scroll to the first section after the story.
7. **Reduced motion** uses the same book with no door segment, and a turn is a 0.5 s crossfade through the
   canvas colour. Before this, reduced motion fell back to `StoryStatic`.
8. **Stage height** = the scroller's `clientHeight` (CSS var `--sv`), not vh/svh/dvh, because the page
   scrolls inside the RN Web ScrollView, which is the visible height on iOS too.

## Consequences

- No gesture is swallowed except the remainder of a flick at the dock, which is intended.
- Touch: on a docked page a vertical swipe turns a page, so you leave the story on mobile through
  "Finish journey", "Skip", or a swipe up on the last page.
- One page sequence (`PAGES` in `timelines.ts`) is the single source for HUD, counter, keys and swipes.
- Not verified on a physical iPhone or iPad: the momentum clamp at the dock writes `scrollTop` during
  iOS momentum.
