#!/usr/bin/env python3
"""Minimal fal.ai queue client for GuGu hero production.

Reads FAL_KEY from the environment or the git-ignored repo-root .env.
Never prints, logs or writes the key. Logs every call (without the key)
to design/hero/scripts/runs.jsonl.

Usage:
  python3 design/hero/scripts/fal.py ENDPOINT --params '{"prompt": "..."}' \
      [--refs a.png b.png --ref-field image_urls] [--start img --end img] \
      --out design/hero/raw --name master-v1 --cost 0.048
"""
import argparse
import base64
import io
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
LOG = Path(__file__).resolve().parent / "runs.jsonl"


def load_key() -> str:
    key = os.environ.get("FAL_KEY")
    if key:
        return key
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if line.startswith("FAL_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("FAL_KEY not set (env or repo-root .env)")


def data_uri(path: str, max_side: int = 1536) -> str:
    img = Image.open(path)
    has_alpha = img.mode in ("RGBA", "LA") or "transparency" in img.info
    img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    if has_alpha:
        img.convert("RGBA").save(buf, "PNG")
        mime = "image/png"
    else:
        img.convert("RGB").save(buf, "JPEG", quality=92)
        mime = "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(buf.getvalue()).decode()


def run(endpoint: str, payload: dict, key: str, timeout: int = 900) -> tuple[dict, str]:
    headers = {"Authorization": f"Key {key}", "Content-Type": "application/json"}
    r = requests.post(f"https://queue.fal.run/{endpoint}", json=payload, headers=headers, timeout=120)
    if r.status_code >= 400:
        sys.exit(f"submit failed {r.status_code}: {r.text[:800]}")
    sub = r.json()
    rid = sub["request_id"]
    status_url = sub.get("status_url")
    response_url = sub.get("response_url")
    t0 = time.time()
    while True:
        s = requests.get(status_url, headers=headers, timeout=60)
        st = s.json().get("status")
        if st == "COMPLETED":
            break
        if st not in ("IN_QUEUE", "IN_PROGRESS"):
            sys.exit(f"request {rid} status {st}: {s.text[:800]}")
        if time.time() - t0 > timeout:
            sys.exit(f"request {rid} timed out")
        time.sleep(3)
    res = requests.get(response_url, headers=headers, timeout=120)
    if res.status_code >= 400:
        sys.exit(f"result failed {res.status_code}: {res.text[:800]}")
    return res.json(), rid


def collect_urls(obj, found=None):
    found = [] if found is None else found
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "url" and isinstance(v, str) and v.startswith("http"):
                found.append(v)
            else:
                collect_urls(v, found)
    elif isinstance(obj, list):
        for v in obj:
            collect_urls(v, found)
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("endpoint")
    ap.add_argument("--params", default="{}")
    ap.add_argument("--refs", nargs="*", default=[])
    ap.add_argument("--ref-field", default="image_urls")
    ap.add_argument("--start")
    ap.add_argument("--start-field", default="start_image_url")
    ap.add_argument("--end")
    ap.add_argument("--end-field", default="end_image_url")
    ap.add_argument("--image")
    ap.add_argument("--image-field", default="image_url")
    ap.add_argument("--max-side", type=int, default=1536)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--cost", type=float, default=0.0, help="estimated USD for the log")
    a = ap.parse_args()

    payload = json.loads(a.params)
    if a.refs:
        payload[a.ref_field] = [data_uri(p, a.max_side) for p in a.refs]
    if a.start:
        payload[a.start_field] = data_uri(a.start, a.max_side)
    if a.end:
        payload[a.end_field] = data_uri(a.end, a.max_side)
    if a.image:
        payload[a.image_field] = data_uri(a.image, a.max_side)

    result, rid = run(a.endpoint, payload, load_key())
    out = Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    files = []
    for i, url in enumerate(collect_urls(result)):
        ext = Path(url.split("?")[0]).suffix or ".bin"
        dest = out / (f"{a.name}{'' if i == 0 else '-' + str(i)}{ext}")
        dest.write_bytes(requests.get(url, timeout=300).content)
        files.append(str(dest.relative_to(ROOT)))

    meta = {k: v for k, v in result.items() if k not in ("images", "image", "video")}
    entry = {
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "endpoint": a.endpoint,
        "request_id": rid,
        "name": a.name,
        "params": {k: v for k, v in payload.items() if not str(v).startswith("data:") and not (isinstance(v, list) and v and str(v[0]).startswith("data:"))},
        "refs": a.refs + [p for p in (a.start, a.end, a.image) if p],
        "files": files,
        "est_cost_usd": a.cost,
        "result_meta": meta,
    }
    with LOG.open("a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(json.dumps({"request_id": rid, "files": files, "meta": meta}, ensure_ascii=False)[:1500])


if __name__ == "__main__":
    main()
