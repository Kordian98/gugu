# 0012 — Salon privacy tools: owner-only export and erasure, async salon export, retention

- **Status:** proposed
- **Date:** 2026-11-03
- **Owner:** auth-security · **Topic:** 05 (step 8)

## Context
Customers never have a GuGu account (X21/X23); each client record belongs to one salon. Owner answer q80: the salon answers its clients' requests with CRM tools; GuGu acts as processor. The spec asks for export (JSON + readable), deletion keeping bookings consistent (q71: bookings anonymised, notes and tags deleted), async exports, retention, audit, and no compliance claims (Law 91/2025/QH15, Decree 356/2025/ND-CP: "designed to support", never "compliant").

## Decision
1. **Permissions:** `customers.export` and the new `customers.erase` are owner-only (never grantable through overrides; organisation owners act as owners). Manager, receptionist and staff get 403; another salon's ids 404.
2. **One-client export** is a synchronous, audited `GET` (`gugu.client-export.v1` JSON + localized text) of: profile (and profiles merged into it), bookings matched by the profiles' phones (with services, payment, status history), the salon's notes, Zalo conversations with that phone or linked to those bookings (with messages), and customer notification log rows (no address — none is stored). Staff names are left out.
3. **Erasure is one transaction** in the privacy module, which is the one place allowed to change other modules' tables for this purpose: profiles and notes deleted; bookings anonymised in place via `BookingAnonymiser.anonymiseSalonClient` (name → placeholder, phone/email/hash/note/cancellation and override reasons cleared, offline-sale note cleared, status-history `reason_text` blanked); Zalo booking links removed, messages deleted, conversation stripped of name/phone/bot state (the OA-scoped Zalo user id stays, so the unique `(oa_id, zalo_user_id)` holds), raw webhook events of that Zalo user deleted, send-log content cleared; notification `recipient_key` hashes cleared outside the 24 h abuse-cap window. Upcoming bookings are cancelled **after** commit, when their contact is already gone, so no confirmation or cancellation message can reach the client.
4. **Append-only status history keeps one narrow exception:** the trigger now allows exactly `reason_text → NULL` with every other column unchanged; all other updates and all deletes still fail (tested).
5. **Assistant entity tokens are not touched:** they only map `staff|service|booking` tokens to ids (no client kind), booking tokens re-hydrate to the reference code, and deleting tokens would let the vault re-issue a number inside a live conversation.
6. **Salon-wide export** is a `privacy` queue job: one queued/running per salon (partial unique index), 3 per day, gzipped JSON + CSV (formula-neutralised, UTF-8 BOM) stored in `privacy_exports`, downloadable only through the authenticated panel for 24 hours (no signed public link, nothing emailed), each download audited.
7. **Retention** (`privacy.retention`, daily system job, time predicates only, batched). Periods are working values to confirm in the legal review (q04); they are not a compliance claim:

   | Data | Kept | Then |
   |---|---|---|
   | Notification deliveries, bell items | 12 months | deleted |
   | Recipient hash on a delivery | 48 h | cleared |
   | Ended sessions (+ refresh tokens) | 30 days after end | deleted |
   | Magic links | 1 day after expiry | deleted |
   | Idempotency keys | until expiry | deleted |
   | Salon export content | 24 h after completion | cleared (row kept as `expired`) |
   | Stuck exports (queued/running) | 6 h | marked failed |
   | Zalo raw webhook events | 30 days | deleted (zalo module) |
   | **Audit log** (amended 2026-11-04, owner answer q94) | `AUDIT_RETENTION_MONTHS`, default **24 months**, minimum 12 | deleted in batches of 5 000 |

   The audit log stays append-only. Its trigger allows exactly one exception: a `DELETE` inside a transaction that set `gugu.audit_retention = on` (transaction-local, set only by the retention job) on a row older than 12 months. Every `UPDATE` fails, and so does any `DELETE` without the flag or on a younger row, whatever the env says (tested).
8. **Suspension** (amended 2026-11-04, owner answer q92): while GuGu suspends a salon, the owner can still erase one client (`POST …/customers/:customerId/erase`) and start the salon-wide export (`POST …/privacy/exports`; download and the one-client export are GETs and were already open). Both stay owner-only and audited. This is a narrow allow-list (`SUSPENSION_WRITE_ALLOWLIST` + `@AllowWhileSuspended()`): the guard honours the decorator only for `customers.erase` / `customers.export`, and the boot check pins it to exactly those two (method, path, permission) triples. Every other salon write stays blocked (generated route matrix, stack-less and on the stack).

## Alternatives considered
- Soft-delete the profile — keeps the personal data the client asked to remove.
- Cancel upcoming bookings first (as the account-deletion hook does) — races the notification planner, which could still email the client.
- Signed download links — would leak exports through email/URL logs; the panel-only download keeps them behind the session.
- Object storage for exports — no S3 client in the API yet; at MVP size gzipped rows are enough.

## Consequences
- Bookings entered for the same person without a phone (walk-ins by name only) cannot be matched and are not anonymised.
- A suspended salon can still answer privacy requests: export one client, erase a client, run and download the salon-wide export (q92). Nothing else can be changed.
- The account-deletion hook (`anonymiseCustomer`) still cancels before anonymising; worth aligning with topic 06.
- Legal review (q04) must confirm the retention periods (including the 24-month audit log period, q94) and the controller/processor split before launch.
- Audit entries older than the retention period are gone for good; an investigation that needs them must happen within the period (or a later legal-hold mechanism must pause the purge).
