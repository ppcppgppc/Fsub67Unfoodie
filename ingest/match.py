#!/usr/bin/env python3
"""
Entity resolution 測試 —— 抽取出嚟嘅店名,配唔配得返一個真 POI?

用 Nominatim（OSM 官方 geocoder,免費、免 key）做 proxy。
生產環境會用自建 Overture PostGIS,但配對難度一樣:
同一個名喺同一區有幾多個候選、日文漢字/かな變體、
中文簡繁、英文 vs 本地名。

Nominatim 使用政策:最多 1 req/sec,必須有真 User-Agent。
"""
import json, subprocess, sys, time, urllib.parse, pathlib

UA = "unfoodie-eval/0.1 (entity-resolution accuracy test)"
BASE = "https://nominatim.openstreetmap.org/search"

VIEWBOX = {  # 收窄搜尋範圍,同 app 「附近」邏輯一致
    "HK": "113.83,22.15,114.44,22.56",
    "JP": "139.56,35.53,139.92,35.82",   # 東京 23 區
}
CITY = {"HK": "Hong Kong", "JP": "Tokyo"}


def query(name: str, area: str | None, market: str):
    q = " ".join(x for x in [name, area, CITY[market]] if x)
    params = {
        "q": q, "format": "jsonv2", "limit": "3", "addressdetails": "1",
        "viewbox": VIEWBOX[market], "bounded": "1",
    }
    # 用 curl 唔用 urllib:macOS 上 Python 往往搵唔到 CA bundle,
    # 全部請求會靜靜咁 SSL 失敗,睇落似「零命中」實情係零連線。
    url = BASE + "?" + urllib.parse.urlencode(params)
    p = subprocess.run(["curl", "-s", "--max-time", "25", "-A", UA, url],
                       capture_output=True, text=True)
    if p.returncode != 0 or not p.stdout.strip():
        return {"__error": p.stderr.strip() or f"curl exit {p.returncode}"}
    try:
        return json.loads(p.stdout)
    except Exception as e:
        return {"__error": f"bad json: {e}"}


FOOD_CATS = {
    "restaurant", "cafe", "fast_food", "bar", "pub", "bakery", "confectionery",
    "ice_cream", "food_court", "deli", "pastry", "tea", "coffee_shop",
    "seafood", "convenience", "supermarket", "food", "shop", "yes",
}


def main():
    src = pathlib.Path(__file__).parent / "eval" / "extracted.json"
    data = json.loads(src.read_text())
    out, n = [], 0

    for post in data["posts"]:
        for m in post["mentions"]:
            n += 1
            res = query(m["name"], post.get("area"), post["market"])
            time.sleep(1.1)                      # Nominatim 政策

            row = {
                "post": post["id"], "market": post["market"],
                "area": post.get("area"), "name": m["name"],
                "extract_conf": m["conf"],
            }
            if isinstance(res, dict):
                row |= {"hit": False, "error": res.get("__error")}
            elif not res:
                row |= {"hit": False, "error": None}
            else:
                top = res[0]
                cat = top.get("type") or top.get("category") or ""
                row |= {
                    "hit": True,
                    "matched": top.get("name") or top.get("display_name", "")[:60],
                    "osm_type": f'{top.get("category")}/{cat}',
                    "food_like": cat in FOOD_CATS or top.get("category") == "amenity",
                    "lat": float(top["lat"]), "lon": float(top["lon"]),
                    "n_candidates": len(res),
                }
            out.append(row)
            print(f'{n:3} [{row["market"]}] {m["name"][:28]:30} '
                  f'{"HIT " + str(row.get("matched",""))[:28] if row["hit"] else "miss"}',
                  flush=True)

    dst = pathlib.Path(__file__).parent / "eval" / "matched.json"
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=1))

    for mk in ("HK", "JP"):
        rows = [r for r in out if r["market"] == mk]
        hit = [r for r in rows if r["hit"]]
        print(f"\n{mk}: {len(hit)}/{len(rows)} 有結果 = {len(hit)/max(len(rows),1):.0%}")
    print(f"\n→ {dst}")


if __name__ == "__main__":
    sys.exit(main())
