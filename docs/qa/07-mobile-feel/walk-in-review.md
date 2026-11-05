# Walk-in design and domain review — 2026-11-05

Read-only review of `QuickWalkInSheet.tsx`, `quick-walk-in.ts`, Today integration and WeekStrip using the design-reviewer/test-engineer role checklists. This is a source review, not an exact-commit merge-gate approval.

## Findings resolved during review

1. **Fixed-price variant inherited an unrelated maximum.** The helper used `variant?.priceMax ?? service.priceMax`; a 200k fixed variant of a 100–150k base service could display 200–150k. The owner aligned the fallback with canonical `packages/domain/src/booking/terms.ts` and added a regression test: a variant's fixed price drops the parent range.
2. **An idle native sheet could offer an expired time.** The owner added `walkInNeedsRefresh`: data older than 30 seconds or a start time that has passed triggers a server refresh and returns before any write. The refreshed summary requires another confirmation; native AppState activation also refetches. The deterministic test covers fresh, stale and expired cases. No client-generated availability or automatic rule overrides were introduced.

## Should fix / product limits

- Optional staff buttons now exclude members who are not bookable, even if their ID remains in the service assignment list. The empty-service state also avoids asking users to choose from an empty list.
- The catalogue DTO does not expose staff price/duration overrides. Its footer price is explicitly an estimate, but it may differ from the actual assigned staff's terms. Avoid presenting it as a final quote; a server quote would be the durable solution.
- The fast path chooses today's earliest server-approved slot. It does not promise immediate service or bypass minimum-notice/opening-hour rules. If “walk-in” must always mean starting now, that needs an explicit authorized override path.

## Positive checks

- Today exposes a direct localized action only to authenticated salon users with booking-write permission; it clears an existing booking sheet before opening the fast path.
- Service/variant choice is explicit, with readable body text, selected icon/state and 44-point minimum controls. Server availability remains authoritative and no tomorrow slot is substituted for an empty today.
- Pending writes disable confirm, service/staff changes and optional navigation; the shared sheet locks dismissal. A synchronous submit ref prevents duplicate mutations before React rerenders.
- Availability error and empty states have recovery actions. Conflict handling keeps the sheet open, refreshes server slots, and requires another confirmation.
- Creating the booking updates the list cache using the authoritative POST result before opening booking details. The fast path requires no name/phone keyboard entry.
- WeekStrip uses localized dates and salon timezone, exposes full-date accessibility labels and routes taps to the matching calendar date. The orchestrator's vi/en Chromium/WebKit regression passed, including small and short viewport footer bounds.

Focused verification: `pnpm --filter @gugu/app exec vitest run features/salon-crm/pages/calendar/quick-walk-in.test.ts` — **5/5 passed** after the fixes.

Final source verdict: **Approve** for the reviewed design/domain changes. Exact-commit merge approval and combined runtime verification belong to the orchestrator; this document does not substitute for that gate.
