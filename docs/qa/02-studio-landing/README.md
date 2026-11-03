# GuGu Studio landing — QA (v4)

One continuous, photoreal, scroll-scrubbed scene (web): the hero's arched door grows to full screen, then
Arrive → Front desk (before | after comparison slider) → Treatment room (pain → gain in numbers + real CRM
screens) → Back office (overview, earnings estimate, assistant) → Switch (AI fills the services screen).
(Superseded 2026-11-04: navigation is now doors-by-scroll + a book of page turns; see docs/qa/02-landing-flow/README.md and ADR 0014.)

- Walk-through: fal Nano Banana Pro stills (brand palette, real gugu logo) → Wan 3.0 first/last-frame walks →
  ByteDance 4K upscale → 90 frames per walk (2048 px desktop, 720×1280 portrait mobile), cross-blended.
  Request ids: design/hero/scripts/runs.jsonl. Frames: design/hero/scripts/walk_frames.py.
- Every still is checked at face-level zoom before it goes to video; every walk frame-by-frame.
- Weight: walks ≈ 19 MB desktop / 9 MB mobile in total, loaded per walk as it approaches (first walk ≈ 5 / 2 MB).
- Frame timing (headless Chromium, transitions driven by single wheel notches): 0 frames > 25 ms;
  canvas redraws every frame while a walk is playing.
- Not verified: real Safari / iOS Safari on device.
