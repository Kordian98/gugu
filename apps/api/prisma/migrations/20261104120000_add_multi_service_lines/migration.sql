-- M6.8 multi-service appointments (topic 06, flag booking.multiService): a booking holds up to
-- four service lines in sequence, each with its own staff member, times and snapshots. Occupancy
-- stays one row per staff member / resource unit per line; the EXCLUDE constraints are unchanged.

-- Calendar and own-calendar scopes look bookings up by the staff of any line.
CREATE INDEX "booking_services_salon_id_staff_id_starts_at_idx" ON "booking_services"("salon_id", "staff_id", "starts_at");

-- Was "sequence" = 1 (q17 launch contract). Same name, so the raw-object inventory is unchanged.
ALTER TABLE "booking_services" DROP CONSTRAINT "booking_services_valid";
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_valid"
  CHECK (
    "sequence" BETWEEN 1 AND 4
    AND "starts_at" < "ends_at"
    AND "duration_minutes" > 0
    AND "buffer_before_minutes" >= 0 AND "buffer_after_minutes" >= 0
    AND "price_minor" >= 0
  );
