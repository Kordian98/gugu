---
name: seo-page
description: Procedure for creating or changing any public, indexable GuGu web route in apps/app/app/[locale]/(public)/ — loader, generateMetadata, canonical, hreflang, Open Graph, JSON-LD, sitemap entry, cache headers, noindex rules. Use whenever adding a public page, renaming a slug, or touching +html.tsx, sitemaps, robots.txt or llms.txt.
---

# SEO page procedure

GuGu web runs Expo Router with `web.output: "server"` (SDK ≥ 58). Public pages are server-rendered and CDN-cached; authenticated pages are client-only shells. Spec: `docs/tasks/10-marketplace-seo.md` §3–4.

## When to use
- New file under `apps/app/app/[locale]/(public)/`
- Changing a public URL, slug rule, or redirect
- Editing `+html.tsx`, sitemap/robots/llms.txt/OG API routes, or JSON-LD helpers

## Invariants
- MUST render the primary content (H1, key facts) in server HTML — check with JS disabled.
- MUST export `generateMetadata`; use `<Head>` only for updates after hydration.
- MUST produce absolute canonical URLs on `https://gugu.vn/{locale}/...`; query params for filters/sort → canonical to the clean path + `noindex, follow`. Pagination `?page=n` → self-canonical.
- MUST emit hreflang alternates for every supported locale + `x-default` → `/vi/...`.
- MUST NOT include user-specific data in server HTML (no cookies-based personalisation in loaders except locale and selected city).
- MUST keep URL path keywords locale-independent (`/c/`, `/salon/`, `/services/`); slugs are unaccented, lowercase, hyphenated, `đ→d`, ≤ 60 chars.
- MUST create a `slug_redirects` row (301) when a slug changes.
- MUST NOT index thin pages: category×location with < `SEO_MIN_SALONS` (default 3) published salons → `noindex`.
- Titles on category×location pages include the legacy district name as a secondary label when an alias exists ("Nail Quận 1 · P. Bến Thành, TP.HCM").
- robots.txt allows AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) on public pages (owner decision q43).
- Light theme only (X18): `+html.tsx` sets `<meta name="color-scheme" content="light">`; no dark variants on public routes.
- All strings via localization (`public`, `salon`, `search` namespaces). Titles ≤ 60 chars, descriptions ≤ 155.

## Procedure: add a public route
1. Create the route file under `(public)`; validate `[locale]` with the localization helper (unknown → `+not-found`).
2. Add a `loader` that fetches via `packages/api-client` (server base URL, public token). Throw a not-found response for unpublished/suspended entities.
3. Export `generateMetadata({ params, data })` using the shared `buildMetadata()` helper:
   - `title`, `description` (localized, interpolated, truncated)
   - `canonical`, `alternates.languages` (vi, en, x-default)
   - `openGraph` (type, url, title, description, image ≥ 1200×630, locale `vi_VN`/`en_US`), `twitter.card = summary_large_image`
   - `robots` per invariants
4. Add JSON-LD with the typed builders in `features/salon-public/seo/jsonld.ts` (or equivalent): always `BreadcrumbList`; plus page-specific type (see table). Render as `<script type="application/ld+json">` in server output.
5. Set the cache policy: public → `s-maxage=300, stale-while-revalidate=86400`.
   - Register the URL in the purge map so a salon publish invalidates it: CloudFront path invalidation or Cloudflare URL purge, batched by the purge job.
   - Never vary on auth cookies. Only the home page varies by the `gugu_city` cookie.
6. Add the URL family to the sitemap generator (correct sitemap file, `lastmod`, `xhtml:link` alternates).
7. Add internal links (breadcrumbs, related categories/locations) — no orphan pages.
8. If the route has a native screen, confirm the path is in the universal/app links config (topic 13).
9. Tests: Playwright SSR test (fetch HTML without JS → assert H1, title, canonical, hreflang, JSON-LD parses), plus both locales.

## JSON-LD by page
| Page | Types |
|---|---|
| Home | `WebSite` + `SearchAction`, `Organization` |
| Category / location hub | `CollectionPage`, `ItemList` of salons (top 20), `BreadcrumbList` |
| Salon | most specific of `NailSalon`/`HairSalon`/`BeautySalon`/`DaySpa`/`HealthAndBeautyBusiness`; `PostalAddress`, `GeoCoordinates`, `openingHoursSpecification`, `priceRange`, `hasOfferCatalog`, `aggregateRating` only if ≥ 3 verified reviews and flag `seo.aggregateRating` on |
| Service | `Service` with `provider` (salon) + `Offer` (`priceCurrency: "VND"`, price or `priceSpecification` min/max) |
| Article | `Article`, `BreadcrumbList` |

## Checklist before PR
- [ ] Page renders correct content with JS disabled (vi and en)
- [ ] Title/description present, localized, within length
- [ ] Canonical + hreflang (vi, en, x-default) correct and absolute
- [ ] JSON-LD validates (schema.org validator / Rich Results Test)
- [ ] Cache headers + purge tag set; no personal data in HTML
- [ ] Sitemap includes the URL family; robots rules unaffected or updated
- [ ] noindex rules applied for params/thin pages
- [ ] Lighthouse: LCP ≤ 2.5 s, CLS ≤ 0.1 on mobile throttling
- [ ] `docs/domains/marketplace-seo.md` route table updated
