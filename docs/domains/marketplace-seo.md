# Marketing site & SEO (domain doc)

The public face of gugu.vn: **GuGu Studio's own marketing pages** for salon owners (landing, features, pricing, marketplace announcement, FAQ, legal) and everything that makes them findable (SSR, metadata, structured data, sitemap, robots, llms.txt). Read this before touching public web routes. Task spec: `docs/tasks/10-marketplace-seo.md`. Agent: `.claude/agents/marketplace-seo.md`. Skill: `seo-page`.

> Status: skeleton. TODO sections get filled in as code lands.

## What gugu.vn does NOT show (owner decisions X21, X23)
- No salon pages, profiles, booking pages, availability widgets or custom-domain booking sites. These are **blocked pending Vietnamese legal review / VN company** (spec Appendix B; custom-domain notes in `.claude/skills/seo-page/references/custom-domain.md`).
- No search, directory, category/location hubs or salon listings. The marketplace comes **later, after a Vietnamese company** (spec Appendix C; skill `search` is deferred).
- No salon or customer data in pages, JSON-LD, sitemap, llms.txt or OG images.

## Rendering model
Expo Router, `web.output: "server"` (SDK ≥ 58) unless the S1 spike chooses static for the whole web app. Marketing routes are server-rendered and long-cached. App/auth routes are client-only, `noindex` and use a private cache. Decision: TODO (ADR link).

## Routes
| Page | Path |
|---|---|
| Landing | `/{locale}` |
| Features | `/{locale}/features`, `/{locale}/features/{feature}` |
| Pricing | `/{locale}/pricing` |
| Marketplace announcement | `/{locale}/marketplace` (X19 promise + X20 disclaimer) |
| FAQ, About, Contact | `/{locale}/faq`, `/about`, `/contact` |
| Legal | `/{locale}/legal/{terms|privacy|cookies}` |
Reserved for the future (do not reuse): `/{locale}/salon/*`, `/{locale}/c/*`, `/{locale}/l/*`, `/{locale}/search`, `/s/*`, single-segment salon slugs.

## Invariants
- Only `(marketing)` routes are indexable and in the sitemap.
- Copy shows only in-scope features; no invented stats or testimonials; no legal-compliance claims; disclaimer on marketplace content.
- The landing story ends with an in-app Zalo/email message to a customer, never a GuGu booking page.
- Light theme only (X18). All strings in the `marketing` namespace.

## File map
TODO: `(marketing)` routes, `features/marketing/content/*`, metadata/JSON-LD helpers, SEO API routes, OG template.

## Product AI-agent tools
None (no tenant data). Deferred marketplace tools: spec Appendix C §9.

## ADRs
TODO: expo-web-output (S1). Parked: postgres-search-vietnamese, two-tier-location-model, map-provider (OSM), custom-domains.
