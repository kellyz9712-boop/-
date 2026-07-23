# 我的庫存櫃 v2

## 升級前

1. 先保留目前 GitHub 專案 ZIP。
2. 建議在舊版 App 的設定中確認 Google Apps Script 網址仍可使用。
3. v2 第一次開啟時，會在瀏覽器本機建立 `kucun_state_v1_backup_before_v2` 備份，並沿用原本的 `kucun_state_v1` 資料。

## GitHub Pages 更新

將 ZIP 內下列檔案全部上傳並覆蓋 GitHub 儲存庫同名檔案：

- `index.html`
- `styles.css`
- `app.js`
- `manifest.json`
- `sw.js`
- 三個圖示 PNG

GitHub Pages 更新後，先用瀏覽器重新整理。若主畫面圖示開啟的仍是舊版，請關閉 App 後重開；仍未更新時，再移除主畫面捷徑並重新加入。

## Google Apps Script 更新

1. 到原本的 Google Apps Script 專案。
2. 將 `apps-script-code.gs` 的完整內容貼到原本程式碼中並儲存。
3. 點「部署」→「管理部署作業」→編輯。
4. 將版本改成「新版本」，完成部署。
5. 原本的網頁應用程式網址通常不會改變，App 也會沿用已儲存的網址。

雲端仍使用 Google Drive 裡原本的 `kucun-data.json`。舊資料會在前端讀取時自動遷移，不必刪除或重建。

## v2 資料規則

- 舊版 `name` 會轉為「品項名稱」。
- 舊版 `quantity` 會轉為「未開封庫存」。
- 新增的「商品名」與「使用中」初始為空白及 0。
- 同類別、同品項名稱、同單位的商品會彙整為一個品項。
- 建議安全庫存取「手動下限」與「實際消耗率 ×（補貨等待＋緩衝）」兩者較高值。
- 資料不足時只使用手動安全庫存；記錄完整使用週期後，推薦值會逐漸準確。
