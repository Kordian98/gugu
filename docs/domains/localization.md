# Localization domain

This is the durable reference for how GuGu handles languages, formats and localized content. Read it before touching strings, formatters or templates. The spec and rationale are in `docs/tasks/03-localization.md`, and the procedures are in `.claude/skills/localization/SKILL.md`.

> Status: skeleton. Sections marked _TBD_ get filled in as code lands.

## Summary
- Locales: `vi` (default), `en`. Configured in `packages/localization/src/locales.ts`.
- Runtime: i18next (API), plus react-i18next (app), sharing the same dictionaries.
- Formatters: `packages/localization/format/*`. They are the only allowed path to `Intl`.

## Locale resolution
URL segment (web) → user `preferredLocale` (server) → persisted local choice → device/`Accept-Language` if supported → `vi`. Implementation: _TBD_ (`apps/app/services/i18n/detector.ts`).

## File map
| Path | Purpose |
|---|---|
| `packages/localization/locales/<locale>/<ns>.json` | Dictionaries |
| `packages/localization/src/locales.ts` | Supported locales config |
| `packages/localization/format/` | Date, number, VND, phone, name and address formatters |
| `packages/localization/src/zod-error-map.ts` | Validation code → message |
| `packages/localization/src/localized-text.ts` | `LocalizedText` type and `pick()` |
| `packages/localization/templates/` | Notification templates (event × channel × locale) |
| `apps/app/services/i18n/` | App binding, detector, polyfills |
| `apps/api/src/common/i18n/` | Backend module, error filter |

## Invariants
See the skill's Invariants section; it is canonical.

## Decisions (owner)
- Prices in vi: `150.000đ` (q27).
- Address: customer and marketing copy uses "bạn"; the salon CRM uses "anh/chị" (q27).
- vi review and brand-copy approval: the vi reviewer (owner's wife) (q12, q49).
- No SMS for now (X12): `vi-ascii` variants are deferred.

## Error contract
The API error shape is `{ code: string; params?: Record<string, string | number>; field?: string }`. The code catalogue is _TBD_.

## Localized content (`LocalizedText`)
Shape: `{ vi: string; en?: string }`, plus `sourceLocale` on salon-authored entities. Columns that use it: _TBD_ (topic 04).

## Marketing and hero text
Hero headlines and script accents are `marketing` keys rendered as live text, including inside the 3D scene and over native video fallbacks. Never bake text into assets. Reference: `design/hero-references/ref-01-homepage-lilac-diorama.png` (editorial serif plus handwritten script accents). Key list: _TBD_.

## Font coverage
Results of the Vietnamese glyph gate (test string in the skill), per font, size and platform: _TBD_ (fonts are picked by topic 02).

| Font | Role | Web | iOS | Android | Result |
|---|---|---|---|---|---|

## Hermes Intl
Spike results and polyfill decisions: _TBD_ (M1).

## Notification templates
The event catalogue and channel variants (`vi`, `vi-ascii`, `en`, `zalo_template` parameter mapping) are _TBD_ (topics 11 and 09).

## AI agent language behaviour
The agent replies in the UI locale, or mirrors the language of the user's message. It quotes server-formatted values and uses glossary terms. Eval set location: _TBD_.

## Changelog
- 2026-11-02: skeleton created.
- 2026-11-02: ZNS renamed to `zalo_template` (ZBS Template Message, roadmap X2); hero text and font-coverage sections added.
- 2026-11-02: owner answers applied (q12, q27, q49, X12).
