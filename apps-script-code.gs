/**
 * 我的庫存櫃 v2 — Google Apps Script 同步後端
 * 沿用 kucun-data.json，因此舊資料會由前端自動遷移，不需重建。
 * 將此檔完整貼到 script.google.com，儲存後重新部署網頁應用程式。
 */
const FILE_NAME = 'kucun-data.json';

function doGet() {
  const file = findFile_();
  if (!file) return json_({ schemaVersion: 2, items: [], categories: null, shoppingList: [], settings: null, updatedAt: 0 });
  try {
    return json_(JSON.parse(file.getBlob().getDataAsString('UTF-8')));
  } catch (error) {
    return json_({ error: 'invalid_cloud_data' });
  }
}

function doPost(e) {
  const lock = LockService.getUserLock();
  try {
    lock.waitLock(10000);
    const body = JSON.parse(e.postData.contents || '{}');
    const incoming = body.data || {};
    if (!Array.isArray(incoming.items)) return json_({ error: 'invalid_items' });
    incoming.schemaVersion = Number(incoming.schemaVersion) || 2;
    incoming.shoppingList = Array.isArray(incoming.shoppingList) ? incoming.shoppingList : [];
    incoming.updatedAt = Number(incoming.updatedAt) || Date.now();

    const file = findFile_();
    if (file) {
      // 避免較舊裝置覆蓋較新的雲端資料。
      try {
        const current = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
        if (Number(current.updatedAt) > incoming.updatedAt) {
          return json_({ ok: true, ignored: true, updatedAt: current.updatedAt });
        }
      } catch (ignore) {}
      file.setContent(JSON.stringify(incoming));
    } else {
      DriveApp.createFile(FILE_NAME, JSON.stringify(incoming), MimeType.PLAIN_TEXT);
    }
    return json_({ ok: true, updatedAt: incoming.updatedAt });
  } catch (error) {
    return json_({ error: String(error && error.message || error) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function findFile_() {
  const files = DriveApp.getFilesByName(FILE_NAME);
  return files.hasNext() ? files.next() : null;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
