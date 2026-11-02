# GuGu brand assets: usage rules

Final logo and icon delivered by the product owner (2026-11-02; wordmark confirmed final, q50). This file says which file to use where, how much space it needs, and how platform icons are derived. Design-system code renders these SVGs verbatim via `Logo` / `LogoMark`; never redraw or retype the wordmark.

## Safari fix (2026-11-02)

The delivered SVGs cut the "g" counters with `<mask id="knockout">` (`maskContentUnits="userSpaceOnUse"`), which Safari/WebKit renders as black holes. The files at the paths above are **mask-free equivalents**: each hole subpath is merged into the letter path that contains it as a compound path with `fill-rule="evenodd"`; viewBox and colours are unchanged. Chrome renders them pixel-identical to the originals (max channel difference 1). The owner's originals are kept untouched in `original/`. The Expo app uses these SVGs through `@gugu/design-system` `Logo` (react-native-svg `SvgXml`, generated into `packages/design-system/src/brand/logoXml.ts`).

## Files

| File | Content | Colors | Use on |
|---|---|---|---|
| `gugu-logo.svg` | mark + wordmark, horizontal (≈ 2.47 : 1) | mark `#A98BEB` lilac.500, eye dot + wordmark `#2A1426` plum.950 | light backgrounds (cream, white, blush, light lilac) |
| `gugu-logo-on-dark.svg` | mark + wordmark, horizontal | mark `#A98BEB`, wordmark `#F6B8CC` pink.300 | dark backgrounds (dark theme canvas `#1A0E18`, plum, photos with dark overlay) |
| `gugu-logo-monochrome.svg` | mark + wordmark, single color | `#2A1426` (recolorable to white or any single token) | one-color contexts: stamps, receipts, embossing, watermarks, partner lists |
| `gugu-icon.svg` | mark only, square viewBox | `#A98BEB` + plum eye dot | app icon source, avatars, favicon, compact nav |
| `gugu-icon-monochrome.svg` | mark only, single color | `#2A1426` | Android themed icon, notification small icon (as white), favicon fallback |

Token check: `#A98BEB` = `lilac.500`, `#2A1426` = `plum.950`, `#F6B8CC` = `pink.300`. The delivered colors match the palette in `docs/tasks/02-design-system.md` §3.2 exactly.

Wordmark note: the delivered wordmark (rounded geometric "gugu") supersedes the lettering shown in ref-01. The diorama brand wall and reception desk use the delivered logo, composited in post.

## Clear space

Unit **x** = the height of the lowercase "u" in the wordmark (≈ 0.3 × logo height).
- Horizontal logo: keep **1 x** clear on every side. No text, edges, or other logos inside it.
- Icon: keep **0.15 × icon width** clear on every side (the mark's tail and eye dot extend close to the viewBox edge).

## Minimum sizes

| Asset | Digital min | Print min |
|---|---|---|
| Horizontal logo | 96 px wide (≈ 39 px tall) | 25 mm wide |
| Icon (full color) | 24 px | 8 mm |
| Icon (favicon) | 16 px: use the monochrome or full-color mark; the petal gaps must stay open. If they close, use a simplified 16 px export (gaps widened) |

Below the horizontal minimum, use the icon alone.

## Do / don't

- Do use `gugu-logo.svg` on light, `gugu-logo-on-dark.svg` on dark. On mid-tone pastels (lilac.300, pink.300) use the monochrome logo in plum.950.
- Do place the logo on photos only over a calm area or a scrim that gives ≥ 3:1 contrast against the wordmark.
- Don't recolor the two-color logo, add gradients, glows, shadows, outlines or 3D effects to the wordmark (the 3D jelly look is for props, not the logo). Exception: the neon/glossy version composited into the hero diorama, approved per output.
- Don't stretch, rotate, rearrange mark and wordmark, or set "gugu" in another font.
- Don't put `gugu-icon.svg` (plum eye dot) on dark backgrounds: the dot disappears. Use the on-dark icon variant (approved, q76) or the monochrome icon in white.

## Platform derivations (generated, not hand-made)

All exports are generated from the SVGs by a script owned by topic 13 (`infra` asset pipeline); outputs go to `apps/app/assets/brand/`.

| Target | Spec |
|---|---|
| **iOS app icon** | 1024×1024 PNG, no transparency, no rounded corners (iOS masks). Background cream `#FBF6F3`; `gugu-icon.svg` centered at **62 %** of the canvas width. iOS 18 variants: **dark** = mark lilac + eye dot pink.300 on `#1A0E18`; **tinted** = monochrome mark (system tints). |
| **Android adaptive icon** | 108×108 dp layers. Foreground: mark centered inside the 66 dp safe zone (mark ≤ 60 dp wide), transparent PNG/vector. Background: solid cream `#FBF6F3`. **Monochrome layer** (Android 13+ themed icons): `gugu-icon-monochrome.svg` in the same safe zone. |
| **Android notification icon** | white-only silhouette of the mark on transparency, 24 dp (mdpi) → xxxhdpi; accent color `#A98BEB`. |
| **Favicon set (web)** | `favicon.svg` (mark; `prefers-color-scheme` media query switches the eye dot to pink.300 in dark), `favicon.ico` (16/32/48), `apple-touch-icon.png` 180×180 (cream background, 62 % mark), PWA `icon-192.png`, `icon-512.png`, `maskable-512.png` (mark ≤ 60 % for the maskable safe zone). |
| **Splash screen** (`expo-splash-screen`) | Light: mark on cream `#FBF6F3`; dark: on-dark mark on `#1A0E18`. Image width 200 dp, centered; no wordmark (keeps it crisp on small screens). Native splash hides once fonts + locale load, then the app fades from the same background. |
| **Zalo OA / social avatars** | 1024×1024, cream background, mark at 62 %; safe for circular crop (mark inside the central 80 % circle). |
| **Open Graph default** | 1200×630, horizontal logo on cream with a lilac-glow blob; localized tagline as live text in the template (topic 10). |
| **Email header** | horizontal logo PNG @2x, 160 px display width, on white/cream; on-dark variant for dark-mode email clients via `prefers-color-scheme` where supported. |

## Pending

- None. On-dark icon variant (eye dot `#F6B8CC`) approved by the PO (q76); generated by the asset script.
