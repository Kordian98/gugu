---
name: seo-page
description: Procedure for creating or changing any public, indexable page of the GuGu Studio marketing site on gugu.vn (apps/app/app/[locale]/(marketing)/) — loader/content, generateMetadata, canonical, hreflang, Open Graph, JSON-LD, sitemap entry, robots, llms.txt, cache headers, noindex rules, copy/claims checks. Use whenever adding a marketing page, renaming its slug, or touching +html.tsx, sitemap, robots.txt, llms.txt or OG image routes.
---

# SEO page procedure (marketing site)

gugu.vn publicly shows only GuGu Studio's own marketing pages. **No salon pages, booking pages, listings or search** (owner decision X23; designs parked in `docs/tasks/10-marketplace-seo.md` Appendices B/C). The web app uses Expo Router (`web.output: "server"` unless the S1 spike says static). Spec: `docs/tasks/10-marketplace-seo.md` §3.

## When to use
- A new page under `apps/app/app/[locale]/(marketing)/`
- Changing a marketing URL or redirect
- Editing `+html.tsx`, sitemap/robots/llms.txt/OG routes, or JSON-LD helpers

## Invariants
- MUST render H1, headings and story text in server HTML. Check with JS disabled.
- MUST export `generateMetadata`. Use `<Head>` only for updates after hydration.
- MUST use absolute canonical URLs `https://gugu.vn/{locale}/...`, with hreflang vi, en and `x-default` → `/vi/...`.
- Only `(marketing)` routes are indexable and listed in the sitemap. Everything else gets `noindex` + a robots disallow.
- MUST NOT put salon/customer data, booking links or `LocalBusiness`/review markup on any page.
- Titles follow "{Page} – GuGu Studio", ≤ 60 chars. Descriptions ≤ 155 chars. All strings come from the `marketing` namespace.
- Light theme only (X18): `+html.tsx` sets `<meta name="color-scheme" content="light">`.
- robots.txt allows AI crawlers on marketing pages (q43).
- Copy rules: only in-scope features; no invented numbers, logos or testimonials; no legal-compliance claims; marketplace content carries the X20 disclaimer.

## Procedure: add a marketing page
1. Add the route under `(marketing)`; validate `[locale]` (unknown → `+not-found`).
2. Add or extend its typed content module in `features/marketing/content/` (i18n keys + asset keys). Nav, sitemap and footer read from the same list.
3. Export `generateMetadata` via `buildMetadata()`: title, description, canonical, `alternates.languages`, `openGraph` (image 1200×630 per locale from the `og/*` route), `twitter.card = summary_large_image`, robots.
4. Add JSON-LD with the typed builders:
   | Page | Types |
   |---|---|
   | Landing | `Organization` (GuGu), `WebSite`, `SoftwareApplication` (GuGu Studio), `FAQPage` if FAQ present |
   | Features / feature | `BreadcrumbList`, `SoftwareApplication` reference |
   | Pricing | `BreadcrumbList`, `SoftwareApplication` with `offers` only when prices are published |
   | FAQ | `FAQPage`, `BreadcrumbList` |
   | Marketplace announcement, about, legal | `BreadcrumbList` |
5. Cache policy (when deployed): `s-maxage=3600, stale-while-revalidate=86400`. Never vary on auth cookies.
6. Make sure the sitemap generator includes the route (both locales, alternates, `lastmod`) and `llms.txt` mentions it if relevant.
7. Tests: Playwright SSR check (HTML without JS → H1, title, canonical, hreflang, JSON-LD parses) in vi and en; Lighthouse budget for heavy pages.

## Checklist before PR
- [ ] Content correct with JS disabled (vi and en)
- [ ] Title and description localized and within length
- [ ] Canonical + hreflang correct and absolute
- [ ] JSON-LD validates; no LocalBusiness/review/salon data
- [ ] Sitemap and robots correct; non-marketing routes stay noindex
- [ ] Copy checklist: in-scope features only, no fake stats, disclaimer on marketplace copy, no gugu.vn booking URLs in visuals
- [ ] Lighthouse: LCP ≤ 2.5 s, CLS ≤ 0.1, initial JS ≤ 200 KB gzip
- [ ] `docs/domains/marketplace-seo.md` route table updated

## References
- `references/custom-domain.md` — parked design for salon custom domains (**blocked**, X23). Do not implement.
