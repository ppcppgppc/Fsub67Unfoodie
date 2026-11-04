#!/usr/bin/env python3
"""Matcher v2 評估 —— 同 v1 對比。"""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import matcher as M

HERE = pathlib.Path(__file__).parent
EV = HERE / "eval"

ext = json.loads((EV / "extracted.json").read_text())
posts_raw = {p["id"]: p for p in json.loads((EV / "posts.json").read_text())}

# 1) 描述入面嘅 Tabelog / OpenRice 連結 = 免費精確 ID
if not any(p.get("description") for p in posts_raw.values()):
    print("⚠️  posts.json 冇描述（公開 repo 唔存創作者原文）。"
          "先跑: python3 ingest/fetch_posts.py\n")

extern = {}
for pid, p in posts_raw.items():
    ids = M.external_ids(p.get("description", ""))
    if ids["tabelog"] or ids["openrice"]:
        extern[pid] = ids

rows = []
for post in ext["posts"]:
    for m in post["mentions"]:
        conf, info = M.match(m["name"], post.get("area"), post["market"])
        rows.append({
            "post": post["id"], "market": post["market"], "area": post.get("area"),
            "name": m["name"], "extract_conf": m["conf"],
            "match_conf": conf, **info,
        })
        flag = f'{conf:.2f} {info.get("matched","")[:26]}' if conf else f'miss ({info.get("reject","")[:34]})'
        print(f'{len(rows):3} [{post["market"]}] {m["name"][:24]:26} {flag}', flush=True)

(EV / "matched_v2.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1))

v1 = {(r["post"], r["name"]): r for r in json.loads((EV / "matched.json").read_text())}
print("\n" + "=" * 62)
for mk in ("HK", "JP"):
    rs = [r for r in rows if r["market"] == mk]
    h1 = sum(1 for r in rs if v1.get((r["post"], r["name"]), {}).get("hit"))
    h2 = sum(1 for r in rs if r["match_conf"] > 0)
    print(f'{mk}: v1 {h1}/{len(rs)} ({h1/len(rs):.0%})  →  v2 {h2}/{len(rs)} ({h2/len(rs):.0%})')

print(f'\nTabelog/OpenRice 精確 ID:')
for pid, ids in extern.items():
    n = len(ids["tabelog"]) + len(ids["openrice"])
    print(f'  post #{pid}: {n} 個 (tabelog {len(ids["tabelog"])}, openrice {len(ids["openrice"])})')
(EV / "external_ids.json").write_text(json.dumps(extern, ensure_ascii=False, indent=1))
