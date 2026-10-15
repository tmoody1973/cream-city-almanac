#!/usr/bin/env python3
"""Weekly Health Compass Milwaukee download for Cream City Almanac (spec 2026-10-15-zip-health; decision 050).

Cloudflare in front of Health Compass refuses Convex's servers, so this runs on a server it accepts (Hetzner, by cron)
and posts Health Compass's own answers to Convex, which parses, picks and stores them. Standard library only.

    health-compass-push.py /etc/creamcity/health-compass-dev.env

The env file holds ALMANAC_SITE (https://<deployment>.convex.site) and HEALTH_PUSH_SECRET. On any failure it tells
Convex why (the card keeps last week's figures and says how old they are) and exits 1.
"""
import json
import sys
import time
import urllib.error
import urllib.request

HC_API = "https://healthcompassmilwaukee.org/api/v1"
USER_AGENT = "CreamCityAlmanac/1.0 (+https://www.creamcityalmanac.app)"
TIMEOUT_S = 30
PACE_S = 1.0  # one request a second
WAITS_S = [2, 5]  # retries for a busy (429) or failing (5xx) answer
DEADLINE_S = 5 * 60


def read_env(path: str) -> dict[str, str]:
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    for k in ("ALMANAC_SITE", "HEALTH_PUSH_SECRET"):
        if not out.get(k):
            raise SystemExit(f"{path} has no {k}")
    return out


def request(url: str, headers: dict[str, str] | None = None, body: object = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT, "Accept": "application/json", **(headers or {})})
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as res:
        return json.load(res)


def health_compass(url: str) -> dict:
    for i in range(len(WAITS_S) + 1):
        try:
            return request(url)
        except urllib.error.HTTPError as e:
            if i >= len(WAITS_S) or not (e.code == 429 or e.code >= 500):
                raise RuntimeError(f"Health Compass request failed: {e.code}") from None
            time.sleep(WAITS_S[i])
    raise RuntimeError("unreachable")


def download(targets: list[dict]) -> dict:
    stop_at = time.monotonic() + DEADLINE_S
    pages, url = [], f"{HC_API}/topics/?limit=500"
    while url and len(pages) < 20:
        page = health_compass(url)
        pages.append(page)
        url = page.get("next") if isinstance(page, dict) else None
    places = []
    for t in targets:
        if time.monotonic() > stop_at:
            raise RuntimeError("Health Compass took too long; stopped at the deadline")
        page = health_compass(f"{HC_API}/data/?layer={t['layer']}&geography={t['geo']}")
        rows = page.get("results") if isinstance(page, dict) else None
        # Whole population only: what Ask keeps, and a tenth of the upload.
        whole = [r for r in rows if isinstance(r, dict) and r.get("p") == ""] if isinstance(rows, list) else rows
        places.append({"layer": t["layer"], "geo": t["geo"], "data": {"results": whole}})
        time.sleep(PACE_S)
    return {"topics": pages, "places": places}


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    cfg = read_env(sys.argv[1])
    site = cfg["ALMANAC_SITE"].rstrip("/")
    auth = {"Authorization": f"Bearer {cfg['HEALTH_PUSH_SECRET']}"}
    started = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        targets = request(f"{site}/health-compass/targets", auth)["places"]
        result = request(f"{site}/health-compass", auth, download(targets))
        print(f"{started} stored: {json.dumps(result)}")
        return 0 if result.get("ok") else 1
    except Exception as e:  # tell Convex why, so the card's status says it, then fail the cron run
        reason = str(e) or type(e).__name__
        if isinstance(e, urllib.error.HTTPError):
            try:
                reason = f"{reason}: {e.read().decode('utf-8', 'replace')[:200]}"
            except Exception:
                pass
        print(f"{started} failed: {reason}", file=sys.stderr)
        try:
            request(f"{site}/health-compass", auth, {"error": reason})
        except Exception as e2:
            print(f"{started} couldn't report the failure: {e2}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
