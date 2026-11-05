# ADR-0019: Custom CRM appointment terms without catalog entries

Status: accepted — owner request 2026-11-05.

Salon operators need to reserve a calendar selection's actual duration and record a service before adding it to their catalog. Creating hidden catalog services would accumulate records and complicate service maintenance and staff assignments.

A CRM appointment may override its single line's effective duration, preserving catalog buffers and resource requirements. An ad hoc line instead stores its name, fixed price and duration entirely in the existing immutable booking snapshot. Its catalog `service_id` is nullable; existing composite catalog foreign keys remain for catalog-backed lines. Ad hoc bookings do not create service or assignment records.

All availability/check/create paths resolve these terms before using the same booking engine, sorted locks and occupancy constraints. Custom service eligibility is the active bookable salon team, constrained by the caller's own-calendar scope. Custom service reschedules preserve the snapshot. Existing catalog snapshots continue to resolve current catalog eligibility as before.

This adds a nullable service reference to booking read models. Revenue and payroll retain such rows through left joins; commission uses the staff member's default rate and execution cost remains unknown. Service charts group ad hoc entries by their recorded name. Assistant output uses an `ad_hoc` aggregate marker without sending that name to the model.

The change does not permit overlapping staff/resource reservations. Hours, lead-time and horizon exceptions continue through the existing explicit permission, confirmation reason and audit path.
