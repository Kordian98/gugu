# PostgreSQL 18 + PostGIS 3.6 for local dev/CI (docs/tasks/04-backend-database.md §3.8).
# Why not postgis/postgis:18-3.6: that image is amd64-only, and dev Macs are arm64. This builds the
# same versions as the later RDS target (PG 18.6, PostGIS 3.6.3) from the official multi-arch image
# + pinned PGDG packages. Bump both pins together with RDS.
FROM postgres:18.6
ARG POSTGIS_VERSION=3.6.3+dfsg-1.pgdg13+1
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    "postgresql-18-postgis-3=${POSTGIS_VERSION}" \
    "postgresql-18-postgis-3-scripts=${POSTGIS_VERSION}" \
  && rm -rf /var/lib/apt/lists/*
