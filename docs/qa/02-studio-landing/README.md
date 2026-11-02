# GuGu Studio landing — QA (v3)

`page-<engine>-<locale>-<width>.webp`: the whole page captured top to bottom (one frame per ~820 px of
scroll, Playwright). The before/after split is the only pinned block (CSS sticky); every other section owns
its space and reveals in place.

## Frame times

Scripted scroll through the whole page in 12 s, rAF timing, headless Playwright, 2× DPR. "Pin offset" is
the before/after stage's distance from the viewport top while pinned.

| Engine | Viewport | CPU | fps | p95 | p99 | frames >25 ms | pin offset |
|---|---|---|---|---|---|---|---|
| Chrome | 1440×900 | 1× | 60.0 | 16.8 ms | 16.8 ms | 0 | 0 px |
| Chrome | 1440×900 | 4× throttled | 59.1 | 16.7 ms | 16.8 ms | 1 | 0 px |
| Chrome | 390×844 | 4× throttled | 60.0 | 16.8 ms | 16.8 ms | 0 | 0 px |
| WebKit | 1440×900 | 1× | 60.0 | 18.0 ms | 18.0 ms | 1 | 0 px |
| WebKit | 390×844 | 1× | 60.0 | 18.0 ms | 18.0 ms | 0 | 0 px |

Real Safari not measured (Safari "Allow remote automation" is off).
