---
name: design-system
description: GuGu design-system procedures — adding/changing tokens, themes, surface modes (expressive vs calm), motion, shared components, platform-split components, charts/ChartSpec, and the UI review checklist. Use whenever editing packages/design-system, styling screens in apps/app, or reviewing UI.
---

# GuGu design system

One token source powers a bold **expressive** mode (public marketplace, customer) and a quiet **calm** mode (business, staff, admin) across iOS, Android and web. Spec: `docs/tasks/02-design-system.md`. Durable reference: `docs/domains/design-system.md`.

## Art direction: Lilac Glow
Source: `design/hero-references/README.md` (ref-01). A cream canvas, pastel lilac/pink/peach, **plum-black ink** for all text and primary buttons, editorial serif headlines with one gradient word (`gradient.glow`), handwritten script accents, glossy jelly/glass 3D, soft wide radii (24–28) and pill buttons.
- Fonts: display **Noto Serif Display** (wght 800–900, wdth ≈ 75–87.5%; alt Playfair Display), UI **Be Vietnam Pro**, script **Playwrite VN** (alt Dancing Script). All have Vietnamese subsets. Never swap in a font without the glyph test; paid fonts allowed only with full Vietnamese + web/app license.
- Logo: `design/branding/` SVGs via `Logo`/`LogoMark`; rules in `design/branding/README.md`.
- Dark mode ships at launch for marketplace and CRM: every component and screen is verified in both themes.
- Expressive = full Lilac Glow. Calm = palette + UI sans only: no serif display in data views, no script, no gradient, no 3D.
- Pastels never carry text; text on pastel is ink.

## When to use
- Creating or modifying any UI component or screen styling.
- Adding a color, size, spacing, radius, shadow, motion value, or breakpoint.
- Rendering charts or AI-agent output.
- Reviewing UI (use the checklist at the end).

## Invariants
- MUST style with semantic tokens (`color.fg.default`, `space.4`, `radius.lg`, `motion.base`). MUST NOT use raw hex, numeric font sizes, or ad-hoc spacing outside `packages/design-system/src/tokens/`.
- MUST NOT put user-facing strings in components. Take translated strings / i18n keys (topic 03).
- MUST pick the mode by route group: `(public)`, `(customer)` → expressive; `(business)`, `(staff)`, `(admin)` → calm. Calm: no decorative motion, no 3D, no bouncy springs.
- MUST honor reduced motion (`useReducedMotion()` from the design system).
- MUST convey status with icon + label, not color alone.
- MUST format money/dates/numbers through topic 03 formatters (`PriceTag`, `FormattedDate`…), never inline.
- Platform files only when behavior genuinely differs; shared props type lives in the base file.

## Procedures

### Add a token
1. Add the primitive (if new) in `src/tokens/primitives.ts`.
2. Map it to a semantic name in `semantic.light.ts` **and** `semantic.dark.ts`.
3. If mode-specific, add to `modes.ts` (`expressive`/`calm`).
4. Run the generators (`build/generate-nativewind-theme.ts`, `build/generate-css-vars.ts`).
5. Run the contrast check for any new fg/bg pair.
6. Note the change in `docs/domains/design-system.md#tokens`.

### Add a component
1. Folder `src/components/<Name>/` with `<Name>.tsx`, `<Name>.types.ts`, `index.ts`, `<Name>.meta.ts`, story/catalog entry.
2. Implement variants, sizes and all states: default, hover (web), pressed, focused, disabled, loading, error.
3. a11y: `accessibilityRole`, label/hint props, focus ring on web, ≥44×44 hit area (`hitSlop` if visually smaller).
4. Light + dark verified; Vietnamese sample text in the story.
5. Split into `.native.tsx` / `.web.tsx` only if needed (e.g. `Sheet`, `DataTable`, `Calendar`); keep logic in a shared hook.
6. Export `meta` (name, mode support, variants, short props summary) — agents use it for discovery.
7. Add to the inventory in `docs/domains/design-system.md#components`.

### Render a chart / agent output
1. Data arrives as a `ChartSpec` (type, series, unit: `vnd|count|percent|minutes`, locale).
2. Render with the design-system chart primitives; never accept HTML/markdown from the agent.
3. Untrusted text (customer notes, reviews, Zalo messages) renders as plain text.

### Pick motion
- Durations: `fast` 120, `base` 200, `slow` 320, `deliberate` 500 ms. Springs: `snappy`, `gentle`, `bouncy` (expressive only).
- Entry stagger ≤ 8 items, 40 ms. No scroll-jacking. Reduced motion → crossfade or none.
- Page micro-interactions (hearts, cards, tiles, CTA arrows, gradient drift, script draw-on, floating sprites) are DOM/CSS/Reanimated, never extra WebGL canvases. Spec: `docs/tasks/02-design-system.md` §4.4.

### Use the gradient and script
- `gradient.glow` as text fill on ≤ 2 headline words per screen; never body text, buttons or calm mode.
- Script: live i18n text, ≤ 5 words, rotated −6° to −12°, decorative (`aria-hidden` if it duplicates meaning), loaded lazily.

## Checklist (before PR)
- [ ] No hardcoded strings; no raw style values.
- [ ] Correct mode for the route group.
- [ ] All states + loading/empty/error for data UI.
- [ ] Light/dark ok; contrast check passes.
- [ ] Reduced-motion path tested.
- [ ] Vietnamese diacritics render unclipped (ặ ỗ ừ ỹ Ữ Ặ).
- [ ] Web: keyboard + focus visible. Native: screen reader labels.
- [ ] Catalog entry + `meta` + domain doc updated.
- [ ] `design-reviewer` approved.

## References
- `references/vietnamese-typography.md` — glyph test and font rules.
