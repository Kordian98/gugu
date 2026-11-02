# Hero & prototype asset licenses

Record of the source and usage terms of every generated or third-party asset. Rule (spec §5.2): a fal model is used for shipped assets only if its fal model page shows the **"Commercial use"** tag. fal's general terms claim no IP in outputs and place use at the customer's risk; model-specific terms apply on top. Recorded 2026-11-02 by `design-system`.

| Asset(s) | Tool / model (fal endpoint) | Terms as recorded | Notes |
|---|---|---|---|
| `ref01/diorama-clean-v1/v2.png`, `master/*`, `characters/*`, `props/prop-*`, `demo/*` | FLUX 3 Edit: `blackforestlabs/flux-3/edit-image` ([model page](https://fal.ai/models/blackforestlabs/flux-3/edit-image)) | Tagged "Commercial use" + "Partner" on fal | The input `ref-01` is a PO-supplied reference owned by GuGu |
| `loops/*.mp4` | Kling 4.0 image-to-video: `kling/v4/image-to-video` ([model page](https://fal.ai/models/kling/v4/image-to-video)) | Tagged "Commercial use" + "Partner" on fal | |
| `props/cut-*.png` | BiRefNet v2: `fal-ai/birefnet/v2` | BiRefNet weights are MIT-licensed; confirm the fal page tag before production use | Background removal only |
| Logo / icon | `design/branding/*.svg` | Owned by GuGu (PO-delivered) | Composited in post / overlaid in HTML; never generated |
| Fonts | Noto Serif Display, Be Vietnam Pro, Playwrite VN via Google Fonts | SIL Open Font License 1.1 | Production should self-host with the Vietnamese subset |

People: no real people appear. Characters are stylized chibi figures; the demo salon interiors contain no people. Demo salon names, ratings and prices are fictional and labelled **DEMO** in the UI.

Open item: screenshot the fal model pages (tags) into `design/hero/licenses/` before any production release, since tags can change.

## GuGu Studio landing (v3)

| Asset | Tool | Terms | Notes |
|---|---|---|---|
| `design/hero/studio/raw/reception-calm.png` → `apps/app/assets/studio/people/*` | FLUX 3 Edit (`blackforestlabs/flux-3/edit-image`) via fal MCP | Tagged "Commercial use" on fal | Reference: our ref-01 diorama. People are stylized chibi characters, not real persons. |

## GuGu Studio landing (v4, photoreal)

| Asset | Tool | Terms | Notes |
|---|---|---|---|
| `apps/app/public/studio/photo/*.webp` (stills) | Nano Banana Pro (`fal-ai/nano-banana-pro`, `/edit`) via fal MCP | fal commercial use per model terms | Illustrative AI people (not real persons, never presented as customers). Logos/labels/sign text removed or blurred. |
| `apps/app/public/studio/walk/**` (frame sequences), `public/studio/loop/*.mp4` | Wan 3.0 Prime image-to-video (`alibaba/wan-3.0-prime/image-to-video`) + ByteDance video upscaler | fal commercial use per model terms | Generated from our own stills (first/last frame). Sources: `design/hero/studio/photo/{raw,video}` (local, gitignored); request ids in `scripts/runs.jsonl`. |
