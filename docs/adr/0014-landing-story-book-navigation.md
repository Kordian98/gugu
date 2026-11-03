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
   Down returns to the book on the page the visitor left, already rendered, then continues past it. The
   dock catches a gesture that started on the other side, so a flick never skips the book. Page 1 has no
   Prev.
4. **Book pages** (`flow/book.ts`, `PAGES` in `timelines.ts`): Front desk before · after · treatment room
   ×3 · office · Insights · switching, counted "n / 8". They turn only by Next/Prev, HUD chapters (Front
   desk, Treatment room, Back office, Switch; Arrive is gone), keys while the hero or story is in view, or
   one swipe per page. A turn plays the existing timeline at the original pacing and never stops
   half-way. Next during a turn fast-forwards it (≤ 0.45 s) and queues at most one page. Chapter jumps
   keep the old distance-based duration.
5. **No before/after divider.** The handle and drag were removed. Before → after is the original sweep
   (photo split + gradient line + scene content), played by Next ("Xem sau khi dùng"), a key or a swipe.
6. **Signposting:** counter, per-page HUD bars filling with journey time (Front desk's first bar fills
   during the intro), first-view hints (hero: "scroll or Start"; Front desk: "Next or →"), Prev, and a
   Next label that crossfades the moment a turn starts. "Finish journey" and "Skip" scroll to the first
   section after the story. The static hero's Start becomes "Continue the journey".
7. **Reduced motion:** the intro and every turn are 0.5 s crossfades.
8. **Sizing:** the stage and static hero are one scroller viewport high (`--sv` = `clientHeight`), because
   the page scrolls inside the RN Web ScrollView.

## Consequences

- No gesture is swallowed except the remainder of a flick at the dock, which is intended.
- Touch: on a docked page a vertical swipe turns a page. On mobile you leave the story through "Finish
  journey", "Skip", a swipe up on the last page, or a swipe down on Front desk page 1 (up to the hero).
- One page sequence (`PAGES` in `timelines.ts`) is the single source for HUD, counter, keys and swipes.
- The nav (top of the page) scrolls away the moment the intro jumps to the stage.
- Not verified on a physical iPhone or iPad: the dock clamp writes `scrollTop` during iOS momentum.
