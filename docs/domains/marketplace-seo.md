# Marketplace & SEO (domain doc)

The public, unauthenticated side of GuGu: discovery (home, category and location hubs, search), salon and service pages, and everything that makes them findable (SSR, metadata, structured data, sitemaps) and shareable. Read this before working on public routes or search. Task spec: `docs/tasks/10-marketplace-seo.md`. Agent: `.claude/agents/marketplace-seo.md`. Skills: `seo-page`, `search`.

> Status: skeleton — sections marked TODO are filled in as code lands.

## Rendering model
- Expo Router, `web.output: "server"` (SDK ≥ 58). Public routes: `loader` + `generateMetadata`, CDN-cached. Authenticated routes: client-only shell, `noindex`, private cache.
- Fallback (if S1 spike fails): static output + `generateStaticParams` rebuilt on publish. Decision: TODO (ADR link).

## URL scheme
| Page | Path |
|---|---|
| Home | `/{locale}` |
| Category | `/{locale}/c/{category}` |
| Category × place | `/{locale}/c/{category}/{province}[/{commune}]` |
| Location hub | `/{locale}/l/{province}` |
| Search | `/{locale}/search?q=&...` |
| Salon | `/{locale}/salon/{slug}` |
| Service | `/{locale}/salon/{slug}/services/{serviceSlug}` |
| Short link | `/s/{shortId}` |
Slug rules and redirects: see skill `seo-page`.

## Homepage
Reference: `design/hero-references/ref-01-homepage-lilac-diorama.png` (+ README by topic 02). Blocks, mobile order, SSR vs client split and the search card → URL mapping are in spec §3.3. Home HTML is cached per (locale, city).

## Hosting
AWS ap-southeast-1 (Singapore): SSR Node container next to the API, with Cloudflare or CloudFront in front (final call: topic 13). Auth cookies are never part of public cache keys.

## Location model
Two-tier since 2025-07-01: province (34) → commune (xã/phường/đặc khu). Legacy districts and old provinces are `LocationAlias` rows. Locations are versioned (`valid_from`, `valid_to`, `replaced_by`). TODO: dataset source + seed script path.
Area labels: `{neighbourhood | ward short}, {province short}` + optional legacy chip ("Q.1 cũ" / "former D1"), precomputed in `salon_search` (spec §3.6.1). Never "District N" as the primary label.

## Search read model
`salon_search` — TODO: column list, indexes, projector events, ranking weights (with change log).

## Invariants
- No personal data in cached public HTML.
- Diacritic-insensitive search via shared normaliser (SQL + JS parity).
- Availability filters use the summary from the booking engine; exact slots only via booking API.
- Only published, non-suspended salons and public staff are exposed.
- Sponsored results are labelled.

## File map
TODO: routes, features, API module, projector, SEO API routes, JSON-LD builders.

## Product AI-agent tools
`marketplace.search_salons`, `marketplace.get_salon_profile`, `marketplace.list_services`, `marketplace.suggest`, `marketplace.resolve_location`, `marketplace.get_availability_summary` — all read-only, public data. Schemas: TODO (`packages/agent-tools`).

## Maps & geocoding
OSM only (owner q26): MapLibre (web + native), self-hosted Protomaps PMTiles (OpenFreeMap in dev), Photon (autocomplete) + Nominatim (reverse) self-hosted behind `GeocoderPort`. Owner-confirmed pin is the source of truth; province/commune always from our Location tables. Attribution "© OpenStreetMap contributors" required.

## Owner decisions
Nationwide index, HCMC first; legacy district names in titles; AI crawlers allowed; aggregateRating + promoted listings at launch; dark mode on public pages; instant booking by default; saved-spots = favourites + bookings (30 d) with labelled editor's picks. Full table: spec §10.

## ADRs
TODO: expo-server-output, postgres-search-vietnamese, two-tier-location-model, map-provider.
