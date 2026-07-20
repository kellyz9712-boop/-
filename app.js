/* 我的庫存櫃 — app.js
   純 JavaScript,不需編譯。資料存在本機,並透過 Google Apps Script 同步到你的 Google 雲端硬碟。 */


/* ---------- 常數 ---------- */
const DAY = 86400000;
const UNITS = ['個', '瓶', '包', '盒', '支', '片', '組', '罐', '條'];
const DEFAULT_CATEGORIES = [
  { id: 'beauty',  name: '美妝',     color: '#E0614C' },
  { id: 'daily',   name: '日常用品', color: '#2C9686' },
  { id: 'kitchen', name: '廚房',     color: '#D99A34' },
  { id: 'merch',   name: '追星商品', color: '#6C5C8A' },
  { id: 'album',   name: '專輯',     color: '#C25E8B' },
  { id: 'other',   name: '其他',     color: '#7A7684' },
];
const PALETTE = ['#E0614C', '#2C9686', '#D99A34', '#6C5C8A', '#C25E8B', '#4E9A6B', '#7A7684'];
const STATUS = {
  out:      { label: '已用完',   color: '#E0614C' },
  low:      { label: '數量偏低', color: '#E0614C' },
  soon:     { label: '快用完了', color: '#D99A34' },
  ok:       { label: '庫存充足', color: '#4E9A6B' },
  expired:  { color: '#E0614C' },
  expiring: { color: '#D99A34' },
};

/* ---------- 小工具 ---------- */
const $ = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const clone = (x) => JSON.parse(JSON.stringify(x));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (ts) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
const money = (n) => 'NT$' + (Number(n) || 0).toLocaleString('en-US');
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

function fmtInterval(intervalDays, unit) {
  if (intervalDays == null) return '';
  if (intervalDays >= 1) return `平均每 ${Math.round(intervalDays)} 天用掉 1${unit}`;
  return `平均每天用掉約 ${Math.round(1 / intervalDays)}${unit}`;
}
function daysToExpiry(it) {
  if (!it.expiry) return null;
  const d = new Date(it.expiry + 'T00:00:00').getTime();
  return Math.ceil((d - startOfToday()) / DAY);
}
function analyze(it, leadDays) {
  const q = Number(it.quantity) || 0;
  const threshold = Number(it.threshold) || 0;
  const uses = (it.usageLog || []).filter((e) => e.delta < 0).sort((a, b) => a.t - b.t);
  let dailyRate = null, daysLeft = null, emptyDate = null, buyBy = null, intervalDays = null;
  if (uses.length >= 2) {
    const first = uses[0].t, last = uses[uses.length - 1].t;
    const span = Math.max((last - first) / DAY, 0.5);
    const total = uses.reduce((s, e) => s + Math.abs(e.delta), 0);
    dailyRate = total / span;
    if (dailyRate > 0) {
      intervalDays = 1 / dailyRate;
      daysLeft = q / dailyRate;
      emptyDate = Date.now() + daysLeft * DAY;
      buyBy = emptyDate - leadDays * DAY;
    }
  }
  let status = 'ok';
  if (q <= 0) status = 'out';
  else if (threshold > 0 && q <= threshold) status = 'low';
  else if (daysLeft != null && daysLeft <= leadDays) status = 'soon';
  return { q, threshold, dailyRate, daysLeft, emptyDate, buyBy, intervalDays, status, uses };
}

/* ---------- 圖示 ---------- */
const P = {
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 2h2l2.6 12.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H5.1"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
  trend: '<path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  rotate: '<path d="M3 2v6h6"/><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sparkles: '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  pkg: '<path d="M16.5 9.4 7.5 4.2"/><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" x2="12" y1="22" y2="12"/>',
};
function ic(name, size = 16, color = 'currentColor', sw = 2) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
}

/* ---------- 狀態 ---------- */
const LOCAL_KEY = 'kucun_state_v1';
let state = { items: [], categories: clone(DEFAULT_CATEGORIES), settings: { leadDays: 7, expiryWarnDays: 14 }, updatedAt: 0 };
let ui = { typeFilter: 'all', catFilter: 'all', query: '', view: 'list', detail: null, sync: 'off' };
let draft = null;              // 編輯中的品項
let saveTimer = null;
let pollTimer = null;
let pulling = false;
let booted = false;            // 是否已完成第一次開機讀取(本機或雲端)

/* ---------- 範例資料 ---------- */
function sampleItems() {
  const now = Date.now();
  const log = (days) => days.map((d) => ({ t: now - d * DAY, delta: -1 }));
  const inDays = (n) => new Date(now + n * DAY).toISOString().slice(0, 10);
  return [
    { id: uid(), type: 'consumable', name: '卸妝棉', category: 'beauty', quantity: 22, unit: '片', threshold: 15, expiry: '', usageLog: log([28, 25, 22, 19, 16, 13, 10, 7, 4, 2]), createdAt: now },
    { id: uid(), type: 'consumable', name: '洗碗精', category: 'kitchen', quantity: 1, unit: '瓶', threshold: 1, expiry: '', usageLog: [], createdAt: now },
    { id: uid(), type: 'consumable', name: '面膜', category: 'beauty', quantity: 6, unit: '片', threshold: 3, expiry: inDays(20), usageLog: log([21, 14, 7]), createdAt: now },
    { id: uid(), type: 'collectible', name: 'SEVENTEEN《17 IS RIGHT HERE》', category: 'album', artist: 'SEVENTEEN', status: 'owned', price: '990', note: '限定版', cover: '', createdAt: now },
    { id: uid(), type: 'collectible', name: '官方應援手燈 ver.3', category: 'merch', artist: '', status: 'wishlist', price: '1580', note: '等團購', cover: '', createdAt: now },
  ];
}

/* ================================================================= */
/*  雲端設定(Google Apps Script)                                     */
/* ================================================================= */
const CLOUD_URL_KEY = 'kucun_cloud_url';
function getCloudUrl() { return (localStorage.getItem(CLOUD_URL_KEY) || '').trim(); }
function configReady() { return !!getCloudUrl(); }
function cloudUrl() { return getCloudUrl(); }

/* ---------- 本機儲存(離線優先,啟動立即可用) ---------- */
function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    state.items = Array.isArray(d.items) ? d.items : [];
    state.categories = Array.isArray(d.categories) && d.categories.length ? d.categories : clone(DEFAULT_CATEGORIES);
    state.settings = Object.assign({ leadDays: 7, expiryWarnDays: 14 }, d.settings || {});
    state.updatedAt = Number(d.updatedAt) || 0;
    return true;
  } catch (e) { return false; }
}
function saveLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      items: state.items, categories: state.categories, settings: state.settings, updatedAt: state.updatedAt,
    }));
  } catch (e) { /* 存不下(容量滿等)就略過,雲端還是有備份 */ }
}

/* ---------- 雲端同步(呼叫 Apps Script) ---------- */
async function pullFromCloud(silent) {
  if (!configReady() || pulling) return;
  pulling = true;
  if (!silent) { ui.sync = 'connecting'; renderSyncDot(); }
  try {
    const res = await fetch(`${cloudUrl()}?t=${Date.now()}`);
    const d = await res.json();
    if (d && d.error) throw new Error(d.error);
    const remoteUpdatedAt = Number(d && d.updatedAt) || 0;
    if (d && remoteUpdatedAt >= state.updatedAt) {
      if (remoteUpdatedAt > 0) {
        state.items = Array.isArray(d.items) ? d.items : [];
        state.categories = Array.isArray(d.categories) && d.categories.length ? d.categories : clone(DEFAULT_CATEGORIES);
        state.settings = Object.assign({ leadDays: 7, expiryWarnDays: 14 }, d.settings || {});
        state.updatedAt = remoteUpdatedAt;
        saveLocal();
      }
      ui.sync = 'synced';
    } else {
      ui.sync = 'synced'; // 本機比較新(尚未推上去),等 debounce 儲存
    }
  } catch (e) {
    console.error('pull', e);
    ui.sync = booted ? 'offline' : 'error';
  }
  pulling = false;
  booted = true;
  renderMainOrLoading();
}

function scheduleSave() {
  state.updatedAt = Date.now();
  saveLocal();
  ui.sync = 'saving';
  renderSyncDot();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushToCloud, 700);
}
async function pushToCloud() {
  if (!configReady()) { ui.sync = 'synced'; renderSyncDot(); return; }
  try {
    const payload = { data: { items: state.items, categories: state.categories, settings: state.settings, updatedAt: state.updatedAt } };
    const res = await fetch(cloudUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 避免瀏覽器 CORS 預檢請求
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (d && d.error) throw new Error(d.error);
    ui.sync = 'synced';
  } catch (e) {
    console.error('push', e);
    ui.sync = 'error';
  }
  renderSyncDot();
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') pullFromCloud(true); }, 25000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pullFromCloud(true); });
  window.addEventListener('focus', () => pullFromCloud(true));
}

/* ================================================================= */
/*  路由 / 主渲染                                                      */
/* ================================================================= */
function render() {
  const root = $('root');
  if (!configReady()) { root.innerHTML = screenSetupUrl(); return; }
  renderMainOrLoading();
}
function renderMainOrLoading() {
  const root = $('root');
  if (!booted && !state.items.length && !$('appShell')) {
    // 完全沒有本機資料、也還沒拉過雲端 → 顯示載入畫面
    if (!localStorage.getItem(LOCAL_KEY)) { root.innerHTML = screenLoading('讀取雲端資料中…'); return; }
  }
  mountMain();
}

function screenLoading(t) { return `<div class="center"><div class="spin"></div><div>${esc(t || '載入中…')}</div></div>`; }
let setupErr = '';
function screenSetupUrl(prefill) {
  const canCancel = !!getCloudUrl();
  return `<div class="authwrap"><div class="authcard" style="text-align:left">
    <div class="logo" style="margin:0 auto 14px">${ic('box', 20, '#F3F1EA')}</div>
    <h2 style="text-align:left">連接你的雲端硬碟</h2>
    <p style="text-align:left">把 Google Apps Script 部署後拿到的網址貼在下面,就能把資料存到你自己的 Google 雲端硬碟,其他裝置也貼同一個網址就會同步。</p>
    <div class="field" style="margin-top:4px"><div class="l">Apps Script 網路應用程式網址</div>
      <input class="in" id="setupUrl" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(prefill || '')}" autocapitalize="off" autocorrect="off" spellcheck="false" /></div>
    <div class="autherr">${esc(setupErr)}</div>
    <button class="authbtn" onclick="A.saveCloudUrl()">儲存並開始使用</button>
    ${canCancel ? `<div class="authswap"><b onclick="A.cancelChangeUrl()">取消,返回 App</b></div>` : ''}
    <div class="notice warn" style="margin-top:14px"><div class="th">${ic('sparkles', 15, '#D99A34')} 還沒有網址?</div>
    先照著「設定教學」在手機上把 Apps Script 部署好,就會拿到這串網址,再回來貼這裡。</div>
  </div></div>`;
}

/* ---------- 主畫面外殼 ---------- */
function mountMain() {
  const root = $('root');
  // 只建立一次外殼;之後只更新 #body
  if (!$('appShell')) {
    root.innerHTML = `
      <div id="syncDot" class="syncdot"></div>
      <div class="wrap" id="appShell">
        <header class="header">
          <div class="hrow">
            <div class="brand">
              <div class="logo">${ic('box', 20, '#F3F1EA')}</div>
              <div><h1>我的庫存櫃</h1><p>備品 · 追星 · 收藏,自動同步</p></div>
            </div>
            <button class="iconbtn" onclick="A.openSettings()" aria-label="設定">${ic('settings', 17, '#7A7684')}</button>
          </div>
          <div class="search">${ic('search', 16, '#7A7684')}
            <input id="q" placeholder="搜尋品項或藝人…" oninput="A.setQuery(this.value)" />
            <button id="qx" class="hide" onclick="A.clearQuery()">${ic('x', 15, '#7A7684')}</button>
          </div>
        </header>
        <main id="body"></main>
      </div>
      <button class="fab" onclick="A.openEdit()">${ic('plus', 20, '#fff')} 新增品項</button>
      <div id="modal"></div>`;
    const q = $('q'); if (q) q.value = ui.query;
  }
  updateBody();
  renderSyncDot();
}

function renderSyncDot() {
  const el = $('syncDot'); if (!el) return;
  const map = {
    synced: { t: '已同步', c: '#4E9A6B', bg: '#E7F1EA' },
    saving: { t: '儲存中…', c: '#D99A34', bg: '#FAEFD6' },
    connecting: { t: '連線中…', c: '#7A7684', bg: '#EDEAE2' },
    offline: { t: '離線(稍後同步)', c: '#7A7684', bg: '#EDEAE2' },
    error: { t: '同步異常', c: '#E0614C', bg: '#FAE7E2' },
    off: { t: '', c: '', bg: '' },
  };
  const s = map[ui.sync] || map.off;
  if (!s.t) { el.classList.add('hide'); return; }
  el.classList.remove('hide');
  el.style.background = s.bg; el.style.color = s.c;
  el.innerHTML = `${ic('sparkles', 12, s.c)} ${s.t}`;
}

/* ---------- body(alerts + 統計 + 篩選 + 清單/牆) ---------- */
function updateBody() {
  const body = $('body'); if (!body) return;
  const lead = state.settings.leadDays || 7;
  const cats = Object.fromEntries(state.categories.map((c) => [c.id, c]));
  const alerts = buildAlerts();

  // 花費統計(收藏品)
  const coll = state.items.filter((i) => i.type === 'collectible');
  const wishSum = coll.filter((i) => i.status === 'wishlist').reduce((s, i) => s + (Number(i.price) || 0), 0);
  const ownSum = coll.filter((i) => i.status === 'owned').reduce((s, i) => s + (Number(i.price) || 0), 0);
  const showMoney = ui.typeFilter !== 'consumable' && (wishSum > 0 || ownSum > 0);

  // 篩選
  const qq = ui.query.trim().toLowerCase();
  const visible = state.items.filter((it) => {
    if (ui.typeFilter !== 'all' && it.type !== ui.typeFilter) return false;
    if (ui.catFilter !== 'all' && it.category !== ui.catFilter) return false;
    if (qq && !((it.name || '').toLowerCase().includes(qq) || (it.artist || '').toLowerCase().includes(qq))) return false;
    return true;
  });

  let html = '';

  if (alerts.length) {
    html += `<section class="alerts"><div class="head">${ic('bell', 16, '#E0614C')} 需要補貨/注意<span class="badge">${alerts.length}</span></div>`;
    for (const al of alerts) {
      const col = STATUS[al.reason.k] ? STATUS[al.reason.k].color : '#E0614C';
      const canRestock = ['out', 'low', 'soon'].includes(al.reason.k);
      html += `<div class="alertrow">
        <div class="spine" style="background:${col}"></div>
        <button class="txt" onclick="A.openDetail('${al.it.id}')">
          <div class="n">${esc(al.it.name)}</div><div class="s">${esc(al.reason.txt)}</div>
        </button>
        ${canRestock ? `<button class="pill-dark" onclick="A.restock('${al.it.id}',1)">${ic('cart', 13, '#F3F1EA')} 補貨</button>`
          : `<span style="color:${col}">${ic('clock', 16, col)}</span>`}
      </div>`;
    }
    html += `</section>`;
  }

  if (showMoney) {
    html += `<div class="money">
      <div class="box"><div class="lbl">願望清單合計</div><div class="val" style="color:#6C5C8A">${money(wishSum)}</div></div>
      <div class="box"><div class="lbl">已入手合計</div><div class="val" style="color:#2C9686">${money(ownSum)}</div></div>
    </div>`;
  }

  // 類型分頁
  const seg = (v, label, icon) =>
    `<button class="seg ${ui.typeFilter === v ? 'on' : ''}" onclick="A.setType('${v}')">${ic(icon, 14, ui.typeFilter === v ? '#F3F1EA' : '#7A7684')} ${label}</button>`;
  html += `<div class="segrow">${seg('all', '全部', 'pkg')}${seg('consumable', '消耗品', 'rotate')}${seg('collectible', '收藏品', 'star')}</div>`;

  // 分類 chips
  html += `<div class="chips"><button class="chip ${ui.catFilter === 'all' ? 'on' : ''}" onclick="A.setCat('all')">全部分類</button>`;
  for (const c of state.categories) {
    html += `<button class="chip ${ui.catFilter === c.id ? 'on' : ''}" onclick="A.setCat('${c.id}')">
      <span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`;
  }
  html += `</div>`;

  // 收藏品可切換清單/封面牆
  if (ui.typeFilter === 'collectible') {
    html += `<div class="viewtoggle">
      <button class="vbtn ${ui.view === 'list' ? 'on' : ''}" onclick="A.setView('list')">${ic('list', 13, ui.view === 'list' ? '#F3F1EA' : '#7A7684')} 清單</button>
      <button class="vbtn ${ui.view === 'wall' ? 'on' : ''}" onclick="A.setView('wall')">${ic('grid', 13, ui.view === 'wall' ? '#F3F1EA' : '#7A7684')} 封面牆</button>
    </div>`;
  }

  // 清單本體
  if (!visible.length) {
    html += emptyState(state.items.length > 0);
  } else if (ui.typeFilter === 'collectible' && ui.view === 'wall') {
    html += `<div class="wall">`;
    for (const it of visible) html += tileCard(it, cats[it.category]);
    html += `</div>`;
  } else {
    html += `<div class="list">`;
    for (const it of visible) html += itemCard(it, cats[it.category], lead);
    html += `</div>`;
  }

  body.innerHTML = html;
  const qx = $('qx'); if (qx) qx.classList.toggle('hide', !ui.query);
  renderSyncDot();
}

function buildAlerts() {
  const lead = state.settings.leadDays || 7;
  const warn = state.settings.expiryWarnDays || 14;
  const out = [];
  for (const it of state.items) {
    if (it.type !== 'consumable') continue;
    const a = analyze(it, lead);
    const reasons = [];
    if (a.status === 'out') reasons.push({ k: 'out', rank: 0, txt: '已用完' });
    else if (a.status === 'low') reasons.push({ k: 'low', rank: 1, txt: `剩 ${a.q}${it.unit},低於安全庫存` });
    else if (a.status === 'soon') reasons.push({ k: 'soon', rank: 3, txt: `剩約 ${Math.max(0, Math.round(a.daysLeft))} 天${a.buyBy ? ' · 建議 ' + md(a.buyBy) + ' 前補' : ''}` });
    const de = daysToExpiry(it);
    if (de != null) {
      if (de < 0) reasons.push({ k: 'expired', rank: 0, txt: `已過期 ${Math.abs(de)} 天` });
      else if (de <= warn) reasons.push({ k: 'expiring', rank: 2, txt: `${de} 天後到期(${it.expiry.slice(5)})` });
    }
    if (reasons.length) { reasons.sort((x, y) => x.rank - y.rank); out.push({ it, a, reason: reasons[0] }); }
  }
  out.sort((x, y) => x.reason.rank - y.reason.rank || (x.a.daysLeft ?? 1e9) - (y.a.daysLeft ?? 1e9));
  return out;
}

function itemCard(it, cat, lead) {
  const isCons = it.type === 'consumable';
  const a = isCons ? analyze(it, lead) : null;
  const m = isCons ? STATUS[a.status] : null;
  const bar = isCons ? m.color : (cat ? cat.color : '#7A7684');
  const de = isCons ? daysToExpiry(it) : null;

  let right = '';
  if (isCons) {
    right = `<div class="qty"><div class="big tnum">${a.q}<span class="u"> ${esc(it.unit)}</span></div>
      <div class="st" style="color:${m.color}">${m.label}</div></div>`;
  } else if (it.price) {
    right = `<div style="font-size:13px;font-weight:600;color:#7A7684">${money(it.price)}</div>`;
  }

  const tags = [];
  if (cat) tags.push(`<span class="tag" style="background:${cat.color}22;color:${cat.color}">${esc(cat.name)}</span>`);
  if (!isCons) {
    const own = it.status === 'owned';
    tags.push(`<span class="tag" style="background:${own ? '#E1F0EC' : '#ECE6F2'};color:${own ? '#2C9686' : '#6C5C8A'}">${own ? ic('check', 10, '#2C9686') + '已入手' : ic('heart', 10, '#6C5C8A') + '願望清單'}</span>`);
  }
  if (it.artist) tags.push(`<span class="artist">${esc(it.artist)}</span>`);

  let foot = '';
  if (isCons) {
    let hint;
    if (a.status === 'out') hint = '目前沒有庫存了';
    else if (a.buyBy) hint = `剩約 ${Math.max(0, Math.round(a.daysLeft))} 天 · ${md(a.buyBy)} 前補貨`;
    else if (a.uses.length >= 1) hint = '累積使用資料中…';
    else hint = '尚無使用紀錄';
    if (de != null && de < 0) hint = `已過期 ${Math.abs(de)} 天`;
    else if (de != null && de <= (state.settings.expiryWarnDays || 14)) hint = `${de} 天後到期`;
    foot = `<div class="cardfoot"><div class="hint">${esc(hint)}</div>
      <button class="ghost" onclick="A.use('${it.id}',1)">${ic('minus', 13)} 用一個</button></div>`;
  }

  return `<div class="card"><div class="bar" style="background:${bar}"></div><div class="body">
    <div class="top">
      <button class="name" style="flex:1" onclick="A.openDetail('${it.id}')">${esc(it.name)}
        <div class="metaline">${tags.join('')}</div></button>
      ${right}
    </div>${foot}</div></div>`;
}

function tileCard(it, cat) {
  const own = it.status === 'owned';
  const flag = own
    ? `<span class="ownflag">${ic('check', 10, '#fff')} 已入手</span>`
    : `<span class="wishflag">${ic('heart', 10, '#fff')} 願望</span>`;
  const cover = it.cover
    ? `<img src="${esc(it.cover)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="ph" style="display:none;color:${cat ? cat.color : '#7A7684'}">${esc((it.name || '?').slice(0, 1))}</div>`
    : `<div class="ph" style="color:${cat ? cat.color : '#7A7684'}">${esc((it.name || '?').slice(0, 1))}</div>`;
  return `<button class="tile" onclick="A.openDetail('${it.id}')">
    <div class="cover" style="background:${cat ? cat.color + '18' : '#F3F1EA'}">${cover}${flag}</div>
    <div class="cap"><div class="n">${esc(it.name)}</div>${it.artist ? `<div class="a">${esc(it.artist)}</div>` : (it.price ? `<div class="a">${money(it.price)}</div>` : '')}</div>
  </button>`;
}

function emptyState(hasAny) {
  return `<div class="empty"><div class="ic">${ic('pkg', 26, '#7A7684')}</div>
    <p>${hasAny ? '這個篩選沒有品項' : '還沒有任何品項'}</p>
    <div class="sub">${hasAny ? '換個分類或清除搜尋看看' : '新增第一個品項,或先載入範例體驗一下'}</div>
    ${hasAny ? '' : `<div class="row"><button class="btn-dark" onclick="A.openEdit()">新增品項</button>
      <button class="btn-line" onclick="A.loadSample()">載入範例</button></div>`}</div>`;
}

/* ================================================================= */
/*  編輯 / 新增                                                        */
/* ================================================================= */
function newDraft(type) {
  return type === 'collectible'
    ? { id: uid(), type, name: '', category: 'album', artist: '', status: 'owned', price: '', note: '', cover: '', createdAt: Date.now() }
    : { id: uid(), type, name: '', category: 'daily', quantity: 1, unit: '個', threshold: 1, expiry: '', usageLog: [], createdAt: Date.now() };
}
function openEdit(item) {
  draft = item ? clone(item) : newDraft(ui.typeFilter === 'collectible' ? 'collectible' : 'consumable');
  renderEditModal(!!item);
}
function switchDraftType(type) {
  const base = newDraft(type);
  draft = Object.assign(base, { id: draft.id, name: draft.name, category: base.category, createdAt: draft.createdAt });
  renderEditModal(false);
}
function renderEditModal(isEdit) {
  const d = draft, isCons = d.type === 'consumable';
  const cats = state.categories.map((c) =>
    `<button class="catbtn" style="${d.category === c.id ? `background:${c.color};color:#fff;border-color:${c.color}` : ''}" onclick="A.pick('category','${c.id}')">${esc(c.name)}</button>`).join('');

  let fields;
  if (isCons) {
    fields = `
      <div class="two">
        <div class="field" style="flex:1"><div class="l">目前數量</div>${stepper('quantity', Number(d.quantity) || 0)}</div>
        <div class="field"><div class="l">單位</div>
          <select class="in" style="width:92px" onchange="A.draftSet('unit',this.value)">
            ${UNITS.map((u) => `<option ${u === d.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      </div>
      <div class="field"><div class="l">安全庫存(低於就提醒補貨)</div>${stepper('threshold', Number(d.threshold) || 0)}</div>
      <div class="field"><div class="l">保存期限(選填)</div>
        <input class="in" type="date" value="${esc(d.expiry || '')}" onchange="A.draftSet('expiry',this.value)" /></div>
      <p style="font-size:12px;color:#7A7684;margin-top:-6px">之後每次按「用一個」都會記錄,系統會自動算出使用頻率並推估補貨時間。</p>`;
  } else {
    fields = `
      <div class="field"><div class="l">狀態</div><div class="statuspick">
        <button style="${d.status === 'owned' ? 'background:#2C9686;color:#fff;border-color:#2C9686' : ''}" onclick="A.pick('status','owned')">已入手</button>
        <button style="${d.status === 'wishlist' ? 'background:#6C5C8A;color:#fff;border-color:#6C5C8A' : ''}" onclick="A.pick('status','wishlist')">願望清單</button>
      </div></div>
      <div class="two">
        <div class="field" style="flex:1"><div class="l">藝人 / 品牌</div><input class="in" value="${esc(d.artist || '')}" placeholder="選填" oninput="A.draftSet('artist',this.value)" /></div>
        <div class="field"><div class="l">價格</div><input class="in" style="width:110px" inputmode="numeric" value="${esc(d.price || '')}" placeholder="選填" oninput="A.draftSet('price',this.value)" /></div>
      </div>
      <div class="field"><div class="l">封面圖片網址(選填,顯示在封面牆)</div><input class="in" value="${esc(d.cover || '')}" placeholder="貼上圖片連結 https://…" oninput="A.draftSet('cover',this.value)" /></div>
      <div class="field"><div class="l">備註</div><input class="in" value="${esc(d.note || '')}" placeholder="限定版、購買通路…選填" oninput="A.draftSet('note',this.value)" /></div>`;
  }

  const canSave = (d.name || '').trim().length > 0;
  $('modal').innerHTML = `<div class="overlay" onclick="A.closeModal(event)"><div class="sheet" onclick="event.stopPropagation()">
    <div class="shead"><span class="t">${isEdit ? '編輯品項' : '新增品項'}</span>
      <div class="headbtns">
        <button class="save" ${canSave ? '' : 'disabled'} onclick="A.saveDraft()">儲存</button>
        <button class="x" onclick="A.closeModal()">${ic('x', 16, '#7A7684')}</button>
      </div></div>
    <div class="sbody">
      <div class="typetoggle">
        <button class="${isCons ? 'on' : ''}" onclick="A.switchType('consumable')"><div class="m">消耗品</div><div class="s">追蹤數量與補貨</div></button>
        <button class="${!isCons ? 'on' : ''}" onclick="A.switchType('collectible')"><div class="m">收藏品</div><div class="s">專輯 / 周邊收藏</div></button>
      </div>
      <div class="field"><div class="l">名稱</div>
        <input class="in" id="draftName" value="${esc(d.name || '')}" placeholder="${isCons ? '例如:卸妝棉' : '例如:專輯名稱 / 周邊'}" oninput="A.draftSet('name',this.value); A.refreshSave()" /></div>
      <div class="field"><div class="l">分類</div><div class="catpick">${cats}</div>
        <div class="newcat"><input class="in" id="newCat" style="height:38px;font-size:13px" placeholder="新增分類…" />
          <button class="restockbtn" style="padding:0 14px" onclick="A.addCat()">加入</button></div></div>
      ${fields}
    </div></div></div>`;
}
function stepper(key, val) {
  return `<div class="stepper">
    <button onclick="A.stepDraft('${key}',-1)">${ic('minus', 17)}</button>
    <input inputmode="numeric" value="${val}" onchange="A.draftSet('${key}',Math.max(0,parseInt(this.value)||0))" />
    <button class="plus" onclick="A.stepDraft('${key}',1)">${ic('plus', 17, '#F3F1EA')}</button>
  </div>`;
}

/* ================================================================= */
/*  詳情                                                              */
/* ================================================================= */
function renderDetailModal() {
  const it = state.items.find((i) => i.id === ui.detail);
  if (!it) { $('modal').innerHTML = ''; ui.detail = null; return; }
  const cat = state.categories.find((c) => c.id === it.category);
  const isCons = it.type === 'consumable';
  let inner;

  if (isCons) {
    const a = analyze(it, state.settings.leadDays || 7);
    const m = STATUS[a.status];
    const de = daysToExpiry(it);
    const stat = (l, v, u, col, sm) => `<div class="stat"><div class="l">${l}</div><div class="v ${sm ? 'sm' : ''}" style="${col ? 'color:' + col : ''}">${v}${u ? `<span class="u"> ${u}</span>` : ''}</div></div>`;
    let analysis;
    if (a.dailyRate) {
      analysis = `<div class="body">${fmtInterval(a.intervalDays, it.unit)}<br>照這個速度,大約還能用 <b>${Math.max(0, Math.round(a.daysLeft))} 天</b>。
        ${a.buyBy ? `<div class="buyline">${ic('calendar', 14, '#E0614C')} 建議在 ${md(a.buyBy)} 前補貨</div>` : ''}</div>`;
    } else {
      analysis = `<div class="body" style="color:#7A7684">至少記錄 2 次以上的使用,就能自動算出頻率跟建議補貨時間。先多按幾次「用一個」吧!</div>`;
    }
    const expLine = it.expiry
      ? `<div class="analysis" style="margin-top:12px"><div class="h">${ic('clock', 16, de != null && de < 0 ? '#E0614C' : '#D99A34')} 保存期限</div>
         <div class="body">${it.expiry}${de != null ? (de < 0 ? ` · <b style="color:#E0614C">已過期 ${Math.abs(de)} 天</b>` : ` · 還有 ${de} 天`) : ''}</div></div>`
      : '';
    const hist = (it.usageLog || []).length
      ? `<div class="history"><div class="l">近期紀錄</div>${[...it.usageLog].reverse().slice(0, 8).map((e) => {
          const dt = new Date(e.t);
          return `<div class="hrow2"><span style="color:#7A7684">${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2, '0')}</span>
            <span style="font-weight:600;color:${e.delta < 0 ? '#E0614C' : '#2C9686'}">${e.delta < 0 ? '用掉 ' + Math.abs(e.delta) : '補貨 +' + e.delta}</span></div>`;
        }).join('')}</div>`
      : '';
    inner = `
      <div class="stats">${stat('目前數量', a.q, esc(it.unit), m.color)}${stat('狀態', m.label, '', m.color, true)}${stat('安全庫存', a.threshold, esc(it.unit), '#7A7684')}</div>
      <div class="analysis"><div class="h">${ic('trend', 16, '#2C9686')} 使用分析</div>${analysis}</div>
      ${expLine}
      <div class="detailactions">
        <div class="restockbox"><input id="useN" inputmode="numeric" value="1" /><button class="usebtn" onclick="A.useN('${it.id}')">${ic('minus', 16)} 用掉</button></div>
        <div class="restockbox"><input id="reN" inputmode="numeric" value="1" /><button class="restockbtn" onclick="A.restockN('${it.id}')">${ic('cart', 16, '#F3F1EA')} 補貨</button></div>
      </div>${hist}`;
  } else {
    const own = it.status === 'owned';
    inner = `
      ${it.cover ? `<img src="${esc(it.cover)}" alt="" style="width:100%;border-radius:16px;margin-top:12px;max-height:280px;object-fit:cover" onerror="this.style.display='none'" />` : ''}
      <div class="analysis" style="margin-top:12px">
        <button class="restockbtn" style="background:${own ? '#2C9686' : '#6C5C8A'};margin-bottom:12px" onclick="A.toggleStatus('${it.id}')">
          ${own ? ic('check', 14, '#fff') + ' 已入手' : ic('heart', 14, '#fff') + ' 願望清單'} · 點我切換</button>
        ${it.price ? `<div class="detailrow"><span class="l">價格</span><span class="v">${money(it.price)}</span></div>` : ''}
        ${it.artist ? `<div class="detailrow"><span class="l">藝人 / 品牌</span><span class="v">${esc(it.artist)}</span></div>` : ''}
        ${it.note ? `<div class="detailrow"><span class="l">備註</span><span class="v">${esc(it.note)}</span></div>` : ''}
        <div class="detailrow" style="border:none"><span class="l">加入時間</span><span class="v">${new Date(it.createdAt).toLocaleDateString('zh-TW')}</span></div>
      </div>`;
  }

  const tag = cat ? `<span class="tag" style="background:${cat.color}22;color:${cat.color}">${esc(cat.name)}</span>` : '';
  $('modal').innerHTML = `<div class="overlay" onclick="A.closeModal(event)"><div class="sheet" onclick="event.stopPropagation()">
    <div class="shead"><span class="t">品項詳情</span>
      <div class="headbtns">
        <button class="ghost" onclick="A.editFromDetail('${it.id}')">${ic('pencil', 14)} 編輯</button>
        <button class="x" onclick="A.closeModal()">${ic('x', 16, '#7A7684')}</button>
      </div></div>
    <div class="sbody">
      <div class="metaline" style="margin-bottom:2px">${tag}</div>
      <h2 style="font-size:21px;font-weight:700;line-height:1.3;margin:2px 0 0">${esc(it.name)}</h2>
      ${it.artist && !isCons ? `<p style="color:#7A7684;margin:2px 0 0">${esc(it.artist)}</p>` : ''}
      ${inner}
      <button class="deletebtn" onclick="A.confirmDelete('${it.id}')">${ic('trash', 14, '#7A7684')} 刪除這個品項</button>
    </div></div></div>`;
}

/* ================================================================= */
/*  設定                                                              */
/* ================================================================= */
function renderSettingsModal() {
  const s = state.settings;
  const chip = (key, n) => `<button class="catbtn" style="${s[key] === n ? 'background:#2B2934;color:#F3F1EA;border-color:#2B2934' : ''}" onclick="A.setSetting('${key}',${n})">${n} 天</button>`;
  $('modal').innerHTML = `<div class="overlay" onclick="A.closeModal(event)"><div class="sheet" onclick="event.stopPropagation()">
    <div class="shead"><span class="t">設定</span><div class="headbtns"><button class="x" onclick="A.closeModal()">${ic('x', 16, '#7A7684')}</button></div></div>
    <div class="sbody">
      <div class="field"><div class="l">快用完前幾天開始提醒</div><div class="catpick">${[3, 5, 7, 10, 14].map((n) => chip('leadDays', n)).join('')}</div></div>
      <div class="field"><div class="l">保存期限前幾天開始提醒</div><div class="catpick">${[7, 14, 30, 60].map((n) => chip('expiryWarnDays', n)).join('')}</div></div>
      <div class="notice ok"><div class="th">${ic('sparkles', 15, '#2C9686')} 雲端同步已連接</div>
        資料存在你自己的 Google 雲端硬碟。在其他裝置打開這個 App 網址,第一次會請你貼一次同一組 Apps Script 網址,之後就會自動同步。</div>
      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-line" onclick="A.manualSync()">${ic('rotate', 14)} 立即同步</button>
        <button class="btn-line" onclick="A.openChangeUrl()">${ic('pencil', 14)} 更改雲端網址</button>
        <button class="deletebtn" style="margin:0;padding:9px 4px" onclick="A.confirmClear()">${ic('trash', 14, '#7A7684')} 清空所有品項</button>
      </div>
    </div></div></div>`;
}

/* ================================================================= */
/*  互動處理(全域 A)                                                 */
/* ================================================================= */
const A = {
  /* 篩選 */
  setQuery(v) { ui.query = v; updateBody(); },
  clearQuery() { ui.query = ''; const q = $('q'); if (q) q.value = ''; updateBody(); },
  setType(v) { ui.typeFilter = v; if (v !== 'collectible') ui.view = 'list'; updateBody(); },
  setCat(v) { ui.catFilter = v; updateBody(); },
  setView(v) { ui.view = v; updateBody(); },

  /* 品項動作 */
  use(id, n) { A._bump(id, -Math.abs(n || 1)); },
  useN(id) { const n = Math.max(1, parseInt($('useN').value) || 1); A._bump(id, -n); },
  restock(id, n) { A._bump(id, Math.abs(n || 1)); },
  restockN(id) { const n = Math.max(1, parseInt($('reN').value) || 1); A._bump(id, n); },
  _bump(id, delta) {
    state.items = state.items.map((p) => {
      if (p.id !== id) return p;
      const next = Math.max(0, (Number(p.quantity) || 0) + delta);
      const log = [...(p.usageLog || []), { t: Date.now(), delta }];
      if (log.length > 300) log.splice(0, log.length - 300);
      return { ...p, quantity: next, usageLog: log };
    });
    scheduleSave(); updateBody(); if (ui.detail === id) renderDetailModal();
  },
  toggleStatus(id) {
    state.items = state.items.map((p) => p.id === id ? { ...p, status: p.status === 'owned' ? 'wishlist' : 'owned' } : p);
    scheduleSave(); updateBody(); if (ui.detail === id) renderDetailModal();
  },

  /* 詳情 / 編輯 */
  openDetail(id) { ui.detail = id; renderDetailModal(); },
  editFromDetail(id) { const it = state.items.find((i) => i.id === id); ui.detail = null; openEdit(it); },
  openEdit() { openEdit(null); },
  switchType(t) { switchDraftType(t); },
  draftSet(k, v) { draft[k] = v; },
  pick(k, v) { draft[k] = v; renderEditModal(state.items.some((i) => i.id === draft.id)); },
  stepDraft(k, d) { draft[k] = Math.max(0, (Number(draft[k]) || 0) + d); renderEditModal(state.items.some((i) => i.id === draft.id)); },
  refreshSave() { const b = document.querySelector('.save'); if (b) b.disabled = !(draft.name || '').trim(); },
  addCat() {
    const el = $('newCat'); const name = (el.value || '').trim(); if (!name) return;
    const c = { id: uid(), name, color: PALETTE[state.categories.length % PALETTE.length] };
    state.categories = [...state.categories, c]; draft.category = c.id;
    scheduleSave(); renderEditModal(state.items.some((i) => i.id === draft.id));
  },
  saveDraft() {
    const d = clone(draft);
    d.name = (d.name || '').trim(); if (!d.name) return;
    if (d.type === 'consumable') { d.quantity = Number(d.quantity) || 0; d.threshold = Number(d.threshold) || 0; }
    const exists = state.items.some((i) => i.id === d.id);
    state.items = exists ? state.items.map((i) => (i.id === d.id ? d : i)) : [d, ...state.items];
    scheduleSave(); closeModal(); updateBody();
  },

  /* 刪除 / 清空 */
  confirmDelete(id) {
    const it = state.items.find((i) => i.id === id); if (!it) return;
    if (confirm(`確定刪除「${it.name}」?`)) {
      state.items = state.items.filter((i) => i.id !== id);
      scheduleSave(); closeModal(); ui.detail = null; updateBody();
    }
  },
  confirmClear() {
    if (confirm('確定清空所有品項?此動作無法復原。')) {
      state.items = []; scheduleSave(); closeModal(); updateBody();
    }
  },
  loadSample() { state.items = sampleItems(); scheduleSave(); updateBody(); },

  /* 設定 */
  openSettings() { renderSettingsModal(); },
  setSetting(k, v) { state.settings = { ...state.settings, [k]: v }; scheduleSave(); renderSettingsModal(); updateBody(); },

  /* modal */
  closeModal(e) { if (e && e.target !== e.currentTarget) return; $('modal').innerHTML = ''; ui.detail = null; },

  /* 雲端 */
  manualSync() { pullFromCloud(false); },
  saveCloudUrl() {
    const el = $('setupUrl');
    const v = (el && el.value || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(v)) {
      setupErr = '網址格式看起來不太對,要用 https://script.google.com/macros/s/ 開頭、/exec 結尾的完整網址';
      render();
      return;
    }
    setupErr = '';
    localStorage.setItem(CLOUD_URL_KEY, v);
    booted = false;
    render();
    pullFromCloud(false);
    startPolling();
  },
  openChangeUrl() {
    closeModal();
    $('root').innerHTML = screenSetupUrl(getCloudUrl());
  },
  cancelChangeUrl() {
    setupErr = '';
    $('root').innerHTML = '';
    mountMain();
  },
};
window.A = A;

/* ---------- 啟動 ---------- */
loadLocal();          // 先用本機資料,馬上可用(離線也行)
render();
if (configReady()) {
  pullFromCloud(!!state.items.length); // 有本機資料就靜默拉,沒資料就顯示連線中
  startPolling();
} else {
  booted = true;
}
