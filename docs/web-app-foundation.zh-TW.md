# 網頁應用基礎與 API 契約

## 開發

採用 Vite + TypeScript SPA，以原生 DOM 建立階段 1 路由骨架。需要 Node.js 20.19+ 或 22.12+；本次環境為 Node.js 24。使用 pnpm 執行開發、建置與測試指令。

```text
pnpm install
pnpm start:dev
```

另一個終端執行：

```text
pnpm web:dev
pnpm web:build
pnpm --filter @bathroom-genius/web exec playwright install chromium
pnpm web:test
```

後端沿用根目錄 `.env`。前端可將 `web/.env.sample` 複製為 `web/.env.local`。網站使用 `http://127.0.0.1:5173`，`/api` 代理至 `http://127.0.0.1:3000`。後端需要 MongoDB；只啟動前端仍可查看路由骨架。

`API_PROXY_TARGET` 僅用於開發代理。`VITE_LIFF_ID` 是可公開的識別碼；不得將 LINE secret、session secret 或資料庫憑證放進 `VITE_*`。

正式環境提供 `web/dist` 靜態檔案；先代理 `/api/*` 到 NestJS，再讓其他前端路由 fallback 至 `index.html`。API 錯誤不可改成 HTML；Vite preview 不作正式伺服器。

## 環境待確認

| 項目 | 待管理者確認 |
| --- | --- |
| 正式網址 | HTTPS 網域，網站與 API 同 origin |
| LINE Login | channel ID、secret、callback：`https://<網域>/api/auth/line/callback` |
| LINE 內入口 | MINI App 或 LIFF channel、LIFF ID、HTTPS endpoint URL |
| Bot 身分整合 | Messaging API 與 Login／MINI App 的 provider，確認 user ID 對應 |
| 開發環境 | 測試 channel、測試帳號及 HTTPS tunnel |

上述設定尚未確認。Login／session 設定在階段 2 加入後端啟動驗證；目前尚無登入端點。骨架不依賴 LINE SDK。

## 共用契約

`packages/contracts/index.d.ts` 是前後端共用型別套件，不包含執行期程式；NestJS DTO 仍負責執行期驗證。新增型別不會自動改變現有 API。

| 型別 | 說明／狀態 |
| --- | --- |
| `ApiError` | 沿用現有 statusCode、timestamp、path、message |
| `HealthStatus` | 對應現有 `/api/health` |
| `ToiletSummary` | 對齊現有廁所資料；API 層須將設施缺值正規化為 null |
| `Page<T>` | 現有清單分頁格式 |
| `NearbyPage<T>` | 階段 3 才讓 `/api/toilets/nearby` 回傳此格式 |
| `AuthState`、`CurrentUser` | 階段 2：loading／guest／authenticated，角色以後端為準 |
| `ReviewInput`、`PublicReview` | 階段 3：匿名顯示、canEdit 及移除公開回應中的內部身分；目前 API 尚未提供 |

附近搜尋使用現有端點，增加 page、limit，回傳 `{ data, total, page, limit, hasMore }`。Bot 固定 page=1、limit=5。此契約變更尚未實作，須同步遷移 Bot 與測試。

## 顯示與表單規則

- 設施：true 顯示「有」、false 顯示「無」、null 或舊資料缺值顯示「未知」。
- 沒有該項評分顯示「尚無評分」，不顯示零顆星；只有文字的評論不計入平均分。
- 地理查詢顯示直線距離，文字搜尋不假定有距離。
- 開放時間缺值顯示「開放時間未提供」，不推定正在營業。
- 標籤先保留既有內容，資料盤點後再處理 24H／24h 等大小寫；不可單憑包含「24」推定全天開放。
- 乾淨度、便利度各為選填 1–5 星；至少一項評分或非空白文字；文字上限 1,000 字。衛生紙三態只記錄評論觀察，不覆寫設施。

## 資料盤點與驗收邊界

已由程式確認 Toilet schema 宣告 location 的 2dsphere 索引，座標順序為 `[lng, lat]`；這不代表實際資料庫已建立索引。

待測試資料庫可用後，以唯讀查詢盤點：資料筆數、實際索引、無效座標、設施缺值、標籤大小寫、開放時間格式，以及已知位置附近的搜尋結果。不得輸出正式連線憑證或提交正式資料。

階段 1 提供首頁、詳情、撰寫評論、我的評論及找不到頁面的骨架，不含搜尋或登入功能。自動化測試覆蓋直接開啟詳情、重新整理及無效頁面返回首頁。真實 MongoDB 啟動、LINE 設定與實機測試仍須在環境具備後驗收。

階段 1 初次驗證：前端建置、後端建置與 2 項 Chromium 路由測試通過；尚未驗證實際資料庫連線。後續已將根目錄 web 指令與 Playwright webServer 統一改為直接呼叫 pnpm，不要求安裝 Corepack。使用者已確認 `pnpm web:dev` 可正常執行。

參考：[Vite 靜態部署](https://vite.dev/guide/static-deploy.html)、[Playwright webServer](https://playwright.dev/docs/test-webserver)。
