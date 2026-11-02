# 03 — Localization (vi / en)

Covers every user-facing string, format, and template in GuGu: the universal Expo app, the API's error and notification output, SEO metadata, and the in-product AI agent's answers. Vietnamese (`vi`) is the default locale and English (`en`) is the second. Source: master prompt §5, plus the localization parts of §16 (notifications), §20 (SEO) and §24 (errors).

## 1. Scope

**In scope**
- Shared package `packages/localization`: dictionaries, typed keys, formatters (dates, numbers, VND, phone, names, addresses, relative time), locale resolution, and the Zod error map.
- Locale resolution and persistence on web (URL prefix), iOS, and Android.
- Localized backend output: error codes, validation messages, email / push / SMS / Zalo template (`zalo_template`) templates, OpenAPI descriptions where needed.
- Localized content model for database data: categories, taxonomy, amenities, salon and service text.
- Localized SEO metadata, `hreflang`, and `<html lang>`.
- Localized accessibility labels.
- Tests and lint: key parity, placeholder parity, no hardcoded strings, formatter snapshots.
- AI-first tooling: subagent, skill, glossary, tone guide.
- Language behaviour of the product AI agent.

**Out of scope** (owned elsewhere)
- Fonts that render Vietnamese diacritics well → 02.
- Search over text with or without diacritics (`unaccent`, trigram) → 10.
- ZBS Template Message approval with Zalo (formerly ZNS; channel id `zalo_template`) → 09 (this topic supplies the template content).
- Notification orchestration and channel fallback → 11.
- Admin UI for editing taxonomy translations → 12 (this topic defines the data shape).

## 2. Gap analysis

| # | Gap or issue in the master prompt | Decision |
|---|---|---|
| G1 | No library is named. | Use **i18next + react-i18next** in the app and **i18next** in NestJS, both reading the same dictionaries from `packages/localization`. Use `expo-localization` for the device locale. Reason: one runtime for the frontend and the backend, mature plural support (`compatibilityJSON: v4`, based on `Intl.PluralRules`), and namespaces map onto the prompt's file split. |
| G2 | The Intl API is assumed to exist. Hermes only partially supports `Intl.NumberFormat` and `Intl.DateTimeFormat` ([FormatJS guide](https://formatjs.github.io/docs/guides/react-native-hermes)). Support for `timeZone` and the `vi` locale data needs checking. | Spike in sub-milestone M1: run the formatter test suite on iOS and Android Hermes builds. Load `@formatjs/intl-*` polyfills on native only, and only for the APIs that fail, in the order given in the FormatJS guide. All formatting goes through `packages/localization` wrappers, so a fix applies everywhere. |
| G3 | Translating the URL prefix (`/vi/…`) versus storing the preference is ambiguous across platforms. | Resolution order: **URL segment (web)** → **signed-in user's `preferredLocale` (server)** → **persisted local choice** (localStorage on web, AsyncStorage on native; this value is not sensitive) → **device or `Accept-Language` locale if it is vi or en** → **`vi`**. On native, the `[locale]` segment exists in routes but is driven by the stored preference. Deep links that carry `/en/` switch the locale for that session only. |
| G4 | Database content (salon descriptions, service names) is called "localized", but the model is undefined. | Platform taxonomy (categories, amenities, cancellation-policy presets) uses `LocalizedText` JSONB `{ vi: string; en?: string }`, with `vi` required. Salon-authored text stores `sourceLocale` plus optional translations in the same shape. The UI falls back from the requested locale to the source locale and shows a "translated" badge where relevant. Translations are never auto-published without the salon's approval (see the AI draft in §6). |
| G5 | The prompt says "localized validation messages", but validation runs in shared Zod schemas on both the client and the server. | Schemas emit **stable error codes with params**, never prose (e.g. `phone.invalid`, `string.too_short {min}`). A shared `zodErrorMap(locale)` maps codes to `errors` namespace keys. The API returns `{ code, params, field }` and the client renders the text. The server renders prose only for outbound channels (email, SMS, `zalo_template`, push). |
| G6 | SMS cost: Vietnamese diacritics force UCS-2 encoding (70 characters per segment instead of 160), and many brandname SMS routes expect unaccented text. | Each SMS template has `vi` plus a generated `vi-ascii` variant made with a deterministic diacritic stripper; `đ` becomes `d`. Which one is sent is a per-template config chosen by 11 and 09. OTP SMS defaults to `vi-ascii`. Open question Q3.  **Deprioritised:** no SMS for now (roadmap X12, owner q48/q11). `vi-ascii` and `stripDiacritics` stay specified but are built only when an SMS provider is plugged in. |
| G7 | VND formatting is unspecified. `Intl` gives `150.000 ₫` in vi-VN, but local apps show `150.000đ`. | **Decided (owner q27 delegated the choice): `150.000đ`** in vi, because it is what Vietnamese users see on Shopee, Grab, menus and salon price boards, and `₫` reads as formal or banking style. en uses `₫150,000`. `formatVND(amount, locale, { style })` keeps an `intl` style for structured data (JSON-LD uses the ISO code `VND`). VND has no minor units: amounts are stored as integer đồng (bigint), and decimals are never shown. Price ranges render as `150.000–250.000đ`. "From" prices use the key `price.from`. |
| G8 | Date and time conventions are missing. | vi uses the 24-hour clock, weekday names "Thứ Hai…Chủ Nhật", and patterns like `T2, 03/11`. en uses `Mon, Nov 3` with a 12-hour clock. Weeks start on Monday in both locales. Times always display in the **salon's timezone** (`Asia/Ho_Chi_Minh` initially), never the device's. When the device timezone differs, a timezone hint is shown. |
| G9 | Vietnamese naming and addressing are not addressed. | Store `fullName` (a single field in natural order, family name first) plus an optional `displayName`. Never split names into first and last. Greetings use the last syllable (the given name) via a helper and fall back to `fullName`. Addresses use the post-2025 two-level model (street → ward/commune → province). Formatting comes from data in topic 10, and the order is locale-aware. |
| G10 | Phone numbers are not addressed. | Store E.164 (`+84…`). Display `0901 234 567` in vi and `+84 90 123 4567` in en. Input accepts both `0…` and `+84…`. Parsing is shared with 05 via libphonenumber-js (the `min` metadata). |
| G11 | There is no mechanism to prevent hardcoded strings. | Use an ESLint rule (`eslint-plugin-i18next` `no-literal-string`, configured for RN `<Text>`, `accessibilityLabel`, `placeholder`, `title`) in the app and in design-system packages. CI fails on violations. Allowed exceptions are brand names and test files. |
| G12 | "Professional Vietnamese" has no process, which is risky with AI-generated translations. | Keep a glossary and tone guide (skill references). Every new vi string carries review status. A PR that adds or changes vi strings gets the `i18n:vi-review` label and needs approval from the **vi reviewer (owner's wife)** before release, not before merge to `main`. The same person approves hero and campaign copy (`copy:brand`) (owner q12, q49). |
| G13 | Sorting is not addressed. | Client-side sorting uses `Intl.Collator('vi')`. Postgres uses an ICU collation (`vi-VN-x-icu`) for name ordering where needed. Coordinate with 04. |
| G14 | SEO localization is underspecified. | Each public route outputs `<html lang>`, localized title and description, `canonical`, and `hreflang` vi, en and `x-default` (→ vi). Open Graph uses `og:locale` `vi_VN` / `en_US`. Slugs are locale-independent (one canonical salon slug) to avoid duplicate-content splits. Owned jointly with 10. |
| G15 | The language behaviour of the product AI agent is undefined. | See §6. |
| G17 | The hero reference (`design/hero-references/ref-01-homepage-lilac-diorama.png`) uses an editorial serif display face and handwritten script accents ("More self love please", "Good beauty brighter you"). Text like this is easily baked into images, textures or the 3D scene, which makes it untranslatable. Script fonts also often lack Vietnamese stacked diacritics (ầ, ẫ, ặ, ở, ữ). | Every marketing text (headlines, script accents, stickers, badges, 3D scene labels) is a **localized string** in the `marketing` namespace, rendered as live text or as runtime-generated text in 3D (e.g. troika/`Text` in R3F). It is never baked into PNG, video, glTF textures or posters. Native video fallbacks overlay localized text, not text inside the video. Topic 02 picks the fonts, but 03 sets a hard gate: each serif and script font must pass the Vietnamese glyph test string (R11) at display sizes with no clipped or colliding stacked marks. Accent copy is written natively for vi, not translated from en (see the tone guide). |
| G16 | Adding future languages needs to be cheap. | The supported-locale list lives in one config (`packages/localization/src/locales.ts`). Adding a locale is a documented skill procedure. CI parity tests cover all listed locales. RTL is out of scope, but logical style props (`start`/`end`) are preferred. |

## 3. Refined requirements

**R1 Dictionaries**
- Location: `packages/localization/locales/{vi,en}/<namespace>.json`.
- Namespaces: `common`, `marketing`, `auth`, `booking`, `salon`, `customer`, `crm`, `admin`, `errors`, `validation`, `notifications`, `seo`, `a11y`, `agent`.
- Keys are nested in camelCase and describe meaning, not position (e.g. `booking.confirm.cta`, not `booking.button1`).
- `vi` is the source of truth for completeness. Both locales must have identical key sets.

**R2 Typed keys**
- Generate TypeScript types from the `vi` dictionaries, using i18next `CustomTypeOptions`.
- Unknown keys fail at compile time.

**R3 Interpolation and plurals**
- Placeholders use `{{name}}`.
- Plurals use i18next v4 suffixes (`_one`, `_other`). vi has only `_other`, and that is valid.
- Placeholder sets must match across locales.

**R4 Formatters**
- All formatters live in `packages/localization/format` and are pure functions taking `(value, locale, opts)`.
- They cover dates, times, ranges, relative time, durations (`45 phút` / `45 min`, `1 giờ 30 phút`), VND, numbers, percentages, phone numbers, names and addresses.
- Components never call `Intl` or `toLocaleString` directly. A lint rule enforces this.

**R5 Locale switching**
- The switch is reachable from the profile page and from the footer and header on web.
- It is instant (no reload on native).
- For a signed-in user, the choice is persisted locally and on the server.
- The server value drives notification language.

**R6 Backend**
- The API returns machine codes for errors.
- Templates render with the recipient's `preferredLocale`, falling back to `vi`.
- The `Accept-Language` header is honoured for anonymous endpoints that return localized database content.

**R7 Templates**
- Notification templates are keyed by `event × channel × locale`.
- They live in `packages/localization/templates/` as source, and are synced to `NotificationTemplate` rows for runtime overrides (topic 11).
- Email gets MJML or HTML plus a plain-text version. Push gets title and body with length limits. SMS gets `vi`, `vi-ascii` and `en`. `zalo_template` (ZBS Template Message, formerly ZNS) gets parameter mapping only, because the content is approved by Zalo.

**R8 Accessibility**
- Every icon-only control has a localized `accessibilityLabel` from the `a11y` namespace.
- Web sets `lang` on `<html>`, and on inline spans when mixed-language text appears.

**R9 Content**
- `LocalizedText` is a shared type and Zod schema in `packages/localization`.
- The API `pick(text, locale)` helper returns `{ value, locale, isFallback }`.

**R11 Marketing and hero text**
- Hero headlines, script accents and 3D labels are keys in `marketing` (e.g. `marketing.hero.accent1`). They can be swapped per campaign without a redeploy only if 02/10 add a CMS later; the keys stay the source.
- No user-visible text in raster or video assets, glTF textures or OG images, unless the image is generated per locale at build time from the same keys (OG images).
- Font gate: every display, serif and script font must render this test string at 48px and 96px without missing glyphs, fallback-font substitution, or overlapping marks: `Ầ Ẫ Ặ Ở Ữ Ỳ ầ ẫ ặ ở ữ ỳ đ Đ — Thương mình nhiều hơn, đẹp rạng rỡ mỗi ngày`. Results are recorded in `docs/domains/localization.md`. A font that fails is not used for vi, even if en uses it.
- Copy length: script accents in vi may run 20–40% longer than en. Layout uses wrap and auto-fit, never fixed widths.

**R10 Quality gates** (CI)
- Key parity.
- Placeholder parity.
- No empty values.
- No unused keys (warning).
- No hardcoded literals.
- Formatter snapshot tests for vi and en.
- A pseudo-locale (`en-XA`, dev only) to catch layout overflow and untranslated text.

## 4. Proposed technical approach

- `packages/localization` is platform-agnostic and must not import `react-native` or `expo`:
  - `locales.ts` (supported list, default, labels in their own language: "Tiếng Việt", "English")
  - `resources` (JSON)
  - `i18n-core.ts` (i18next factory)
  - `format/*`
  - `zod-error-map.ts`
  - `localized-text.ts`
  - `strip-diacritics.ts`
  - `templates/*`
- The app-side binding lives in `apps/app/services/i18n/`:
  - react-i18next provider.
  - Detector chain implementing the order in G3.
  - Native Intl polyfill loader, imported first in the root `_layout`.
  - Sync of the `[locale]` route param.
- Backend binding: a NestJS `I18nModule` that wraps the same core, plus an exception filter that maps domain errors to `{ code, params }`.
- Dictionaries are bundled statically: the total for 2 locales is small, and lazy loading adds complexity on native. Revisit if more than 4 locales are added.
- Translation management: JSON in the repo for now. Evaluating a TMS (Tolgee or Crowdin) is an open question once non-engineers translate.

## 5. Acceptance criteria

1. App start-up behaves as follows:
   - A fresh install on a vi device shows Vietnamese.
   - An en device shows English.
   - A fr device shows Vietnamese.
   - `/en/…` on web shows English regardless of the device.
2. Switching language on native updates all visible screens without a restart, and survives an app relaunch.
3. A signed-in user who switches to en receives the next booking notification in English on every channel.
4. CI fails when:
   - a key exists in only one locale;
   - placeholders differ between locales;
   - a JSX literal string is added under `apps/app` or `packages/design-system`.
5. `formatVND(150000, 'vi')` returns `150.000đ` (the recorded decision), and `formatVND(150000, 'en', { style: 'intl' })` returns `₫150,000`. Snapshot tests pass identically on Node, iOS Hermes and Android Hermes.
6. A booking at 09:00 Asia/Ho_Chi_Minh displays as 09:00 on a device set to Europe/Warsaw, with the timezone hint shown.
7. A Zod validation failure on the API returns `{code, params, field}`, and the client renders it in the active locale.
8. A sample of 30 vi strings, each tagged with its source string, passes native-speaker review: the vi strings follow the glossary and contain no literal translationese.
9. Every public page renders correct `lang`, `hreflang`, canonical and `og:locale`. This is verified by Playwright for both locales.
10. The VoiceOver and TalkBack labels on the booking flow are in the active locale (manual check on both platforms).
11. `stripDiacritics('Đặt lịch thành công')` returns `Dat lich thanh cong`.
12. Switching locale on the homepage changes every hero headline and script accent, including text inside the 3D scene and the native video fallback overlay. A grep or asset audit finds no text baked into `design/hero-*` exports or textures.
13. The chosen serif and script fonts pass the Vietnamese glyph test (R11) on web, iOS and Android, with screenshots attached to the font-decision ADR.

## 6. Product AI-agent surface (language behaviour)

- **Reply language.** The agent replies in the user's UI locale by default. If the user writes in the other language, the agent mirrors the message language. The system prompt contains the locale and the salon timezone.
- **Numbers and dates.** Tools return raw values (integers in đồng, ISO timestamps) plus server-formatted strings from `packages/localization`. The agent must quote the formatted strings and never re-format, so it cannot hallucinate formats.
- **Metric names.** Metric names and definitions come from the metrics catalogue (topic 07/08) with `LocalizedText` labels, so "doanh thu ước tính" is always "estimated revenue" and never "revenue".
- **Glossary.** The agent prompt includes the glossary subset for business terms: lịch hẹn, khách mới, khách quay lại, không đến (no-show), etc.
- **Evaluation.** The agent eval set has paired vi and en questions. Grading checks the language, the terminology and correct number formatting.
- **Optional tool `draft_translation`.** It drafts an English (or Vietnamese) version of salon-authored text. It is a write action, and the draft needs owner confirmation before publishing. Input is `{entity, field, targetLocale}`, output is `{draft}`. It requires the `salon.profile.edit` permission and is tenant-scoped. Source text is untrusted input.
- **Locale tools.** The agent uses no locale-specific tools beyond this. Locale is context, not a tool.

## 7. AI-first deliverables

- `.claude/agents/localization.md`: the i18n implementer and reviewer.
- `.claude/skills/localization/SKILL.md` plus `references/glossary.md` and `references/tone-guide.md`.
- `docs/domains/localization.md`: a skeleton filled in as code lands.
- An ADR to write when implementation starts: `docs/adr/NNNN-i18next-shared-dictionaries.md`.
- Rules for AI agents writing translations:
  - Write vi first, as natural Vietnamese for a gen-z audience.
  - Follow the glossary.
  - Never leave English in vi files.
  - Add the `i18n:vi-review` label.
  - Never invent legal or policy wording; flag it instead.

## 8. Dependencies

| Topic | Relationship |
|---|---|
| 01 | Package boundaries and the lint setup. |
| 02 | Picks fonts; serif and script display faces must pass the R11 Vietnamese glyph gate. Hero/3D text must be live localized text. Text-expansion tolerance in components. |
| 04 | `LocalizedText` JSONB columns, `preferredLocale` on User, ICU collation. |
| 05 | Phone parsing; OTP SMS wording. |
| 07 / 08 | Metric label catalogue; agent prompts. |
| 09 | ZBS Template Messages (`zalo_template`, formerly ZNS), approved per language; Zalo message language. |
| 10 | Routing with `[locale]`, hreflang and sitemaps, diacritic-insensitive search, address formatting. |
| 11 | Template rendering and per-channel selection, including `vi-ascii`. |
| 12 | Admin editing of taxonomy translations. |
| 13 | CI jobs, and Hermes test runs on device builds. |

## 9. Sub-milestones

| # | Milestone | Contents |
|---|---|---|
| M1 | Package skeleton | Package skeleton, locale config, `vi`/`en` `common` dictionaries, i18next factory, formatters, plus the **Hermes Intl spike**: run the formatter tests on iOS and Android dev builds and decide on polyfills. |
| M2 | App binding | Detector chain, `[locale]` route sync, switcher UI, persistence. |
| M3 | Quality gates | Parity, placeholder and literal-string lint in CI, pseudo-locale. |
| M4 | Shared validation | Zod error map, API error-code contract, backend i18n module. |
| M5 | Localized content | `LocalizedText` type, helper, migration guidance for 04. |
| M6 | Notification templates | Templates for the first events (booking created, confirmed, cancelled, reminder) for push, email and `zalo_template`. SMS (`vi`, `vi-ascii`, `en`) is deferred until an SMS provider exists (X12). |
| M7 | SEO metadata | Metadata helpers with 10. |
| M8 | Agent language behaviour | Language behaviour, plus paired eval questions with 08. |

## 10. Open questions for the product owner

- **Q1** ~~Price style~~ Answered (q27): `150.000đ` (see G7).
- **Q2** ~~Native reviewer~~ Answered (q12): the vi reviewer (owner's wife).
- **Q3** ~~SMS diacritics~~ Moot for now: no SMS (X12). Revisit when SMS is enabled.
- **Q4** Should salons be able to publish English descriptions drafted by the AI agent? This needs an English toggle per salon.
- **Q5** ~~Formality~~ Answered (q27): customer and marketing copy uses "bạn"; the salon CRM uses "anh/chị".
- **Q6** Should we adopt a TMS (Tolgee or Crowdin) before launch, or keep JSON in the repo?
- **Q7** ~~Copy approver~~ Answered (q49): the vi reviewer (owner's wife).
