-- Ad hoc services live entirely in the immutable booking snapshot. Existing catalog FKs remain.
ALTER TABLE booking_services ALTER COLUMN service_id DROP NOT NULL;
