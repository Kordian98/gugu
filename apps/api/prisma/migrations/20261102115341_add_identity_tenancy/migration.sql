-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'pending_deletion', 'deleted');

-- CreateEnum
CREATE TYPE "platform_role" AS ENUM ('support_admin', 'super_admin');

-- CreateEnum
CREATE TYPE "locale" AS ENUM ('vi', 'en');

-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('apple', 'google', 'zalo');

-- CreateEnum
CREATE TYPE "session_kind" AS ENUM ('web', 'native');

-- CreateEnum
CREATE TYPE "magic_link_purpose" AS ENUM ('sign_in', 'salon_registration');

-- CreateEnum
CREATE TYPE "location_level" AS ENUM ('province', 'ward');

-- CreateEnum
CREATE TYPE "organization_status" AS ENUM ('active', 'suspended', 'closed');

-- CreateEnum
CREATE TYPE "organization_role" AS ENUM ('org_owner', 'org_manager', 'org_viewer');

-- CreateEnum
CREATE TYPE "member_status" AS ENUM ('invited', 'pending_verification', 'active', 'removed');

-- CreateEnum
CREATE TYPE "salon_status" AS ENUM ('draft', 'pending_review', 'active', 'suspended', 'closed');

-- CreateEnum
CREATE TYPE "salon_role" AS ENUM ('owner', 'manager', 'receptionist', 'staff');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('anonymous', 'user', 'agent', 'integration', 'system', 'platform_admin');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT,
    "email_verified_at" TIMESTAMPTZ(6),
    "phone_e164" TEXT,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "preferred_locale" "locale" NOT NULL DEFAULT 'vi',
    "platform_role" "platform_role",
    "last_login_at" TIMESTAMPTZ(6),
    "deletion_requested_at" TIMESTAMPTZ(6),
    "deletion_scheduled_for" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" TEXT,
    "avatar_media_id" UUID,
    "preferred_location_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "marketing_consent_at" TIMESTAMPTZ(6),
    "notification_prefs" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "auth_provider" NOT NULL,
    "subject" TEXT NOT NULL,
    "email" CITEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "session_kind" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" TEXT,
    "user_agent" TEXT,
    "ip_prefix" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "magic_link_tokens" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "user_id" UUID,
    "purpose" "magic_link_purpose" NOT NULL DEFAULT 'sign_in',
    "token_hash" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "client" "session_kind" NOT NULL DEFAULT 'web',
    "locale" "locale" NOT NULL DEFAULT 'vi',
    "redirect_path" TEXT,
    "salon_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "ip_prefix" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "magic_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "level" "location_level" NOT NULL,
    "code" TEXT NOT NULL,
    "parent_id" UUID,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "slug" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" CITEXT NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "status" "organization_status" NOT NULL DEFAULT 'active',
    "default_locale" "locale" NOT NULL DEFAULT 'vi',
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "locations_hint" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "organization_role" NOT NULL,
    "status" "member_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salons" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "slug" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "salon_status" NOT NULL DEFAULT 'draft',
    "verified_at" TIMESTAMPTZ(6),
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "default_locale" "locale" NOT NULL DEFAULT 'vi',
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "owner_user_id" UUID NOT NULL,
    "phone_e164" TEXT,
    "primary_category_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "salons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salon_locations" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "address_line" TEXT NOT NULL,
    "ward_id" UUID NOT NULL,
    "province_id" UUID NOT NULL,
    "geo" geography(Point,4326),
    "map_place_id" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "salon_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salon_members" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "salon_role" NOT NULL,
    "permissions_override" JSONB,
    "status" "member_status" NOT NULL DEFAULT 'active',
    "invited_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "salon_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" UUID,
    "salon_id" UUID,
    "organization_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" UUID,
    "request_id" TEXT,
    "ip_prefix" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_e164_key" ON "users"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_user_id_key" ON "customers"("user_id");

-- CreateIndex
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_subject_key" ON "auth_identities"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "magic_link_tokens_token_hash_key" ON "magic_link_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "magic_link_tokens_email_created_at_idx" ON "magic_link_tokens"("email", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE INDEX "locations_parent_id_idx" ON "locations"("parent_id");

-- CreateIndex
CREATE INDEX "locations_level_idx" ON "locations"("level");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_slug_key" ON "service_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "salons_slug_key" ON "salons"("slug");

-- CreateIndex
CREATE INDEX "salons_organization_id_idx" ON "salons"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "salons_organization_id_id_key" ON "salons"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "salon_locations_salon_id_key" ON "salon_locations"("salon_id");

-- CreateIndex
CREATE INDEX "salon_locations_geo_idx" ON "salon_locations" USING GIST ("geo");

-- CreateIndex
CREATE UNIQUE INDEX "salon_locations_salon_id_id_key" ON "salon_locations"("salon_id", "id");

-- CreateIndex
CREATE INDEX "salon_members_user_id_idx" ON "salon_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "salon_members_salon_id_user_id_key" ON "salon_members"("salon_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "salon_members_salon_id_id_key" ON "salon_members"("salon_id", "id");

-- CreateIndex
CREATE INDEX "audit_logs_salon_id_created_at_idx" ON "audit_logs"("salon_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_preferred_location_id_fkey" FOREIGN KEY ("preferred_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salons" ADD CONSTRAINT "salons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salons" ADD CONSTRAINT "salons_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salons" ADD CONSTRAINT "salons_primary_category_id_fkey" FOREIGN KEY ("primary_category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_locations" ADD CONSTRAINT "salon_locations_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_locations" ADD CONSTRAINT "salon_locations_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_locations" ADD CONSTRAINT "salon_locations_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_members" ADD CONSTRAINT "salon_members_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_members" ADD CONSTRAINT "salon_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_members" ADD CONSTRAINT "salon_members_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Raw objects Prisma cannot model (ADR-0008; listed in prisma/raw-objects.json) ──────────────

-- Audit log is append-only (spec 05 R28). The app role may INSERT but never UPDATE/DELETE.
CREATE FUNCTION audit_logs_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- Wards always have a province parent; provinces never have one.
ALTER TABLE locations ADD CONSTRAINT locations_parent_by_level
  CHECK ((level = 'province' AND parent_id IS NULL) OR (level = 'ward' AND parent_id IS NOT NULL));

-- At most one live owner membership per salon.
CREATE UNIQUE INDEX salon_members_one_owner ON salon_members (salon_id)
  WHERE role = 'owner' AND status <> 'removed';

-- Magic links: attempts bounded; code-only lookups by email go through the (email, created_at) index.
ALTER TABLE magic_link_tokens ADD CONSTRAINT magic_link_tokens_attempts_range
  CHECK (attempts BETWEEN 0 AND 10);

-- ─── Reference data ─────────────────────────────────────────────────────────────────────────────

-- Initial categories (master prompt §7). Admin-managed afterwards.
INSERT INTO service_categories (id, slug, name, icon, sort_order, updated_at) VALUES
  (uuidv7(), 'nails',      '{"vi":"Làm móng","en":"Nails"}',                 'nails',    10, now()),
  (uuidv7(), 'hair',       '{"vi":"Làm tóc","en":"Hair"}',                   'hair',     20, now()),
  (uuidv7(), 'barber',     '{"vi":"Cắt tóc nam","en":"Barber"}',             'barber',   30, now()),
  (uuidv7(), 'massage',    '{"vi":"Massage","en":"Massage"}',                'massage',  40, now()),
  (uuidv7(), 'spa',        '{"vi":"Spa","en":"Spa"}',                        'spa',      50, now()),
  (uuidv7(), 'skincare',   '{"vi":"Chăm sóc da","en":"Skincare"}',           'skincare', 60, now()),
  (uuidv7(), 'lashes',     '{"vi":"Nối mi","en":"Lashes"}',                  'lashes',   70, now()),
  (uuidv7(), 'brows',      '{"vi":"Chân mày","en":"Brows"}',                 'brows',    80, now()),
  (uuidv7(), 'makeup',     '{"vi":"Trang điểm","en":"Makeup"}',              'makeup',   90, now()),
  (uuidv7(), 'treatments', '{"vi":"Liệu trình làm đẹp","en":"Beauty treatments"}', 'treatments', 100, now());

-- STUB locations (post-2025 reform: province → ward). The full official dataset is imported by the
-- locations milestone (topic 10); codes prefixed `stub-` are replaced there.
INSERT INTO locations (id, level, code, parent_id, name_vi, name_en, slug, updated_at) VALUES
  (uuidv7(), 'province', 'stub-79', NULL, 'Thành phố Hồ Chí Minh', 'Ho Chi Minh City', 'ho-chi-minh', now()),
  (uuidv7(), 'province', 'stub-01', NULL, 'Thành phố Hà Nội',      'Hanoi',            'ha-noi',      now()),
  (uuidv7(), 'province', 'stub-48', NULL, 'Thành phố Đà Nẵng',     'Da Nang',          'da-nang',     now());

INSERT INTO locations (id, level, code, parent_id, name_vi, name_en, slug, updated_at)
SELECT uuidv7(), 'ward', w.code, p.id, w.name_vi, w.name_en, w.slug, now()
FROM (VALUES
  ('stub-79-sai-gon',    'stub-79', 'Phường Sài Gòn',    'Sai Gon Ward',    'sai-gon'),
  ('stub-79-ben-thanh',  'stub-79', 'Phường Bến Thành',  'Ben Thanh Ward',  'ben-thanh'),
  ('stub-79-tan-dinh',   'stub-79', 'Phường Tân Định',   'Tan Dinh Ward',   'tan-dinh'),
  ('stub-01-hoan-kiem',  'stub-01', 'Phường Hoàn Kiếm',  'Hoan Kiem Ward',  'hoan-kiem'),
  ('stub-01-ba-dinh',    'stub-01', 'Phường Ba Đình',    'Ba Dinh Ward',    'ba-dinh'),
  ('stub-48-hai-chau',   'stub-48', 'Phường Hải Châu',   'Hai Chau Ward',   'hai-chau')
) AS w(code, province_code, name_vi, name_en, slug)
JOIN locations p ON p.code = w.province_code;
