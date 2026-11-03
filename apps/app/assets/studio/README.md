# GuGu Studio landing — product captures

Real captures of the GuGu Studio CRM (business workspace, `?demo=1` demo data, light theme) used by the
landing (`apps/app/features/landing`). Regenerate whenever the CRM changes:

```bash
pnpm --filter @gugu/app web -- --port 8094   # any running dev server
node scripts/capture-studio-screens.mjs http://localhost:8094
```

The script writes `<locale>/<shot>.webp` and `manifest.json` (pixel sizes). Dev error overlays are hidden
during capture.

| Shot | Source screen | Used in |
|---|---|---|
| `overview` | Overview (Today) | — (reserve) |
| `timeline` | Overview → Today's timeline card | Story: team calendar |
| `upcoming` | Overview → Upcoming appointments card | Hero card, Story: clients |
| `kpis` | Overview → KPI row | Hero card, Story: insights |
| `ai-setup` | Services → AI setup banner | Story: AI setup |

## Temporary placeholders (replace with captures when the screens exist)

- **Client list / client profile** — not built yet; the clients chapter uses the Upcoming appointments card.
- **AI price-list import** — the import screen is not built; the AI chapter shows a hand-written price-list
  card (`PriceListCard`) above the real Services AI banner.
- **Zalo / email messages, AI assistant chat, finale chat** — illustrative UI mockups (labelled
  "Message examples are illustrative"); replace with captures of the message composer / assistant panel
  once they exist.
