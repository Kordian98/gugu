# 10 — GuGu Studio marketing site & SEO (marketplace and customer booking surfaces: blocked/later)

> Status: refined spec, no code yet. Owner agent: `.claude/agents/marketplace-seo.md` (name kept for continuity). Skills: `.claude/skills/seo-page/` (active), `.claude/skills/search/` (deferred). Domain doc: `docs/domains/marketplace-seo.md`.
> Governing owner decisions (`docs/tasks/00-roadmap.md`): **X23** (no public salon pages on gugu.vn), **X22** (GuGu Studio brand + scroll-storytelling landing), X19/X20 (SaaS first, marketplace announced with disclaimer), X18 (light theme only), X16 (localhost only for now), X14 (in-house analytics), X13 (SaaS first).
> Revision 2026-11-02 (rev 4): scope reduced to the marketing site. The earlier booking-page and marketplace designs are kept as reference in Appendix B (**blocked pending Vietnamese legal review / VN company**) and Appendix C (**later, marketplace**). They are not to be built.

---

## 1. Scope

### In (near term)
The public marketing website of **GuGu Studio** on `gugu.vn`, for salon owners:
- Landing page (X22 scroll-storytelling: dive into the living salon diorama; manual way (Zalo chats, paper notebook) vs GuGu Studio; ends with the salon sending availability/confirmation messages to a customer, generated in the app — **not** a GuGu-hosted booking page, per X23).
- Supporting pages: Features (overview + per-feature sections or pages), Pricing (plans from 12), AI setup ("effortless AI setup"), FAQ, About/Contact, Marketplace announcement (X19/X20 copy + disclaimer), legal pages (terms, privacy, cookies).
- SEO for those pages only: rendering, metadata, canonical, hreflang vi/en, Open Graph/Twitter images, JSON-LD, sitemap, robots.txt, `llms.txt`, redirects, 404.
- Conversion entry points: "Start free" / "Book a demo" / "Sign in" → app auth routes (05, 07). Lead capture form (optional, see §3.6).
- Web quality: performance budgets for the storytelling page, accessibility, light theme only.
- Marketing analytics events (in-house, X14) with consent.

### Out
- **Blocked pending Vietnamese legal review / VN company (X23):** any customer-facing booking surface: salon profile or booking page on `gugu.vn/<slug>`, booking pages on salons' own domains, public availability widgets, customer self-service booking flow, guest manage-booking pages, customer reviews display. Design reference kept in **Appendix B**.
- **Later, marketplace (after VN company):** discovery homepage, search, category/location hubs, salon listings, map, marketplace SEO and AI concierge. Design reference kept in **Appendix C**.
- Visual design, motion, diorama/hero production and real CRM screenshot pipeline → **02** (with 07 for screenshots). This topic owns page structure, copy slots, SEO and performance contracts.
- Plans/prices content → **12**; auth/sign-up → **05**; app (business) routes → **07**; hosting/CDN → **13**; copy translation quality → **03**.

---

## 2. Gap analysis (rev 4)

| # | Gap / issue | Decision |
|---|---|---|
| M1 | Master prompt §7–9, §20 assume a public marketplace with SEO for salons/services; X21 then X23 remove all public salon pages. | Near-term SEO covers **marketing pages only**. No salon names, services, prices or availability are published on gugu.vn. Everything salon-public is Appendix B/C. |
| M2 | The landing story (X22) ends with "the salon sends its booking page"; X23 forbids GuGu-hosted booking pages. | Ending changed: the salon sends a **message generated in GuGu Studio** (available times / booking confirmation via Zalo or email, 07/09/11). No URL to a GuGu booking page appears in screenshots or copy. Coordinate with 02. |
| M3 | Marketing claims risk: features out of scope (payments, SMS marketing), fake stats/testimonials, legal-compliance claims, and marketplace promises. | Copy rules (§3.5): only shipped or explicitly roadmap-labelled features; no invented numbers or testimonials; no "compliant with PDPL/Law X" claims; marketplace copy carries the X20 disclaimer verbatim from 03/legal. |
| M4 | The scroll-storytelling hero is heavy (video/image sequences) vs mobile 4G in Vietnam and SEO (LCP, CLS). | Budgets in §3.4: the H1 and first story frame are server-rendered; sequences are streamed and lazy; reduced-motion and data-saver get a static storyboard version; the story is also told in semantic text for crawlers and screen readers. |
| M5 | Real CRM screenshots (X22) change as the CRM evolves; stale or fake screenshots mislead. | Screenshots come from the automated capture pipeline (02/07). Pages reference them by stable asset keys with localized alt text and vi/en variants. |
| M6 | Expo `web.output: "server"` vs static: marketing pages are static by nature, but the same project also serves the app. | Keep the S1 spike: the server output with long CDN caching gives the same SEO as static. If S1 fails, fall back to static output for the whole web app (marketing pages prerendered, app routes client-only). Expo cannot mix modes. |
| M7 | Indexing boundaries: app routes, auth pages, and any future salon-specific URLs must never be indexed. | Allow-list approach: only routes in the `(marketing)` group are indexable and in the sitemap. Everything else sends `X-Robots-Tag: noindex` and is disallowed in robots.txt. |
| M8 | Hosting: localhost only (X16); the AWS Singapore + CDN design is a later milestone. | Specs keep cache headers and purge behaviour, but there are no deployment tasks now. |
| M9 | SEO value of the brand: the "GuGu Studio" name vs the existing "gugu" consumer brand. | Titles use "GuGu Studio"; `Organization` = GuGu, `SoftwareApplication` = GuGu Studio. |

---

## 3. Refined requirements

### 3.1 Route tree (Expo Router, `apps/app/app`)
```
[locale]/(marketing)/
  index.tsx              landing (scroll storytelling)
  features/index.tsx     features overview
  features/[feature].tsx calendar, clients, team, ai-setup, ai-assistant, insights, zalo, reminders… (from a typed list)
  pricing.tsx
  marketplace.tsx        future marketplace announcement + disclaimer (X19/X20)
  faq.tsx
  about.tsx, contact.tsx
  legal/[doc].tsx        terms, privacy, cookies
+html.tsx, +not-found.tsx
api/ (Expo API routes: sitemap.xml, robots.txt, llms.txt, og/[page].png)
```
- `/` → 302 to `/vi` or `/en` (cookie, then `Accept-Language`, default `vi`).
- App routes (`(business)`, `(staff)`, `(admin)`, auth) are outside `(marketing)`: client-only, `noindex`, `private` cache.
- Reserved for the future (do not use for marketing slugs): `/[locale]/salon/*`, `/[locale]/c/*`, `/[locale]/l/*`, `/[locale]/search`, `/s/*`, and top-level single-segment slugs (Appendix B/C).

### 3.2 Landing page structure (content contract with 02)
Visual reference: `design/landing-references/` (ref-01-hero, ref-02-full) and `design/hero-references/`; followed loosely, not 1:1 (X22).
| # | Chapter | Content | Render |
|---|---|---|---|
| L0 | Header | GuGu logo + "Studio", nav (Features, Pricing, AI setup, Marketplace), Sign in, **Start free** | SSR |
| L1 | Hero | H1 + subtitle + CTAs (Start free / See how it works) + first diorama frame (poster) | SSR text + poster; motion client-side |
| L2 | Dive in | scroll zoom into the living salon (people working) | client sequence, SSR caption text |
| L3 | The manual way | Zalo chat chaos, paper notebook, missed calls, double bookings | SSR text + client visuals |
| L4 | GuGu Studio way | real CRM screenshots: Today, calendar, clients, AI setup from price-list photo, reminders | SSR text + responsive images |
| L5 | AI | "effortless AI setup" (every plan) + AI assistant (Pro) | SSR |
| L6 | Send to customer | the salon sends availability/confirmation as a Zalo/email message generated in the app (M2) | SSR text + visual |
| L7 | Pricing teaser | plans from 12 (only when prices are final; otherwise "Pricing coming soon") | SSR |
| L8 | Marketplace announcement | X19 promise + X20 disclaimer | SSR |
| L9 | FAQ + final CTA | | SSR, `FAQPage` JSON-LD |
| F | Footer | locale switch, legal, contact | SSR |
- Mobile (360–430 px): same chapter order; the scroll sequence is shortened to key frames; sticky "Start free" button after L1.
- Every chapter has a semantic heading (H2) and a text paragraph that tells the story without the visuals (crawlers, screen readers, reduced-motion).

### 3.3 SEO deliverables (marketing pages only)
- `generateMetadata` on each page: localized title (≤ 60 chars, pattern "{Page} – GuGu Studio"), description (≤ 155), absolute canonical, hreflang vi/en/x-default (→ `/vi/...`), OG + Twitter `summary_large_image` (per-page OG images, vi/en), robots.
- JSON-LD: `Organization` (GuGu) + `WebSite` on landing; `SoftwareApplication` (name GuGu Studio, `applicationCategory: BusinessApplication`, `operatingSystem: Web, iOS, Android`, `offers` from plans when published); `FAQPage` on FAQ/landing FAQ; `BreadcrumbList` on inner pages. **No `LocalBusiness`, `aggregateRating`, review or salon data.**
- `sitemap.xml`: marketing routes only × locales with `xhtml:link` alternates and `lastmod`.
- `robots.txt`: allow `(marketing)` paths; disallow app/auth/api paths; AI crawlers allowed on marketing pages (q43); sitemap link.
- `llms.txt` (+ `llms-full.txt`): what GuGu Studio is, who it is for, features, AI setup, pricing link, FAQ, marketplace status with the disclaimer. **No salon data.**
- Redirects: trailing-slash normalisation; renamed marketing slugs → 301 (table in repo).
- 404 page localized, `noindex`.

### 3.4 Web quality & performance
- Light theme only (X18): `<meta name="color-scheme" content="light">`, forced `color-scheme: light`.
- Core Web Vitals on a Moto G-class device over 4G, at p75: **LCP ≤ 2.5 s (H1 or poster), INP ≤ 200 ms, CLS ≤ 0.1**.
- Initial JS on marketing pages ≤ 200 KB gzip, excluding lazily loaded story assets. Story media is streamed (video/sequence), never blocking hydration.
- Capability gating per the `3d-hero` skill (02): reduced motion, `saveData` and low-memory devices get the static storyboard.
- Images: AVIF/WebP, `srcset`, explicit dimensions, localized alt text.
- Accessibility: WCAG 2.2 AA, keyboard-reachable CTAs and nav, skip link, no scroll-jacking that traps keyboard or screen-reader users (the story advances with normal scroll).
- Cache (when deployed later): marketing HTML `s-maxage=3600, stale-while-revalidate=86400`; assets immutable.

### 3.5 Copy & claims rules
- All strings via localization (03), vi default; native-quality Vietnamese.
- Show only features in scope (no payments, no SMS marketing, X22); roadmap items are labelled "coming soon".
- No invented customer counts, logos or testimonials; social proof only from real, consented sources.
- No legal-compliance claims (e.g. "PDPL compliant"). The marketplace page and teaser use the X20 disclaimer text approved for 03/legal.
- No public salon names, prices or booking links in examples unless they come from fictional demo data clearly labelled as demo.

### 3.6 Conversion & analytics
- CTAs route to app sign-up / sign-in (05) with `?src=landing&cta=<id>`.
- Optional "Book a demo / talk to us" form (name, salon name, contact, Zalo/phone optional). It posts to the API with rate limiting and a bot check (Turnstile on `gugu.vn`, one hostname), and stores leads for admin (12). Consent text is included.
- Events (in-house, X14, consent-gated): `landing_viewed`, `landing_chapter_viewed` (chapter id), `cta_clicked`, `pricing_viewed`, `signup_started` — no PII.

---

## 4. Proposed technical approach
- Expo SDK ≥ 58, `web.output: "server"` (S1 spike decides; fallback static for the whole web app). `+html.tsx` spreads the `useServerDocumentContext` nodes; `generateMetadata` handles head tags.
- Marketing content: typed content modules per page in `apps/app/features/marketing/content/*` referencing i18n keys + asset keys. The feature list is typed so routes, sitemap and nav share one source.
- OG images: generated at build/request by an API route from a template (title + visual), cached.
- Localhost now (X16). Later deployment follows 13 (AWS ap-southeast-1 + Cloudflare/CloudFront).

## 5. Acceptance criteria
1. `curl` (no JS) of each marketing page in vi and en returns H1, title, description, canonical, hreflang vi/en/x-default, OG tags and valid JSON-LD (schema.org validator / Rich Results Test for `FAQPage` and `SoftwareApplication`).
2. App and auth routes return `X-Robots-Tag: noindex` and are absent from the sitemap. robots.txt disallows them.
3. The sitemap lists exactly the `(marketing)` routes × 2 locales with alternates.
4. `llms.txt` is served and contains no salon or customer data.
5. Landing Lighthouse (mobile, throttled): LCP ≤ 2.5 s, CLS ≤ 0.1, initial JS ≤ 200 KB gzip. With `prefers-reduced-motion` and `saveData`, no story video or sequence is requested.
6. At 360/390/430 px widths: no horizontal scroll, chapters in order, sticky CTA visible after the hero. A keyboard-only run reaches every CTA.
7. The i18n coverage test passes for the `marketing` namespace. No hardcoded strings.
8. A copy review checklist (§3.5) is signed off in the PR: no out-of-scope features, no fake stats, disclaimer present on marketplace content, no gugu.vn booking-page URLs in visuals.
9. The demo form, if built, rejects requests without a valid Turnstile token and is rate limited (integration test).

## 6. Dependencies
**01** SDK/rendering, monorepo. **02** visual design, storytelling motion, diorama assets, screenshot pipeline (with **07**). **03** `marketing` namespace, X20 disclaimer text, formatting. **05** sign-up/sign-in routes. **12** plans/prices, lead storage, analytics events. **13** later hosting, CDN, synthetic monitoring.

## 7. Suggested sub-milestones
1. S1 spike (SSR vs static on SDK 58) → ADR.
2. Marketing route group + content model + metadata/JSON-LD helpers + sitemap/robots/llms.txt.
3. Landing skeleton with SSR text chapters and the poster (works without motion).
4. Integrate 02's storytelling motion + real screenshots; performance and a11y pass.
5. Features, pricing, AI setup, marketplace announcement, FAQ, legal pages.
6. Demo form + analytics events (optional, after 12).

## 8. AI-first deliverables
- Agent `.claude/agents/marketplace-seo.md`: owns `apps/app/app/[locale]/(marketing)/**`, `apps/app/features/marketing/**`, `+html.tsx`, SEO API routes. Appendix B/C paths are frozen.
- Skill `seo-page` (marketing pages procedure + `references/custom-domain.md`, blocked). Skill `search` is marked deferred.
- Domain doc `docs/domains/marketplace-seo.md`.
- ADRs: `expo-web-output` (S1). The deferred designs keep their ADR stubs in the appendices.

## 9. Product AI-agent surface
None near term: marketing pages hold no tenant data. (The salon assistant (08) may later answer "how do I share my availability via Zalo" from help content; owned by 07/08.) The deferred marketplace tools are listed in Appendix C.

## 10. Product-owner decisions
| Ref | Decision | Effect here |
|---|---|---|
| X23 | No public salon pages on gugu.vn (Law 122/2025 intermediary-platform risk); customer-facing booking surfaces wait for Vietnamese legal review. | Appendix B blocked; near-term scope = marketing site. |
| X22 | GuGu Studio brand; Apple-style scroll-storytelling landing; real CRM screenshots; only in-scope features. | §3.2, §3.5. |
| X19/X20 | SaaS first; landing announces the future marketplace (free listing, 2-year booking-fee exemption for early subscribers) with a disclaimer that it starts only after a Vietnamese company exists. | L8, `/marketplace`. |
| X18 | Light theme only on public pages. | §3.4. |
| X16 | Localhost only for now. | §4. |
| q43 | AI crawlers allowed. | robots.txt. |
| Earlier marketplace answers (q25, q26, q30, q54, q55, q66, q67; X11 booking without OTP) | Still valid for the deferred designs. | Appendices B/C. |

No open questions for the near-term scope. Questions about the blocked surfaces wait for the legal review (tracker).

---

## Appendix B — Customer-facing booking surfaces (BLOCKED pending Vietnamese legal review / VN company, X23)
Do not build. This is kept so the work can resume quickly if legal review allows it (e.g. on the salon's own domain, or after a VN company exists).

### B.1 Notes from rev 3 (X21, superseded by X23)
- URL idea: `gugu.vn/<salon-slug>` (vi) and `gugu.vn/en/<salon-slug>`. No subdomains (owner: not allowed). Expo `+middleware.ts` is alpha and returns Responses only (no documented rewrite), so routing would need a top-level `[salonSlug]` route with a reserved-word guard.
- Slug rules: 3–40 chars, `[a-z0-9-]`, unaccented (`đ→d`), no leading/trailing/double hyphen, not all digits, case-insensitive unique. Reserved words: locales, system routes (api, app, admin, business, studio, login, signup, account, settings, help, support, docs, blog, pricing, features, marketplace, legal, terms, privacy, contact, about, s, book, booking, manage, static, assets, _expo, .well-known, robots.txt, sitemap.xml, llms.txt, favicon.ico, www, mail), brand names, and an offensive-word list (vi/en). Renames are rate-limited; old slugs redirect 301 for ≥ 12 months and are not reusable for 12 months.
- Custom domain idea: owner adds a domain → TXT `_gugu-verify.<domain>` token + CNAME to `custom.gugu.vn` (apex via ALIAS/A); a BullMQ job verifies DNS and then issues TLS. Provider options: Cloudflare for SaaS custom hostnames, CloudFront SaaS Manager (per-tenant distribution tenants with ACM certs, cert in us-east-1, ~$0.10/tenant/month beyond 200), or Caddy on-demand TLS with an "ask" endpoint. Daily re-verification guards against dangling-domain takeover. The verified primary domain becomes canonical, and the gugu.vn URL 301-redirects to it. Turnstile allows 10 hostnames per widget (more needs Enterprise or the "any hostname" entitlement) → server-side hostname validation or another bot check would be needed.

### B.2 Salon page, booking flow and area labels (rev 2–3 text, unchanged)

#### 3.6 Salon profile (public)
- Sections: header (name, logo, cover, verified badge, rating, review count, price range, open-now), gallery, services (grouped by category, variants, price/price range, duration), staff (public only), about, amenities, map + address + directions link, opening hours (incl. special hours), cancellation policy, reviews (approved), "Pay at the salon" notice, sticky Book CTA, share button.
- Only `published` and not `suspended` salons are public; suspended → 410 or 404 (decision: 404 + `noindex`).
- Live availability is client-fetched (not cached in HTML).
- Service page: unique content (description, variants, duration, price, staff who perform it, salon context) for long-tail SEO.

##### 3.6.2 Customer booking flow from the salon page (owner decision X11 — no OTP)
Booking is as quick as the best Polish booking apps: **no OTP, guest booking allowed, account offered only after booking**. Topic 06 owns holds/creation and topic 11 owns the account and notification follow-up. This section owns the flow UX on web + native, starting from the salon page.

**Target**: from the salon page to a confirmed booking in **≤ 6 taps and ≤ 60 s** at p50 for a returning or signed-in customer, and ≤ 90 s for a first-time guest (typing included). Measured by the funnel `booking_started → booking_completed` (12), plus a Playwright timing test with scripted input.

**Steps (one flow, one screen per step on mobile; a two-pane drawer on desktop)**
| # | Step | Tap(s) | Notes |
|---|---|---|---|
| 1 | **Service** (+ variant) | 1 | Tap "Book" on a service row (or the sticky CTA → service list). Variant chips appear inline only if the service has variants. Deep link `/salon/{slug}?book={serviceSlug}` skips this step. |
| 2 | **Staff or "Any available"** | 1 | "Any available" preselected and first. The step is skipped when the service has a single performer or the salon disabled staff choice. |
| 3 | **Slot** | 1 | Date strip (next 14 days, first available day preselected) + time chips grouped Morning/Afternoon/Evening, from the availability API (06). Tapping a slot creates a **short hold** (06, TTL ~5 min, countdown shown in the last minute). |
| 4 | **Name + phone** | 0–1 | Prefilled and collapsed when signed in or remembered on the device. Otherwise: name + VN phone (+84 mask, `tel`/`name` autocomplete). Optional one-tap **Continue with Apple / Google** fills name and email; it never blocks. Optional note field, collapsed. |
| 5 | **Review & confirm** | 1 | Summary: service, staff, date/time in salon TZ, from-price, "Pay at the salon", cancellation policy line, consent text for transactional messages. Button: **Confirm booking**. |
| 6 | **Confirmation** | — | Success screen: add to calendar, directions, share, "Manage booking" link. Then the **account offer**: "Save your details for next time" → passwordless sign-up (Apple/Google, or an email magic link (no SMS, X12)). Dismissible and never required. |
Signed-in or remembered happy path: Book (1) → Any (skipped or 1) → slot (1) → Confirm (1) = **3–4 taps**.

**Rules**
- MUST NOT require OTP, password or account creation before confirming. Bookings created without verification carry `identity_verified=false` (X11); salons may enable "confirm first-time/unverified customers" (then the booking is `pending` and the copy says "Waiting for salon confirmation").
- Guest identity: the booking stores name + normalised E.164 phone. The device keeps a signed, httpOnly "returning guest" token (web cookie / SecureStore on native) to prefill next time and to open "Manage booking" without signing in. The booking message (ZBS/SMS/email, topics 09/11) carries a magic manage link.
- Data loss prevention: the selected step state lives in the URL (`?book=…&staff=…&slot=…`) and survives refresh/back. If the hold expires, the next available slots are re-offered in place without restarting the flow.
- Errors: slot taken at confirm → inline "Just booked by someone else" + 3 nearest alternatives (06 revalidates inside the transaction). Network loss → retry with an idempotency key (06), never a double booking.
- Native: the same flow as a modal stack/bottom sheet with haptic feedback on slot select and confirm; web desktop: right-side drawer over the salon page with keyboard support (Esc closes, focus trapped).
- All copy from localization (`booking` namespace), vi default.

**Bot / abuse protection (no OTP wall)**
- **Cloudflare Turnstile**, invisible/managed mode, on web only. The widget runs silently when step 4 renders, and its token is sent with the hold-to-booking confirm request. The API verifies it server-side and rejects on failure. An interactive challenge appears only when Turnstile escalates. Not shown to signed-in users with a good history. Turnstile works with CloudFront too (not tied to Cloudflare CDN).
- Native: App Attest (iOS) / Play Integrity (Android) token on confirm (13 owns setup); fallback to rate limits only.
- Server rate limits (05): per IP, device token, and phone (e.g. max 3 active future bookings per phone per salon, 10 per day platform-wide). Holds are limited per device so slots cannot be squatted.
- No-show / late-cancel history per phone (12) feeds the salon's "require confirmation" rule and risk score.
- Never block a booking purely because the phone is new; escalate to salon confirmation instead.

**Analytics**: `booking_started` (step 1), `booking_step_viewed` (step n), `booking_completed`, `booking_abandoned` (with last step), `account_offer_shown/accepted` — no PII in properties (12).

##### 3.6.1 Area labels on cards and profiles (post-2025 reform)
The reference shows "District 1, HCMC" — that is pre-reform wording and must not be used as the primary label.
- **Primary label** = `{area}, {province short}` where `area` is, in order of preference: a curated `Neighborhood` the salon belongs to (e.g. "Thảo Điền"), otherwise the commune/ward short name (e.g. "Phường Bến Thành" → vi "P. Bến Thành", en "Ben Thanh Ward").
- **Legacy alias (optional)**: if the commune maps to a pre-2025 district via `LocationAlias`, show it as a muted secondary chip — vi "Q.1 cũ", en "former D1". Controlled by flag `location.showLegacyAlias` (default on for 24 months after launch, then review).
- Province short forms come from DB (`short_name_vi/en`: "TP.HCM"/"HCMC", "Hà Nội"/"Hanoi"), never hardcoded.
- Examples: vi "P. Bến Thành, TP.HCM · Q.1 cũ"; en "Ben Thanh Ward, HCMC · former D1"; neighbourhood: "Thảo Điền, TP.HCM".
- Truncation at 360 px: drop the legacy chip first, then use the province short form; the full label goes into `accessibilityLabel`.
- Labels are precomputed in `salon_search` (`area_label_vi`, `area_label_en`, `legacy_area_label_vi`, `legacy_area_label_en`) so cards never assemble geography on the client.
- Search treats legacy names as aliases ("quận 1" → the communes that replaced District 1), so the label and the search stay consistent.
- Prices on cards: `formatVND` from 03 (vi "Từ 300.000 ₫", en "From ₫300,000" — final format owned by 03); rating shows average with one decimal + review count; no rating shown under 3 reviews ("New on GuGu" badge instead).


---

## Appendix C — Marketplace (LATER, after a Vietnamese company; X19/X21/X23)
Do not build. Rev 3 marketplace design, kept unchanged for later. Sections keep their original numbers; cross-references (§3.x, §4.x) point inside this appendix.

### 2. Gap analysis

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
| G10 | 3D hero vs SEO/LCP. | Hero ships a server-rendered H1, search card, and a static poster image; 3D canvas lazy-loads after hydration (contract with 02, §3.3). On mobile the LCP element is the H1 text. |
| G20 | Product-owner reference (ref-01) uses pre-reform "District 1, HCMC" labels and shows social-proof numbers. | Labels follow §3.6.1 (ward/neighbourhood + optional legacy chip); social proof is shown only from real stats above a threshold (engineering rule: no fake data). |
| G11 | URL scheme only partially defined (`/vi/salon/lotus-beauty`). Localized slugs? Category/location URLs? | Full URL scheme in §3.2. Path segments stay English-keyword constant across locales (`/vi/salon/…`, `/en/salon/…`); content slugs are unaccented Vietnamese (`/vi/c/nail/ho-chi-minh/phuong-ben-thanh`). Slug history table → 301 redirects on rename. |
| G12 | Canonical salon identifier vs slug — not specified how they relate. | Canonical id = UUID; public slug is unique per platform and mutable with history; `gugu.vn/s/{shortId}` short links for QR/sharing redirect to the canonical localized URL. Subdomains (`lotus.gugu.vn`) later = 301 to canonical path; never the canonical. |
| G13 | Locale detection for `/` root not defined; risk of cloaking. | `/` → 302 to `/vi` or `/en` by persisted cookie, then `Accept-Language`, default `vi`. Crawlers get the same logic; every page carries hreflang + `x-default` → `/vi`. |
| G14 | Thin/duplicate content: category×location pages with 0 salons, filter permutations. | Category×location pages are indexable only if ≥ N (config, default 3) published salons; filter/sort query params are `noindex, follow` with canonical to the clean path. |
| G15 | Reviews structured data — Google restricts self-serving review snippets for LocalBusiness. | Emit `aggregateRating` only from GuGu-collected verified reviews (booking-linked, so not self-serving by the business); never emit when count < 3. Keep it behind a flag so it can be turned off. |
| G16 | No GEO/AI discoverability. | `llms.txt` + `llms-full.txt` (top cities/categories/how booking works), clean semantic HTML, complete JSON-LD (`BeautySalon`/`HairSalon`/`NailSalon`/`DaySpa`, `OfferCatalog`), stable facts block (address, hours, price range, "pay at salon"). Robots policy for AI crawlers is a product-owner decision (open question). |
| G17 | Web performance targets missing. | Budgets in §3.7 (LCP, INP, CLS, JS size) on a mid-range Android over 4G. |
| G18 | Map browsing: no provider chosen; Google Maps cost; RN-web support. | **OSM only (q26)**: MapLibre on web + native, self-hosted Protomaps tiles, Photon/Nominatim geocoding behind `GeocoderPort`; owner-confirmed map pin is the source of truth because Vietnamese OSM address coverage is weak. See §4.4. |
| G19 | Promotions/editorial/trending have no data source. | Editorial: simple CMS-in-admin (12) with localized articles, or markdown in repo for MVP. Promotions: salon-created offers (07) shown only if active. Trending: derived from search/booking events (12), cold-start = curated. |

---

### 3. Refined requirements

#### 3.1 Route tree (Expo Router, `apps/app/app`)
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

#### 3.2 URL scheme
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

#### 3.3 Homepage IA (aligned with reference `design/hero-references/ref-01-homepage-lilac-diorama.png`)
Visual analysis and art direction: `design/hero-references/README.md` (topic 02). This section owns structure, data, SSR/client split and behaviour; 02 owns look, motion and the 3D scene.

**Blocks (desktop order, as in the reference)**
| # | Block | Content | Data source | Render |
|---|---|---|---|---|
| H0 | Header | logo; nav Discover / Beauty services / For professionals; search icon; Sign in; Get started | static + auth state | SSR shell; auth buttons swapped client-side (avatar when signed in) |
| H1 | Hero copy | eyebrow ("Beauty for a brighter you"), H1 ("Your beauty era starts here." with gradient accent word), subtitle | localization `public.home.hero.*` | SSR (H1 is the SEO heading) |
| H2 | Hero CTAs | primary **Explore beauty →** → `/{locale}/search` (or nearest hub when city known); secondary **Become a beauty pro** → `/{locale}/for-business` | static | SSR |
| H3 | Trust chips | Verified professionals · Easy booking · Real reviews | static copy; each links to an explainer anchor | SSR |
| H4 | 3D diorama | salon diorama (nails / hair / skin care zones, GuGu signage) | 02 assets | **poster image SSR** (LCP candidate on desktop); 3D canvas client-only, lazy (see gating below) |
| H5 | Search card | tabs **Book a treatment / Find salons**; rows location → service → date; CTA **Find my glow →** | categories + locations from API; defaults from cookie | SSR with defaults; pickers are client bottom sheets (mobile) / popovers (desktop) |
| B1 | Category tiles | Nails, Hair, Skin, Brows, Lashes, Massage (first tile highlighted) + "more" | `ServiceCategory` (DB, admin-ordered, icon asset key) | SSR |
| B2 | Social proof | avatar stack + count ("10K+") + quote ("Self care looks good on you.") | real platform stats (12) and a consented review or brand line | SSR; **hidden** when stat below configured threshold — no invented numbers or fake testimonials |
| B3 | "The spots everyone is saving" | salon cards: cover, favourite heart, name, rating + count, area label (§3.6.1), "From {price} ₫", **Book now**; prev/next + **View all salons** | `marketplace.saved_trending` read model: most-favourited/booked salons in the selected city over last 30 days; curated fallback during cold start | SSR per (locale, city); heart state client-side |
| B4 | "Your next glow-up" | editorial carousel (looks, tips, campaigns) | editorial content (12 / repo markdown, open question) | SSR first 3 cards, rest lazy |
| B5 | Popular neighborhoods | links to category×location hubs | location read model | SSR (internal linking) |
| B6 | Trending services | service cards with from-price | search events / bookings (12) | SSR per city |
| B7 | Personalised | Recently viewed, Recommended for you, Near you (geolocation), Promotions | local storage / auth / geo | **client-only**, below fold, skeleton placeholders |
| F | Footer | locale switch, cities, categories, for-business, legal | static + DB | SSR |
Decorative handwritten doodles ("More self love please", "Good beauty brighter you") are imagery (`aria-hidden`), supplied per locale by 02 or omitted; if rendered as text they come from localization.

**Mobile order & behaviour (360–430 px)**
1. Compact header: logo, search icon, Sign in (or avatar). Nav links move into a menu; "Get started" becomes part of the menu.
2. Eyebrow + H1 (2–3 lines, fluid type) + subtitle (max 2 lines).
3. Primary CTA **Explore beauty** full width; **Become a beauty pro** as secondary/text button beneath.
4. Trust chips: single horizontally scrollable row.
5. Diorama visual at ~16:10, full bleed, poster first. The **search card overlaps its bottom edge** (as in the reference) and is the first interactive element after the CTAs. The overlap stays within the first two viewports.
6. Category tiles: horizontal scroll-snap row (~3.5 tiles visible); the social proof card follows as its own slim block.
7. Spots carousel: horizontal snap, card width ~80% of the viewport, heart top right (44 px hit area), Book now on each card.
8. Glow-up carousel, then neighborhoods, trending services, personalised blocks, footer.
9. After the hero scrolls out, a sticky compact **search pill** (location · service) appears at the top on mobile web; native apps use the bottom tab bar (Explore, Search, Bookings, Favorites, Profile) instead.
- "Alive" behaviour (motion spec from 02): tile press scale, heart pop + haptic on native, carousel momentum, subtle diorama idle loop; all reduced or off under `prefers-reduced-motion`.
- Hero media (X15): AI-produced layered renders + image-to-video loops with pointer/scroll parallax. That is the default "alive" layer. Real-time R3F is an optional enhancement under the same gating.
- 3D/interactive-layer gating: mount only after hydration + idle, on desktop/tablet and capable mobile (deviceMemory ≥ 4, no `saveData`, not reduced-motion, WebGL2 available). Otherwise keep the poster or a short muted loop video from 02. On mobile the **H1 text is the LCP element**, not the diorama.
- Native app home reuses the same blocks (minus header/footer), with poster/video in place of the web 3D scene per 02.

**Search card → URL mapping**
| Tab | Fields | Navigation on "Find my glow" |
|---|---|---|
| Book a treatment | location (province or commune, or "near me"), service (category or specific service), date (Today / Tomorrow / This week / pick date) | category + place only → clean hub `/{locale}/c/{category}/{province}[/{commune}]`; extra params appended: `?when=today` (or `tomorrow`, `week`) or `?date=YYYY-MM-DD`. Specific service → `/{locale}/search?service={serviceSlug}&province=…&when=…`. "Near me" → `/{locale}/search?category=…&lat=…&lng=…&radius=3000&sort=nearest&when=…` |
| Find salons | location + free text (salon name) | `/{locale}/search?q={text}&province=…` |
- `when`/`date` map to availability-summary filters (§3.4) and are `noindex` params (canonical = hub path).
- Location default: last selected (cookie `gugu_city`), else Hồ Chí Minh; "near me" asks for location permission only when chosen.
- Missing service → hub of the place (`/{locale}/l/{province}`); missing everything → `/{locale}/search`.
- Search card state is serialised to the URL, so back navigation restores the card.
- Analytics: `search_performed` with `source=home_search_card` and tab (12).

**Caching**: home HTML is cached per (locale, city). CloudFront supports a `gugu_city` cookie in the cache key. If Cloudflare without custom cache keys is chosen, the SSR default is HCMC and city-dependent blocks (B3, B6) re-fetch on the client when the cookie differs.

#### 3.4 Search
- **Inputs**: `q` (salon/service/staff/address text), `category`, `province`, `commune`, `lat,lng,radius`, `bbox` (map), filters: price min/max (VND), rating ≥, distance ≤, availability (`today|tomorrow|week`), open now, duration bucket, staff gender/preference (only if salons opt in), verified.
- **Sort**: recommended (default), rating, distance (only with geo), price asc/desc, popularity.
- **Pagination**: keyset/cursor for infinite scroll (API), page numbers in SSR URLs for crawlable listing pages (`?page=2`, canonical self).
- **Autosuggest** endpoint: top salons, services, categories, places for prefix; ≤ 100 ms p95 server time; diacritic-insensitive (`"goi"` matches "Gội").
- **Recommended** score = weighted(text relevance, rating Bayesian avg, review count, distance decay, availability soon, profile completeness, verified, response/reliability metrics from 12) + promoted boost hook (capped, labelled).
- URL ⇄ filter state is bidirectional (browser history, sharing, deep link).
- Works without location permission: falls back to selected city, then default (Hồ Chí Minh).
- Empty state suggests broader area/removing filters; error state retriable; skeletons for loading.

#### 3.5 Location model (requirements to 04)
- `Location` tree: `country` → `province` (34 units) → `commune` (xã/phường/đặc khu), each with `code` (official GSO/administrative code), `name_vi`, `name_en` (unaccented fallback), `slug`, `type`, `centroid geography(Point)`, optional `boundary geography(MultiPolygon)`, `valid_from`, `valid_to`, `replaced_by_id[]`.
- `LocationAlias`: legacy names (pre-2025 districts, old provinces, "Sài Gòn", "Q1") → mapped to provinces/communes or to a bounding polygon; used by search and slug redirects.
- `Neighborhood` (optional, curated): popular areas not matching admin units (e.g. "Thảo Điền").
- Seed from an authoritative dataset (open question: source + licence); admin can edit (12).
- Salon address: `province_id`, `commune_id`, street line, `geo geography(Point,4326)`, `geocode_source`, `geocode_confidence`.

#### 3.7 Web quality & performance
- **Light theme only** on public, marketplace and customer screens (X18, supersedes q44): no dark theme, no `prefers-color-scheme` handling. `<meta name="color-scheme" content="light">` is set and `color-scheme: light` is forced so OS dark mode and browser auto-dark do not invert the UI. Native sets `userInterfaceStyle: "light"` for these screens (coordinate with 13).
- Core Web Vitals on Moto G-class device / 4G: **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1** at p75.
- Public route initial JS ≤ 250 KB gzip (excluding lazily loaded 3D bundle); images via CDN with AVIF/WebP, `srcset`, explicit dimensions.
- Cache: public HTML `s-maxage=300, stale-while-revalidate=86400` at Cloudflare, purged on salon publish/update via tag/URL purge.
- Keyboard: all interactive elements focusable, visible focus, skip-to-content link, filter panel operable by keyboard, Esc closes sheets.

#### 3.8 SEO deliverables
- `generateMetadata` on every public route: localized title (≤ 60 chars) and description (≤ 155), canonical absolute URL, `alternates` vi/en + `x-default`, Open Graph + Twitter card, robots directives.
- JSON-LD: `WebSite` + `SearchAction` (home), `Organization` (home), `BreadcrumbList` (all), salon: most specific `LocalBusiness` subtype + `PostalAddress` + `GeoCoordinates` + `openingHoursSpecification` + `priceRange` + `hasOfferCatalog` + `aggregateRating` (rules G15) + `paymentAccepted: "Cash, bank transfer"` (as configured by salon); service: `Service` + `Offer` (`priceCurrency: VND`).
- Sitemaps: index → `sitemap-static.xml`, `sitemap-categories.xml`, `sitemap-locations.xml`, `sitemap-salons-{n}.xml` (≤ 50k URLs each), each entry with `xhtml:link` alternates and `lastmod`. Generated from API, cached 1 h.
- `robots.txt`: disallow `/*/(customer|business|staff|admin)`, `/api/`, search with params; sitemap link; AI crawler rules per product decision.
- OG images: dynamic per salon (cover + name + rating) rendered by API route, cached at CDN.
- `llms.txt` at root summarising GuGu, key hubs, and how to book.

#### 3.9 Sharing
- Share sheet (native) / Web Share API with copy-link fallback; shared URL = canonical localized URL with `utm_source`/`ref` param for attribution (12 consumes `acquisition_source = direct_link|social_media`).
- QR codes per salon resolve to `/s/{shortId}?src=qr`.

---

### 4. Proposed technical approach

#### 4.1 Rendering
- Expo SDK ≥ 58, `web.output: "server"`, `+html.tsx` spreading `useServerDocumentContext` nodes; `generateMetadata` for head tags (earliest bytes), `<Head>` only for post-hydration updates.
- Hosting (decided by the product owner: **AWS Singapore, ap-southeast-1**; topic 13 owns the final infra): `expo export --platform web` → `dist/server` run by the expo-server Node/Express adapter in a container on AWS in ap-southeast-1, next to the API. **Cloudflare or CloudFront** sits in front (choice in 13).
  - Static client bundles and image variants are served from S3 through the CDN, with immutable caching.
  - Public HTML: `s-maxage=300, stale-while-revalidate`.
  - Purging: on CloudFront, use path invalidations for salon URLs, batched and debounced on publish; on Cloudflare, use URL purge (cache tags need Enterprise). Short TTL + SWR keeps correctness if a purge is missed.
  - Cache key: locale path + `gugu_city` cookie for the home page only. All other cookies, including auth, are stripped from public cache keys and never forwarded to public loaders.
  - Latency: Singapore → Vietnam RTT is roughly 30–50 ms. The TTFB budget for cache-miss SSR is ≤ 600 ms at p75 from HCMC/Hanoi, checked with synthetic monitoring (13).
  - EAS Hosting / Workers adapters are no longer the primary path.
- Loaders call NestJS through `packages/api-client` with a server-only base URL and a public service token; they must not leak user tokens into cached HTML.
- Authenticated groups: layout guards render a client-only shell; middleware sets `noindex` + `private` cache.
- **Spike S1** (first sub-milestone): prove SSR + loaders + metadata + hydration with NativeWind + react-native-web + i18n on SDK 58; measure TTFB and CWV. Exit criteria → keep server mode; otherwise switch to fallback F1 (static + `generateStaticParams` + rebuild on publish) and F2 worker for long tail.

#### 4.2 Search implementation
- Read model table `salon_search` (denormalised, one row per published salon): ids, names (vi/en), unaccented names, service names, category ids, staff public names, address text, province/commune ids + legacy alias ids, `geo geography(Point)`, price_min/max, rating_avg, rating_bayes, review_count, popularity, verified, promoted_weight, availability summary columns, `search_doc tsvector`.
- Indexes: GIN on `search_doc`; GIN `gin_trgm_ops` on unaccented name + services text; GiST on `geo`; btree on (province_id, category ids via GIN array), rating, price_min.
- Normalisation: `immutable_unaccent(lower(text))` wrapper function (unaccent is only STABLE; needed for index expressions); same function applied to queries in NestJS (`packages/domain` provides a JS equivalent for slugs & client-side highlighting; parity test).
- Geo: `ST_DWithin(geo, ST_MakePoint(lng,lat)::geography, radius_m)` + `ST_Distance` for sort; bbox via `ST_MakeEnvelope`.
- Maintained by BullMQ projector jobs on domain events (`salon.updated`, `service.updated`, `review.approved`, `availability.summary.changed`) + nightly full rebuild; Redis cache for hot queries (home blocks, autosuggest) 60–300 s.
- `SearchIndex` port in NestJS `search` module → `PostgresSearchIndex` now, external engine later.

#### 4.3 Location data
- Seed migration from official 2025 two-tier dataset + alias table for old districts/provinces; geocoding via provider port; boundary polygons optional (for "salons in phường X" accuracy fall back to commune_id assignment).

#### 4.4 Map and geocoding (OSM only — decision q26)
- List-first; map toggle. Renderer: **MapLibre** everywhere: `Map.web.tsx` (MapLibre GL JS, lazy chunk) and `Map.native.tsx` (`@maplibre/maplibre-react-native`). No Google Maps SDK; `react-native-maps` is not used because it defaults to Google/Apple tiles. Shared clustering and viewport logic live in `features/search`.
- **Tiles**:
  - Development/local: OpenFreeMap vector tiles (free, no key) or a local Protomaps PMTiles extract of Vietnam.
  - Production: self-hosted **Protomaps PMTiles** (Vietnam extract, regenerated monthly) served from object storage through the CDN. A vi/en label style is built from the design tokens (light only).
  - Attribution "© OpenStreetMap contributors" is always visible (ODbL).
- **Geocoding** goes through the `GeocoderPort` in the API, never called directly from the client:
  - Forward/autocomplete: **Photon**, self-hosted with a Vietnam extract. It is used for the salon address form and for customer "search an address".
  - Reverse geocoding: **Nominatim**, self-hosted. The public nominatim.org instance is allowed in local development only (usage policy: 1 req/s, no autocomplete, no bulk).
  - Results are cached in Postgres/Redis.
- **Vietnamese address-quality limits** and mitigations:
  - OSM house-number coverage in Vietnam is sparse.
  - Alley addresses ("hẻm 123/45/6", "ngõ 12 ngách 3") rarely resolve.
  - OSM admin boundaries may lag the 2025 reform.
  - Diacritic-less input matches poorly.
  - Mitigations: (1) the salon owner **confirms or drags the map pin** during onboarding (07); the pin is the source of truth (`geocode_source = owner_pin`), and the geocoder only suggests. (2) Province/commune always come from **our own Location tables** (point-in-polygon on our boundaries, or the owner's pick), never from OSM admin tags. (3) Customer location search hits our Location + alias tables first; the geocoder is only a fallback for street addresses. (4) Queries are normalised with `normalizeVi()` before reaching Photon. (5) `geocode_confidence` is stored, and salons with low confidence get an admin review flag (12).
- Directions: "Open in maps" deep links to the user's installed app (Apple Maps / Google Maps app / OSM-based apps). This is a link-out only, with no API usage.

---

### 5. Acceptance criteria
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
16. Homepage at 360, 390 and 430 px widths: no horizontal page scroll; block order matches §3.3 mobile order; search card reachable without passing the 3D canvas; carousels scroll-snap and are keyboard/screen-reader operable (Playwright + visual snapshots vs reference layout).
17. Search card: each tab/field combination navigates to the URL in the §3.3 mapping table (unit test of the serializer + Playwright), and back navigation restores the card state.
18. Salon cards show reform-correct area labels (§3.6.1), with the legacy chip toggled by flag; no card renders "District N" as the primary label.
19. Social-proof block is absent when the real stat is below the threshold (no hardcoded counts or testimonials in code).
21. Booking flow (§3.6.2): Playwright web + Maestro native — guest books without OTP or account in ≤ 6 taps from the salon page; the signed-in path takes ≤ 4 taps; the account offer appears only after confirmation; scripted run ≤ 60 s.
22. Turnstile token is required and verified server-side for web guest confirms (an invalid token is rejected in an integration test); hold expiry and slot-taken paths re-offer alternatives without losing entered data.
20. Mobile home: LCP element is the H1 text or poster, never the WebGL canvas; the 3D bundle is not downloaded on `saveData`/reduced-motion/low-memory devices.

### 6. Dependencies
- **01** SDK 58 + server output decision, monorepo, api-client. **02** hero visuals, tokens, card components, poster asset contract. **03** locale routing helpers, slug/date/VND formatting, translation namespaces (`public`, `search`, `salon`). **04** schema: Location (two-tier + aliases + versioning), salon_search read model, slug_redirects, PostGIS/pg_trgm/unaccent extensions. **06** availability summary projection + exact slot API. **07** salon publishing, profile data, promotions. **11** reviews (approved only) + favorites. **12** taxonomy/location admin, promoted listings, attribution of shares/QR, analytics events (`search_performed`, `salon_viewed`, `service_viewed`). **13** hosting of SSR server, Cloudflare caching/purge, universal links files matching §3.2, Playwright/Lighthouse CI. **08** read-only tools (§9).

### 7. Suggested sub-milestones
Priority per X13: steps 1–5 + booking flow (§3.6.2) + step 7 basics form the lean marketplace slice; steps 6 (full homepage polish), 8 (map) and editorial/trending follow after the salon SaaS core.
1. **S1 spike**: SSR on SDK 58 with NativeWind + i18n + loaders + generateMetadata; decide server vs fallback (ADR).
2. Location seed (two-tier + aliases) + slug utilities + URL scheme constants in `packages/domain`.
3. `salon_search` read model + projector + Postgres search + autosuggest + tests (AC 4–6).
4. Salon profile + service page (SSR, metadata, JSON-LD) using seeded real-shaped data.
5. Search results UI (list, filters, URL state) + category & location hubs.
6. Homepage per §3.3 (ref-01): SSR blocks + search card URL mapping + mobile order, using the poster slot; then integrate 02's 3D hero behind capability gating.
7. Sitemaps, robots, llms.txt, OG images, redirects, cache headers + purge.
8. Map view (web/native split).
9. Performance + a11y pass, Lighthouse CI budgets, Playwright suites (AC 1–15).

### 8. AI-first deliverables
- `.claude/agents/marketplace-seo.md` — owns `apps/app/app/[locale]/(public)/**`, `apps/app/features/{search,salon-public,home}/**`, `apps/api/src/modules/search/**`, SEO API routes.
- `.claude/skills/seo-page/SKILL.md` — procedure for any public route (metadata, canonical, hreflang, JSON-LD, sitemap, cache, noindex rules).
- `.claude/skills/search/SKILL.md` — normalisation, read-model changes, index rules, adding a filter/sort, perf checks.
- `docs/domains/marketplace-seo.md` — durable domain doc (skeleton now).
- ADRs to write during implementation: `adr/xxxx-expo-server-output.md`, `adr/xxxx-postgres-search-vietnamese.md`, `adr/xxxx-two-tier-location-model.md`, `adr/xxxx-map-provider.md`.
- Glossary entries (vi/en): tỉnh/thành phố, xã/phường/đặc khu, legacy quận, salon slug, short link.

### 9. Product AI-agent surface
Read-only, public data; used by the future customer AI concierge and (limited) by the salon agent (08) for competitive context. All via the same NestJS search service — no separate data path.

| Tool | Input (Zod) | Output | Permission | Scope | R/W |
|---|---|---|---|---|---|
| `marketplace.search_salons` | q?, category?, location (province/commune/lat-lng-radius)?, filters?, sort?, cursor? | salon cards (id, slug, name, rating, price range, distance, next_available_at, url) | public | public published salons | R |
| `marketplace.get_salon_profile` | salon id or slug, locale | public profile (no internal notes, no non-public staff) | public | single salon | R |
| `marketplace.list_services` | salon id, category? | services + variants + price/duration | public | single salon | R |
| `marketplace.suggest` | prefix, locale | suggestions | public | public | R |
| `marketplace.resolve_location` | free text ("quận 1", "Thảo Điền") | province/commune ids + confidence | public | public | R |
| `marketplace.get_availability_summary` | salon id, date range | per-day has-slots (summary, not exact) | public | single salon | R |
Booking actions are not exposed here; concierge hands off to the booking flow (06/11), which needs no OTP (X11) but always requires explicit user confirmation. Review text and salon descriptions are untrusted content for the agent.


### 10. Product-owner decisions (from the GuGu Roadmap tracker, 2026-11-02)
| Q | Decision | Applied in |
|---|---|---|
| q25 | **Nationwide** index (all 34 provinces) from day 1; **HCMC is the primary launch market**: default city, curated homepage blocks, editorial and SEO focus. | §3.3 defaults, §3.5 seed, sitemaps |
| q26 | **OpenStreetMap-based maps and geocoding, no Google.** | §4.4 |
| q30 | Legacy district names **are used in page titles** as a secondary label ("Nail Quận 1 · P. Bến Thành, TP.HCM"). Editorial content lives **both in admin (12) and in repo markdown**; the loader merges them, admin wins on slug collision. | §3.8, B4 |
| q43 | **Allow AI crawlers** (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…) on public pages; **`aggregateRating` from launch** (≥ 3 verified reviews, flag kept as kill switch); **promoted listings at launch**, capped boost and always labelled "Sponsored / Được tài trợ". | §3.8 robots, G15, §3.4 |
| q54 | Social proof as proposed: real stats above the threshold, consented review or brand line; hidden otherwise. | B2 |
| q55 | Former-district chip shown for **24 months** after launch, then reviewed. | §3.6.1 |
| q66 | **Instant booking by default**; salons can switch on "confirm first-time/unverified customers". | §3.6.2 |
| q67 | "Spots everyone is saving" = **favourites + bookings over 30 days**; cold start filled with **labelled editor's picks**. | B3 |
| q44 → X18 | **Light theme only** on public pages, marketplace and customer screens, ignoring the OS dark preference (X18 supersedes q44). The hero ships no dark variant. | §3.7 |
| X13 | Marketplace is **secondary to the salon SaaS**: build the lean slice first (salon page + booking flow + search + SEO basics), polish (map, editorial, trending) later. | §7 |
| X15 | Hero is **produced with AI tools** (layered renders, image-to-video loops, parallax); real-time R3F is optional. | §3.3 gating |
| X16 | Localhost only for now; AWS hosting (§4.1) is a later milestone. | §4.1 |

No open questions remain for this topic; new ones go to the tracker.

