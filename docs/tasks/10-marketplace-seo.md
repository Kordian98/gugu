# 10 — Public marketplace & web/SEO

> Status: refined spec, no code yet. Owner agent: `.claude/agents/marketplace-seo.md`. Skills: `.claude/skills/seo-page/`, `.claude/skills/search/`. Domain doc: `docs/domains/marketplace-seo.md`.
> Master prompt coverage: §7 (marketplace, categories, search, location), §8 (salon profiles), §9 (service catalog, public side), §20 (public web, SEO, sharing), §23 (web-specific functionality).
> Verified 2026-11-02 against Expo docs (SDK 58 released 2026-10-21), Vietnamese administrative reform sources.

---

## 1. Scope

### In
- Public route tree `app/[locale]/(public)/…`: homepage, category, location, category×location, search results, salon profile, service page, staff (as a section of salon), editorial articles, static pages (about, terms, privacy, for-business landing).
- Search API (`/api/v1/search/*`) and its read model: text, category, geo, filters, sorting, pagination, autosuggest.
- Location model on the read side: provinces, communes/wards, neighborhood labels, geo points; location selector UX.
- Salon public profile read model; public service catalog projection (variants, price ranges, durations).
- SEO: rendering mode, metadata, canonical, hreflang, Open Graph, JSON-LD, sitemaps, robots, share previews, universal-link-compatible URLs.
- GEO (AI-search discoverability): `llms.txt`, machine-readable salon pages, structured data quality.
- Web-first concerns from §23: desktop layout of public pages, keyboard navigation, browser history, shareable filter URLs.
- "Recently viewed" (client-side) and favorites entry points (CTA only; favorites logic belongs to 11).

### Out (owned elsewhere)
- Visual design, tokens, 3D hero implementation → **02**. This topic owns the homepage *information architecture* and the hero's content/CTA contract.
- Booking flow after "Book" CTA → **06** (engine) / **11** (customer UX).
- Writing salon profile data (owner side) → **07**. Taxonomy/location admin UI → **12**.
- DB physical schema ownership → **04** (this spec states required columns/indexes; 04 merges them).
- Reviews write/moderation → **11** (we only display aggregates and approved reviews).
- Deep links / AASA / assetlinks files → **13** (we define the URL scheme they must match).
- Promoted listings ranking business rules → **12** (we provide the ranking hook).

---

## 2. Gap analysis

| # | Gap / issue in master prompt | Decision |
|---|---|---|
| G1 | §20 asks for "SSR for dynamic salon pages" with "current stable Expo Router capabilities" but doesn't say what exists. | Verified: Expo Router server rendering is **stable from SDK 58** (alpha behind `unstable_useServerRendering` in SDK 55–57). SDK 58 defaults `web.output` to `"server"`. **Use `web.output: "server"`** with route `loader`s + `generateMetadata`. Expo **cannot mix static and server output in one project**, so "static generation for static pages" becomes "server-rendered + CDN-cached" (same SEO outcome). See §4.1. |
| G2 | Server output means *every* web route, including authenticated CRM/admin, goes through the SSR server. | Authenticated groups `(customer)`, `(business)`, `(staff)`, `(admin)` render a client-only shell (no loaders, `noindex`, `Cache-Control: private, no-store`). Only `(public)` routes have loaders. |
| G3 | No fallback if SSR misbehaves in production (new in stable). | Fallback plan F1: `web.output: "static"` + `apiRoutes: true` + `generateStaticParams` for all published salons, rebuilt by a debounced CI job on publish events; F2 (emergency): Cloudflare Worker that injects `<title>`/meta/JSON-LD into the SPA shell from the search read model. Decision gate after spike S1 (§7). |
| G4 | §7 requires district-level search/filtering; **Vietnam abolished the district tier on 2025-07-01** (63→34 provinces; ~10k communes → ~3.3k communes/wards/special zones). | Two-tier canonical model: `province` → `commune` (xã/phường/đặc khu). Districts survive only as **legacy aliases/neighborhood labels** ("Quận 1", "Quận 3") because users still search that way. Locations are versioned (`valid_from`/`valid_to`, `replaced_by`) for future reforms. Salons store commune + geo point; legacy district is derived for display/search. |
| G5 | "Use PostgreSQL full-text search" — Postgres has no Vietnamese dictionary/stemmer; users type without diacritics ("nail quan 1", "goi dau"). | `simple` FTS config over an `unaccent`-normalized document (immutable wrapper; `đ→d` covered by unaccent rules) + `pg_trgm` for fuzzy/prefix and typo tolerance. Ranking = FTS rank + trigram similarity + quality signals. Re-evaluate Meilisearch/Typesense when p95 > 300 ms or catalog > 50k salons — behind a `SearchIndex` port so it's swappable. |
| G6 | "Available today/tomorrow/this week" filters would call the booking engine for every result → N×availability computation. | Booking engine (06) maintains a **precomputed availability summary** per salon (`next_available_at`, `has_slots_on[date]` for next 14 days) refreshed by BullMQ on booking/schedule change + periodic sweep. Search filters on the summary; exact slots fetched only on the profile. Summary is eventually consistent; UI copy says "likely available". |
| G7 | Search by "staff name" exposes staff PII. | Only staff with `public_profile = true` (display name + photo) are indexed. |
| G8 | "Open now" requires timezone + special hours + holidays. | Computed server-side in salon TZ (default Asia/Ho_Chi_Minh) from opening hours + special hours + holidays; cached per salon per 15 min. |
| G9 | Homepage list is long (12 blocks) and conflicts with "don't overload". | IA in §3.3: 6 blocks above footer on mobile; others are progressive/personalized. Recently viewed + recommended are client-hydrated (not in SSR HTML) to keep pages cacheable. |
| G10 | 3D hero vs SEO/LCP. | Hero ships a server-rendered H1, search bar, and a static poster image as LCP element; 3D canvas lazy-loads after hydration (contract with 02, §3.3). |
| G11 | URL scheme only partially defined (`/vi/salon/lotus-beauty`). Localized slugs? Category/location URLs? | Full URL scheme in §3.2. Path segments stay English-keyword constant across locales (`/vi/salon/…`, `/en/salon/…`); content slugs are unaccented Vietnamese (`/vi/c/nail/ho-chi-minh/phuong-ben-thanh`). Slug history table → 301 redirects on rename. |
| G12 | Canonical salon identifier vs slug — not specified how they relate. | Canonical id = UUID; public slug is unique per platform and mutable with history; `gugu.vn/s/{shortId}` short links for QR/sharing redirect to the canonical localized URL. Subdomains (`lotus.gugu.vn`) later = 301 to canonical path; never the canonical. |
| G13 | Locale detection for `/` root not defined; risk of cloaking. | `/` → 302 to `/vi` or `/en` by persisted cookie, then `Accept-Language`, default `vi`. Crawlers get the same logic; every page carries hreflang + `x-default` → `/vi`. |
| G14 | Thin/duplicate content: category×location pages with 0 salons, filter permutations. | Category×location pages are indexable only if ≥ N (config, default 3) published salons; filter/sort query params are `noindex, follow` with canonical to the clean path. |
| G15 | Reviews structured data — Google restricts self-serving review snippets for LocalBusiness. | Emit `aggregateRating` only from GuGu-collected verified reviews (booking-linked, so not self-serving by the business); never emit when count < 3. Keep it behind a flag so it can be turned off. |
| G16 | No GEO/AI discoverability. | `llms.txt` + `llms-full.txt` (top cities/categories/how booking works), clean semantic HTML, complete JSON-LD (`BeautySalon`/`HairSalon`/`NailSalon`/`DaySpa`, `OfferCatalog`), stable facts block (address, hours, price range, "pay at salon"). Robots policy for AI crawlers is a product-owner decision (open question). |
| G17 | Web performance targets missing. | Budgets in §3.7 (LCP, INP, CLS, JS size) on a mid-range Android over 4G. |
| G18 | Map browsing: no provider chosen; Google Maps cost; RN-web support. | Map is a progressive enhancement: list-first. Web: MapLibre GL + vector tiles (self-hosted/OpenFreeMap or MapTiler); native: `react-native-maps` (or MapLibre RN) via `.web.tsx`/`.native.tsx` split. Geocoding provider behind a port (candidates: Google, VietMap, Goong — Vietnam-specific address quality). Decision needed. |
| G19 | Promotions/editorial/trending have no data source. | Editorial: simple CMS-in-admin (12) with localized articles, or markdown in repo for MVP. Promotions: salon-created offers (07) shown only if active. Trending: derived from search/booking events (12), cold-start = curated. |

---

## 3. Refined requirements

### 3.1 Route tree (Expo Router, `apps/app/app`)
```
[locale]/(public)/
  index.tsx                          home
  c/[category]/index.tsx             category (country-wide)
  c/[category]/[province]/index.tsx  category × province
  c/[category]/[province]/[commune]  category × commune (index only if ≥N salons)
  l/[province]/index.tsx             location hub
  search.tsx                         search results (noindex when params beyond q/category/location)
  salon/[slug]/index.tsx             salon profile (tabs as sections, not separate routes)
  salon/[slug]/services/[serviceSlug].tsx  service page
  salon/[slug]/reviews.tsx           paginated reviews (indexable page 1)
  blog/[slug].tsx, blog/index.tsx    editorial
  for-business.tsx, about.tsx, terms.tsx, privacy.tsx
+html.tsx, +not-found.tsx
api/ (Expo API routes only for: sitemap.xml, robots.txt, llms.txt, og image rendering) — business data always from NestJS.
```
- `[locale]` validated against `packages/localization` supported list; unknown → 404.
- Each public route exports `loader` (data via `packages/api-client` server-side) and `generateMetadata`.

### 3.2 URL scheme
| Page | vi | en |
|---|---|---|
| Home | `/vi` | `/en` |
| Category | `/vi/c/nail` | `/en/c/nail` |
| Category × place | `/vi/c/nail/ho-chi-minh/phuong-sai-gon` | same slugs |
| Salon | `/vi/salon/lotus-beauty` | `/en/salon/lotus-beauty` |
| Service | `/vi/salon/lotus-beauty/services/son-gel` | `/en/salon/lotus-beauty/services/son-gel` |
| Short link | `/s/{shortId}` → 302 to localized canonical | |
- Category slugs are stable keys from DB (`ServiceCategory.slug`), localized names only in content.
- Slugs: lowercase, unaccented, `đ→d`, hyphenated, ≤ 60 chars; uniqueness enforced in DB; history in `slug_redirects` → 301.
- These paths are the contract for universal links/app links (13): every public URL must resolve to a native screen.

### 3.3 Homepage IA (mobile order; desktop = 12-col grid, same order)
1. **Hero** (02 owns visuals): H1 (localized, SSR text), search bar (service/salon) + location chip, 3–5 category quick chips. Poster image is LCP; 3D scene lazy-mounted after `requestIdleCallback`, skipped on `prefers-reduced-motion`, `saveData`, low-memory devices, and native (native gets poster/video per 02).
2. **Categories** row (from DB, ordered by admin).
3. **Near you / Popular in {city}** — salon cards (SSR for city from cookie or default HCMC).
4. **Trending services** — service cards with price-from.
5. **Featured salons** (curated/promoted slot — labelled "Sponsored" when promoted, per 12).
6. **Popular neighborhoods** — links to category×location hubs (also internal linking for SEO).
7. Client-only, below fold: Recently viewed (local storage), Recommended (if signed in), Promotions, Editorial.
8. Footer: locale switch, city links, categories, for-business, legal.
- Mobile: bottom tab bar (Explore, Search, Bookings, Favorites, Profile). Desktop: top nav with search collapsed into header after scroll.

### 3.4 Search
- **Inputs**: `q` (salon/service/staff/address text), `category`, `province`, `commune`, `lat,lng,radius`, `bbox` (map), filters: price min/max (VND), rating ≥, distance ≤, availability (`today|tomorrow|week`), open now, duration bucket, staff gender/preference (only if salons opt in), verified.
- **Sort**: recommended (default), rating, distance (only with geo), price asc/desc, popularity.
- **Pagination**: keyset/cursor for infinite scroll (API), page numbers in SSR URLs for crawlable listing pages (`?page=2`, canonical self).
- **Autosuggest** endpoint: top salons, services, categories, places for prefix; ≤ 100 ms p95 server time; diacritic-insensitive (`"goi"` matches "Gội").
- **Recommended** score = weighted(text relevance, rating Bayesian avg, review count, distance decay, availability soon, profile completeness, verified, response/reliability metrics from 12) + promoted boost hook (capped, labelled).
- URL ⇄ filter state is bidirectional (browser history, sharing, deep link).
- Works without location permission: falls back to selected city, then default (Hồ Chí Minh).
- Empty state suggests broader area/removing filters; error state retriable; skeletons for loading.

### 3.5 Location model (requirements to 04)
- `Location` tree: `country` → `province` (34 units) → `commune` (xã/phường/đặc khu), each with `code` (official GSO/administrative code), `name_vi`, `name_en` (unaccented fallback), `slug`, `type`, `centroid geography(Point)`, optional `boundary geography(MultiPolygon)`, `valid_from`, `valid_to`, `replaced_by_id[]`.
- `LocationAlias`: legacy names (pre-2025 districts, old provinces, "Sài Gòn", "Q1") → mapped to provinces/communes or to a bounding polygon; used by search and slug redirects.
- `Neighborhood` (optional, curated): popular areas not matching admin units (e.g. "Thảo Điền").
- Seed from an authoritative dataset (open question: source + licence); admin can edit (12).
- Salon address: `province_id`, `commune_id`, street line, `geo geography(Point,4326)`, `geocode_source`, `geocode_confidence`.

### 3.6 Salon profile (public)
- Sections: header (name, logo, cover, verified badge, rating, review count, price range, open-now), gallery, services (grouped by category, variants, price/price range, duration), staff (public only), about, amenities, map + address + directions link, opening hours (incl. special hours), cancellation policy, reviews (approved), "Pay at the salon" notice, sticky Book CTA, share button.
- Only `published` and not `suspended` salons are public; suspended → 410 or 404 (decision: 404 + `noindex`).
- Live availability is client-fetched (not cached in HTML).
- Service page: unique content (description, variants, duration, price, staff who perform it, salon context) for long-tail SEO.

### 3.7 Web quality & performance
- Core Web Vitals on Moto G-class device / 4G: **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1** at p75.
- Public route initial JS ≤ 250 KB gzip (excluding lazily loaded 3D bundle); images via CDN with AVIF/WebP, `srcset`, explicit dimensions.
- Cache: public HTML `s-maxage=300, stale-while-revalidate=86400` at Cloudflare, purged on salon publish/update via tag/URL purge.
- Keyboard: all interactive elements focusable, visible focus, skip-to-content link, filter panel operable by keyboard, Esc closes sheets.

### 3.8 SEO deliverables
- `generateMetadata` on every public route: localized title (≤ 60 chars) and description (≤ 155), canonical absolute URL, `alternates` vi/en + `x-default`, Open Graph + Twitter card, robots directives.
- JSON-LD: `WebSite` + `SearchAction` (home), `Organization` (home), `BreadcrumbList` (all), salon: most specific `LocalBusiness` subtype + `PostalAddress` + `GeoCoordinates` + `openingHoursSpecification` + `priceRange` + `hasOfferCatalog` + `aggregateRating` (rules G15) + `paymentAccepted: "Cash, bank transfer"` (as configured by salon); service: `Service` + `Offer` (`priceCurrency: VND`).
- Sitemaps: index → `sitemap-static.xml`, `sitemap-categories.xml`, `sitemap-locations.xml`, `sitemap-salons-{n}.xml` (≤ 50k URLs each), each entry with `xhtml:link` alternates and `lastmod`. Generated from API, cached 1 h.
- `robots.txt`: disallow `/*/(customer|business|staff|admin)`, `/api/`, search with params; sitemap link; AI crawler rules per product decision.
- OG images: dynamic per salon (cover + name + rating) rendered by API route, cached at CDN.
- `llms.txt` at root summarising GuGu, key hubs, and how to book.

### 3.9 Sharing
- Share sheet (native) / Web Share API with copy-link fallback; shared URL = canonical localized URL with `utm_source`/`ref` param for attribution (12 consumes `acquisition_source = direct_link|social_media`).
- QR codes per salon resolve to `/s/{shortId}?src=qr`.

---

## 4. Proposed technical approach

### 4.1 Rendering
- Expo SDK ≥ 58, `web.output: "server"`, `+html.tsx` spreading `useServerDocumentContext` nodes; `generateMetadata` for head tags (earliest bytes), `<Head>` only for post-hydration updates.
- Hosting: `expo export --platform web` → `dist/server` run by the Node/Express adapter in a Docker container (same infra as API, see 13) behind Cloudflare; Cloudflare Workers adapter / EAS Hosting are alternatives (decision in 13).
- Loaders call NestJS through `packages/api-client` with a server-only base URL and a public service token; they must not leak user tokens into cached HTML.
- Authenticated groups: layout guards render a client-only shell; middleware sets `noindex` + `private` cache.
- **Spike S1** (first sub-milestone): prove SSR + loaders + metadata + hydration with NativeWind + react-native-web + i18n on SDK 58; measure TTFB and CWV. Exit criteria → keep server mode; otherwise switch to fallback F1 (static + `generateStaticParams` + rebuild on publish) and F2 worker for long tail.

### 4.2 Search implementation
- Read model table `salon_search` (denormalised, one row per published salon): ids, names (vi/en), unaccented names, service names, category ids, staff public names, address text, province/commune ids + legacy alias ids, `geo geography(Point)`, price_min/max, rating_avg, rating_bayes, review_count, popularity, verified, promoted_weight, availability summary columns, `search_doc tsvector`.
- Indexes: GIN on `search_doc`; GIN `gin_trgm_ops` on unaccented name + services text; GiST on `geo`; btree on (province_id, category ids via GIN array), rating, price_min.
- Normalisation: `immutable_unaccent(lower(text))` wrapper function (unaccent is only STABLE; needed for index expressions); same function applied to queries in NestJS (`packages/domain` provides a JS equivalent for slugs & client-side highlighting; parity test).
- Geo: `ST_DWithin(geo, ST_MakePoint(lng,lat)::geography, radius_m)` + `ST_Distance` for sort; bbox via `ST_MakeEnvelope`.
- Maintained by BullMQ projector jobs on domain events (`salon.updated`, `service.updated`, `review.approved`, `availability.summary.changed`) + nightly full rebuild; Redis cache for hot queries (home blocks, autosuggest) 60–300 s.
- `SearchIndex` port in NestJS `search` module → `PostgresSearchIndex` now, external engine later.

### 4.3 Location data
- Seed migration from official 2025 two-tier dataset + alias table for old districts/provinces; geocoding via provider port; boundary polygons optional (for "salons in phường X" accuracy fall back to commune_id assignment).

### 4.4 Map
- List-first; map toggle. `Map.web.tsx` (MapLibre GL JS, lazy chunk) / `Map.native.tsx` (react-native-maps or MapLibre RN). Shared clustering + viewport logic in `features/search`.

---

## 5. Acceptance criteria
1. `curl -A Googlebot https://<staging>/vi/salon/<slug>` returns HTML containing the salon name in `<h1>`, `<title>`, meta description, canonical, hreflang vi/en/x-default, OG tags, and valid JSON-LD (passes Google Rich Results Test and schema.org validator) — without executing JS.
2. Same for `/en/...` with English UI text and identical canonical structure.
3. Authenticated routes return `X-Robots-Tag: noindex` and `Cache-Control: private` and contain no user data in server HTML.
4. Search "nail quan 1" (no diacritics) returns salons in former District 1 communes (e.g. phường Sài Gòn, Bến Thành, Tân Định) ranked above others; "gội đầu" and "goi dau" return the same result set (integration test with seeded data).
5. Radius search 2 km around a point returns only salons within 2 km (PostGIS test), sorted by distance when `sort=nearest`.
6. Search p95 ≤ 300 ms server time on a 10k-salon synthetic dataset; autosuggest p95 ≤ 100 ms; EXPLAIN shows index usage (no seq scan on `salon_search`).
7. Filters/sort/page are reflected in the URL; back/forward restores state; shared URL reproduces results.
8. Sitemap index validates; every published salon appears in exactly one salon sitemap with both locale alternates; unpublished/suspended salons never appear.
9. Renamed salon slug 301-redirects old URL to new; `/s/{shortId}` redirects to canonical.
10. Category×commune page with < N salons renders with `noindex`.
11. Homepage Lighthouse (mobile, throttled) on staging: LCP ≤ 2.5 s, CLS ≤ 0.1, with 3D hero enabled; 3D bundle not requested when `prefers-reduced-motion: reduce`.
12. All public UI strings come from localization resources (i18n coverage test from 03 passes for `public` namespace).
13. Platform works with location permission denied (falls back to city selector) — Playwright test.
14. Keyboard-only Playwright test can search, filter, open a salon, and reach the Book CTA.
15. `llms.txt` served at root; robots.txt matches policy.

## 6. Dependencies
- **01** SDK 58 + server output decision, monorepo, api-client. **02** hero visuals, tokens, card components, poster asset contract. **03** locale routing helpers, slug/date/VND formatting, translation namespaces (`public`, `search`, `salon`). **04** schema: Location (two-tier + aliases + versioning), salon_search read model, slug_redirects, PostGIS/pg_trgm/unaccent extensions. **06** availability summary projection + exact slot API. **07** salon publishing, profile data, promotions. **11** reviews (approved only) + favorites. **12** taxonomy/location admin, promoted listings, attribution of shares/QR, analytics events (`search_performed`, `salon_viewed`, `service_viewed`). **13** hosting of SSR server, Cloudflare caching/purge, universal links files matching §3.2, Playwright/Lighthouse CI. **08** read-only tools (§9).

## 7. Suggested sub-milestones
1. **S1 spike**: SSR on SDK 58 with NativeWind + i18n + loaders + generateMetadata; decide server vs fallback (ADR).
2. Location seed (two-tier + aliases) + slug utilities + URL scheme constants in `packages/domain`.
3. `salon_search` read model + projector + Postgres search + autosuggest + tests (AC 4–6).
4. Salon profile + service page (SSR, metadata, JSON-LD) using seeded real-shaped data.
5. Search results UI (list, filters, URL state) + category & location hubs.
6. Homepage IA with placeholder hero slot (poster), then integrate 02's 3D hero.
7. Sitemaps, robots, llms.txt, OG images, redirects, cache headers + purge.
8. Map view (web/native split).
9. Performance + a11y pass, Lighthouse CI budgets, Playwright suites (AC 1–15).

## 8. AI-first deliverables
- `.claude/agents/marketplace-seo.md` — owns `apps/app/app/[locale]/(public)/**`, `apps/app/features/{search,salon-public,home}/**`, `apps/api/src/modules/search/**`, SEO API routes.
- `.claude/skills/seo-page/SKILL.md` — procedure for any public route (metadata, canonical, hreflang, JSON-LD, sitemap, cache, noindex rules).
- `.claude/skills/search/SKILL.md` — normalisation, read-model changes, index rules, adding a filter/sort, perf checks.
- `docs/domains/marketplace-seo.md` — durable domain doc (skeleton now).
- ADRs to write during implementation: `adr/xxxx-expo-server-output.md`, `adr/xxxx-postgres-search-vietnamese.md`, `adr/xxxx-two-tier-location-model.md`, `adr/xxxx-map-provider.md`.
- Glossary entries (vi/en): tỉnh/thành phố, xã/phường/đặc khu, legacy quận, salon slug, short link.

## 9. Product AI-agent surface
Read-only, public data; used by the future customer AI concierge and (limited) by the salon agent (08) for competitive context. All via the same NestJS search service — no separate data path.

| Tool | Input (Zod) | Output | Permission | Scope | R/W |
|---|---|---|---|---|---|
| `marketplace.search_salons` | q?, category?, location (province/commune/lat-lng-radius)?, filters?, sort?, cursor? | salon cards (id, slug, name, rating, price range, distance, next_available_at, url) | public | public published salons | R |
| `marketplace.get_salon_profile` | salon id or slug, locale | public profile (no internal notes, no non-public staff) | public | single salon | R |
| `marketplace.list_services` | salon id, category? | services + variants + price/duration | public | single salon | R |
| `marketplace.suggest` | prefix, locale | suggestions | public | public | R |
| `marketplace.resolve_location` | free text ("quận 1", "Thảo Điền") | province/commune ids + confidence | public | public | R |
| `marketplace.get_availability_summary` | salon id, date range | per-day has-slots (summary, not exact) | public | single salon | R |
Booking actions are not exposed here; concierge hands off to the booking flow (06/11), which requires verified phone and explicit user confirmation. Review text and salon descriptions are untrusted content for the agent.

## 10. Open questions for the product owner
1. Launch cities: Hồ Chí Minh + Hà Nội only, or nationwide index from day 1? (affects seed + sitemap scope)
2. Geocoding/maps provider: Google (quality, cost) vs VietMap/Goong (local) vs MapLibre + OSM? Budget?
3. AI crawler policy: allow GPTBot/ClaudeBot/PerplexityBot/Google-Extended for GEO visibility, or block? (Recommendation: allow on public pages.)
4. Show `aggregateRating` in structured data from launch? (Recommendation: yes, flag-guarded, min 3 reviews.)
5. Should category×location pages target legacy district names in titles ("Nail Quận 1") for search demand, alongside new phường names? (Recommendation: yes, as secondary label.)
6. Editorial content: in-admin CMS (12) or repo markdown for MVP?
7. Promoted listings in search results at launch, or only later? (Affects ranking + "Sponsored" label.)
8. Hosting choice for SSR server: own Node container (alongside API) vs Cloudflare Workers vs EAS Hosting (coordinate with 13).
