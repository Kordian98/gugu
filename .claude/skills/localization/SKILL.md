---
name: localization
description: Procedures for GuGu localization (vi default, en second). Use when you add or change a UI string or translation key, create a namespace, add a locale, write notification templates, format dates, times, VND, phone numbers or addresses, or write Vietnamese copy. Triggers: t(), i18n, translation, locales/, LocalizedText, formatVND, hreflang, "Tiếng Việt".
---

# Localization

GuGu ships Vietnamese (`vi`, default) and English (`en`). The app (react-i18next) and the API (i18next) share the dictionaries and formatters in `packages/localization`. The full spec is `docs/tasks/03-localization.md`.

## When to use
- Any change that adds user-visible text, including accessibility labels, placeholders, push and email copy, SEO meta, and agent prompts.
- Any display of a date, time, duration, price, number, phone number, name or address.
- Adding a namespace or a locale.

## Invariants
- MUST put every string in `packages/localization/locales/<locale>/<namespace>.json`. No literals in JSX, and never in `accessibilityLabel`, `placeholder` or `title`.
- MUST keep the key set and the `{{placeholders}}` identical in all locales. CI enforces this.
- MUST write `vi` first, in natural Vietnamese that follows `references/tone-guide.md` and `references/glossary.md`.
- MUST format values through `packages/localization/format/*`. MUST NOT call `Intl` or `toLocaleString` directly.
- MUST show appointment times in the salon's timezone.
- MUST NOT put user-facing prose in API responses. Return `{ code, params, field }`.
- MUST NOT split Vietnamese names into first and last name. Use `fullName` and the `givenName()` helper.
- MUST add the PR label `i18n:vi-review` when any vi string is new or changed.
- MUST NOT bake text into images, video, glTF textures, posters or 3D scenes. Hero headlines and script accents are `marketing` keys rendered as live text (OG images may be generated per locale from keys at build time).
- MUST only use display, serif and script fonts that pass the Vietnamese glyph gate (see "Check a font for Vietnamese").
- MUST use the right register: marketing (playful) or CRM (calm). See `references/tone-guide.md`.

## Procedures

### Add a key
1. Pick the namespace by feature: `booking`, `salon`, `crm`, etc. Shared words go in `common`, error messages in `errors`/`validation`, screen-reader text in `a11y`.
2. Name the key by meaning, nested in camelCase, e.g. `booking.summary.payAtSalon`.
3. Add the `vi` value first, then `en`. Use the same placeholders.
4. For counts, add `_other` in `vi` (Vietnamese has no plural forms) and `_one` plus `_other` in `en`.
5. Use it as `t('booking:summary.payAtSalon')`. Typed keys catch typos at compile time.
6. Run `pnpm --filter @gugu/localization test` and lint.

### Add a namespace
1. Create `locales/vi/<ns>.json` and `locales/en/<ns>.json` with the same keys.
2. Register the namespace in `packages/localization/src/resources.ts` and the type declarations.
3. Add it to the parity test fixture list if that list is not auto-discovered.

### Add a locale
1. Add the locale to `src/locales.ts`: its code, its label written in its own language, Intl tag, `og:locale`, and fallback.
2. Copy the `en` folder as a base and translate every value. Never ship English placeholders.
3. Add the formatter snapshot cases and the notification templates for every event × channel.
4. Add the locale to the Expo config `supportedLocales`, to sitemap and hreflang generation, and to the agent eval set.
5. Verify the Hermes Intl output on device builds, and add polyfill locale data if needed.

### Add a notification template
Templates live in `templates/<event>/<channel>.<locale>.*`.
- SMS needs `vi`, `vi-ascii` (generated with `stripDiacritics`, then reviewed for ambiguity) and `en`.
- `zalo_template` (ZBS Template Message, formerly ZNS) only maps parameters, because Zalo approves the wording (topic 09).
- Push keeps the title at 40 characters or fewer and the body at 120 or fewer.

### Add hero or marketing copy
1. Add keys under `marketing` (e.g. `marketing.hero.headline`, `marketing.hero.accent1`).
2. Write vi natively in the marketing register, offering 2–3 options in the PR description. Don't translate the en line word for word.
3. Render as live text. In 3D use runtime text (R3F `Text`). On native video fallbacks, overlay the text on the video.
4. Check that vi wraps and fits at small mobile and wide desktop widths; vi can be 20–40% longer.
5. Add the labels `i18n:vi-review` and `copy:brand`; the copy needs brand-copy approval (Q7).

### Check a font for Vietnamese
Render `Ầ Ẫ Ặ Ở Ữ Ỳ ầ ẫ ặ ở ữ ỳ đ Đ — Thương mình nhiều hơn, đẹp rạng rỡ mỗi ngày` at 48px and 96px on web, iOS and Android. Fail the font on any of these: missing glyphs, fallback-font substitution, marks clipped by line-height, or marks colliding. Record the result in `docs/domains/localization.md` → "Font coverage".

### Display localized database content
Use `pick(localizedText, locale)` to get `{ value, isFallback }`. When `isFallback` is true and the content was authored by a salon, show the "original language" badge.

## Pre-PR checklist
- [ ] No literal strings (lint passes).
- [ ] vi/en parity and placeholder parity pass.
- [ ] Copy is checked against the glossary; diacritics are verified.
- [ ] Dates, prices and phone numbers go through formatters; the timezone is the salon's.
- [ ] Layout was checked in vi (longer strings) and in the `en-XA` pseudo-locale.
- [ ] The `i18n:vi-review` label is added if vi changed.
- [ ] No text baked into images, video or 3D assets; any new display font passes the Vietnamese glyph gate.
- [ ] The string uses the right register (marketing vs CRM).

## References
- `references/tone-guide.md`: voice, marketing vs CRM registers, hero accent drafts, formatting conventions
- `references/glossary.md`: canonical vi/en product terms
