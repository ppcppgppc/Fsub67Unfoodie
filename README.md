# UNFOODIE

> 一個唔收廣告嘅食評 app。
> 你唔使判斷邊間舖好食 —— 你只需要判斷你信邊個。

Fsub 系列。

個名唔係「反對 foodie」，係「**唔預設信 foodie**」。預設值係零，信任要你自己畀。

---

## 問題

香港同日本嘅食評生態，收錢 post 已經係常態。問題唔係「有廣告」，而係**你分唔清邊篇係廣告**。所有平台嘅評分都係將收錢內容同真心推薦溝埋一齊，再平均出一個數字，然後叫你信呢個數字。

現有 app 嘅答案係「更多評分」。我哋認為評分本身就係噪音。

真正嘅訊號唔喺餐廳度，喺**人**度。你身邊總有幾個朋友嘅推薦你係信嘅，亦總有幾個 KOL 你一睇就知係鱔稿。呢個判斷你自己做得好準 —— 但冇一個 app 幫你將呢個判斷變成過濾器。

## 做法

用戶對每個食評人畀一個信任等級。**上下兩極有名額限制** —— 稀缺性逼你真係排序，而唔係人人派花：

| 等級 | 權重 | 名額 |
|---|---|---|
| 超級白名單 | **+10** | 5 |
| 高級白名單 | +5 | 20 |
| 白名單 | +1 | 無限 |
| 一般 | 0 | 無限 |
| 黑名單 | −1 | 無限 |
| 高級黑名單 | −5 | 20 |
| 超級黑名單 | **−10** | 5 |

冇名額限制嘅話，三個月後你會有四十個超級白名單，個 scale 就塌返做 ±1，加權等於白做。

每篇 post 由 LLM 抽出「講緊邊間餐廳」同「幾正面」（−1 到 +1）。之後相乘：

| 你嘅立場 | 佢嘅評價 | 乘積 | 解讀 |
|---|---|---|---|
| 白名單 ＋ | 讚 ＋ | **＋** | 信得過嘅人推薦 |
| 白名單 ＋ | 彈 − | **−** | 信得過嘅人彈 → 避 |
| 黑名單 − | 讚 ＋ | **−** | 收錢味 → 可疑 |
| 黑名單 − | 彈 − | **＋** | 連佢都彈 → 反而值得試 |

第三行係整個 app 嘅賣點：**「呢間舖淨係得你唔信嗰班人讚過」**。冇任何平台會話俾你聽呢件事，因為所有平台嘅收入都嚟自嗰班人。

第四行係白執嘅 —— 冇人俾錢一個 KOL 去彈嘢，所以佢嘅劣評特別可信。呢個推理唔使寫任何邏輯，個乘數自己做晒。

### 兩個分數

| | 計法 | 用途 |
|---|---|---|
| `score` | Σ(權重 × 評價 × 配對信心 × 時間衰減) | 總量 |
| `score_norm` | score ÷ Σ\|權重 × 信心 × 衰減\| | **公平比較同排序（−1 到 +1）** |

`score` 獎勵音量：五十篇 post 嘅名店永遠贏得兩篇嘅新舖。`score_norm` 係加權**平均**，同數量無關 —— 「喺我信嘅人眼中，呢間舖有幾好」。排序用 `score_norm × n_eff ÷ (n_eff + 2)`：正分永遠喺負分上面，樣本太細就向 0 靠。

`n_eff` 係**有效樣本**，唔係篇數：每條訊號按「配對信心 × 時間衰減」計。一篇 5 年前嘅 post 只值約 0.1 篇，所以四篇舊好評唔會再贏一篇上星期嘅好評。只用篇數嘅話，衰減喺 `score_norm` 嘅分子分母差唔多對消，「舊」對排序幾乎冇影響（migration 13）。

**UI 一定要同時顯示四象限嘅 count。** 一個數字冇人信；「3 個你信嘅人讚 · 1 個你唔信嘅人讚」一睇就明點解。解釋得到嘅分數，用戶先會信。

### 兩個刻意嘅取捨

**一、單一來源可以壓死一間舖，我哋接受。**

一間好舖俾一個超級黑名單 KOL 讚過就 −10，足以蓋過五個普通白名單嘅好評 —— 就算間舖咩都冇做過。我哋唔設負向封頂：「淨係得鱔稿王讚」本身就係訊號，誤傷係呢個訊號嘅代價。`score_norm` 同四象限顯示負責令呢件事至少係**睇得明**嘅。

**二、時間衰減係唯一嘅緩解機制。**

因為冇封頂，半衰期（預設 18 個月）唔係 tuning 參數，係產品政策：佢決定咗一篇舊鱔稿要幾耐先唔再影響一間舖。衰減對正負評對稱 —— 餐廳嘅水準對所有人一樣會變。

冇可靠 `posted_at` 嘅 post **唔計入分數**（照樣喺 post 列表顯示）。用 `ingested_at` 代替會令一篇 2019 年嘅舊 post 睇落好新鮮，比冇分更差。

## 點樣起你嘅名單

上面成套機制有個前提：你要有一個白名單。但新用戶嘅名單係空嘅，所以 app 對佢嚟講一開始係廢嘅 —— 呢個係整個產品最大嘅實際風險。

解決方法係反轉條問題。唔問「你信邊個」，問「**你食過乜**」。

用戶為食過嘅餐廳評分，用**同一把五檔尺**（呢點唔係美觀問題，兩邊唔同尺就冇得計相關性）：

```
+1.0  勁正   ★★★★★        -0.5  麻麻   ★★
+0.5  唔錯   ★★★★          -1.0  伏     ★
 0.0  一般   ★★★
```

然後喺重疊嘅餐廳上面，計你同每個食評人嘅 Pearson 相關性：

| 相關性 | 意思 | 建議 |
|---|---|---|
| 高度正 | 佢讚嘅你都鍾意 | 白名單（等級按強度） |
| 接近零 | 冇規律 | 一般 |
| 高度負 | **佢讚嘅你多數唔鍾意** | 黑名單 |

**反向配對同正向一樣有價值。** 一個口味同你完全相反嘅人，佢嘅推薦係一個可靠嘅負面指標 —— 而個乘數已經自動處理咗，唔使寫額外邏輯。

### 細樣本嘅相關性係垃圾

兩間舖啱啱都同意 → 相關性 1.0 → 「完美契合！」呢個係噪音。所以要收縮：

```
sim_shrunk = sim × n / (n + λ)      λ = 8
```

| 重疊餐廳數 | 原始 1.0 收縮後 |
|---|---|
| 2 | 0.20 |
| 5 | 0.38 |
| 15 | 0.65 |
| 40 | 0.83 |

冇呢步，用戶食完兩餐就會收到一堆「99% 契合」嘅假建議，然後永遠唔再信呢個功能。

### 兩種黑名單，意思完全唔同

用戶減分一個食評人可以係兩個原因：

1. **收錢鱔稿** — 佢唔誠實
2. **口味唔夾** — 佢好誠實，但佢鍾意嘅嘢你唔鍾意

數學上一樣（佢讚 → 對你係負分），所以個乘數照用。**但意思差天共地**，所以 `stance.reason` 一定要分開存：

- **UI 上** — 因為口味唔夾而叫人「加入黑名單」係錯誤描述，應該係「口味相反：佢讚嘅你多數唔鍾意」
- **法律上** — 公開聚合統計（「62% 用戶隱藏咗呢位食評人」）**必須排除 `taste_mismatch`**。將一個只不過鍾意食辣嘅人算入去，就等於將「唔誠實」呢個暗示扣咗喺佢身上，而呢種 imputation 正正係我哋一路避緊嘅嘢

### 用戶之間嘅配對

同樣機制可以搵到口味相近（或相反）嘅其他用戶。但：

- **餐廳評分預設私人**，要 opt-in 先可以攞去配對
- 出現喺配對候選名單之前，要夠最低評分數同 account 年齡 —— 否則有人開幾十個假 account 模仿你嘅口味，就篤得入你嘅推薦名單
- **相似度只可以喺餐廳評分上面計，永遠唔可以喺信任等級上面計**（見下面私隱承諾）

### 只建議，唔自動套用

呢啲建議永遠只可以係建議，要用戶撳實先入名單。

原因唔係技術上嘅 —— **成個 app 嘅賣點就係「你自己決定信邊個」**。自動幫用戶分配信任，就變返一個黑箱推薦系統，同我哋批評緊嗰啲平台冇分別。而且超級白名單得 5 個位，系統會幫你用晒。

建議照出，決定權留返用戶。

## 唔會做嘅嘢

呢三條係產品定義，唔係暫時嘅取捨：

- **唔收廣告。** 成個 app 嘅賣點就係識別收錢內容，一收廣告即刻自我否定。
- **唔向用戶收費。** 冇訂閱、冇 paywall、冇 pro 版。
- **唔賣餐廳排名。** 冇付費置頂、冇贊助位。

後果要講清楚：大部分 app 嘅預設出路（先做大再賣廣告）已經自己封死。所以工程目標唔係「可擴展」，而係**每用戶邊際成本趨近零**。呢個決定貫穿咗成個架構。

### 一條硬規則

> **Hot path 唔准 call 任何第三方收費 API。**

「附近餐廳」查自己個 PostGIS，唔係查 Google Places。LLM 抽取喺 ingest 嗰刻做完，永遠唔喺用戶 request 入面跑。守住呢條，成本就同用戶數脫鈎，只同資料量掛鈎 —— 而資料量係我哋控制到嘅。

## 範圍

**香港 + 日本，但服務同一批人。**

唔係開兩個市場。目標用戶係香港人，覆蓋佢哋兩個場景：

1. **今晚食乜** — 附近餐廳
2. **下個月去東京食乜** — 行程規劃

香港 foodie 本身就一半本地一半日本自由行，係同一班人、同一個信任圖譜。

日本用戶唔喺 MVP 範圍 —— 嗰邊嘅食評生態喺 X 同 Tabelog reviewer 度，完全另一批人，等於再做多次 cold start。

## 架構

以下係目標架構。Overture 仲未匯入，而家用手寫示範資料。

```
POI 資料      Overture Maps (Places) → 自建 PostGIS
地圖顯示      react-native-maps
                iOS     → Apple Maps
                Android → Google Maps SDK
                Web     → MapLibre
導航          deep-link 出 Apple / Google Maps
內容抽取      Claude API（ingest 時做，唔喺 hot path）
口味配對      Postgres corr()（用戶加評分時增量重算，唔喺 hot path）
後端          Supabase (Postgres + PostGIS + Auth + RLS)
App           Expo / React Native
Web           Next.js
```

經常性成本：**$0**（唔計 Apple Developer 上架費 US$99/年）。

### 內容入口

按乾淨程度排：

1. **Share Sheet**（主力）— 用戶 share 個 post 入 app → LLM 抽取 → 入庫。零法律風險，兼有用戶意圖訊號。
2. **官方 API** — Threads API、YouTube Data API、IG Graph API hashtag search。
3. **手動 seed** — 頭 50–100 個知名 foodie，開荒用。

所有入口寫入同一張 `post` 表。**Ingestion 一定要係可換嘅 adapter** —— app 永遠唔可以 depend 住任何單一來源，某條路封咗只係少一個來源，唔係死機。

### 新舖偵測

免費 POI 資料嘅弱點係新舖覆蓋。但呢個 app 本身就係一部新舖偵測機：新舖 Overture 未有，但 foodie 一定第一時間去打卡 → 用戶 share 入嚟 → 抽取 → geocode → 入庫。

**Ingest pipeline 同時就係地圖更新機制。** Google 用衛星同街景解決嘅問題，我哋用食客解決，而且喺「新舖」呢個 Google 最弱嘅位會快過佢。

## 資料來源同授權

| 來源 | 用途 | 可否再分發 |
|---|---|---|
| Overture Maps (Places) | POI spine | ✅ CDLA-Permissive-2.0 |
| OpenStreetMap | 補漏 | ⚠️ ODbL（有 share-alike） |
| Google Places | 只喺用戶搜尋而 DB 冇時叫一次 | ⚠️ 只准存 Place ID |
| Apple MapKit | **淨係畫地圖** | ❌ 資料唔准入 DB |
| Tabelog / OpenRice | — | ❌ 冇 API，唔用 |

`post.redistributable` 係 generated column，由 `ingest_source` 決定，改唔到。爬返嚟嘅內容永遠唔會出現喺開源 dataset 入面。

**注意**：淨係用 Overture Places 可以保持 permissive；一撈 OSM 資料入去，ODbL 嘅 share-alike 就會傳染成個 derived database。

## 私隱承諾

**你嘅信任名單係你自己嘅，唔會離開你個 account。**

- `user_foodie_stance` 由 Postgres RLS 鎖死，policy 係 `user_id = auth.uid()`
- 唔會出現喺任何開源 dataset
- 唔會賣、唔會分享、唔會做 analytics
- 只有經過 k-anonymity 門檻（≥50 人）嘅聚合統計先會公開，而且係中性事實陳述（「62% 用戶隱藏咗呢位食評人」），唔會做成排行榜

**你嘅餐廳評分預設私人。**

- 其他用戶讀唔到你嘅評分。用戶之間配對未做，所以 `is_public` 而家冇任何效果
- 將來做嗰陣只會經函數出聚合結果，唔會開放原始行，note 永遠唔出街

### 一條唔可以過嘅線

> **口味相似度只可以喺餐廳評分上面計，永遠唔可以喺信任等級上面計。**

「信 Alice 嘅人都信 Bob」係好強嘅 collaborative filtering 訊號，但佢會反向洩漏用戶嘅信任名單 —— 而上面第一句承諾就係咁樣冇咗。

如果真係要做 stance-based 推薦，只可以走已有嗰條 k-anonymity 聚合路（「≥50 個信 Alice 嘅用戶都信 Bob」）。per-user 嘅版本冇得傾。

RLS 唔係 nice-to-have，佢係以上所有承諾嘅結構性保證。冇咗佢，任何一個 API bug 都會變成私隱事故。

## 資料治理

`mention`（邊個 foodie 講過邊間舖）呢個圖譜係眾包維護嘅。20 篇樣本嘅初步結果係約一半配得到（細樣本、未獨立驗證，見 [`ingest/eval/RESULTS_v2.md`](ingest/eval/RESULTS_v2.md)），所以人手覆核佇列係主線功能，唔係 nice-to-have。

**設計前提：食評人有直接經濟誘因去篡改呢個圖譜** —— 刪走自己啲收錢 post、加返啲假嘅正面 edge。呢個係系統嘅主要攻擊面。

| 資料 | 可否眾包修改 |
|---|---|
| 呢篇 post 講緊邊間舖 | ✅ 有客觀對錯 |
| Place 配對錯誤 | ✅ |
| 正評／負評分數 | ⚠️ 可標記爭議，唔可直接覆寫 |
| 用戶自己嘅信任等級 | ❌ 永遠唔可以被第三者改 |
| 用戶自己嘅餐廳評分 | ❌ 同上 |

三條規矩：

1. **Propose-then-verify** — 所有修改都係建議，夠 N 個獨立用戶同意或者高信譽貢獻者提出先生效。
2. **只准標記爭議，唔准刪除 edge** — 刪除正正就係 KOL 想要嘅結果。要移除必須經人手審核加證據。
3. **全量 audit log** — 既係反篡改，亦係下架程序嘅法律紀錄。

### 食評人認領

食評人可以驗證身分、公開回應、**申報合作內容**。申報咗嘅 post 唔計入餐廳分數。

但唔可以令申報變成懲罰 —— 否則冇人會申報。所以獎勵放喺食評人層面：profile 會顯示申報率，「呢位食評人申報咗 12 篇合作內容」係一個令人更想 +1 佢嘅資訊。誠實喺餐廳分數度冇著數，喺信任度度有著數，而後者先係佢真正嘅資產。

## 開放咩，唔開放咩

| | |
|---|---|
| **Code** | ✅ 全開 |
| **Mapping graph**（`place_id, foodie, post_url, sentiment`） | ✅ 開，但只限 `redistributable` 嘅 |
| **用戶信任等級資料** | ❌ 永不 |
| **用戶餐廳評分** | ❌ 永不（連 opt-in 公開嘅都唔會入 dataset） |

尾二行冇得傾。將用戶對真人嘅負面評價打包公開，會令我哋由被動平台變成主動發布者，而且一放出去就收唔返 —— 等於親手毀掉唯一嘅補救途徑。

最後一行值得解釋：`is_public` 嘅意思係「可以喺 app 入面攞去配對」，唔係「可以打包派街坊」。飲食偏好嘅指紋性極高，就算除名都好易反推返係邊個。

## 下架程序

`takedown_request` 唔係行政表，係防線。公開聯絡途徑、48 小時內回應、所有動作留 log。

> 以上安排係產品政策，唔係法律意見。正式上線前需要香港（及涉及日本內容時，日本）律師審視一次。

## 專案結構

```
unfoodie/
├── supabase/migrations/    # schema（PostGIS + RLS + 評分函數 + grants）
├── packages/core/          # 共用 TypeScript：型別、訊號分類、DB 存取
├── web/                    # Next.js
├── app/                    # Expo / React Native
├── data/                   # seed 資料 + 示範用戶腳本
└── ingest/                 # 抽取 prompt + matcher + 準確度測試
    ├── prompt.md           #   post → mention 嘅抽取 prompt
    ├── matcher.py          #   店名 → POI（類別過濾、多重 query、名稱正規化）
    └── eval/               #   20 篇真實 post 嘅測試集同結果
```

## 點樣行起佢

```bash
supabase start && supabase db reset
```

```bash
SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) ./data/seed_demo_user.sh
```

```bash
npm install && npm run web
```

開 <http://localhost:3000>，用 `demo@unfoodie.local` / `demo1234` 登入。

### 手機版（要先裝兩樣嘢）

喺開發機上面 Metro dev server 啟動時撞 `EMFILE: too many open files`，調 `ulimit`
同收窄 `watchFolders` 都冇用。根本原因未確定，watchman 係最可能嘅解法，但未驗證。
原生 build 又要 CocoaPods，而 CocoaPods 要 Ruby ≥ 3.1（系統 Ruby 係 2.6）。

兩樣都由 Homebrew 解決，但 Homebrew 自己要 Xcode Command Line Tools：

```bash
sudo xcode-select --install
```

```bash
brew install watchman cocoapods
```

之後：

```bash
npm run app
```

（`sudo` 嗰句要你自己行，所以呢一步唔可以自動化。）

App 嘅 code typecheck 同 iOS Metro bundle 得過；UI 用 react-native-web 加 mock 後端截圖睇過（地圖用替身），但**未喺模擬器或者真機上面實際行過**。

## 狀態

**Alpha —— 行得，用緊手寫 seed 資料。**

- [x] Schema（PostGIS + RLS + 名額 trigger + 禁刪 trigger + 評分/配對函數）
- [x] 手寫 seed（16 間餐廳、8 個食評人、41 條 mention，全部虛構）
- [x] 探索 view（清單 ⇄ 地圖，MapLibre + OpenFreeMap）
- [x] 餐廳詳情（逐條 mention 攤開「信任等級 × 評價」）
- [x] 食評人管理（七檔 + 名額限制）
- [x] 餐廳評分 + 口味配對建議
- [x] Expo app code（探索 / 食評人 / 我的 / 下架），同 web 一致；未喺模擬器行過
- [x] **RLS 實測** — `supabase/tests/rls_check.py`，真 JWT 打 REST API，75 項
- [x] 註冊、示範資料標示、production 唔預填帳號
- [x] **下架請求公開頁面**（`/takedown`，唔使登入）— 每條 mention 都有入口；migration 12 鎖死投訴人只可以填自己嗰幾欄，唔可以倒填 `received_at`
- [x] **Entity resolution 測試** — 20 篇真實 YouTube 食評（[v1 結果](ingest/eval/RESULTS.md)）
- [x] **Matcher v2** — 20 篇 in-sample 初步結果，有重要限制，見 [`ingest/eval/RESULTS_v2.md`](ingest/eval/RESULTS_v2.md)
- [x] **`match_confidence` 拆做兩個數**（migration 09）— 抽取信心唔再假扮配對信心，只有後者乘入評分

> **初步跡象（細樣本，未獨立驗證）：** 呢批樣本入面日本配對唔差過香港，樽頸喺配對多過抽取。喺用未見過嘅資料重測之前，唔好當定論。

未做，按重要性排：

- [ ] **公開部署**（步驟見下面）
- [ ] **用未見過嘅 post 重測配對**，由人核對地址
- [ ] 下架請求嘅處理後台 —— 而家淨係收得，要喺 Supabase dashboard 睇 `takedown_request`；上真食評人資料之前要有人每日睇
- [ ] Overture HK + JP 匯入（取代手寫餐廳）
- [ ] 字幕 ingestion（先確認有幾多店名真係只喺口述）
- [ ] `ingest/fetch_posts.py` 改用 YouTube Data API（而家係直接讀 watch page）
- [ ] Share Extension（最重要嘅入口）
- [ ] 抽取 pipeline（Claude API）
- [ ] 手動 seed 頭 50 個食評人 —— **按餐廳覆蓋面同有冇 YouTube 揀人，唔係按 follower 數**
- [ ] 行程 view（日本場景）
- [ ] 用戶之間配對（要先有足夠評分密度先有意思）

## 部署

Next.js 要接 hosted Supabase，唔可以放 GitHub Pages。全程用瀏覽器就做到：

1. 開一個全新嘅 Supabase project，喺 SQL Editor 貼 [`supabase/deploy_all.sql`](supabase/deploy_all.sql) 跑一次
2. Vercel 匯入呢個 repo，Root Directory 揀 `web`，加 `NEXT_PUBLIC_SUPABASE_URL` 同 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. 喺 Supabase Authentication → URL Configuration 將 Site URL 改做 Vercel 網址，並將同一個網址加入 Redirect URLs（註冊確認信會 redirect 返當前網域）

`deploy_all.sql` 只適用於全新 project。之後改 schema 要加新 migration，再用 `supabase db push`。

改完 schema 或者權限，跑 `supabase/build_deploy_sql.sh` 同 `python3 supabase/tests/rls_check.py`。

`web/next.config.mjs` 已經加咗基本安全 header；CSP 未加，因為 MapLibre 要 `blob:` worker
同 OpenFreeMap 嘅 host，要逐個列清楚先開得。

## 授權（待確認）

- **Code** — AGPL-3.0。呢個係 commons project，唔想俾人閉源 fork 走。如果想要更多貢獻者，可以考慮 MIT。
- **資料** — CDLA-Permissive-2.0，同 Overture Places 一致。

---

*README 中文版優先，因為產品定位就係本地。`README.en.md` 待補。*
