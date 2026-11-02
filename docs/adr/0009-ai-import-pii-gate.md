# ADR 0009: AI import no-PII image gate (OCR and face detection on our servers)

- Status: proposed
- Date: 2026-11-02
- Owner: ai-agent (topic 08, milestone IMP)

## Context

The AI onboarding import turns photos and screenshots of a salon's price list into services. Owner rule q03/q65: **no personal data reaches an LLM** until there has been a legal review and explicit consent. Price lists often carry the salon's hotline (in a household business that is usually the owner's personal phone), Zalo numbers, emails, Facebook/Instagram links, staff names ("anh Tuấn phụ trách") and, in screenshots, avatars or photos of people.

We need to detect and black out those regions **before** the image is sent to Claude. The detection must run on our own infrastructure: a cloud OCR or face API would itself be a new processor of the personal data.

## Spike (2026-11-02)

The spike used a rendered Vietnamese price list with a phone number, a Zalo number, an email, a Facebook link and a name label, plus a public group photo.

| Option | Result |
|---|---|
| **tesseract.js 7 (WASM), `vie` + `eng` from `@tesseract.js-data/*`** | ~230 ms init, ~400 ms per image on an M-series laptop. Every phone digit group, email and link was read exactly; diacritics were mostly correct ("Sơn gel" read as "Son gel"). Word-level boxes, no native build, no network at runtime. |
| **UltraFace RFB-320 ONNX (MIT, 1.2 MB) on onnxruntime-node 1.31** | ~10 ms per image. Found 44 faces in the group photo and 0 on the price list. Uses prebuilt N-API binaries. |
| Cloud OCR or face APIs (AWS Textract/Rekognition, Google Vision) | Rejected: they add a processor of personal data, and Textract's Vietnamese support is weak. |
| Send OCR text only (no image) to the LLM | Rejected: column layout is lost and Vietnamese OCR errors would leak into service names. Claude reads the redacted image far better. |
| MediaPipe / TF.js face detection | Rejected: heavier, and browser-oriented. |

We only need OCR to *find* PII. Claude reads the service names from the image itself, so Tesseract's diacritic slips do not reach the menu.

## Decision

The pipeline (`apps/api/src/modules/ai-import/pii/`) runs in memory for every image:
1. Decode with sharp. Apply EXIF rotation, strip all metadata (GPS, device) and downscale to at most 2000 px.
2. **Faces** (UltraFace). Reject the image (`ai_import.person_detected`) if any face covers ≥ 1.5 % of the image or there are ≥ 3 confident faces (a photo of people). Otherwise black out each small face (avatars in a screenshot).
3. **OCR** (Tesseract vie+eng). Rebuild each line with word offsets and match phone numbers (VN formats), emails, URLs, @handles and "honorific/role + Capitalised name" (`anh/chị/em/cô/chú/KTV/stylist/…`). Black out every overlapping word box.
4. Re-encode as JPEG, at most 1568 px.
5. **Egress check.** OCR the output again. If any contact detail or name pattern is still readable, refuse (`ai_import.pii_check_failed`) and send nothing.

Only the redacted image goes to the model, in one call: Sonnet route, strict tool, refusal fallback. Neither originals nor redacted copies are stored.

## Consequences

- No new data processor. The LLM only ever sees redacted images.
- About 1–2 s of CPU per image (two OCR passes). Bounded by the 10-image limit and a per-salon rate limit (20 extractions/hour); runs before any cost is reserved.
- Recall over precision: a blacked-out price is fixed by the owner in the review table.
- Residual risk: names written **without** an honorific, or in stylised fonts Tesseract cannot read, can pass. This is the same accepted-risk model as q62. Mitigations are the privacy note shown before upload and, later, a "what Gu sees" preview of the redacted images.
- The model file is vendored at `apps/api/assets/models/ultraface-rfb-320.onnx` (see the README there). Deployments must ship `apps/api/assets/`.
- Tests: `ai-import.pii.test.ts` (real engines, canary strings, people photo, avatar masking, egress refusal) and `ai-import.int.test.ts` (HTTP, tenant isolation, cap).

## Follow-ups

- Show the redacted images to the owner before sending ("What Gu sees", spec §4.5 step 3). The server would return the redacted previews from a separate `/redact` call first.
- Measure OCR recall on 20 real salon price lists from field interviews (T-BIZ) and tune `NAME_PREFIXES` and the face thresholds.
