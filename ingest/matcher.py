#!/usr/bin/env python3
"""
UNFOODIE matcher v2 —— 店名 → POI。

v1 得一個 query（店名+地區+城市 串埋），端到端 46%。
呢度改咗四樣：

  1. 類別過濾    —— 教堂、學校唔係餐廳（v1 兩個錯配全部係呢類）
  2. 多重 query  —— 剝地區前綴、剝品類前綴、淨店名 + bbox
  3. 名稱正規化  —— 全形/半形、かな/カナ、繁簡、空格
  4. 真信心分數  —— 名稱相似度 × 類別 × 地理距離 × 候選數懲罰

⚠️ 呢個分數同抽取器嗰個 confidence 係兩件事：
   抽取信心 = 「呢串字似唔似一個店名」
   配對信心 = 「我哋配到嘅係唔係嗰間」
   只有後者應該乘入評分公式。
"""
from __future__ import annotations
import json, re, subprocess, time, unicodedata, pathlib, difflib

UA = "unfoodie-matcher/0.2 (entity resolution)"
BASE = "https://nominatim.openstreetmap.org/search"
CACHE = pathlib.Path(__file__).parent / ".nominatim_cache.json"

VIEWBOX = {
    "HK": "113.83,22.15,114.44,22.56",
    "JP": "139.56,35.53,139.92,35.82",
}
CITY = {"HK": "Hong Kong", "JP": "Tokyo"}

# 明確唔係餐飲 —— 直接否決
NOT_FOOD = {
    "place_of_worship", "school", "university", "college", "kindergarten",
    "hospital", "clinic", "doctors", "dentist", "pharmacy", "bank", "atm",
    "police", "fire_station", "townhall", "library", "parking", "fuel",
    "post_office", "toilets", "bus_station", "car_repair", "hairdresser",
    "residential", "apartments", "house", "office", "construction",
    # 行政區劃同地名 —— 「and TOKYO」曾經配到成個「東京都」
    "administrative", "city", "town", "village", "suburb", "quarter",
    "neighbourhood", "county", "state", "island", "locality", "hamlet",
}
# 呢啲 top-level category 一律唔係單一店舖
NOT_FOOD_TOP = {"boundary", "place", "landuse", "natural", "waterway", "railway"}
# 好可能係餐飲
FOOD = {
    "restaurant", "cafe", "fast_food", "bar", "pub", "bakery", "confectionery",
    "ice_cream", "food_court", "deli", "pastry", "tea", "coffee", "seafood",
    "butcher", "greengrocer", "food", "juice_bar", "biergarten",
}

# 地區前綴 —— 「浅草メンチ」搵唔到,「メンチ」搵到
AREA_PREFIX = [
    "浅草", "築地", "銀座", "東京駅", "東京", "新宿", "渋谷", "原宿", "丸の内",
    "香港", "尖沙咀", "旺角", "中環", "銅鑼灣", "深水埗", "長沙灣", "屯門", "油尖旺",
]
# 品類前綴 —— 「和菓子 楓」→「楓」、「かりんとう小桜」→「小桜」
KIND_PREFIX = [
    "和菓子", "かりんとう", "純喫茶", "大学いも", "中華", "きびだんご",
    "おいもやさん", "もんじゃ", "茶餐廳", "餅家", "甜品",
]


def norm(s: str) -> str:
    """全形→半形、カタカナ→ひらがな、去空格標點,做相似度比較用。"""
    s = unicodedata.normalize("NFKC", s).lower()
    s = "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)
    return re.sub(r"[\s　·・,，.。&\-—–/()（）'\"]+", "", s)


def similarity(a: str, b: str) -> float:
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return 0.0
    # Substring 加分要有節制:「and」喺「andtokyo」入面唔代表同一間舖。
    # 短嗰個要佔長嗰個一定比例,而且本身要夠長,先當係同一個實體。
    if na in nb or nb in na:
        short, long = (na, nb) if len(na) <= len(nb) else (nb, na)
        cjk = any("\u4e00" <= c <= "\u9fff" or "\u3040" <= c <= "\u30ff" for c in short)
        # CJK 每個字帶嘅資訊量高好多:「亀十」兩個字已經夠獨特,
        # 但英文「and」三個字母乜都唔代表。所以兩套門檻。
        min_len, min_cover = (2, 0.30) if cjk else (4, 0.55)
        cover = len(short) / len(long)
        if len(short) >= min_len and cover >= min_cover:
            return 0.90 + 0.10 * cover

    r = difflib.SequenceMatcher(None, na, nb).ratio()

    # 拉丁品牌名:頭一個字唔同就好可能係另一間舖。
    # 「BAKE CHEESE TART」vs「Pablo cheese tart」共用尾巴,difflib 畀 0.76,
    # 但佢哋係競爭對手,唔係同一間。
    ta, tb = a.split(), b.split()
    if ta and tb and r < 0.9:
        ha, hb = norm(ta[0]), norm(tb[0])
        if ha and hb and ha.isascii() and hb.isascii():
            head = difflib.SequenceMatcher(None, ha, hb).ratio()
            if head < 0.5:
                r *= 0.6
    return r


def variants(name: str, area: str | None) -> list[str]:
    """由最specific到最闊,逐個試。"""
    out, seen = [], set()

    def add(x):
        x = x.strip()
        # CJK 單字都可以係完整店名(楓、丸),唔可以照搬拉丁文嘅 >=2 規則
        cjk = any("\u4e00" <= c <= "\u9fff" or "\u3040" <= c <= "\u30ff" for c in x)
        if x and (len(x) >= 2 or cjk) and x not in seen:
            seen.add(x); out.append(x)

    add(name)
    for p in AREA_PREFIX:                     # 剝地區前綴
        if name.startswith(p) and len(name) > len(p):
            add(name[len(p):])
    for p in KIND_PREFIX:                     # 剝品類前綴 —— 留後半,唔留品類本身
        if name.startswith(p) and len(name) > len(p):
            add(name[len(p):])
    if " " in name:                           # 「中華 幸軒」→「幸軒」(只要後半)
        add(name.split(" ", 1)[1])
    return out[:4]


_cache: dict | None = None


def _load_cache() -> dict:
    global _cache
    if _cache is None:
        _cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    return _cache


def nominatim(q: str, market: str, bounded: bool) -> list:
    key = f"{market}|{int(bounded)}|{q}"
    c = _load_cache()
    if key in c:
        return c[key]
    params = {
        "q": q, "format": "jsonv2", "limit": "5", "addressdetails": "1",
        "namedetails": "1",   # 攞 name:ja / name:en / alt_name,漢字↔羅馬字要靠佢
        "viewbox": VIEWBOX[market], "bounded": "1" if bounded else "0",
    }
    import urllib.parse
    url = BASE + "?" + urllib.parse.urlencode(params)
    # 用 curl:macOS 上 Python 往往冇 CA bundle,urllib 會全部 SSL 失敗,
    # 睇落似「零命中」實情係零連線。
    p = subprocess.run(["curl", "-s", "--max-time", "25", "-A", UA, url],
                       capture_output=True, text=True)
    try:
        res = json.loads(p.stdout) if p.stdout.strip() else []
    except Exception:
        res = []
    c[key] = res
    CACHE.write_text(json.dumps(c, ensure_ascii=False))
    time.sleep(1.1)                                   # Nominatim 政策
    return res


def score_candidate(name: str, cand: dict) -> tuple[float, dict]:
    cat = cand.get("type") or ""
    top = cand.get("category") or ""
    nd = cand.get("namedetails") or {}
    cand_name = cand.get("name") or nd.get("name") or cand.get("display_name", "").split(",")[0]

    if cat in NOT_FOOD or top in NOT_FOOD_TOP:
        return 0.0, {"reject": f"非餐飲類別 {top}/{cat}"}

    # 同所有已知名稱比,取最高 —— 「丸豊」對「Marutoyo」單靠字元相似度係 0,
    # 但 OSM 嘅 name:ja 有漢字原名。呢個係日本配對嘅關鍵。
    all_names = {cand_name, *(v for k, v in nd.items() if k.startswith("name") or k == "alt_name")}
    # 候選名淨係一個地區/通用詞 → 一定係配錯（「銀座」「丸の内」「place」）
    GENERIC = {norm(a) for a in AREA_PREFIX} | {
        "place", "and", "tokyo", "hongkong", "station", "market", "mall", "cafe", "shop"}
    if norm(cand_name) in GENERIC:
        return 0.0, {"reject": f"候選係通用/地區名: {cand_name}"}

    sim = max((similarity(name, x) for x in all_names if x), default=0.0)
    if sim < 0.45:
        return 0.0, {"reject": f"名唔似 ({sim:.2f}) {cand_name}"}

    # 非餐飲嘅 shop 要重罰,但唔好一刀切否決 ——
    # 「曲奇四重奏」喺 OSM 標咗 shop/gift,佢真係間餅店。
    # 重罰之後,只有名完全一樣先過到門檻;
    # 「犬印鞄製作所」(shop/bag)、「and ST」(shop/clothes) 就會跌出局。
    if cat in FOOD:
        cat_score = 1.0
    elif top == "shop":
        cat_score = 0.15
    elif top == "amenity":
        cat_score = 0.75
    else:
        cat_score = 0.4
    conf = 0.72 * sim + 0.28 * cat_score
    return round(min(conf, 1.0), 3), {
        "matched": cand_name, "osm": f"{top}/{cat}",
        "sim": round(sim, 3), "lat": float(cand["lat"]), "lon": float(cand["lon"]),
    }


def match(name: str, area: str | None, market: str, threshold: float = 0.55):
    """回 (confidence, info)。confidence 0 = 配唔到。"""
    best, best_info, tried = 0.0, {"reject": "冇候選"}, 0

    for i, v in enumerate(variants(name, area)):
        for q, bounded in ((f"{v} {area} {CITY[market]}" if area else f"{v} {CITY[market]}", True),
                           (f"{v} {CITY[market]}", True),
                           (v, True)):
            tried += 1
            for cand in nominatim(q, market, bounded):
                c, info = score_candidate(name, cand)
                if c > best:
                    best, best_info = c, info | {"query": q, "variant_rank": i}
            if best >= 0.85:                          # 夠好就唔使再試
                break
        if best >= 0.85:
            break

    # 靠 fallback variant 配到,信心要打折 —— 剝走前綴之後個名冇咁 specific
    if best and best_info.get("variant_rank", 0) > 0:
        best = round(best * 0.9, 3)

    best_info["queries_tried"] = tried
    return (best, best_info) if best >= threshold else (0.0, best_info)


TABELOG = re.compile(r"tabelog\.com/[a-z]+/[A-Z0-9]+/[A-Z0-9]+/(\d{6,})")
OPENRICE = re.compile(r"openrice\.com/\S*?/r-\S*?-r(\d+)")


def external_ids(text: str) -> dict[str, list[str]]:
    """描述入面嘅 Tabelog / OpenRice 連結 = 免費嘅精確 ID。"""
    return {
        "tabelog": sorted(set(TABELOG.findall(text or ""))),
        "openrice": sorted(set(OPENRICE.findall(text or ""))),
    }
