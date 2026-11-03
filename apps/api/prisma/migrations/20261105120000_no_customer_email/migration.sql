-- X26 (owner q85/q86/q87): GuGu never emails a salon's customers. Customers hear only from the
-- salon's Zalo OA (module zalo). The optional client email moves from the booking to the client
-- profile, where it is stored and never used for sending.
--
-- One-step contract (drop in the same migration as the backfill) is deliberate: GuGu has no
-- deployed environment yet, so there is no running release that still reads these columns.

-- 1. Client profile email (expand) ---------------------------------------------------------------
ALTER TABLE "customer_salon_profiles" ADD COLUMN     "email" CITEXT;

-- Profiles for phones that so far exist only in bookings that carry an email (same rule as
-- CustomersService.materialize), so no stored email is lost.
INSERT INTO customer_salon_profiles (id, salon_id, phone_e164, display_name, source, updated_at)
SELECT uuidv7(), b.salon_id, b.customer_phone_e164,
       (array_agg(b.customer_name ORDER BY b.starts_at DESC))[1], 'booking', now()
FROM bookings b
WHERE b.customer_phone_e164 IS NOT NULL AND b.customer_name IS NOT NULL
  AND b.customer_email IS NOT NULL AND b.customer_anonymised_at IS NULL
GROUP BY b.salon_id, b.customer_phone_e164
ON CONFLICT (salon_id, phone_e164)
  WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL AND merged_into_id IS NULL
DO NOTHING;

-- Backfill: the most recent email entered on a booking of that phone in that salon. Bookings
-- without a phone have no profile to move to (staff entry always requires a phone).
UPDATE customer_salon_profiles p
SET email = latest.email
FROM (
  SELECT DISTINCT ON (b.salon_id, b.customer_phone_e164)
         b.salon_id, b.customer_phone_e164 AS phone, b.customer_email AS email
  FROM bookings b
  WHERE b.customer_email IS NOT NULL AND b.customer_phone_e164 IS NOT NULL
    AND b.customer_anonymised_at IS NULL
  ORDER BY b.salon_id, b.customer_phone_e164, b.created_at DESC
) latest
WHERE p.salon_id = latest.salon_id AND p.phone_e164 = latest.phone
  AND p.deleted_at IS NULL AND p.merged_into_id IS NULL AND p.email IS NULL;

-- 2. Booking email (contract) --------------------------------------------------------------------
ALTER TABLE "bookings" DROP COLUMN "customer_email";

-- 3. Customer email sending removed --------------------------------------------------------------
-- Customer rows were only ever customer emails (planned, skipped or sent to Mailpit in dev; GuGu
-- never sent a real one). They are removed, not shown as history: the booking timeline lists
-- Zalo deliveries only. Bell items reference team rows only.
DELETE FROM notification_deliveries WHERE audience = 'customer';

-- Abuse caps for customer emails are gone with them.
DROP INDEX "notification_deliveries_recipient_key_reserved_at_idx";
DROP INDEX "notification_deliveries_salon_id_reserved_at_idx";
ALTER TABLE "notification_deliveries" DROP COLUMN "recipient_key",
DROP COLUMN "reserved_at";

-- Reply-to address only served customer emails.
ALTER TABLE "notification_settings" DROP COLUMN "reply_to_email";

-- Stored per-event switches of customer events have no meaning any more.
UPDATE notification_settings
SET events = events - 'booking.confirmed' - 'booking.rescheduled' - 'booking.cancelled_by_salon'
             - 'booking.reminder';

-- Raw object (prisma/raw-objects.json): the send log holds team deliveries only, so a customer
-- email row cannot be written again even by mistake.
ALTER TABLE notification_deliveries DROP CONSTRAINT notification_deliveries_valid;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_valid CHECK (
  channel IN ('email', 'in_app')
  AND audience = 'team'
  AND recipient_user_id IS NOT NULL
  AND units >= 0 AND cost_estimate_vnd >= 0
);
