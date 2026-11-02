# Vietnamese typography rules

Vietnamese stacks a tone mark on top of a vowel diacritic (ặ, ỗ, ừ, Ẫ). Many display fonts lack these glyphs or clip them at tight line-heights.

## Test string (use in every font evaluation and screenshot test)

```
Đặt lịch làm đẹp nhanh chóng — Tiệm nail Ngọc Ánh, Quận Bình Thạnh
ẶẰẲẴẮ ẬẦẨẪẤ ỆỀỂỄẾ ỘỒỔỖỐ ỢỜỞỠỚ ỰỪỬỮỨ ỴỲỶỸÝ Đđ
ặằẳẵắ ậầẩẫấ ệềểễế ộồổỗố ợờởỡớ ựừửữứ ỵỳỷỹý
Gội đầu dưỡng sinh 150.000 ₫ · Chăm sóc da mặt · Uốn mi
```

## Rules
- A font is eligible only if it has the full Vietnamese set (Google Fonts "Vietnamese" language support is a first filter, not proof).
- Render the test string at every shipped weight and every typography token; nothing may be clipped by the line box on iOS, Android or web.
- Body line-height ≥ 1.4; display ≥ 1.15 (raise if the test fails). Uppercase display text needs extra top room.
- Web: self-host with `latin`, `latin-ext`, `vietnamese` subsets. Some tooling drops the Vietnamese subset when downloading Google Fonts — verify the files contain U+1EA0–1EF9.
- Native: load via `expo-font`; check Android does not fall back to a system font for tone-marked glyphs.
- Default UI face: Be Vietnam Pro (OFL, 9 static weights — ship max 4).
- Display serif: Playfair Display (alt Noto Serif Display). Script: Playwrite VN (alt Dancing Script, Charm, Pangolin, Patrick Hand).
- Known NOT eligible (no Vietnamese subset in Google Fonts CSS API, checked 2026-11-02): Bodoni Moda, Instrument Serif, DM Serif Display, Young Serif, Gloock, Caveat, Shadows Into Light, Gochi Hand, Nothing You Could Do.
- Quick check: `curl -s -A "<desktop Chrome UA>" "https://fonts.googleapis.com/css2?family=<Name>" | grep -o '/\* [a-z-]* \*/'` must list `vietnamese`, or a single non-subset file must contain U+1EA0–1EF9 (e.g. Playwrite VN).
- Display at tight leading (≈1.0): test uppercase-start words with stacked marks ("Đặt", "Ưu đãi", "Ở đây") at the largest token.
- Currency: `₫` symbol placement and spacing come from the topic 03 VND formatter.
