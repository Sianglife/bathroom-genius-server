# 階段 2：LINE 登入與管理員操作

## 設定

在根目錄 `.env` 加入 `.env.sample` 的以下欄位。Messaging API 的 channel secret 不能代替 Login channel secret。

| 變數 | 用途 |
| --- | --- |
| `APP_ORIGIN` | 網站完整 origin，不含尾端 `/`；本機預設 `http://127.0.0.1:5173` |
| `LINE_LOGIN_CHANNEL_ID` | 外部瀏覽器使用的 LINE Login channel ID |
| `LINE_LOGIN_CHANNEL_SECRET` | LINE Login channel secret，僅供後端使用 |
| `LINE_PROVIDER_ID` | 此 channel 所屬 provider，作為外部身分的命名空間 |
| `LINE_LIFF_CHANNEL_ID` | 選填，預設使用 Login channel；MINI App 可使用另一 channel |
| `LINE_LIFF_PROVIDER_ID` | 使用不同 LIFF channel 時必填，必須等於 `LINE_PROVIDER_ID` |

部署者必須在 LINE Console 確認 channel 真的屬於相同 provider；設定值相等本身不是 LINE 的證明。不同 provider 的身分不自動合併，也不以暱稱判斷同一人。

LINE Login Console 的 callback URL 設為：`<APP_ORIGIN>/api/auth/line/callback`。開發時瀏覽器需使用與 APP_ORIGIN 完全相同的 host 與 port，不混用 localhost 與 127.0.0.1。若使用 HTTPS tunnel，讓 tunnel 指向 5173，更新根目錄 `.env` 的 APP_ORIGIN 及 Console callback，並重新啟動前後端；Vite 讀取同一份設定，自動允許該 hostname，前端仍代理 `/api`。

production 必須設定 HTTPS APP_ORIGIN 與完整 Login 欄位，否則啟動失敗。開發環境可先不設定 Login 欄位，公開搜尋仍可使用，登入回傳 503。

## 登入、Cookie 與 CSRF

- 外部瀏覽器：前往 `/api/auth/line/start?returnTo=<站內路徑>`，後端建立一次性的 state、nonce、PKCE 與 10 分鐘授權紀錄；callback 驗證後輪替 session 並導回原頁。
- LIFF：先 GET `/api/auth/csrf`，再將 `liff.getIDToken()` 的原始 token POST 到 `/api/auth/line`。後端向 LINE verify endpoint 驗證，檢查 issuer、channel、期限及 subject；不信任前端傳入的 profile 或 user ID。
- LIFF 的 SDK 入口整合留在階段 6，目前提供後端端點與 `web/src/auth.ts` 的 signInWithLiff 存取函式。
- 授權碼與 LINE access／refresh／ID token 不存入資料庫；session 使用 32-byte 隨機識別碼，資料庫只保存 SHA-256 雜湊。
- 登入 session 固定有效 7 天，訪客 CSRF session 有效 15 分鐘；MongoDB TTL 僅負責清理，API 每次仍檢查期限。
- HTTPS Cookie 為 `__Host-session`，設定 HttpOnly、Secure、SameSite=Lax、Path=/，不設定 Domain。本機 HTTP 則使用 `bathroom-session` 且不設定 Secure。
- 每次受保護請求都讀取資料庫最新角色；登出刪除 session，既有 Cookie 立即失效。登入會換新 session 與 CSRF token。
- Cookie 不放 localStorage；CSRF token 由 API 回傳並在請求時使用。CSRF token 不是登入憑證。

Cookie 驗證的寫入請求需附帶：

```text
Origin: <APP_ORIGIN>
X-CSRF-Token: <GET /api/auth/csrf 回傳的 csrfToken>
Content-Type: application/json
```

瀏覽器會自動設定 Origin 與傳送同 origin Cookie。後端拒絕缺少 Origin、Origin 不完全相符、CSRF 缺少／不符等請求。外部工具呼叫受保護 API 時也必須提供這些資料。

OAuth callback 使用 state／nonce／PKCE 與發起瀏覽器的 Cookie 驗證，不套用一般寫入 CSRF header。LINE Bot webhook 保留 LINE HMAC 簽章驗證。

## API

| 端點 | 行為 |
| --- | --- |
| `GET /api/auth/csrf` | 取得 csrfToken；必要時建立訪客 Cookie；no-store |
| `GET /api/auth/line/start` | 302 到 LINE 授權頁 |
| `GET /api/auth/line/callback` | 一次性驗證並 302 返回站內頁 |
| `POST /api/auth/line` | `{ idToken }`，需要訪客或登入 session 的 CSRF／Origin；回傳 `{ user, csrfToken }` |
| `GET /api/auth/me` | 回傳 `{ id, displayName, role }`；未登入回傳 401；no-store |
| `POST /api/auth/logout` | 需要登入與 CSRF／Origin，撤銷 session 並清除 Cookie |

returnTo 僅允許 `/`、`/me/reviews`、`/toilets/<24位ObjectId>` 與 `/toilets/<24位ObjectId>/review`；其他輸入回首頁。不接受完整外部網址、協定相對網址、編碼繞過或任意 API 路徑。

目前網站已有登入連結、登入名稱及登出按鈕；評論表單及登入草稿恢復於階段 5 實作。`GET /api/me/reviews` 在階段 3 實作，本階段不宣稱已提供。

## 寫入權限與舊資料

| 操作 | 權限 |
| --- | --- |
| 廁所／評論公開讀取 | 不需登入 |
| 新增評論 | 有效 session＋CSRF／Origin |
| 修改／刪除評論 | 作者或管理員＋CSRF／Origin |
| 新增／修改／刪除廁所 | 管理員＋CSRF／Origin |

未登入回傳 401；有效登入但權限不足回傳 403。寫入 API 不接受舊 Bearer JWT。OptionalJwtAuthGuard 僅保留相容程式，已移除驗證失敗仍解碼並信任的行為，且不再用於任何寫入路由。

新評論的作者儲存在不可由 DTO 指定的 `ownerId`，值為已驗證應用帳號的 ObjectId。舊 `userId` 欄位不作為權限依據，即使字串恰好相同也不能認領。舊匿名評論由管理員處理。公開 JSON 移除 ownerId 與舊 userId；所有舊資料保留，不執行破壞性遷移。

部署時確認 User 的 providerId＋lineSubject 唯一索引及 session／授權紀錄 TTL 索引已建立。新身分登入只建立 user 角色，不會覆寫既有 admin 角色。

## 管理員 CLI

先使用 LINE 登入建立帳號，再以 `/api/auth/me` 回傳的 `id` 操作。指令使用與伺服器相同的 `.env` MongoDB 設定，執行前確認目標環境。

```text
pnpm admin:grant --user-id <應用使用者ID>
pnpm admin:revoke --user-id <應用使用者ID>
```

必須在互動終端執行。指令顯示目標 ID、名稱與角色變更，輸入 `yes` 才執行；不存在帳號或無效 ID 不寫入資料。角色已符合時回報無需變更。

角色與 roleChanges 操作紀錄在同一個 User 文件中原子更新，紀錄包含前後角色、維運作業系統帳號／主機與時間。期間角色被其他操作改動會拒絕覆寫。撤銷後下一個受保護請求立即使用新角色。

目前允許維運人員撤銷最後一位管理員，可用同一 CLI 恢復；管理員頁面及最後一位管理員的操作限制屬於未來工作，未實作公開角色管理 API。

## 驗證範圍

2026-11-06 再次驗收：使用者已確認真實 LINE 登入可用。取消授權返回頁面修正後，前後端建置通過；完整後端 17 組、145 項測試通過；6 項 Chromium 瀏覽器測試通過。先前修改的 LINE 回應處理程式 ESLint 通過。管理員 CLI 的無效 ID 呼叫已確認在連線資料庫前拒絕。

圖片路徑測試已修復並包含在完整通過的測試中。另行執行整個 repo 的 `tsc --noEmit` 仍有先前記錄的 LINE Bot 測試 fixture 型別問題；本次未宣稱已修復或重跑此全域檢查。正式 NestJS 建置可通過。原有依賴真實環境的 e2e 測試未執行，避免連線既有 `.env` 資料庫。

隔離 MongoDB 的 HTTP 整合測試覆蓋：偽造／過期／錯誤 channel token、Cookie 輪替與登出、期限、CSRF／Origin、OAuth state／nonce／PKCE、回傳路徑、作者／舊評論限制與管理員授權撤銷。LINE API 回應在自動測試中模擬；真實登入另採使用者回報作為證據，不將兩者混為一項。

本次補強：所有受保護寫入路由的 401／CSRF 拒絕矩陣、跨 session 的 CSRF 不可混用、一般使用者的廁所 CRUD 限制、OAuth 與 LIFF 端點重複登入不建立重複帳號且保留 admin、篡改 state 與並行 callback 只能成功一次、PKCE challenge 與 verifier 的實際關係、重複 Cookie／刪除帳號拒絕、實際隔離資料庫索引、重複撤銷不新增操作紀錄，以及 production Cookie 設定與清除。

同時修正兩個邊界情況：LINE 回傳 null／陣列等非預期 JSON 結構時安全回覆 503；已過期或撤銷的 session 按登出時，前端重新載入並回到訪客狀態。

第一次執行測試時 mongodb-memory-server 可能下載 MongoDB 執行檔，不使用 `.env` 的正式資料庫。CLI 變更邏輯由同一隔離資料庫測試驗證，本次未對真實帳號執行授權或撤銷。另以臨時資料庫啟動真正的 CLI，已確認會顯示目標帳號及確認提示；後續互動輸入工具回報「rejected by user」，未完成確認／取消流程，已停止並清理測試程序。

## 階段 2 驗收對照與剩餘項目

| 項目 | 狀態與證據 |
| --- | --- |
| 真實 LINE 登入 | 使用者確認可登入；尚未提供裝置／瀏覽器矩陣 |
| token 驗證及上游異常 | 自動測試通過：issuer、subject、channel、期限、nonce、HTTP 429／5xx、連線及異常 JSON |
| session 輪替、到期、登出撤銷 | 真實隔離 MongoDB 的 HTTP 測試通過 |
| HTTPS Cookie | production 設定的 HTTP 回應 header 測試通過；測試傳輸仍是本機 HTTP，不等同真實瀏覽器 TLS／Cookie 儲存驗收 |
| 所有寫入的登入／CSRF／Origin 防護 | 路由矩陣測試通過；缺少登入 401，CSRF 不符或權限不足 403 |
| 作者限制、舊匿名評論保護 | API 測試通過；不依賴舊 userId 認領 |
| CLI 的角色變更、冪等、競爭與操作紀錄 | 底層服務的隔離資料庫測試通過；使用者確認真實 grant／revoke 有效；CLI 取消、重複操作與實際操作紀錄仍待逐項確認 |
| 同一 session 撤銷 admin 立即生效 | API 測試通過，不必重新登入 |
| 登入後返回原頁 | API callback 與前端登入連結測試通過；使用者確認真實登入返回指定詳情頁有效 |
| User 唯一索引、session／授權紀錄 TTL | 隔離資料庫的實際索引測試通過；部署資料庫索引仍需唯讀確認 |
| OAuth 與 LIFF 使用相同帳號 | 同一 channel 的兩種登入端點測試通過；不同 channel 的 provider 設定驗證通過，實際 Console provider 與 LIFF 實機留待確認 |
| 我的評論 API | 已明確歸階段 3，尚未實作 |
| 評論草稿恢復 | 已明確歸階段 5，尚未實作，不能視為階段 2 已驗收 |
| LINE SDK、MINI App／LIFF 實機 | 階段 6，尚未整合 |
| iOS／Android 全矩陣、速率限制與正式部署 | 階段 7，尚未驗收 |

剩餘手動清單：

1. 在實際 HTTPS 網域確認 session Cookie 的 HttpOnly／Secure／SameSite=Lax／Path=/ 與無 Domain，登出後重新整理 `/api/auth/me` 應回 401。
2. 真實登入返回同一詳情頁已確認；剩餘：實際取消 LINE 授權後不應建立登入 session，並可重新發起登入。
3. 真實 CLI grant／revoke 已由使用者確認；剩餘：在測試環境取消一次、重複 grant／revoke，查核 roleChanges 及同一 session 的管理 API 權限。
4. 唯讀確認部署資料庫的唯一及 TTL 索引；實際 provider／LIFF 與裝置矩陣依上述階段完成。

### 如何驗收取消授權

此處指使用者在 LINE 登入同意畫面按取消或拒絕。先讓網站處於未登入狀態，再使用尚未同意此應用的測試帳號，點「使用 LINE 登入」，到 LINE 同意畫面後取消。已同意過的帳號可能自動登入，不顯示同意畫面；單純登出網站不會清除 LINE 的同意紀錄。LINE 支援在送往 LINE 的授權 URL 設定 `prompt=consent` 強制顯示同意畫面，但本專案目前的 `/start` API 未提供此 query 選項。

LINE 通常會以 `error=ACCESS_DENIED` 與 state 返回 callback。後端驗證瀏覽器 session、state 與期限，消耗這次登入紀錄後，以 302 返回原本允許的站內頁面，附加 `?login=cancelled`。前端顯示「已取消 LINE 登入，你仍可繼續瀏覽。」並從網址移除提示參數；使用者可重新點選登入。取消不建立新的已登入 session，也不會撤銷原先就存在的有效登入。若 LINE 回應缺少必要 state，DTO 驗證回 400；無效、過期或重複的 state 回 401，均不執行取消返回。

在同一瀏覽器開啟 `/api/auth/me` 應回 401；可能仍保留訪客 CSRF Cookie，這不代表已登入。重新從網站發起登入並同意，應能正常登入。直接關閉 LINE 授權頁可能不會呼叫 callback；未完成的登入紀錄到期後清理，網站仍維持訪客。

### 如何確認部署資料庫索引

使用 MongoDB Compass／Atlas 的 Collections → Indexes，或在連接同一部署資料庫的 mongosh 執行：

```javascript
db.getName()
db.getCollectionNames()
db.users.getIndexes()
db.sessions.getIndexes()
db.loginattempts.getIndexes()
```

先確認選到 `.env` 的 `MONGODB_DB_NAME` 所指向的資料庫；以上是 Mongoose 預設 collection 名稱，以實際部署為準。`getIndexes()` 是唯讀查詢。

| Collection | 必須存在的 key | 必須存在的選項 |
| --- | --- | --- |
| users | `{ providerId: 1, lineSubject: 1 }` | `unique: true` |
| sessions | `{ tokenHash: 1 }` | `unique: true` |
| sessions | `{ expiresAt: 1 }` | `expireAfterSeconds: 0` |
| loginattempts | `{ stateHash: 1 }` | `unique: true` |
| loginattempts | `{ expiresAt: 1 }` | `expireAfterSeconds: 0` |

索引名稱不必完全一致，重點是 key 與選項。`_id_` 是基本索引，不足以代表上述索引已存在。唯一索引避免重複帳號／識別碼；TTL 的 `expireAfterSeconds: 0` 表示依文件本身的 expiresAt 日期清理，不是立即刪除所有 session。MongoDB 清理非即時，後端仍會在每次請求檢查期限。

程式 schema 的索引宣告與隔離測試通過，不保證部署資料庫已建立索引；例如部署設定停用自動建索引、資料庫權限不足或既有重複資料，都可能影響建立結果。若缺少，記錄實際結果，再安排補建及必要資料處理；本項確認本身不修改資料庫。

官方參考：[LINE Login API](https://developers.line.biz/en/reference/line-login/)、[授權碼登入流程](https://developers.line.biz/en/docs/line-login/integrate-line-login/)。
