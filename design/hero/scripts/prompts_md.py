"""Regenerate design/hero/PROMPTS.md from scripts/runs.jsonl (no secrets are ever logged)."""
import json
from pathlib import Path
here = Path(__file__).resolve().parent
rows = [json.loads(l) for l in (here / "runs.jsonl").read_text().splitlines() if l.strip()]
out = ["# Hero generation log", "",
       "Every fal.ai call for the hero and homepage prototype, generated from `scripts/runs.jsonl` by `scripts/prompts_md.py`. FLUX 3 edit and Kling v4 expose no seed parameter, so the fal request ID plus the exact prompt and reference files are the reproducibility record. Costs are estimates from the fal model pages (2K FLUX tier and BiRefNet price not verified; check the fal dashboard for the actual bill).", "",
       f"**Calls:** {len(rows)} · **Estimated spend:** ${sum(r.get('est_cost_usd', 0) for r in rows):.2f}", "",
       "| # | Name | Endpoint | Request ID | Refs | Output | Est. $ |", "|---|---|---|---|---|---|---|"]
for i, r in enumerate(rows, 1):
    refs = "<br>".join(f"`{x}`" for x in r.get("refs", []))
    files = "<br>".join(f"`{x}`" for x in r.get("files", []))
    out.append(f"| {i} | {r['name']} | `{r['endpoint']}` | `{r['request_id']}` | {refs} | {files} | {r.get('est_cost_usd', 0):.3f} |")
out += ["", "## Prompts and settings", ""]
for i, r in enumerate(rows, 1):
    p = dict(r.get("params", {}))
    prompt = p.pop("prompt", "")
    out += [f"### {i}. {r['name']}", f"- Endpoint: `{r['endpoint']}` · at {r['at']}", f"- Settings: `{json.dumps(p, ensure_ascii=False)}`"]
    if prompt:
        out += ["", "```", prompt, "```"]
    out.append("")
(here.parent / "PROMPTS.md").write_text("\n".join(out))
print("wrote PROMPTS.md")
