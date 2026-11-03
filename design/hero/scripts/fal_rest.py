#!/usr/bin/env python3
"""
Minimal fal REST helper for the landing walk-through (used when the MCP account is out of credits).
Reads FAL_KEY from the environment only; never prints, logs or writes it.

  set -a; . ./.env; set +a
  python3 design/hero/scripts/fal_rest.py upload <file>                 -> prints file_url
  python3 design/hero/scripts/fal_rest.py run <endpoint> <json-input>   -> prints result JSON (+ request_id)
"""
import json
import os
import sys
import time
import urllib.request

KEY = os.environ.get("FAL_KEY")
if not KEY:
    sys.exit("FAL_KEY missing in environment")
H = {"Authorization": f"Key {KEY}", "Content-Type": "application/json"}


def req(method: str, url: str, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers=headers or H)
    with urllib.request.urlopen(r, timeout=120) as resp:
        return json.loads(resp.read() or b"{}")


def upload(path: str) -> str:
    ctype = "image/jpeg" if path.endswith((".jpg", ".jpeg")) else "video/mp4" if path.endswith(".mp4") else "image/png"
    init = req("POST", "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
               {"content_type": ctype, "file_name": os.path.basename(path)})
    with open(path, "rb") as f:
        put = urllib.request.Request(init["upload_url"], data=f.read(), method="PUT", headers={"Content-Type": ctype})
        urllib.request.urlopen(put, timeout=300).read()
    return init["file_url"]


def run(endpoint: str, inp: dict) -> dict:
    sub = req("POST", f"https://queue.fal.run/{endpoint}", inp)
    rid = sub["request_id"]
    status_url = sub["status_url"]
    while True:
        time.sleep(5)
        st = req("GET", status_url)
        if st.get("status") == "COMPLETED":
            break
        if st.get("status") not in ("IN_QUEUE", "IN_PROGRESS"):
            raise SystemExit(f"{rid}: {st}")
    out = req("GET", sub["response_url"])
    out["_request_id"] = rid
    return out


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "upload":
        print(upload(sys.argv[2]))
    elif cmd == "run":
        print(json.dumps(run(sys.argv[2], json.loads(sys.argv[3]))))
