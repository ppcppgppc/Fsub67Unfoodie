#!/usr/bin/env python3
"""
RLS / 權限實測 —— 用真 JWT 打 REST API,唔係用 superuser。

「你嘅信任名單唔會離開你個 account」嘅唯一實現就係呢度驗緊嘅嘢。
改 schema 或者 grant 之後要重跑。只打本地 Supabase。

    python3 supabase/tests/rls_check.py
"""
import json, subprocess, sys, urllib.parse, uuid

st = json.loads(subprocess.run(
    ["supabase", "status", "-o", "json"], capture_output=True, text=True).stdout)
API, ANON, SVC = st["API_URL"], st["ANON_KEY"], st["SERVICE_ROLE_KEY"]
assert "127.0.0.1" in API, "呢個測試只可以打本地"

FAILS, PASSES = [], 0


def call(method, path, token=None, body=None, key=None, prefer=None):
    cmd = ["curl", "-s", "-o", "-", "-w", "\n%{http_code}", "-X", method, API + path,
           "-H", f"apikey: {key or ANON}", "-H", "Content-Type: application/json"]
    if token:
        cmd += ["-H", f"Authorization: Bearer {token}"]
    if prefer:
        cmd += ["-H", f"Prefer: {prefer}"]
    if body is not None:
        cmd += ["-d", json.dumps(body)]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    text, _, code = out.rpartition("\n")
    try:
        data = json.loads(text) if text else None
    except Exception:
        data = text
    return int(code or 0), data


def check(label, ok, detail=""):
    global PASSES
    if ok:
        PASSES += 1
        print(f"  ok    {label}")
    else:
        FAILS.append(label)
        print(f"  FAIL  {label}  {str(detail)[:150]}")


def user(tag):
    email = f"rls-{tag}-{uuid.uuid4().hex[:8]}@test.invalid"
    pw = uuid.uuid4().hex
    c, d = call("POST", "/auth/v1/admin/users", token=SVC, key=SVC,
                body={"email": email, "password": pw, "email_confirm": True})
    assert c < 300, d
    c, t = call("POST", "/auth/v1/token?grant_type=password",
                body={"email": email, "password": pw})
    assert c < 300, t
    return d["id"], t["access_token"]


A, TA = user("a")
B, TB = user("b")
_, foodies = call("GET", "/rest/v1/foodie?select=id&limit=3", token=TA)
_, rests = call("GET", "/rest/v1/restaurant?select=id&limit=2", token=TA)
assert foodies and rests, "要先有 seed 資料"
F = foodies[0]["id"]; R = rests[0]["id"]

print("\n[信任名單]")
c, d = call("POST", "/rest/v1/user_foodie_stance", token=TB,
            body={"user_id": B, "foodie_id": F, "tier": "super_distrust"})
check("B 寫到自己嘅 stance", c < 300, d)
c, d = call("GET", f"/rest/v1/user_foodie_stance?user_id=eq.{B}", token=TB)
check("B 讀到自己嘅 stance", c == 200 and len(d) == 1, d)
c, d = call("GET", f"/rest/v1/user_foodie_stance?user_id=eq.{B}", token=TA)
check("A 讀唔到 B 嘅 stance", c == 200 and d == [], d)
c, d = call("GET", "/rest/v1/user_foodie_stance?select=*", token=TA)
check("A 全表掃只見自己", c == 200 and d == [], d)
c, d = call("GET", "/rest/v1/user_foodie_stance?select=*")
check("anon 讀唔到 stance", c >= 400 or d == [], d)
c, d = call("POST", "/rest/v1/user_foodie_stance", token=TA,
            body={"user_id": B, "foodie_id": foodies[1]["id"], "tier": "trust"})
check("A 唔可以用 B 個名寫 stance", c >= 400, d)
c, d = call("PATCH", f"/rest/v1/user_foodie_stance?user_id=eq.{B}", token=TA,
            body={"tier": "super_trust"}, prefer="return=representation")
check("A 改唔到 B 嘅 stance", d == [] or c >= 400, d)
c, d = call("DELETE", f"/rest/v1/user_foodie_stance?user_id=eq.{B}", token=TA,
            prefer="return=representation")
check("A 刪唔到 B 嘅 stance", d == [] or c >= 400, d)
c, d = call("GET", f"/rest/v1/user_foodie_stance?user_id=eq.{B}&select=tier", token=TB)
check("B 嘅 stance 冇被改", d == [{"tier": "super_distrust"}], d)

print("\n[評分函數]")
args = {"p_user": B, "p_lat": 22.3193, "p_lng": 114.1694, "p_radius_m": 30000}
c, d = call("POST", "/rest/v1/rpc/nearby_with_score", token=TA, body=args)
check("A 用 B 個 uuid 叫 RPC,攞唔到 B 嘅權重",
      c == 200 and all(r["n_signal"] == 0 for r in d), d)
c, d = call("POST", "/rest/v1/rpc/nearby_with_score", body=args)
check("anon 叫唔到 nearby_with_score", c >= 400, d)

print("\n[餐廳評分]")
c, d = call("POST", "/rest/v1/user_rating", token=TB,
            body={"user_id": B, "restaurant_id": R, "score": 1, "note": "私人筆記"})
check("B 寫到評分", c < 300, d)
c, d = call("GET", f"/rest/v1/user_rating?user_id=eq.{B}", token=TA)
check("A 讀唔到 B 未公開嘅評分", d == [], d)
call("PATCH", f"/rest/v1/user_rating?user_id=eq.{B}", token=TB, body={"is_public": True})
c, d = call("GET", f"/rest/v1/user_rating?user_id=eq.{B}&select=score,note", token=TA)
check("opt-in 之後 note 仍然唔公開(README 承諾)", c >= 400 or all(r.get("note") is None for r in d), d)
c, d = call("GET", f"/rest/v1/user_rating?user_id=eq.{B}&select=score")
check("anon 讀唔到評分", c >= 400 or d == [], d)

print("\n[commons 表:client 唯讀]")
# 注意:PATCH 一定要有真 column。空 body 喺 PostgREST 唔會落 DB,會假 200。
TABLES = {
    "restaurant":     ({"name": "x"},                "id=not.is.null"),
    "foodie":         ({"display_name": "x"},        "id=not.is.null"),
    "foodie_account": ({"handle": "x"},              "id=not.is.null"),
    "post":           ({"lang": "x"},                "id=not.is.null"),
    "mention":        ({"sentiment_score": -1},      "id=not.is.null"),
    "stance_weight":  ({"weight": 99},               "tier=eq.trust"),
}
for t, (patch, flt) in TABLES.items():
    col = "tier" if t == "stance_weight" else "id"
    c, d = call("GET", f"/rest/v1/{t}?select={col}&limit=1")
    check(f"anon 讀到 {t}", c == 200 and d, (c, d))
    for who, tok in (("anon", None), ("authenticated", TA)):
        c, d = call("POST", f"/rest/v1/{t}", token=tok, body=patch)
        check(f"{who} INSERT {t} 被拒", c in (401, 403), (c, d))
        c, d = call("PATCH", f"/rest/v1/{t}?{flt}", token=tok, body=patch,
                    prefer="return=representation")
        check(f"{who} UPDATE {t} 被拒", c in (401, 403), (c, d))
        c, d = call("DELETE", f"/rest/v1/{t}?{flt}", token=tok,
                    prefer="return=representation")
        check(f"{who} DELETE {t} 被拒", c in (401, 403), (c, d))

print("\n[commons 入面唔應該出街嘅 column]")
for colname in ("caption", "ingested_by"):
    for who, tok in (("anon", None), ("authenticated", TA)):
        c, d = call("GET", f"/rest/v1/post?select={colname}&limit=1", token=tok)
        check(f"{who} 讀唔到 post.{colname}", c >= 400, (c, d))
c, d = call("GET", "/rest/v1/foodie?select=claimed_by&limit=1")
check("anon 讀唔到 foodie.claimed_by", c >= 400, (c, d))

print("\n[敏感表]")
c, d = call("POST", "/rest/v1/takedown_request", prefer="return=minimal",
            body={"claimant_name": "測試", "claimant_contact": "x@test.invalid", "claim": "rls test"})
check("anon 提交到下架請求", c < 300, (c, d))
for who, tok in (("anon", None), ("authenticated", TA)):
    c, d = call("GET", "/rest/v1/takedown_request?select=*", token=tok)
    check(f"{who} 讀唔到下架請求(投訴人資料)", c >= 400 or d == [], d)
    c, d = call("GET", "/rest/v1/audit_log?select=*", token=tok)
    check(f"{who} 讀唔到 audit_log", c >= 400 or d == [], d)
    c, d = call("POST", "/rest/v1/audit_log", token=tok, body={"action": "x", "entity_type": "x"})
    check(f"{who} 寫唔到 audit_log", c >= 400, d)
c, d = call("POST", "/rest/v1/edit_proposal", token=TA,
            body={"kind": "flag_dispute", "payload": {}, "proposed_by": B})
check("A 唔可以冒 B 名提修改", c >= 400, d)
c, d = call("POST", "/rest/v1/contributor", token=TA, body={"user_id": A, "trust_level": 2})
check("用戶唔可以自封 trust_level 2", c >= 400, d)
c, d = call("GET", "/rest/v1/foodie_public_stats?select=*")
check("anon 讀唔到 foodie_public_stats", c >= 400, d)

print(f"\n{PASSES} 過, {len(FAILS)} 失敗")
for f in FAILS:
    print("  ✗", f)
sys.exit(1 if FAILS else 0)
