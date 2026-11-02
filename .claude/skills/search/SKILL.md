---
name: search
description: Rules and procedures for GuGu marketplace search — the salon_search read model, Vietnamese diacritic-insensitive text search (unaccent + pg_trgm + FTS), PostGIS radius/bbox queries, filters, sorting, autosuggest, ranking and performance checks. Use when editing apps/api/src/modules/search/**, the search projector, search-related migrations, or apps/app/features/search/**.
---

# Search

Search is served by the NestJS `search` module from a denormalised PostgreSQL read model `salon_search` (one row per published salon), kept fresh by BullMQ projector jobs. The module exposes a `SearchIndex` port so an external engine can replace Postgres later. Spec: `docs/tasks/10-marketplace-seo.md` §3.4, §4.2.

## When to use
- Adding/changing a filter, sort, or ranking signal
- Changing `salon_search` columns, indexes, or the projector
- Touching text normalisation, slugs, or autosuggest
- Investigating slow search queries

## Invariants
- MUST normalise text with `immutable_unaccent(lower(x))` in SQL and `normalizeVi()` from `packages/domain` in JS; both map `đ/Đ → d` and strip tone marks. Parity test must pass.
- MUST use the `simple` FTS configuration (Postgres has no Vietnamese stemmer) over normalised text; combine with `pg_trgm` similarity for fuzzy/prefix matching.
- MUST query only `salon_search` for listing — never join live booking tables in a search request.
- Availability filters MUST use the availability summary columns (maintained by topic 06), never compute slots.
- Geo MUST use `geography` with `ST_DWithin` for radius (meters) and `ST_Distance` for nearest sort; bbox via `ST_MakeEnvelope(..., 4326)`.
- Location filters use two-tier ids (province, commune) plus `LocationAlias` resolution for legacy districts ("quận 1", "Q1", "Sài Gòn").
- Display area labels (`area_label_vi/en`, `legacy_area_label_vi/en`) are computed in the projector per spec §3.6.1. Clients never build labels from raw geography.
- The home search card serialises to the same query params as the search page (`category`, `service`, `province`, `commune`, `lat/lng/radius`, `when=today|tomorrow|week`, `date=YYYY-MM-DD`, `q`). Keep the mapping in one shared serializer (`features/search/url.ts`) used by both.
- Only `published`, non-suspended salons; only public staff names are indexed.
- Promoted boost is capped and the result is flagged `sponsored: true`.
- API pagination is cursor/keyset; SSR listing pages may use `?page=n`.

## Procedure: add a filter
1. Add the field to the Zod query schema in `packages/validation` (shared by API + app); update the OpenAPI doc.
2. If needed, add a column to `salon_search` (propose to topic 04's schema owner) and populate it in the projector for every relevant domain event; add backfill to the nightly rebuild.
3. Add an index if the filter is selective; verify with `EXPLAIN (ANALYZE, BUFFERS)` on the 10k-salon synthetic dataset.
4. Wire URL ⇄ state mapping in `features/search` (parse, serialize, default omission).
5. Add localized labels (`search` namespace, vi + en).
6. Tests: unit (query builder), integration (seeded DB, include a no-diacritics query), Playwright (URL round-trip).

## Procedure: change ranking
1. Ranking lives in one place (`search/ranking.ts` or SQL function) — no ad-hoc ORDER BY elsewhere.
2. Document weight changes in `docs/domains/marketplace-seo.md` with the reason.
3. Run the golden-query test set (`search/__fixtures__/golden.*`) and review diffs before merging.

## Performance checks
- Search p95 ≤ 300 ms, autosuggest p95 ≤ 100 ms (server time) on synthetic 10k salons.
- No seq scan on `salon_search` for filtered queries.
- Hot queries (home blocks, autosuggest prefixes) cached in Redis 60–300 s; cache key includes locale + location.
- Request cancellation: app uses TanStack Query `signal`; API honours client abort.

## Checklist before PR
- [ ] Zod schema + OpenAPI updated
- [ ] Projector handles create/update/delete/suspend events for new data
- [ ] Diacritic and legacy-district test cases included
- [ ] EXPLAIN attached for new/changed queries
- [ ] Golden queries reviewed (ranking changes)
- [ ] Localized labels vi/en
- [ ] Domain doc updated
