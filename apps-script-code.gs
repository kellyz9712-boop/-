/**
 * 我的庫存櫃 — 雲端同步後端
 * ------------------------------------------------------------
 * 這段程式碼「不是」放在你的網站裡,而是要貼到 script.google.com。
 * 它會在你自己的 Google 帳號底下執行,把資料存成一個檔案,
 * 放在你自己的 Google 雲端硬碟裡。詳細步驟看「設定教學.md」。
 *
 * ⚠️ 這個版本不用密碼,單靠「網址本身夠長、夠隨機」來防止別人亂猜。
 * 誰拿到這個網址,就能讀寫這份資料 —— 不要把網址貼到公開的地方。
 * ------------------------------------------------------------
 */

// 存在雲端硬碟裡的檔名,不用改
const FILE_NAME = 'kucun-data.json';

/* ---------- 讀取資料(App 開啟時呼叫) ---------- */
function doGet(e) {
  const file = findFile_();
  if (!file) {
    return json_({ items: [], categories: null, settings: null, updatedAt: 0 });
  }
  const text = file.getBlob().getDataAsString('UTF-8');
  try {
    const data = JSON.parse(text);
    return json_(data);
  } catch (err) {
    return json_({ items: [], categories: null, settings: null, updatedAt: 0 });
  }
}

/* ---------- 寫入資料(App 有異動時呼叫) ---------- */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ error: 'bad_request' });
  }
  const data = body.data || {};
  if (!data.updatedAt) data.updatedAt = Date.now();

  const text = JSON.stringify(data);
  const file = findFile_();
  if (file) {
    file.setContent(text);
  } else {
    DriveApp.createFile(FILE_NAME, text, MimeType.PLAIN_TEXT);
  }
  return json_({ ok: true, updatedAt: data.updatedAt });
}

/* ---------- 小工具 ---------- */
function findFile_() {
  const it = DriveApp.getFilesByName(FILE_NAME);
  return it.hasNext() ? it.next() : null;
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
