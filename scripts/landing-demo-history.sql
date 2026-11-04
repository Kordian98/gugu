-- Private capture DB only: a realistic previous period for Insights (copy October's past bookings to
-- September, about 90 % of them, so period-over-period changes are plausible).
BEGIN;
CREATE TEMP TABLE m AS
  SELECT id AS old_id, gen_random_uuid() AS new_id
  FROM bookings
  WHERE starts_at >= '2026-10-01' AND starts_at < '2026-10-31'
    AND status IN ('completed','no_show','cancelled_by_customer')
    AND abs(hashtext(id::text)) % 10 <> 0;
INSERT INTO bookings (id, salon_id, reference_code, status, source, created_by_actor_type, created_by_user_id,
  customer_user_id, customer_name, customer_phone_e164, customer_phone_hash, identity_verified, customer_note,
  staff_id, starts_at, ends_at, total_price_minor, total_price_max_minor, currency, payment_method,
  late_cancellation, cancellation_reason, rule_overrides, override_reason, version, created_at, updated_at)
SELECT m.new_id, b.salon_id, b.reference_code || 'P', b.status, b.source, b.created_by_actor_type, b.created_by_user_id,
  b.customer_user_id, b.customer_name, b.customer_phone_e164, b.customer_phone_hash, b.identity_verified, b.customer_note,
  b.staff_id, b.starts_at - interval '30 days', b.ends_at - interval '30 days', b.total_price_minor, b.total_price_max_minor,
  b.currency, b.payment_method, b.late_cancellation, b.cancellation_reason, b.rule_overrides, b.override_reason, 1,
  b.created_at - interval '30 days', b.updated_at - interval '30 days'
FROM bookings b JOIN m ON m.old_id = b.id;
INSERT INTO booking_services (id, salon_id, booking_id, sequence, service_id, variant_id, staff_id, starts_at, ends_at,
  name, variant_name, duration_minutes, buffer_before_minutes, buffer_after_minutes, price_minor, price_max_minor, currency, created_at)
SELECT gen_random_uuid(), s.salon_id, m.new_id, s.sequence, s.service_id, s.variant_id, s.staff_id,
  s.starts_at - interval '30 days', s.ends_at - interval '30 days', s.name, s.variant_name, s.duration_minutes,
  s.buffer_before_minutes, s.buffer_after_minutes, s.price_minor, s.price_max_minor, s.currency, s.created_at - interval '30 days'
FROM booking_services s JOIN m ON m.old_id = s.booking_id;
INSERT INTO booking_status_history (id, salon_id, booking_id, from_status, to_status, actor_type, actor_id, reason_code, reason_text, occurred_at)
SELECT gen_random_uuid(), h.salon_id, m.new_id, h.from_status, h.to_status, h.actor_type, h.actor_id, h.reason_code, h.reason_text,
  h.occurred_at - interval '30 days'
FROM booking_status_history h JOIN m ON m.old_id = h.booking_id;
INSERT INTO offline_sales (id, salon_id, booking_id, amount_minor, currency, method, note, recorded_by_user_id, recorded_at, updated_at)
SELECT gen_random_uuid(), o.salon_id, m.new_id, o.amount_minor, o.currency, o.method, o.note, o.recorded_by_user_id,
  o.recorded_at - interval '30 days', o.updated_at - interval '30 days'
FROM offline_sales o JOIN m ON m.old_id = o.booking_id;
INSERT INTO booking_occupancy (id, salon_id, kind, booking_id, hold_id, staff_id, period, active, expires_at, created_at, resource_unit_id)
SELECT gen_random_uuid(), o.salon_id, o.kind, m.new_id, o.hold_id, o.staff_id,
  tstzrange(lower(o.period) - interval '30 days', upper(o.period) - interval '30 days', '[)'), o.active, o.expires_at, o.created_at - interval '30 days', o.resource_unit_id
FROM booking_occupancy o JOIN m ON m.old_id = o.booking_id;
SELECT count(*) AS copied FROM m;
COMMIT;
