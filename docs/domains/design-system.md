# Design system (domain doc)

Durable reference for GuGu's design system: tokens, surface modes, typography, motion, components, charts, and the homepage 3D hero. Read this before changing UI. Task spec: `docs/tasks/02-design-system.md`. Procedures: `.claude/skills/design-system/`, `.claude/skills/3d-hero/`.

> Status: skeleton — sections are filled in as implementation lands.

## Art direction
_Selected route: TBD (see DS-1)._

## Surface modes
| Mode | Route groups | Character |
|---|---|---|
| expressive | `(public)`, `(customer)` | bold type, playful motion, 3D hero |
| calm | `(business)`, `(staff)`, `(admin)` | dense, legible, minimal motion |

## Tokens
_File map: `packages/design-system/src/tokens/`. Tables of semantic tokens (light/dark) go here._

## Typography
_Families, weights, scale, line-heights. Vietnamese rules: `.claude/skills/design-system/references/vietnamese-typography.md`._

## Motion
_Duration/easing/spring tokens and choreography rules._

## Components
_Inventory table: name · modes · platform split · status · catalog link._

## Charts & agent output
_ChartSpec contract (shared with topic 08), AgentMessage, ActionConfirmCard._

## Hero
_Hero brief (after reference intake), storyboard links, asset manifest, current budget measurements._

## Decisions
_Links to ADRs in `docs/adr/`._
