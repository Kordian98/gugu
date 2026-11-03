# Hero generation log

Every fal.ai call for the hero and homepage prototype, generated from `scripts/runs.jsonl` by `scripts/prompts_md.py`. FLUX 3 edit and Kling v4 expose no seed parameter, so the fal request ID plus the exact prompt and reference files are the reproducibility record. Costs are estimates from the fal model pages (2K FLUX tier and BiRefNet price not verified; check the fal dashboard for the actual bill).

**Calls:** 125 · **Estimated spend:** $5.93

| # | Name | Endpoint | Request ID | Refs | Output | Est. $ |
|---|---|---|---|---|---|---|
| 1 | chars-v1 | `blackforestlabs/flux-3/edit-image` | `(lost: log bug)` | `design/hero-references/ref-01-homepage-lilac-diorama.png` | `design/hero/characters/chars-v1.png` | 0.048 |
| 2 | master-v1a | `blackforestlabs/flux-3/edit-image` | `01a19b91-4306-7962-b269-eedfe7176424` | `design/hero-references/ref-01-homepage-lilac-diorama.png`<br>`design/hero/characters/chars-v1.png` | `design/hero/master/master-v1a.png` | 0.048 |
| 3 | master-v1b | `blackforestlabs/flux-3/edit-image` | `01a19b91-4314-72c0-a61b-74f995611de8` | `design/hero-references/ref-01-homepage-lilac-diorama.png`<br>`design/hero/characters/chars-v1.png` | `design/hero/master/master-v1b.png` | 0.048 |
| 4 | master-v2-clean | `blackforestlabs/flux-3/edit-image` | `01a19b92-33dc-7141-98b8-2a7ea1939a03` | `design/hero/master/master-v1b.png` | `design/hero/master/master-v2-clean.png` | 0.100 |
| 5 | loop-hair-v1 | `kling/v4/image-to-video` | `01a19b95-5ccc-7161-b951-2c2e318e9328` | `design/hero/crops/zone-hair.png`<br>`design/hero/crops/zone-hair.png` | `design/hero/loops/loop-hair-v1.mp4` | 0.785 |
| 6 | loop-skin-v1 | `kling/v4/image-to-video` | `01a19b95-5cc9-78b3-a196-c1d9224a1168` | `design/hero/crops/zone-skin.png`<br>`design/hero/crops/zone-skin.png` | `design/hero/loops/loop-skin-v1.mp4` | 0.785 |
| 7 | prop-heart-v1 | `blackforestlabs/flux-3/edit-image` | `01a19b98-3f05-74e0-a66f-f22f81109b27` | `design/hero-references/ref-01-homepage-lilac-diorama.png` | `design/hero/props/prop-heart-v1.png` | 0.048 |
| 8 | prop-perfume-v1 | `blackforestlabs/flux-3/edit-image` | `01a19b98-3f03-7c11-9af9-6cad5e67b8f9` | `design/hero-references/ref-01-homepage-lilac-diorama.png` | `design/hero/props/prop-perfume-v1.png` | 0.048 |
| 9 | prop-polish-v1 | `blackforestlabs/flux-3/edit-image` | `01a19b98-3f16-7930-b6d3-417f45862d8a` | `design/hero-references/ref-01-homepage-lilac-diorama.png` | `design/hero/props/prop-polish-v1.png` | 0.048 |
| 10 | prop-polish-v2 | `blackforestlabs/flux-3/edit-image` | `01a19b99-049e-7342-baa1-47a08432e909` | `design/hero/props/prop-polish-v1.png` | `design/hero/props/prop-polish-v2.png` | 0.048 |
| 11 | cut-perfume | `fal-ai/birefnet/v2` | `01a19b99-c201-7f90-a336-cc2d37315641` | `design/hero/props/prop-perfume-v1.png` | `design/hero/props/cut-perfume.png` | 0.000 |
| 12 | cut-polish | `fal-ai/birefnet/v2` | `01a19b99-c232-7593-84b7-509213e2eec7` | `design/hero/props/prop-polish-v2.png` | `design/hero/props/cut-polish.png` | 0.000 |
| 13 | cut-heart | `fal-ai/birefnet/v2` | `01a19b99-c223-7a10-9402-cb64c74391a0` | `design/hero/props/prop-heart-v1.png` | `design/hero/props/cut-heart.png` | 0.000 |
| 14 | loop-nails-v1 | `kling/v4/image-to-video` | `01a19b95-5d74-7ce3-a92a-bbc2d21e0bc2` | `design/hero/crops/zone-nails.png`<br>`design/hero/crops/zone-nails.png` | `design/hero/loops/loop-nails-v1.mp4` | 0.785 |
| 15 | salon-nails | `blackforestlabs/flux-3/edit-image` | `01a19b9a-c45e-7e31-b53b-237cacdbe2fb` | `design/hero-references/ref-01-homepage-lilac-diorama.png` | `design/hero/demo/salon-nails.jpg` | 0.048 |
| 16 | salon-brows | `blackforestlabs/flux-3/edit-image` | `01a19b9a-c45f-7402-a46b-4f00f7bf837b` | `design/hero-references/ref-01-homepage-lilac-diorama.png` | `design/hero/demo/salon-brows.jpg` | 0.048 |
| 17 | salon-hair | `blackforestlabs/flux-3/edit-image` | `01a19b9a-c45d-73a2-89c1-d0709151477d` | `design/hero-references/ref-01-homepage-lilac-diorama.png` | `design/hero/demo/salon-hair.jpg` | 0.048 |
| 18 | salon-spa | `blackforestlabs/flux-3/edit-image` | `01a19b9a-c460-74f0-b377-f5717861fab6` | `design/hero-references/ref-01-homepage-lilac-diorama.png` | `design/hero/demo/salon-spa.jpg` | 0.048 |
| 19 | glow-nails | `blackforestlabs/flux-3/edit-image` | `01a19b9b-f60d-7542-bc9d-8640f59e77f4` | `design/hero-references/ref-01-homepage-lilac-diorama.png`<br>`design/hero/characters/chars-v1.png` | `design/hero/demo/glow-nails.jpg` | 0.048 |
| 20 | glow-skin | `blackforestlabs/flux-3/edit-image` | `01a19b9b-f607-7d11-a36a-8dd339e49132` | `design/hero-references/ref-01-homepage-lilac-diorama.png`<br>`design/hero/characters/chars-v1.png` | `design/hero/demo/glow-skin.jpg` | 0.048 |
| 21 | glow-hair | `blackforestlabs/flux-3/edit-image` | `01a19b9b-f60a-7b22-b2a2-a76851841b60` | `design/hero-references/ref-01-homepage-lilac-diorama.png`<br>`design/hero/characters/chars-v1.png` | `design/hero/demo/glow-hair.jpg` | 0.048 |
| 22 | diorama-clean-v1 | `blackforestlabs/flux-3/edit-image` | `01a19b9c-eb69-7e80-a769-71bf93da097a` | `design/hero/ref01/crop-raw.png` | `design/hero/ref01/diorama-clean-v1.png` | 0.100 |
| 23 | diorama-clean-v2 | `blackforestlabs/flux-3/edit-image` | `01a19b9e-e7ed-7e73-ba22-1c86a9f11485` | `design/hero/ref01/diorama-clean-v1.png` | `design/hero/ref01/diorama-clean-v2.png` | 0.100 |
| 24 | loop-diorama-v1 | `kling/v4/image-to-video` | `01a19ba0-d546-7f70-b7a3-e8d77331def7` | `design/hero/ref01/diorama-clean-v2.png`<br>`design/hero/ref01/diorama-clean-v2.png` | `design/hero/loops/loop-diorama-v1.mp4` | 1.180 |
| 25 | diorama-base-v3 | `blackforestlabs/flux-3/edit-image` | `01a19baf-a1c9-73c1-8f0d-6a22bc4daffa` | `design/hero/ref01/diorama-clean-v2.png` | `design/hero/ref01/diorama-base-v3.png` | 0.100 |
| 26 | cat-hair | `fal-ai/aura-sr` | `01a19bb2-afe1-79d3-8bd5-a483977006f0` | `design/hero/ref01/crops/cat-hair.png` | `design/hero/ref01/up/cat-hair.png` | 0.000 |
| 27 | crown | `fal-ai/aura-sr` | `01a19bb3-07e7-7dd3-9948-c858c99f19f4` | `design/hero/ref01/crops/crown.png` | `design/hero/ref01/up/crown.png` | 0.000 |
| 28 | avatars | `fal-ai/aura-sr` | `01a19bb3-07f3-74c0-aa9d-6ddc9962e223` | `design/hero/ref01/crops/avatars.png` | `design/hero/ref01/up/avatars.png` | 0.000 |
| 29 | cat-brows | `fal-ai/aura-sr` | `01a19bb3-07f4-7071-8fa0-cc4cff7a509d` | `design/hero/ref01/crops/cat-brows.png` | `design/hero/ref01/up/cat-brows.png` | 0.000 |
| 30 | cat-lashes | `fal-ai/aura-sr` | `01a19bb3-07f7-7903-b55a-b3486aa4a945` | `design/hero/ref01/crops/cat-lashes.png` | `design/hero/ref01/up/cat-lashes.png` | 0.000 |
| 31 | cat-skin | `fal-ai/aura-sr` | `01a19bb3-07e6-7950-95ca-e49478026fac` | `design/hero/ref01/crops/cat-skin.png` | `design/hero/ref01/up/cat-skin.png` | 0.000 |
| 32 | cat-nails | `fal-ai/aura-sr` | `01a19bb3-07f3-7212-9a40-7b42991aef8c` | `design/hero/ref01/crops/cat-nails.png` | `design/hero/ref01/up/cat-nails.png` | 0.000 |
| 33 | cat-massage | `fal-ai/aura-sr` | `01a19bb3-07f6-7d81-8400-f9baa267c4ad` | `design/hero/ref01/crops/cat-massage.png` | `design/hero/ref01/up/cat-massage.png` | 0.000 |
| 34 | glow-1 | `fal-ai/aura-sr` | `01a19bb3-09dc-78e3-9ae0-ba9d22717f58` | `design/hero/ref01/crops/glow-1.png` | `design/hero/ref01/up/glow-1.png` | 0.000 |
| 35 | neon-lives | `fal-ai/aura-sr` | `01a19bb3-3b10-7940-8bac-b23a9c1f3e30` | `design/hero/ref01/crops/neon-lives.png` | `design/hero/ref01/up/neon-lives.png` | 0.000 |
| 36 | neon-hair | `fal-ai/aura-sr` | `01a19bb3-3320-72a1-8d67-6c0cb56df7be` | `design/hero/ref01/crops/neon-hair.png` | `design/hero/ref01/up/neon-hair.png` | 0.000 |
| 37 | neon-skincare | `fal-ai/aura-sr` | `01a19bb3-4406-78a2-b129-c5da5329ed0b` | `design/hero/ref01/crops/neon-skincare.png` | `design/hero/ref01/up/neon-skincare.png` | 0.000 |
| 38 | glow-2 | `fal-ai/aura-sr` | `01a19bb3-325a-7510-920c-f5742ad536c6` | `design/hero/ref01/crops/glow-2.png` | `design/hero/ref01/up/glow-2.png` | 0.000 |
| 39 | heart3d | `fal-ai/aura-sr` | `01a19bb3-33d4-7481-925d-ea326b2fb856` | `design/hero/ref01/crops/heart3d.png` | `design/hero/ref01/up/heart3d.png` | 0.000 |
| 40 | glow-3 | `fal-ai/aura-sr` | `01a19bb3-34ff-7751-8c94-1d0f2121d493` | `design/hero/ref01/crops/glow-3.png` | `design/hero/ref01/up/glow-3.png` | 0.000 |
| 41 | neon-nails | `fal-ai/aura-sr` | `01a19bb3-43fd-7ae1-8298-063da10b3afc` | `design/hero/ref01/crops/neon-nails.png` | `design/hero/ref01/up/neon-nails.png` | 0.000 |
| 42 | pillar-text | `fal-ai/aura-sr` | `01a19bb3-440e-7411-b033-091e90fc266a` | `design/hero/ref01/crops/pillar-text.png` | `design/hero/ref01/up/pillar-text.png` | 0.000 |
| 43 | plinth-slogan | `fal-ai/aura-sr` | `01a19bb3-553d-7a11-8e22-cd445a292ffb` | `design/hero/ref01/crops/plinth-slogan.png` | `design/hero/ref01/up/plinth-slogan.png` | 0.000 |
| 44 | prop-polish | `fal-ai/aura-sr` | `01a19bb3-5d8e-7920-bf90-fe66d5db6407` | `design/hero/ref01/crops/prop-polish.png` | `design/hero/ref01/up/prop-polish.png` | 0.000 |
| 45 | prop-perfume | `fal-ai/aura-sr` | `01a19bb3-5e17-7c53-bfba-cb2531e3093e` | `design/hero/ref01/crops/prop-perfume.png` | `design/hero/ref01/up/prop-perfume.png` | 0.000 |
| 46 | salon-2 | `fal-ai/aura-sr` | `01a19bb3-620f-77a0-bc29-705c04a80894` | `design/hero/ref01/crops/salon-2.png` | `design/hero/ref01/up/salon-2.png` | 0.000 |
| 47 | salon-1 | `fal-ai/aura-sr` | `01a19bb3-623c-7982-8663-b29cf6d90d8a` | `design/hero/ref01/crops/salon-1.png` | `design/hero/ref01/up/salon-1.png` | 0.000 |
| 48 | salon-3 | `fal-ai/aura-sr` | `01a19bb3-64c6-77b1-8068-384b8c13b04c` | `design/hero/ref01/crops/salon-3.png` | `design/hero/ref01/up/salon-3.png` | 0.000 |
| 49 | salon-4 | `fal-ai/aura-sr` | `01a19bb3-6fdb-7ce3-94c1-2fa45c9aa4fa` | `design/hero/ref01/crops/salon-4.png` | `design/hero/ref01/up/salon-4.png` | 0.000 |
| 50 | salon-5 | `fal-ai/aura-sr` | `01a19bb3-7184-75e3-a5f8-ec3dd01cc337` | `design/hero/ref01/crops/salon-5.png` | `design/hero/ref01/up/salon-5.png` | 0.000 |
| 51 | trust-star | `fal-ai/aura-sr` | `01a19bb3-d4f2-7c23-854f-16cfc4b5be34` | `design/hero/ref01/crops/trust-star.png` | `design/hero/ref01/up/trust-star.png` | 0.000 |
| 52 | trust-cal | `fal-ai/aura-sr` | `01a19bb3-d4f2-7860-b2df-f516472dfc26` | `design/hero/ref01/crops/trust-cal.png` | `design/hero/ref01/up/trust-cal.png` | 0.000 |
| 53 | trust-shield | `fal-ai/aura-sr` | `01a19bb3-d4f3-72e3-9373-b177fb66c021` | `design/hero/ref01/crops/trust-shield.png` | `design/hero/ref01/up/trust-shield.png` | 0.000 |
| 54 | script-selflove | `fal-ai/aura-sr` | `01a19bb3-d4eb-7132-a8a5-bdaf8a7897d8` | `design/hero/ref01/crops/script-selflove.png` | `design/hero/ref01/up/script-selflove.png` | 0.000 |
| 55 | script-good-beauty | `fal-ai/aura-sr` | `01a19bb3-d4f1-7782-988f-f441b093af5b` | `design/hero/ref01/crops/script-good-beauty.png` | `design/hero/ref01/up/script-good-beauty.png` | 0.000 |
| 56 | loop-diorama-v2 | `kling/v4/image-to-video` | `01a19bb0-cbff-7952-a045-07dce287b76e` | `design/hero/ref01/diorama-base-v3.png`<br>`design/hero/ref01/diorama-base-v3.png` | `design/hero/loops/loop-diorama-v2.mp4` | 1.180 |
| 57 | prop-polish-cut | `fal-ai/birefnet/v2` | `01a19bb4-4ae7-7383-892c-bf1b1d21e117` | `design/hero/ref01/up/prop-polish.png` | `design/hero/ref01/up/prop-polish-cut.png` | 0.000 |
| 58 | prop-perfume-cut | `fal-ai/birefnet/v2` | `01a19bb4-4ba4-7050-be99-b83f93569a89` | `design/hero/ref01/up/prop-perfume.png` | `design/hero/ref01/up/prop-perfume-cut.png` | 0.000 |
| 59 | heart3d-cut | `fal-ai/birefnet/v2` | `01a19bb4-4b4a-7903-949e-e396ae82d232` | `design/hero/ref01/up/heart3d.png` | `design/hero/ref01/up/heart3d-cut.png` | 0.000 |
| 60 | prop-polish-blank | `blackforestlabs/flux-3/edit-image` | `01a19bb4-9f2d-77a2-8365-01e9ab0341a7` | `design/hero/ref01/up/prop-polish.png` | `design/hero/ref01/up/prop-polish-blank.png` | 0.048 |
| 61 | reception-calm | `blackforestlabs/flux-3/edit-image` | `01a19da5-8d42-7693-a781-c9f8b9c8832d` | `design/hero/ref01/diorama-base-v4.png` | `design/hero/studio/raw/reception-calm.png` | 0.100 |
| 62 | photo-stress-a | `fal-ai/nano-banana-pro` | `01a19db8-75ef-7b30-8d53-1c027981ac83` |  |  | 0.000 |
| 63 | photo-stress-b (unused) | `fal-ai/nano-banana-pro` | `01a19db8-75f3-7a20-a638-4a5de0af087f` |  |  | 0.000 |
| 64 | photo-owner | `fal-ai/nano-banana-pro` | `01a19db8-75f1-7440-bbf3-0361b1f3dde7` |  |  | 0.000 |
| 65 | photo-nails | `fal-ai/nano-banana-pro` | `01a19db8-75f5-7682-a4fc-1b832a7af264` |  |  | 0.000 |
| 66 | photo-calm (same receptionist) | `fal-ai/nano-banana-pro/edit` | `01a19db9-fa4a-7a20-ab09-c0b82e88511f` |  |  | 0.000 |
| 67 | photo-stress (clean-up) | `fal-ai/nano-banana-pro/edit` | `01a19db9-fa84-71a2-85cf-d65f895c0ebe` |  |  | 0.000 |
| 68 | photo-owner (logo removed) | `fal-ai/nano-banana-pro/edit` | `01a19db9-fa86-7fc3-a715-fcdcc261a70c` |  |  | 0.000 |
| 69 | photo-nails (labels removed) | `fal-ai/nano-banana-pro/edit` | `01a19db9-fa8b-7000-ab05-5a7368f29640` |  |  | 0.000 |
| 70 | photo-phone-close | `fal-ai/nano-banana-pro/edit` | `01a19db9-fa87-70c3-96bc-54a19ec149ab` |  |  | 0.000 |
| 71 | photo-customer | `fal-ai/nano-banana-pro` | `01a19db9-fa8c-70d3-96c6-42cb46839cf5` |  |  | 0.000 |
| 72 | photo-hair | `fal-ai/nano-banana-pro` | `01a19db9-fa88-7741-b9da-306496f5ef78` |  |  | 0.000 |
| 73 | photo-lash | `fal-ai/nano-banana-pro` | `01a19db9-fa8e-7dd1-a696-d171f0f0bc1e` |  |  | 0.000 |
| 74 | photo-exterior (4K) | `fal-ai/nano-banana-pro/edit` | `01a19dbc-134c-7bc1-a5f5-f17075f43515` |  |  | 0.000 |
| 75 | photo-treatment (4K) | `fal-ai/nano-banana-pro/edit` | `01a19dbc-134e-7ac3-adb1-e1f4020246e8` |  |  | 0.000 |
| 76 | photo-office (4K) | `fal-ai/nano-banana-pro/edit` | `01a19dbc-134e-7930-9bd9-5dd3bc01cbfe` |  |  | 0.000 |
| 77 | photo-barber | `fal-ai/nano-banana-pro` | `01a19dbc-138f-7b93-bb8b-0d2a6437d6c9` |  |  | 0.000 |
| 78 | photo-spa | `fal-ai/nano-banana-pro` | `01a19dbc-1391-7cc2-ba51-b7a0d0dad91c` |  |  | 0.000 |
| 79 | photo-brow | `fal-ai/nano-banana-pro` | `01a19dbc-138c-7652-9788-6ce68bdd5dd3` |  |  | 0.000 |
| 80 | loop-stress | `alibaba/wan-3.0-prime/image-to-video` | `01a19dbb-8de8-7d13-bdfe-f419ac25394d` |  |  | 0.000 |
| 81 | loop-calm | `alibaba/wan-3.0-prime/image-to-video` | `01a19dbb-8e1d-7cf3-b615-cdaba5173e79` |  |  | 0.000 |
| 82 | walk1 v1 (rejected: blurred face from bad signage blur) | `alibaba/wan-3.0-prime/image-to-video` | `01a19dbf-12be-74d3-b24e-750dab25c11b` |  |  | 0.000 |
| 83 | walk1 | `alibaba/wan-3.0-prime/image-to-video` | `01a19dc2-640b-7e70-88cd-2ccdcebb17e5` |  |  | 0.000 |
| 84 | walk2 | `alibaba/wan-3.0-prime/image-to-video` | `01a19dbf-12bd-7c60-8a2a-1ce8b10e1e42` |  |  | 0.000 |
| 85 | walk3 | `alibaba/wan-3.0-prime/image-to-video` | `01a19dbf-12bf-7e00-9279-f3218d714883` |  |  | 0.000 |
| 86 | walk1-4k | `fal-ai/bytedance-upscaler/upscale/video` | `01a19dc5-57c7-73e0-a6d6-177199dd827d` |  |  | 0.000 |
| 87 | walk2-4k | `fal-ai/bytedance-upscaler/upscale/video` | `01a19dc2-640b-7613-ad12-91b6c1fbfccb` |  |  | 0.000 |
| 88 | walk3-4k | `fal-ai/bytedance-upscaler/upscale/video` | `01a19dc2-645e-72a3-8571-8f10bc1e0c50` |  |  | 0.000 |
| 89 | loop-stress-hi | `fal-ai/bytedance-upscaler/upscale/video` | `01a19dc6-338b-7462-9d89-af78ee29d897` |  |  | 0.000 |
| 90 | loop-calm-hi | `fal-ai/bytedance-upscaler/upscale/video` | `01a19dc6-338f-77f3-83ea-0841f0c1a895` |  |  | 0.000 |
| 91 | loop-stress-169 | `alibaba/wan-3.0-prime/image-to-video` | `01a19dd9-06e9-75c2-8a98-b9b4f4c00944` |  |  | 0.000 |
| 92 | loop-calm-169 | `alibaba/wan-3.0-prime/image-to-video` | `01a19dd9-0722-7760-a45b-e4cc6707b031` |  |  | 0.000 |
| 93 | loop-stress-169-4k | `fal-ai/bytedance-upscaler/upscale/video` | `01a19ddf-485a-7ac3-96f3-83aaecdba2ae` |  |  | 0.000 |
| 94 | loop-calm-169-4k | `fal-ai/bytedance-upscaler/upscale/video` | `01a19ddf-485b-7b32-9c57-1ac7ef7db9d8` |  |  | 0.000 |
| 95 | brand-exterior (4K) | `fal-ai/nano-banana-pro/edit` | `01a19fee-3311-7622-ac7f-d2a47fa7297d` |  |  | 0.000 |
| 96 | brand-stress (4K) | `fal-ai/nano-banana-pro/edit` | `01a19ff0-336d-7dc3-9bdb-27f5315b4131` |  |  | 0.000 |
| 97 | brand-calm v1 (rejected: sign mismatch) | `fal-ai/nano-banana-pro/edit` | `01a19ff0-33c6-7352-adfb-2b8c1eae1138` |  |  | 0.000 |
| 98 | brand-calm | `fal-ai/nano-banana-pro/edit` | `01a19ff1-e679-7681-bff5-e21473f61c79` |  |  | 0.000 |
| 99 | brand-treatment (4K) | `fal-ai/nano-banana-pro/edit` | `01a19ff0-33ca-77e0-adb7-3b94651c809e` |  |  | 0.000 |
| 100 | brand-office (4K) | `fal-ai/nano-banana-pro/edit` | `01a19ff0-33c8-7022-a3d2-ae01d646e334` |  |  | 0.000 |
| 101 | walk1-brand | `alibaba/wan-3.0-prime/image-to-video` | `01a19ff1-e677-7091-8615-b8b9fd6c3f48` |  |  | 0.000 |
| 102 | loop-stress-brand | `alibaba/wan-3.0-prime/image-to-video` | `01a19ff1-e6b5-7982-94b2-944ef4e898a3` |  |  | 0.000 |
| 103 | loop-calm-brand | `alibaba/wan-3.0-prime/image-to-video` | `01a19ff3-3d67-7032-86b3-c6899f8344a2` |  |  | 0.000 |
| 104 | walk3-brand (failed: input >20 MB, not billed) | `alibaba/wan-3.0-prime/image-to-video` | `01a19ff1-e6b3-76b0-afb7-eab50b69786c` |  |  | 0.000 |
| 105 | walk2-brand (failed: input >20 MB, not billed) | `alibaba/wan-3.0-prime/image-to-video` | `01a19ff3-3da4-76f3-8841-f04bb4b7870d` |  |  | 0.000 |
| 106 | walk2-brand | `alibaba/wan-3.0-prime/image-to-video` | `01a1a00c-c491-7fe2-bb61-2cee943c91ae` |  |  | 0.000 |
| 107 | walk3-brand | `alibaba/wan-3.0-prime/image-to-video` | `01a1a00c-c492-7b32-b4e3-af6fdcc244c9` |  |  | 0.000 |
| 108 | walk1-brand-4k | `fal-ai/bytedance-upscaler/upscale/video` | `01a1a00c-c493-73d0-acd8-267ac6e5ea1d` |  |  | 0.000 |
| 109 | walk2-brand-4k | `fal-ai/bytedance-upscaler/upscale/video` | `01a1a00e-f665-72d2-a584-55e67f8810f7` |  |  | 0.000 |
| 110 | walk3-brand-4k | `fal-ai/bytedance-upscaler/upscale/video` | `01a1a00e-f666-73e0-a25f-9c5a99758ec4` |  |  | 0.000 |
| 111 | treatment-brand2 | `fal-ai/nano-banana-pro/edit` | `01a1a023-833a-7b32-9732-54b7fdde0d7b` |  |  | 0.000 |
| 112 | walk3-brand2 | `alibaba/wan-3.0-prime/image-to-video` | `01a1a024-7c62-76a1-96a4-5eb8fdd56e23` |  |  | 0.000 |
| 113 | walk3-brand2-4k | `fal-ai/bytedance-upscaler/upscale/video` | `01a1a026-15d4-7fc1-bf54-ed1322ff0872` |  |  | 0.000 |
| 114 | exterior-brand2 | `fal-ai/nano-banana-pro/edit` | `01a1a025-9fe1-70c0-af84-4b37bb83bac7` |  |  | 0.000 |
| 115 | walk1-brand2 | `alibaba/wan-3.0-prime/image-to-video` | `01a1a026-62b5-7580-970f-8feae1f4477b` |  |  | 0.000 |
| 116 | walk1-brand2-4k | `fal-ai/bytedance-upscaler/upscale/video` | `01a1a027-cb74-74b0-8aac-00f02752c47e` |  |  | 0.000 |
| 117 | exterior-cands | `fal-ai/nano-banana-pro/edit` | `01a1a037-6a55-7182-8a25-86bf9eb87c35` |  |  | 0.000 |
| 118 | treatment-closed | `fal-ai/nano-banana-pro/edit` | `01a1a037-6a53-7a83-abfe-4e459e6d9ddd` |  |  | 0.000 |
| 119 | walk3-final | `alibaba/wan-3.0-prime/image-to-video` | `01a1a03e-e2a1-7920-ac5a-bdc69f1821c8` |  |  | 0.000 |
| 120 | walk3-final-4k | `fal-ai/bytedance-upscaler/upscale/video` | `01a1a040-977f-7703-97b2-2f91b5ee8a86` |  |  | 0.000 |
| 121 | stress-fix | `fal-ai/nano-banana-pro/edit` | `01a1a04c-5da8-71c2-a1d9-b649cd08d86d` |  |  | 0.000 |
| 122 | walk1-fix | `alibaba/wan-3.0-prime/image-to-video` | `01a1a04d-324c-7ec0-8afe-052c12ed2ca8` |  |  | 0.000 |
| 123 | walk2-fix | `alibaba/wan-3.0-prime/image-to-video` | `01a1a04d-3252-7a40-bf05-8f37e7a330d0` |  |  | 0.000 |
| 124 | walk1-fix-4k | `fal-ai/bytedance-upscaler/upscale/video` | `01a1a04e-9c3e-7810-8261-e1e1cd5b925c` |  |  | 0.000 |
| 125 | walk2-fix-4k | `fal-ai/bytedance-upscaler/upscale/video` | `01a1a04e-9c3e-76b2-b93f-bebc08c04a75` |  |  | 0.000 |

## Prompts and settings

### 1. chars-v1
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T20:10:00Z
- Settings: `{"aspect_ratio": "3:2", "resolution": "1k", "output_format": "png"}`

### 2. master-v1a
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:23:12+00:00
- Settings: `{"output_format": "png", "resolution": "1k", "aspect_ratio": "4:3"}`

```
Render only the 3D isometric beauty-salon diorama from image 1 as a standalone hero illustration: no website, no UI, no buttons, no headline. Keep the composition idea of image 1: a two-level open salon on a curved glossy lilac glass plinth with a glossy staircase spilling down toward the front right. Zones: nail station front-left with the nail technician and nail client from image 2 doing a manicure; hair area back-center with tall arched gold-framed mirrors, the hair stylist from image 2 drying the hair client's hair in a pink styling chair; skincare shelving with pastel bottles and a facial bed back-right with the sheet-mask client from image 2; spa massage bed with candles on the right; reception front-right with a glossy pink rounded desk, the receptionist from image 2, and a curved pink sofa with a small gold coffee table; a blank smooth lilac brand wall above the reception (leave it completely empty); potted plants; warm lamps. Characters exactly as designed in image 2. Floating around the diorama: a glossy translucent pink jelly heart and a lilac nail-polish bottle. Diorama centered with generous empty cream margin around it. Isometric 3/4 top-down miniature diorama, orthographic look, about 30 degree camera, cute chibi stylized characters (about 2.5 heads tall) with soft clay shading, glossy jelly and translucent glass materials, pastel palette: lilac #A98BEB, light lilac #CDBBF5, soft pink #F6B8CC, rose #EE8FB0, cream #FBF6F3, gold accents #D8B06A, deep plum shadows #2A1426, warm interior glow, pink and lilac bounce light, soft ambient occlusion, high-end collectible toy look, clean cream background, crisp edges Avoid: any text, letters, words, numbers, signage lettering, logos, watermarks, captions; realistic photographic faces; extra fingers; deformed hands; harsh shadows; oversaturated neon; clutter; dark background; blur.
```

### 3. master-v1b
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:23:16+00:00
- Settings: `{"output_format": "png", "resolution": "1k", "aspect_ratio": "4:3"}`

```
Render only the 3D isometric beauty-salon diorama from image 1 as a standalone hero illustration: no website, no UI, no buttons, no headline. Keep the composition idea of image 1: a two-level open salon on a curved glossy lilac glass plinth with a glossy staircase spilling down toward the front right. Zones: nail station front-left with the nail technician and nail client from image 2 doing a manicure; hair area back-center with tall arched gold-framed mirrors, the hair stylist from image 2 drying the hair client's hair in a pink styling chair; skincare shelving with pastel bottles and a facial bed back-right with the sheet-mask client from image 2; spa massage bed with candles on the right; reception front-right with a glossy pink rounded desk, the receptionist from image 2, and a curved pink sofa with a small gold coffee table; a blank smooth lilac brand wall above the reception (leave it completely empty); potted plants; warm lamps. Characters exactly as designed in image 2. Floating around the diorama: a glossy translucent pink jelly heart and a lilac nail-polish bottle. Diorama centered with generous empty cream margin around it. Isometric 3/4 top-down miniature diorama, orthographic look, about 30 degree camera, cute chibi stylized characters (about 2.5 heads tall) with soft clay shading, glossy jelly and translucent glass materials, pastel palette: lilac #A98BEB, light lilac #CDBBF5, soft pink #F6B8CC, rose #EE8FB0, cream #FBF6F3, gold accents #D8B06A, deep plum shadows #2A1426, warm interior glow, pink and lilac bounce light, soft ambient occlusion, high-end collectible toy look, clean cream background, crisp edges Avoid: any text, letters, words, numbers, signage lettering, logos, watermarks, captions; realistic photographic faces; extra fingers; deformed hands; harsh shadows; oversaturated neon; clutter; dark background; blur.
```

### 4. master-v2-clean
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:25:24+00:00
- Settings: `{"resolution": "2k", "aspect_ratio": "auto", "output_format": "png"}`

```
Edit image 1. Remove ALL lettering, words and pseudo-text from every surface: the big wall sign, the neon signs on the walls, the text on the reception desk front, the labels near the nail station and the skincare area. Replace the wall signs with a smooth blank lilac wall panel with a soft empty rounded neon frame, replace small neon text with simple glowing neon heart and sparkle shapes, and make the reception desk front a smooth glossy blank pink surface with a soft glow. Keep everything else exactly identical: composition, camera, characters, furniture, colors, lighting, plinth and staircase. Add one small glossy translucent pink jelly heart floating near the top right. No text anywhere.
```

### 5. loop-hair-v1
- Endpoint: `kling/v4/image-to-video` · at 2026-11-02T09:29:40+00:00
- Settings: `{"duration": 5, "resolution": "720p"}`

```
Isometric miniature chibi beauty salon diorama, hair area. The hair stylist gently moves the hair dryer and brushes the client's long hair, strands of hair flutter softly, the mirror lights glow softly. Camera completely locked, no zoom, no pan, no cut. Keep the toy-like 3D style, colors, lighting and faces identical. Subtle, calm, looping idle motion only. No new objects, no text.
```

### 6. loop-skin-v1
- Endpoint: `kling/v4/image-to-video` · at 2026-11-02T09:29:58+00:00
- Settings: `{"duration": 5, "resolution": "720p"}`

```
Isometric miniature chibi beauty salon diorama, skincare corner. The client with the sheet face mask lies relaxed and breathes slowly, the receptionist gently nods and smiles, the candle flame flickers, warm lights pulse softly. Camera completely locked, no zoom, no pan, no cut. Keep the toy-like 3D style, colors, lighting and faces identical. Subtle, calm, looping idle motion only. No new objects, no text.
```

### 7. prop-heart-v1
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:30:36+00:00
- Settings: `{"output_format": "png", "resolution": "1k", "aspect_ratio": "1:1"}`

```
Product render in the exact glossy jelly-glass material style and pastel palette of the floating objects in image 1: a single glossy translucent pink jelly heart, chubby rounded 3D heart shape, candy-like glass with soft rim light and inner glow, floating, centered, isolated on a plain flat cream background, soft shadowless studio light. Isometric 3/4 top-down miniature diorama, orthographic look, about 30 degree camera, cute chibi stylized characters (about 2.5 heads tall) with soft clay shading, glossy jelly and translucent glass materials, pastel palette: lilac #A98BEB, light lilac #CDBBF5, soft pink #F6B8CC, rose #EE8FB0, cream #FBF6F3, gold accents #D8B06A, deep plum shadows #2A1426, warm interior glow, pink and lilac bounce light, soft ambient occlusion, high-end collectible toy look, clean cream background, crisp edges Avoid: any text, letters, words, numbers, signage lettering, logos, watermarks, captions; realistic photographic faces; extra fingers; deformed hands; harsh shadows; oversaturated neon; clutter; dark background; blur.
```

### 8. prop-perfume-v1
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:30:40+00:00
- Settings: `{"output_format": "png", "resolution": "1k", "aspect_ratio": "1:1"}`

```
Product render in the exact glossy jelly-glass material style and pastel palette of the floating objects in image 1: a single small rounded translucent pink perfume bottle with a gold cap, glossy jelly glass, soft inner glow, floating, centered, isolated on a plain flat cream background, soft shadowless studio light. Isometric 3/4 top-down miniature diorama, orthographic look, about 30 degree camera, cute chibi stylized characters (about 2.5 heads tall) with soft clay shading, glossy jelly and translucent glass materials, pastel palette: lilac #A98BEB, light lilac #CDBBF5, soft pink #F6B8CC, rose #EE8FB0, cream #FBF6F3, gold accents #D8B06A, deep plum shadows #2A1426, warm interior glow, pink and lilac bounce light, soft ambient occlusion, high-end collectible toy look, clean cream background, crisp edges Avoid: any text, letters, words, numbers, signage lettering, logos, watermarks, captions; realistic photographic faces; extra fingers; deformed hands; harsh shadows; oversaturated neon; clutter; dark background; blur.
```

### 9. prop-polish-v1
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:30:40+00:00
- Settings: `{"output_format": "png", "resolution": "1k", "aspect_ratio": "1:1"}`

```
Product render in the exact glossy jelly-glass material style and pastel palette of the floating objects in image 1: a single glossy lilac nail polish bottle with a rounded faceted translucent glass body and a tall glossy plum cap, tilted slightly, floating, centered, isolated on a plain flat cream background, soft shadowless studio light. Isometric 3/4 top-down miniature diorama, orthographic look, about 30 degree camera, cute chibi stylized characters (about 2.5 heads tall) with soft clay shading, glossy jelly and translucent glass materials, pastel palette: lilac #A98BEB, light lilac #CDBBF5, soft pink #F6B8CC, rose #EE8FB0, cream #FBF6F3, gold accents #D8B06A, deep plum shadows #2A1426, warm interior glow, pink and lilac bounce light, soft ambient occlusion, high-end collectible toy look, clean cream background, crisp edges Avoid: any text, letters, words, numbers, signage lettering, logos, watermarks, captions; realistic photographic faces; extra fingers; deformed hands; harsh shadows; oversaturated neon; clutter; dark background; blur.
```

### 10. prop-polish-v2
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:31:35+00:00
- Settings: `{"resolution": "1k", "aspect_ratio": "auto", "output_format": "png"}`

```
Edit image 1: remove the lettering on the bottle completely so the glass body is clean, blank and glossy with no text, no logo, no label. Keep everything else identical.
```

### 11. cut-perfume
- Endpoint: `fal-ai/birefnet/v2` · at 2026-11-02T09:31:52+00:00
- Settings: `{"operating_resolution": "1024x1024", "output_format": "png", "refine_foreground": true}`

### 12. cut-polish
- Endpoint: `fal-ai/birefnet/v2` · at 2026-11-02T09:31:52+00:00
- Settings: `{"operating_resolution": "1024x1024", "output_format": "png", "refine_foreground": true}`

### 13. cut-heart
- Endpoint: `fal-ai/birefnet/v2` · at 2026-11-02T09:31:52+00:00
- Settings: `{"operating_resolution": "1024x1024", "output_format": "png", "refine_foreground": true}`

### 14. loop-nails-v1
- Endpoint: `kling/v4/image-to-video` · at 2026-11-02T09:32:37+00:00
- Settings: `{"duration": 5, "resolution": "720p"}`

```
Isometric miniature chibi beauty salon diorama, nail station. The nail technician gently paints the client's fingernails with small brush strokes, the client blinks and smiles slightly, her hair sways a tiny bit. Camera completely locked, no zoom, no pan, no cut. Keep the toy-like 3D style, colors, lighting and faces identical. Subtle, calm, looping idle motion only. No new objects, no text.
```

### 15. salon-nails
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:33:26+00:00
- Settings: `{"aspect_ratio": "4:3", "resolution": "1k", "output_format": "jpeg"}`

```
Photorealistic interior photo of a small modern nail salon in Ho Chi Minh City, soft blush pink walls, round mirrors with warm LED glow, white manicure tables, pink velvet chairs, plants, cream terrazzo floor, natural light, editorial interior photography, matching the soft pastel color mood of the salon photos in image 1. Avoid: any text, letters, words, signage lettering, logos, watermarks, people.
```

### 16. salon-brows
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:33:26+00:00
- Settings: `{"aspect_ratio": "4:3", "resolution": "1k", "output_format": "jpeg"}`

```
Photorealistic interior photo of a lash and brow studio in Hanoi, rounded pastel pink walls, glowing oval mirror, cream reclining bed, small gold accents, plants, editorial interior photography, soft pastel mood like image 1. Avoid: any text, letters, words, signage lettering, logos, watermarks, people.
```

### 17. salon-hair
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:33:26+00:00
- Settings: `{"aspect_ratio": "4:3", "resolution": "1k", "output_format": "jpeg"}`

```
Photorealistic interior photo of a boutique hair salon in Saigon, arched gold-framed mirrors, beige and lilac tones, pink styling chairs, warm pendant lights, tall plants, editorial interior photography, soft pastel mood like image 1. Avoid: any text, letters, words, signage lettering, logos, watermarks, people.
```

### 18. salon-spa
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:33:44+00:00
- Settings: `{"aspect_ratio": "4:3", "resolution": "1k", "output_format": "jpeg"}`

```
Photorealistic interior photo of a calm skincare and spa room in Vietnam, white treatment bed with pink towels, soft lilac light, candles, rattan details, plants, editorial interior photography, soft pastel mood like image 1. Avoid: any text, letters, words, signage lettering, logos, watermarks, people.
```

### 19. glow-nails
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:34:42+00:00
- Settings: `{"aspect_ratio": "4:5", "resolution": "1k", "output_format": "jpeg"}`

```
Close-up of a chibi hand from image 2 showing fresh glossy lilac and pink chrome nail art with tiny hearts and pearls, resting on a pastel cushion, jelly heart floating nearby. Glossy pastel 3D toy render in the exact style and palette of image 1, lilac, soft pink, cream and gold, soft glow, clean cream gradient background, editorial magazine composition with empty space at the top left. Avoid: any text, letters, logos, watermarks, realistic photo faces.
```

### 20. glow-skin
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:34:43+00:00
- Settings: `{"aspect_ratio": "4:5", "resolution": "1k", "output_format": "jpeg"}`

```
Close-up portrait of the chibi skincare client from image 2 with dewy glowing skin after a facial, eyes closed, happy, tiny sparkles around her face, holding a glossy jelly serum bottle. Glossy pastel 3D toy render in the exact style and palette of image 1, lilac, soft pink, cream and gold, soft glow, clean cream gradient background, editorial magazine composition with empty space at the top left. Avoid: any text, letters, logos, watermarks, realistic photo faces.
```

### 21. glow-hair
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:34:43+00:00
- Settings: `{"aspect_ratio": "4:5", "resolution": "1k", "output_format": "jpeg"}`

```
Chibi client from image 2 with freshly styled glossy wavy hair flowing, playful pose, hair dryer and soft wind swirl, tiny sparkles. Glossy pastel 3D toy render in the exact style and palette of image 1, lilac, soft pink, cream and gold, soft glow, clean cream gradient background, editorial magazine composition with empty space at the top left. Avoid: any text, letters, logos, watermarks, realistic photo faces.
```

### 22. diorama-clean-v1
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:37:07+00:00
- Settings: `{"resolution": "2k", "aspect_ratio": "auto", "output_format": "png"}`

```
Edit image 1 into a clean standalone illustration of the isometric 3D beauty-salon diorama. Remove every website UI element: the navigation links and buttons at the top (Beauty services, For professionals, search icon, Sign in, Get started), the white search card with its rows and dark button at the bottom left, the "SCROLL TO EXPLORE" label and arrow, the large pink letter fragment at the far left edge, and the handwritten pink script at the top right. Fill those areas seamlessly: continue the diorama plinth, glossy staircase, floor and furniture naturally where the card covered them, and use a soft plain cream background (#FBF6F3) elsewhere. Also remove ALL lettering and words in the scene (the gugu signs, NAILS, HAIR, SKIN CARE, BEAUTY LIVES HERE, the text on the pillar and on the plinth edge, the text on the nail polish bottle) leaving the same glowing neon frames, smooth blank sign surfaces and blank glossy desk front. Keep everything else exactly identical: camera, composition, characters, colors, lighting, materials, floating nail polish bottle, hair dryer and perfume bottle. No text anywhere.
```

### 23. diorama-clean-v2
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:38:43+00:00
- Settings: `{"resolution": "2k", "aspect_ratio": "auto", "output_format": "png"}`

```
Edit image 1. Remove the remaining lettering: the word on the floating nail polish bottle at the top left (make its glass label blank and glossy), the tiny symbols on the two small panels on the staircase railing, and the label text on the perfume bottles. Remove the large white curved shape and lilac swoosh in the top left corner and along the top edge so the background there is plain soft cream (#FBF6F3), keeping the diorama walls intact. Keep everything else exactly identical. No text anywhere.
```

### 24. loop-diorama-v1
- Endpoint: `kling/v4/image-to-video` · at 2026-11-02T09:43:12+00:00
- Settings: `{"duration": 5, "resolution": "1080p"}`

```
Isometric miniature 3D beauty salon diorama, toy-like chibi characters. Very subtle gentle idle life: the nail technician paints nails with small brush strokes, the hair stylist moves the dryer softly and hair strands flutter, the woman on the facial bed breathes calmly, the candle flame flickers, warm mirror lights and neon glow pulse softly, plant leaves sway slightly, the floating nail polish bottle, hair dryer and perfume bottle bob up and down very gently. Camera completely static: no zoom, no pan, no rotation, no cut. Keep the style, colors, lighting, characters and every object identical. No new objects, no text. Seamless loop.
```

### 25. diorama-base-v3
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T09:56:45+00:00
- Settings: `{"resolution": "2k", "aspect_ratio": "auto", "output_format": "png"}`

```
Edit image 1: remove only the two floating bottles outside the diorama (the floating pink nail polish bottle at the top left and the floating pink perfume bottle at the bottom right) and the tiny floating hearts, filling those areas with the same soft cream background. Keep the wall-mounted hair dryer and everything else exactly identical: camera, composition, characters, furniture, colors, lighting. No text anywhere.
```

### 26. cat-hair
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:11+00:00
- Settings: `{"upscaling_factor": 4}`

### 27. crown
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:32+00:00
- Settings: `{"upscaling_factor": 4}`

### 28. avatars
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:33+00:00
- Settings: `{"upscaling_factor": 4}`

### 29. cat-brows
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:33+00:00
- Settings: `{"upscaling_factor": 4}`

### 30. cat-lashes
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:33+00:00
- Settings: `{"upscaling_factor": 4}`

### 31. cat-skin
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:33+00:00
- Settings: `{"upscaling_factor": 4}`

### 32. cat-nails
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:33+00:00
- Settings: `{"upscaling_factor": 4}`

### 33. cat-massage
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:33+00:00
- Settings: `{"upscaling_factor": 4}`

### 34. glow-1
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:35+00:00
- Settings: `{"upscaling_factor": 4}`

### 35. neon-lives
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:42+00:00
- Settings: `{"upscaling_factor": 4}`

### 36. neon-hair
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:44+00:00
- Settings: `{"upscaling_factor": 4}`

### 37. neon-skincare
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:44+00:00
- Settings: `{"upscaling_factor": 4}`

### 38. glow-2
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:45+00:00
- Settings: `{"upscaling_factor": 4}`

### 39. heart3d
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:45+00:00
- Settings: `{"upscaling_factor": 4}`

### 40. glow-3
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:45+00:00
- Settings: `{"upscaling_factor": 4}`

### 41. neon-nails
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:48+00:00
- Settings: `{"upscaling_factor": 4}`

### 42. pillar-text
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:49+00:00
- Settings: `{"upscaling_factor": 4}`

### 43. plinth-slogan
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:49+00:00
- Settings: `{"upscaling_factor": 4}`

### 44. prop-polish
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:55+00:00
- Settings: `{"upscaling_factor": 4}`

### 45. prop-perfume
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:56+00:00
- Settings: `{"upscaling_factor": 4}`

### 46. salon-2
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:57+00:00
- Settings: `{"upscaling_factor": 4}`

### 47. salon-1
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:57+00:00
- Settings: `{"upscaling_factor": 4}`

### 48. salon-3
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T09:59:57+00:00
- Settings: `{"upscaling_factor": 4}`

### 49. salon-4
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T10:00:00+00:00
- Settings: `{"upscaling_factor": 4}`

### 50. salon-5
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T10:00:01+00:00
- Settings: `{"upscaling_factor": 4}`

### 51. trust-star
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T10:00:30+00:00
- Settings: `{"upscaling_factor": 4}`

### 52. trust-cal
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T10:00:30+00:00
- Settings: `{"upscaling_factor": 4}`

### 53. trust-shield
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T10:00:34+00:00
- Settings: `{"upscaling_factor": 4}`

### 54. script-selflove
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T10:00:34+00:00
- Settings: `{"upscaling_factor": 4}`

### 55. script-good-beauty
- Endpoint: `fal-ai/aura-sr` · at 2026-11-02T10:00:35+00:00
- Settings: `{"upscaling_factor": 4}`

### 56. loop-diorama-v2
- Endpoint: `kling/v4/image-to-video` · at 2026-11-02T10:00:49+00:00
- Settings: `{"duration": 5, "resolution": "1080p"}`

```
Isometric miniature 3D beauty salon diorama with cute toy-like characters, gently alive and clearly moving: the nail technician paints the client nails with visible brush strokes and the client turns her head and smiles; the hair stylist styles the client hair with a brush, hair strands sway; the woman on the facial bed breathes and moves her hand slightly; the receptionist area glows; the candle flame flickers; warm mirror lights and neon frames pulse softly; plant leaves sway; soft light reflections shimmer on the glossy floor. Camera completely locked: no zoom, no pan, no rotation, no cut. Keep the style, colors, lighting, characters and every object identical. No new objects, no text. Seamless loop, the last frame matches the first frame.
```

### 57. prop-polish-cut
- Endpoint: `fal-ai/birefnet/v2` · at 2026-11-02T10:00:51+00:00
- Settings: `{"operating_resolution": "1024x1024", "output_format": "png", "refine_foreground": true}`

### 58. prop-perfume-cut
- Endpoint: `fal-ai/birefnet/v2` · at 2026-11-02T10:00:52+00:00
- Settings: `{"operating_resolution": "1024x1024", "output_format": "png", "refine_foreground": true}`

### 59. heart3d-cut
- Endpoint: `fal-ai/birefnet/v2` · at 2026-11-02T10:00:52+00:00
- Settings: `{"operating_resolution": "1024x1024", "output_format": "png", "refine_foreground": true}`

### 60. prop-polish-blank
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-02T10:01:40+00:00
- Settings: `{"resolution": "1k", "aspect_ratio": "auto", "output_format": "png"}`

```
Edit image 1: remove the white lettering on the nail polish bottle so the glass body is blank, glossy and clean. Keep everything else identical.
```

### 61. reception-calm
- Endpoint: `blackforestlabs/flux-3/edit-image` · at 2026-11-03T00:00:00+00:00
- Settings: `{"aspect_ratio": "16:9", "resolution": "2k", "output_format": "png"}`

```
Same reception desk of the salon in image 1, same cute chibi toy style and palette, now calm and tidy: the same chibi young Vietnamese receptionist (black hair bun, lilac apron) smiling relaxed at a laptop showing a pastel calendar with colored appointment blocks, a smartphone beside it, a happy chibi client arriving and waving, plants, warm light. Isometric 3/4 camera, depth of field. Avoid: any readable text, letters, numbers, logos, watermarks.
```

### 62. photo-stress-a
- Endpoint: `fal-ai/nano-banana-pro` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Editorial documentary photograph: stressed Vietnamese receptionist, modern Saigon salon, phone + paper notebook, waiting customers; 50mm f/1.8; no text/logos.
```

### 63. photo-stress-b (unused)
- Endpoint: `fal-ai/nano-banana-pro` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Receptionist multitasking with phone and notebook, customers foreground; 85mm.
```

### 64. photo-owner
- Endpoint: `fal-ai/nano-banana-pro` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Confident salon owner at marble table with laptop, staff working behind; 50mm.
```

### 65. photo-nails
- Endpoint: `fal-ai/nano-banana-pro` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Close-up nail technician painting lilac gel; realistic hands.
```

### 66. photo-calm (same receptionist)
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Edit of photo-stress-a: same woman/place, calm, laptop, tidy desk, one smiling customer; remove sign text and brass letter.
```

### 67. photo-stress (clean-up)
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Edit of photo-stress-a: blur street signs, remove brass letter.
```

### 68. photo-owner (logo removed)
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Edit: remove laptop logo and frame fragment.
```

### 69. photo-nails (labels removed)
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Edit: remove bottle labels.
```

### 70. photo-phone-close
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Same receptionist close-up with glowing phone and notebook; 85mm.
```

### 71. photo-customer
- Endpoint: `fal-ai/nano-banana-pro` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Young Vietnamese customer in Saigon cafe smiling at phone; 50mm.
```

### 72. photo-hair
- Endpoint: `fal-ai/nano-banana-pro` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Male stylist blow-drying smiling client; 50mm.
```

### 73. photo-lash
- Endpoint: `fal-ai/nano-banana-pro` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Lash technician applying extensions; 85mm.
```

### 74. photo-exterior (4K)
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Street-front exterior of the same salon, closed glass double doors, blank sign; 35mm.
```

### 75. photo-treatment (4K)
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Treatment area of the same salon, nail tables + hair chairs, door to back office.
```

### 76. photo-office (4K)
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Back office with the same owner at desk and monitor.
```

### 77. photo-barber
- Endpoint: `fal-ai/nano-banana-pro` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Barber giving skin fade; 50mm.
```

### 78. photo-spa
- Endpoint: `fal-ai/nano-banana-pro` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Day spa shoulder massage; 50mm.
```

### 79. photo-brow
- Endpoint: `fal-ai/nano-banana-pro` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Brow artist shaping brows; 85mm.
```

### 80. loop-stress
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Locked-off camera, subtle motion; start=end frame photo-stress for a seamless loop. 5 s.
```

### 81. loop-calm
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
Locked-off camera, subtle motion; start=end frame photo-calm. 5 s.
```

### 82. walk1 v1 (rejected: blurred face from bad signage blur)
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
First/last frame walk: exterior -> reception (stress).
```

### 83. walk1
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
First/last frame steadicam walk: exterior (doors open) -> reception (stress). 6 s.
```

### 84. walk2
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
First/last frame walk: reception (calm) -> treatment area. 6 s.
```

### 85. walk3
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
First/last frame walk: treatment area -> back office. 6 s.
```

### 86. walk1-4k
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
4K upscale, aigc preset, fidelity high.
```

### 87. walk2-4k
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
4K upscale.
```

### 88. walk3-4k
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
4K upscale.
```

### 89. loop-stress-hi
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
1.5x upscale.
```

### 90. loop-calm-hi
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T01:30:00+00:00
- Settings: `{}`

```
1.5x upscale.
```

### 91. loop-stress-169
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

```
16:9 locked-off loop from stress-169 (matches walk1 end frame).
```

### 92. loop-calm-169
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

```
16:9 locked-off loop from calm-169 (matches walk2 start frame).
```

### 93. loop-stress-169-4k
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

```
4K upscale.
```

### 94. loop-calm-169-4k
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

```
4K upscale.
```

### 95. brand-exterior (4K)
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

```
Exterior with the real gugu logo on the sign (logo as reference image), brand palette.
```

### 96. brand-stress (4K)
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

```
Reception stressed: brand palette + gugu sign behind desk.
```

### 97. brand-calm v1 (rejected: sign mismatch)
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

```
Reception calm: brand palette + sign.
```

### 98. brand-calm
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

```
Calm reception with the sign matched to brand-stress.
```

### 99. brand-treatment (4K)
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

```
Treatment area: palette, neon gugu sign, owner visible through the far door.
```

### 100. brand-office (4K)
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

```
Back office: palette, gugu print on the wall.
```

### 101. walk1-brand
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

```
Exterior (gugu sign) -> reception (stress), 6 s.
```

### 102. loop-stress-brand
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

```
Locked-off loop on brand-stress.
```

### 103. loop-calm-brand
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

```
Locked-off loop on brand-calm.
```

### 104. walk3-brand (failed: input >20 MB, not billed)
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

### 105. walk2-brand (failed: input >20 MB, not billed)
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T12:55:00+00:00
- Settings: `{}`

### 106. walk2-brand
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T13:40:00+00:00
- Settings: `{}`

```
Reception (calm, branded) -> treatment area (branded). 6 s. Via REST with the project FAL_KEY.
```

### 107. walk3-brand
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T13:40:00+00:00
- Settings: `{}`

```
Treatment -> back office; owner visible through the door from the start. 6 s.
```

### 108. walk1-brand-4k
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T13:40:00+00:00
- Settings: `{}`

```
4K upscale.
```

### 109. walk2-brand-4k
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T13:40:00+00:00
- Settings: `{}`

```
4K upscale.
```

### 110. walk3-brand-4k
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T13:40:00+00:00
- Settings: `{}`

```
4K upscale.
```

### 111. treatment-brand2
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T14:00:00+00:00
- Settings: `{}`

```
Treatment area: office visible through the door matches the real back office (owner, desk, monitor, gugu print).
```

### 112. walk3-brand2
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T14:00:00+00:00
- Settings: `{}`

```
Treatment -> office, same room throughout.
```

### 113. walk3-brand2-4k
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T14:00:00+00:00
- Settings: `{}`

```
4K upscale.
```

### 114. exterior-brand2
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T14:00:00+00:00
- Settings: `{}`

```
Exterior with the receptionist and waiting customers visible through the glass.
```

### 115. walk1-brand2
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T14:00:00+00:00
- Settings: `{}`

```
Exterior -> reception; nobody appears or disappears.
```

### 116. walk1-brand2-4k
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T14:00:00+00:00
- Settings: `{}`

```
4K upscale.
```

### 117. exterior-cands
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T14:40:00+00:00
- Settings: `{}`

```
2 candidates: receptionist correctly behind the desk (cand0 used).
```

### 118. treatment-closed
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T14:40:00+00:00
- Settings: `{}`

```
Treatment area with the back-office door closed.
```

### 119. walk3-final
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T14:40:00+00:00
- Settings: `{}`

```
Closed door opens into the lilac office.
```

### 120. walk3-final-4k
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T14:40:00+00:00
- Settings: `{}`

```
4K upscale.
```

### 121. stress-fix
- Endpoint: `fal-ai/nano-banana-pro/edit` · at 2026-11-03T14:40:00+00:00
- Settings: `{}`

```
Sharp natural faces for the two waiting customers.
```

### 122. walk1-fix
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T14:40:00+00:00
- Settings: `{}`

```
Exterior -> reception, sharp faces.
```

### 123. walk2-fix
- Endpoint: `alibaba/wan-3.0-prime/image-to-video` · at 2026-11-03T14:40:00+00:00
- Settings: `{}`

```
Reception -> treatment, back-office door closed throughout.
```

### 124. walk1-fix-4k
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T14:40:00+00:00
- Settings: `{}`

```
4K upscale.
```

### 125. walk2-fix-4k
- Endpoint: `fal-ai/bytedance-upscaler/upscale/video` · at 2026-11-03T14:40:00+00:00
- Settings: `{}`

```
4K upscale.
```
