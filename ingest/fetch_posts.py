#!/usr/bin/env python3
"""
補返測試集嘅片描述。

`eval/posts.json` 入 repo 嗰陣只保留 video ID 同標題 —— 完整描述係
創作者嘅文字,唔應該喺公開 repo 度重新發佈。跑呢個腳本本機補返。

    python3 ingest/fetch_posts.py
"""
import json, re, subprocess, time, pathlib, sys

SRC = pathlib.Path(__file__).parent / "eval" / "posts.json"


def main() -> int:
    posts = json.loads(SRC.read_text())
    got = 0
    for p in posts:
        if p.get("description"):
            got += 1
            continue
        out = subprocess.run(
            ["curl", "-s", "-A", "Mozilla/5.0",
             "https://www.youtube.com/watch?v=" + p["video_id"]],
            capture_output=True, text=True).stdout
        m = re.search(r'"shortDescription":"(.*?)","isCrawlable"', out, re.S)
        if m:
            try:
                p["description"] = json.loads('"%s"' % m.group(1))[:1800]
                got += 1
            except Exception:
                pass
        print(f'  {p["id"]:2} {"✅" if p.get("description") else "❌"} {p["title"][:52]}', flush=True)
        time.sleep(0.4)

    SRC.write_text(json.dumps(posts, ensure_ascii=False, indent=1))
    print(f"\n{got}/{len(posts)} 有描述 → {SRC}")
    return 0 if got else 1


if __name__ == "__main__":
    sys.exit(main())
