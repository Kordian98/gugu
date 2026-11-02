# GuGu Studio landing — QA

`story-strip-<engine>-<locale>-<width>.webp`: 17 frames sampled evenly across the pinned story
(Playwright, 2× DPR). The stage top stayed at 0 px while pinned in every frame (≤0.9 px at the very first
frame in WebKit = sticky engaging).

## Frame times (scripted scroll through the whole story in 8 s, rAF timing, headless)

| Engine | Viewport | CPU | fps | p95 | p99 | frames >25 ms | max stage offset |
|---|---|---|---|---|---|---|---|
| Chrome | 1440×900 | 1× | 60.0 | 16.8 ms | 16.8 ms | 0 | 0.3 px |
| Chrome | 1440×900 | 4× throttled | 60.0 | 16.7 ms | 16.8 ms | 0 | 0.3 px |
| Chrome | 390×844 | 4× throttled | 60.0 | 16.8 ms | 16.8 ms | 0 | 0.2 px |
| WebKit | 1440×900 | 1× | 59.8 | 18.0 ms | 18.0 ms | 2 | 0 px |
| WebKit | 390×844 | 1× | 60.0 | 18.0 ms | 18.0 ms | 0 | 0 px |

Real Safari not measured (Safari "Allow remote automation" is off).
