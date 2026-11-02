"""Prompt builder: reads STYLE.md blocks and emits JSON params for fal.py."""
import json, sys
from pathlib import Path
S = (Path(__file__).resolve().parents[1] / "STYLE.md").read_text()
STYLE = S.split("## Style block\n```\n")[1].split("```")[0].replace("\n", " ").strip()
AVOID = S.split("## Avoid block")[1].split("```\n")[1].split("```")[0].replace("\n", " ").strip()

MASTER = ("Render only the 3D isometric beauty-salon diorama from image 1 as a standalone hero illustration: no website, no UI, no buttons, no headline. "
  "Keep the composition idea of image 1: a two-level open salon on a curved glossy lilac glass plinth with a glossy staircase spilling down toward the front right. "
  "Zones: nail station front-left with the nail technician and nail client from image 2 doing a manicure; hair area back-center with tall arched gold-framed mirrors, "
  "the hair stylist from image 2 drying the hair client's hair in a pink styling chair; skincare shelving with pastel bottles and a facial bed back-right with the sheet-mask client from image 2; "
  "spa massage bed with candles on the right; reception front-right with a glossy pink rounded desk, the receptionist from image 2, and a curved pink sofa with a small gold coffee table; "
  "a blank smooth lilac brand wall above the reception (leave it completely empty); potted plants; warm lamps. Characters exactly as designed in image 2. "
  "Floating around the diorama: a glossy translucent pink jelly heart and a lilac nail-polish bottle. Diorama centered with generous empty cream margin around it. ")

def build(kind, **kw):
    if kind == "master":
        p = MASTER + STYLE + " " + AVOID
    else:
        p = kw["prompt"] + " " + STYLE + " " + AVOID
    d = {"prompt": p, "output_format": "png", "resolution": kw.get("res", "1k"), "aspect_ratio": kw.get("ar", "auto")}
    return json.dumps(d)

if __name__ == "__main__":
    kind = sys.argv[1]
    kw = dict(a.split("=", 1) for a in sys.argv[2:])
    print(build(kind, **kw))
