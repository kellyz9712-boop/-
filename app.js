/* 我的庫存櫃 v2 — 無需編譯，離線優先，Google Apps Script 同步 */
'use strict';

const DAY = 86400000;
const LOCAL_KEY = 'kucun_state_v1'; // 沿用舊版鍵值，確保能讀到舊資料
const BACKUP_KEY = 'kucun_state_v1_backup_before_v2';
const CLOUD_URL_KEY = 'kucun_cloud_url';
const SCHEMA_VERSION = 2;
const UNITS = ['個','瓶','包','盒','支','片','組','罐','條','袋'];
const COLORS = ['#d85f49','#2c9686','#d49a32','#6c5c8a','#c25e8b','#4e8e69','#5379a5','#9a6c3f','#718148','#a95757','#477f84','#805f86'];
const DEFAULT_CATEGORIES = [
  {id:'beauty',name:'美妝',color:COLORS[0]},{id:'daily',name:'日常用品',color:COLORS[1]},
  {id:'kitchen',name:'廚房',color:COLORS[2]},{id:'merch',name:'追星商品',color:COLORS[3]},
  {id:'album',name:'專輯',color:COLORS[4]},{id:'other',name:'其他',color:COLORS[5]}
];
const $ = id => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-5);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => Math.max(0, Number(value)||0);
const clone = value => JSON.parse(JSON.stringify(value));
const dateText = ts => ts ? new Date(ts).toLocaleDateString('zh-TW') : '—';
const round = value => Math.round(value*100)/100;

let state = {
  schemaVersion:SCHEMA_VERSION, items:[], categories:clone(DEFAULT_CATEGORIES), shoppingList:[],
  settings:{leadDays:7,bufferDays:3,expiryWarnDays:14}, updatedAt:0
};
let ui = {tab:'inventory',query:'',category:'all',sync:'off',modal:null};
let saveTimer = 0, renderQueued = false, pushing = false, pendingPush = false, pullRunning = false;

function normalizeCategoryColors(categories) {
  const used = new Set();
  return (categories?.length ? categories : clone(DEFAULT_CATEGORIES)).map((cat,index)=>{
    let color = cat.color;
    if (!color || used.has(color.toLowerCase())) color = COLORS.find(c=>!used.has(c.toLowerCase())) || generatedColor(index);
    used.add(color.toLowerCase());
    return {...cat,id:String(cat.id||uid()),name:String(cat.name||'未命名'),color};
  });
}
function generatedColor(index) {
  const hue = (index*137.508+19)%360;
  return `hsl(${hue} 42% 48%)`;
}
function migrateItem(raw) {
  const type = raw.type === 'collectible' ? 'collectible' : 'consumable';
  if (type === 'collectible') return {...raw,id:raw.id||uid(),type,createdAt:raw.createdAt||Date.now()};
  const legacyQuantity = num(raw.quantity);
  return {
    ...raw,id:raw.id||uid(),type,
    itemName:String(raw.itemName||raw.name||'未命名品項').trim(),
    productName:String(raw.productName||'').trim(),
    name:String(raw.itemName||raw.name||'未命名品項').trim(), // 留給舊版後端/回復版本辨識
    unopened:raw.unopened == null ? legacyQuantity : num(raw.unopened),
    inUse:raw.inUse == null ? 0 : num(raw.inUse),
    quantity:raw.unopened == null ? legacyQuantity : num(raw.unopened), // 舊版相容欄位
    threshold:num(raw.threshold),unit:String(raw.unit||'個'),category:raw.category||'other',
    usageLog:Array.isArray(raw.usageLog)?raw.usageLog:[],
    cycleLog:Array.isArray(raw.cycleLog)?raw.cycleLog:[],
    leadDays:raw.leadDays == null ? null : num(raw.leadDays),
    expiry:raw.expiry||'',createdAt:raw.createdAt||Date.now()
  };
}
function migrateData(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    schemaVersion:SCHEMA_VERSION,
    items:(Array.isArray(source.items)?source.items:[]).map(migrateItem),
    categories:normalizeCategoryColors(source.categories),
    shoppingList:Array.isArray(source.shoppingList)?source.shoppingList.map(x=>({...x,id:x.id||uid()})):[],
    settings:{leadDays:7,bufferDays:3,expiryWarnDays:14,...source.settings},
    updatedAt:Number(source.updatedAt)||0
  };
}
function loadLocal() {
  try {
    const text=localStorage.getItem(LOCAL_KEY);
    if(!text){state=migrateData(state);return;}
    const raw=JSON.parse(text);
    if(Number(raw.schemaVersion||1)<SCHEMA_VERSION && !localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY,text);
    state=migrateData(raw);
    persistLocal(false);
  } catch(error){ console.warn('本機資料讀取失敗',error); state=migrateData(state); }
}
function persistLocal(touch=true) {
  if(touch) state.updatedAt=Date.now();
  try { localStorage.setItem(LOCAL_KEY,JSON.stringify(state)); }
  catch(error){ alert('本機儲存空間不足，請先匯出備份。'); }
}
function mutate(change,{render=true,sync=true}={}) {
  change(); persistLocal(true);
  if(render) requestRender();
  if(sync) scheduleCloudPush();
}
function requestRender() {
  if(renderQueued)return;
  renderQueued=true;
  requestAnimationFrame(()=>{renderQueued=false;render();});
}
function cloudUrl(){return (localStorage.getItem(CLOUD_URL_KEY)||'').trim();}
function scheduleCloudPush() {
  ui.sync=cloudUrl()?'saving':'off'; updateSync();
  clearTimeout(saveTimer);
  saveTimer=setTimeout(pushCloud,1800); // 合併連續操作，減少卡頓與網路請求
}
async function pushCloud() {
  if(!cloudUrl()){ui.sync='off';updateSync();return;}
  if(pushing){pendingPush=true;return;}
  pushing=true; pendingPush=false;
  const snapshot=JSON.stringify({data:state});
  try{
    const response=await fetch(cloudUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:snapshot});
    const result=await response.json();
    if(result.error)throw new Error(result.error);
    ui.sync='synced';
  }catch(error){console.warn('雲端寫入失敗',error);ui.sync='error';}
  pushing=false;updateSync();
  if(pendingPush)pushCloud();
}
async function pullCloud(silent=false) {
  if(!cloudUrl()||pullRunning)return;
  pullRunning=true;if(!silent){ui.sync='saving';updateSync();}
  try{
    const response=await fetch(`${cloudUrl()}?t=${Date.now()}`,{cache:'no-store'});
    const remote=await response.json();
    if(remote.error)throw new Error(remote.error);
    if(Number(remote.updatedAt)>Number(state.updatedAt)){
      state=migrateData(remote);persistLocal(false);requestRender();
    }
    ui.sync='synced';
  }catch(error){console.warn('雲端讀取失敗',error);ui.sync='error';}
  pullRunning=false;updateSync();
}
function updateSync(){
  const el=$('sync');
  if(!el)return;
  const map={off:'僅存本機',saving:'儲存中…',synced:'已同步',error:'同步失敗'};
  el.textContent=map[ui.sync]||map.off;el.className=`sync ${ui.sync}`;
}

function itemAvailable(item){return round(num(item.unopened)+num(item.inUse));}
function usageRate(item) {
  const cycles=(item.cycleLog||[]).filter(x=>num(x.days)>0&&num(x.amount)>0);
  if(cycles.length){
    const totalAmount=cycles.reduce((s,x)=>s+num(x.amount),0);
    return totalAmount/cycles.reduce((s,x)=>s+num(x.days),0);
  }
  const uses=(item.usageLog||[]).filter(x=>Number(x.delta)<0).sort((a,b)=>a.t-b.t);
  if(uses.length>=2){
    const span=Math.max((uses.at(-1).t-uses[0].t)/DAY,1);
    return uses.reduce((s,x)=>s+Math.abs(Number(x.delta)||0),0)/span;
  }
  return 0;
}
function groupKey(item){return `${item.category}::${item.itemName.trim().toLocaleLowerCase()}::${item.unit}`;}
function inventoryGroups(){
  const map=new Map();
  state.items.filter(x=>x.type==='consumable').forEach(item=>{
    const key=groupKey(item);
    if(!map.has(key))map.set(key,{key,itemName:item.itemName,category:item.category,unit:item.unit,items:[]});
    map.get(key).items.push(item);
  });
  return [...map.values()].map(group=>{
    const unopened=group.items.reduce((s,x)=>s+num(x.unopened),0);
    const inUse=group.items.reduce((s,x)=>s+num(x.inUse),0);
    const available=round(unopened+inUse);
    const rate=group.items.reduce((s,x)=>s+usageRate(x),0);
    const lead=Math.max(state.settings.leadDays,...group.items.map(x=>x.leadDays==null?0:num(x.leadDays)));
    const safetyManual=Math.max(0,...group.items.map(x=>num(x.threshold)));
    const recommended=rate?Math.max(safetyManual,Math.ceil(rate*(lead+num(state.settings.bufferDays))*10)/10):safetyManual;
    const daysLeft=rate?available/rate:null;
    const target=Math.max(recommended,rate?Math.ceil(rate*(lead+state.settings.bufferDays+30)):recommended);
    const suggest=Math.max(1,Math.ceil(target-available));
    const urgent=available<=recommended || (daysLeft!=null&&daysLeft<=lead);
    return {...group,unopened,inUse,available,rate,lead,safetyManual,recommended,daysLeft,suggest,urgent};
  }).sort((a,b)=>(b.urgent-a.urgent)||a.itemName.localeCompare(b.itemName,'zh-Hant'));
}
function shoppingEntries(){
  const groups=inventoryGroups();
  const auto=groups.filter(g=>g.urgent).map(g=>({id:`auto:${g.key}`,group:g,manual:false}));
  const manual=state.shoppingList.map(row=>({id:row.id,row,manual:true,group:groups.find(g=>g.key===row.groupKey)}));
  const autoKeys=new Set(auto.map(x=>x.group.key));
  return [...auto,...manual.filter(x=>!x.row.groupKey||!autoKeys.has(x.row.groupKey))];
}
function health(group){
  if(group.available<=0)return {class:'urgent',text:'已用完'};
  if(group.urgent)return {class:'urgent',text:'建議補貨'};
  if(group.daysLeft!=null&&group.daysLeft<=group.lead+14)return {class:'warn',text:'留意庫存'};
  return {class:'ok',text:'暫時不用買'};
}

function render(){
  const root=$('root'); if(!root)return;
  const groups=inventoryGroups(), buys=shoppingEntries();
  root.innerHTML=`<main class="app">
    <header class="top">
      <div class="topline"><div class="brand"><h1>我的庫存櫃</h1><p>看清楚家裡還有什麼，再決定要不要買</p></div>
      <button id="sync" class="sync" onclick="App.openSettings()"></button></div>
      <nav class="nav">
        <button class="${ui.tab==='inventory'?'active':''}" onclick="App.tab('inventory')">庫存</button>
        <button class="${ui.tab==='shopping'?'active':''}" onclick="App.tab('shopping')">需購買${buys.length?`<span class="count">${buys.length}</span>`:''}</button>
        <button class="${ui.tab==='collectibles'?'active':''}" onclick="App.tab('collectibles')">收藏／願望</button>
      </nav>
    </header>
    <section id="content">${renderContent(groups,buys)}</section>
    ${ui.tab==='inventory'?'<button class="fab" aria-label="新增商品" onclick="App.edit()">＋</button>':''}
  </main><div id="modal">${renderModal(groups)}</div>`;
  updateSync();
}
function renderContent(groups,buys){
  if(ui.tab==='shopping')return renderShopping(buys);
  if(ui.tab==='collectibles')return renderCollectibles();
  const filtered=groups.filter(g=>{
    const q=ui.query.trim().toLocaleLowerCase();
    const text=[g.itemName,...g.items.map(x=>x.productName)].join(' ').toLocaleLowerCase();
    return (!q||text.includes(q))&&(ui.category==='all'||g.category===ui.category);
  });
  const total=groups.reduce((s,g)=>s+g.available,0);
  return `<div class="tools">
    <input class="search" placeholder="搜尋品項或商品名" value="${esc(ui.query)}" oninput="App.search(this.value)">
    <select class="select" onchange="App.filter(this.value)"><option value="all">全部類別</option>${state.categories.map(c=>`<option value="${esc(c.id)}" ${ui.category===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
    <button class="primary" onclick="App.edit()">＋ 新增商品</button>
  </div>
  <div class="summary"><div class="stat"><b>${groups.length}</b><span>彙整品項</span></div><div class="stat"><b>${round(total)}</b><span>總可用數量</span></div><div class="stat"><b>${groups.filter(g=>g.urgent).length}</b><span>建議補貨</span></div></div>
  <div class="groups">${filtered.length?filtered.map(renderGroup).join(''):'<div class="empty">找不到符合的品項</div>'}</div>`;
}
function renderGroup(group){
  const cat=state.categories.find(c=>c.id===group.category)||{name:'其他',color:'#888'};
  const h=health(group);
  return `<article class="group" style="--cat:${esc(cat.color)}">
    <div class="grouphead"><div><h2>${esc(group.itemName)}</h2><div class="sub">${esc(cat.name)}・${group.items.length} 個商品紀錄</div></div>
    <div class="quant"><b>${group.available} ${esc(group.unit)}</b><br><span class="badge ${h.class}">${h.text}</span></div></div>
    <div class="groupmeta">
      <div class="meta"><b>${group.unopened}＋${group.inUse}</b><span>未開封 ＋ 使用中</span></div>
      <div class="meta"><b>${group.rate?`約 ${Math.round(1/group.rate)} 天／${esc(group.unit)}`:'尚無足夠紀錄'}</b><span>實際使用週期</span></div>
      <div class="meta"><b>${group.recommended} ${esc(group.unit)}</b><span>建議安全庫存${group.safetyManual?'（含手動下限）':''}</span></div>
    </div>
    <div class="variants">${group.items.map(item=>`<div class="variant">
      <div><div class="vname">${esc(item.productName||'未填商品名')}</div><div class="vstock">未開封 ${num(item.unopened)}・使用中 ${num(item.inUse)} ${esc(item.unit)}${item.expiry?`・到期 ${esc(item.expiry)}`:''}</div></div>
      <div class="actions"><button class="ghost small" onclick="App.use('${item.id}')">使用</button><button class="ghost small" onclick="App.edit('${item.id}')">編輯</button><button class="secondary small" onclick="App.restock('${item.id}')">回補</button></div>
    </div>`).join('')}</div>
  </article>`;
}
function renderShopping(entries){
  return `<div class="tools"><button class="primary" onclick="App.manualBuy()">＋ 手動加入</button></div>
  <div class="shopping">${entries.length?entries.map(entry=>{
    const g=entry.group,row=entry.row;
    const title=g?.itemName||row?.itemName||'購物項目';
    const reason=g?(g.available<=0?'目前已無庫存':`現有 ${g.available} ${g.unit}，建議安全庫存 ${g.recommended}`):(row?.note||'手動加入');
    const qty=row?.quantity||g?.suggest||1;
    return `<article class="shopcard ${entry.manual?'manual':''}"><div class="shophead"><div><h3>${esc(title)}</h3><div class="reason">${esc(reason)}</div></div><b>建議買 ${esc(qty)} ${esc(g?.unit||row?.unit||'個')}</b></div>
      <div class="shopactions"><button class="primary small" onclick="App.bought('${esc(entry.id)}')">已購買，回補庫存</button>${entry.manual?`<button class="danger small" onclick="App.removeBuy('${row.id}')">移除</button>`:''}</div></article>`;
  }).join(''):'<div class="empty">目前沒有需要購買的品項 🎉<br>先把家裡的用完再買。</div>'}</div>`;
}
function renderCollectibles(){
  const rows=state.items.filter(x=>x.type==='collectible').filter(x=>!ui.query||String(x.name).includes(ui.query));
  return `<div class="tools"><input class="search" placeholder="搜尋收藏／願望" value="${esc(ui.query)}" oninput="App.search(this.value)"><button class="primary" onclick="App.editCollectible()">＋ 新增</button></div>
  <div class="collect-grid">${rows.length?rows.map(x=>`<article class="collect"><h3>${esc(x.name)}</h3><div class="sub">${x.status==='wishlist'?'願望清單':'已擁有'}${x.artist?`・${esc(x.artist)}`:''}</div>${x.price?`<p class="price">NT$ ${num(x.price).toLocaleString()}</p>`:''}<p>${esc(x.note||'')}</p><div class="actions"><button class="ghost small" onclick="App.editCollectible('${x.id}')">編輯</button></div></article>`).join(''):'<div class="empty">尚無收藏或願望項目</div>'}</div>`;
}

function renderModal(groups){
  const m=ui.modal;if(!m)return '';
  if(m.type==='item')return itemForm(m.item);
  if(m.type==='use')return useForm(m.item);
  if(m.type==='restock')return restockForm(m.item);
  if(m.type==='bought')return boughtForm(m.entry,groups);
  if(m.type==='manual')return manualForm(groups);
  if(m.type==='settings')return settingsForm();
  if(m.type==='collectible')return collectibleForm(m.item);
  return '';
}
function shell(title,body,foot=''){
  return `<div class="overlay" onclick="App.close(event)"><section class="sheet" onclick="event.stopPropagation()"><div class="sheethead"><h2>${esc(title)}</h2><button class="close" onclick="App.close()">×</button></div>${body}${foot}</section></div>`;
}
function itemForm(item){
  const edit=!!item.id;
  return shell(edit?'編輯商品':'新增商品',`<form id="itemForm" class="form" onsubmit="App.saveItem(event)">
    <input type="hidden" name="id" value="${esc(item.id||'')}">
    <div class="field"><label>品項名稱 *</label><input name="itemName" required placeholder="例如：洗髮精" value="${esc(item.itemName||'')}"><span class="help">彙整依據；相同品項名稱、類別、單位會合併顯示。</span></div>
    <div class="field"><label>商品名</label><input name="productName" placeholder="例如：Aveda 迷迭香" value="${esc(item.productName||'')}"></div>
    <div class="field"><label>類別</label><select name="category">${state.categories.map(c=>`<option value="${esc(c.id)}" ${item.category===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>單位</label><select name="unit">${UNITS.map(u=>`<option ${item.unit===u?'selected':''}>${u}</option>`).join('')}</select></div>
    <div class="field"><label>未開封庫存</label><input name="unopened" type="number" min="0" step="0.01" value="${num(item.unopened)}"></div>
    <div class="field"><label>使用中約剩多少</label><input name="inUse" type="number" min="0" step="0.01" value="${num(item.inUse)}"><span class="help">例如剩半瓶填 0.5。</span></div>
    <div class="field"><label>手動安全庫存下限</label><input name="threshold" type="number" min="0" step="0.1" value="${num(item.threshold)}"></div>
    <div class="field"><label>個別補貨等待天數</label><input name="leadDays" type="number" min="0" step="1" placeholder="留空用全域設定" value="${item.leadDays??''}"></div>
    <div class="field full"><label>有效期限</label><input name="expiry" type="date" value="${esc(item.expiry||'')}"></div>
  </form>`,`<div class="sheetfoot">${edit?`<button class="danger" onclick="App.deleteItem('${item.id}')">刪除</button>`:''}<button class="primary" onclick="document.getElementById('itemForm').requestSubmit()">儲存</button></div>`);
}
function useForm(item){
  return shell(`記錄使用：${item.itemName}`,`<form id="useForm" class="form" onsubmit="App.saveUse(event,'${item.id}')">
    <div class="field"><label>這次用掉多少</label><input name="amount" type="number" min="0.01" step="0.01" value="1" required><span class="help">會先扣使用中，再扣未開封。</span></div>
    <div class="field"><label>目前使用中約剩多少</label><input name="inUseNow" type="number" min="0" step="0.01" value="${num(item.inUse)}"></div>
    <div class="field full"><label>若剛用完一整份，這份用了幾天？</label><input name="cycleDays" type="number" min="1" step="1" placeholder="例如 52"><span class="help">記錄完整週期後，安全庫存建議會更準確。</span></div>
  </form>`,`<div class="sheetfoot"><button class="primary" onclick="document.getElementById('useForm').requestSubmit()">確認使用</button></div>`);
}
function restockForm(item){
  return shell(`回補：${item.itemName}`,`<form id="restockForm" class="form" onsubmit="App.saveRestock(event,'${item.id}')"><div class="field"><label>增加未開封數量</label><input name="quantity" type="number" min="0.01" step="0.01" value="1" required></div></form>`,`<div class="sheetfoot"><button class="primary" onclick="document.getElementById('restockForm').requestSubmit()">加入庫存</button></div>`);
}
function boughtForm(entry,groups){
  const group=entry.group;
  const compatible=group?.items||state.items.filter(x=>x.type==='consumable');
  return shell('已購買，回補庫存',`<form id="boughtForm" class="form" onsubmit="App.saveBought(event)">
    <input type="hidden" name="entryId" value="${esc(entry.id)}">
    <div class="field full"><label>回補到哪個商品？</label><select name="itemId" required>${compatible.map(x=>`<option value="${x.id}">${esc(x.itemName)}｜${esc(x.productName||'未填商品名')}</option>`).join('')}</select></div>
    <div class="field"><label>購買數量</label><input name="quantity" type="number" min="0.01" step="0.01" value="${entry.row?.quantity||group?.suggest||1}" required></div>
    <div class="field"><label>加入位置</label><select name="target"><option value="unopened">未開封</option><option value="inUse">使用中</option></select></div>
  </form>`,`<div class="sheetfoot"><button class="primary" onclick="document.getElementById('boughtForm').requestSubmit()">完成回補</button></div>`);
}
function manualForm(groups){
  return shell('手動加入需購買',`<form id="manualForm" class="form" onsubmit="App.saveManual(event)">
    <div class="field full"><label>連結既有品項（可不選）</label><select name="groupKey"><option value="">不連結</option>${groups.map(g=>`<option value="${esc(g.key)}">${esc(g.itemName)}</option>`).join('')}</select></div>
    <div class="field"><label>購物項目 *</label><input name="itemName" required></div><div class="field"><label>數量</label><input name="quantity" type="number" min="0.01" step="0.01" value="1"></div>
    <div class="field"><label>單位</label><select name="unit">${UNITS.map(u=>`<option>${u}</option>`).join('')}</select></div><div class="field"><label>備註</label><input name="note"></div>
  </form>`,`<div class="sheetfoot"><button class="primary" onclick="document.getElementById('manualForm').requestSubmit()">加入清單</button></div>`);
}
function settingsForm(){
  return shell('設定',`<div class="settings-list">
    <form id="settingsForm" class="form" onsubmit="App.saveSettings(event)">
      <div class="field"><label>預設補貨等待天數</label><input name="leadDays" type="number" min="0" value="${num(state.settings.leadDays)}"></div>
      <div class="field"><label>安全緩衝天數</label><input name="bufferDays" type="number" min="0" value="${num(state.settings.bufferDays)}"></div>
      <div class="field full"><label>Google Apps Script 網頁應用程式網址</label><input name="cloudUrl" class="url" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(cloudUrl())}"></div>
    </form>
    <div class="notice">v2 第一次開啟時已保留舊資料備份。雲端仍使用原本的 kucun-data.json，不需重建資料。</div>
    <div><button class="ghost small" onclick="App.addCategory()">新增類別</button> ${state.categories.map(c=>`<span class="badge" style="background:${esc(c.color)};color:white">${esc(c.name)}</span>`).join(' ')}</div>
    <div><button class="ghost small" onclick="App.exportData()">匯出 JSON 備份</button> <button class="ghost small" onclick="App.pull()">立即從雲端同步</button></div>
  </div>`,`<div class="sheetfoot"><button class="primary" onclick="document.getElementById('settingsForm').requestSubmit()">儲存設定</button></div>`);
}
function collectibleForm(item){
  return shell(item.id?'編輯收藏／願望':'新增收藏／願望',`<form id="collectForm" class="form" onsubmit="App.saveCollectible(event)">
    <input type="hidden" name="id" value="${esc(item.id||'')}"><div class="field full"><label>名稱 *</label><input name="name" required value="${esc(item.name||'')}"></div>
    <div class="field"><label>狀態</label><select name="status"><option value="wishlist" ${item.status==='wishlist'?'selected':''}>願望清單</option><option value="owned" ${item.status==='owned'?'selected':''}>已擁有</option></select></div>
    <div class="field"><label>價格</label><input name="price" type="number" min="0" value="${num(item.price)}"></div>
    <div class="field"><label>藝人／品牌</label><input name="artist" value="${esc(item.artist||'')}"></div><div class="field"><label>備註</label><input name="note" value="${esc(item.note||'')}"></div>
  </form>`,`<div class="sheetfoot">${item.id?`<button class="danger" onclick="App.deleteCollectible('${item.id}')">刪除</button>`:''}<button class="primary" onclick="document.getElementById('collectForm').requestSubmit()">儲存</button></div>`);
}

function formObject(form){return Object.fromEntries(new FormData(form).entries());}
const App=window.App={
  tab(tab){ui.tab=tab;ui.modal=null;requestRender();},
  search(value){ui.query=value;requestRender();},
  filter(value){ui.category=value;requestRender();},
  close(event){if(event&&event.target!==event.currentTarget)return;ui.modal=null;requestRender();},
  edit(id){const item=id?state.items.find(x=>x.id===id):{category:state.categories[0]?.id||'other',unit:'個',unopened:0,inUse:0,threshold:0};ui.modal={type:'item',item:clone(item)};requestRender();},
  saveItem(event){
    event.preventDefault();const d=formObject(event.currentTarget),old=state.items.find(x=>x.id===d.id);
    const item=migrateItem({...old,...d,id:d.id||uid(),type:'consumable',unopened:num(d.unopened),inUse:num(d.inUse),threshold:num(d.threshold),leadDays:d.leadDays===''?null:num(d.leadDays),createdAt:old?.createdAt||Date.now()});
    mutate(()=>{state.items=old?state.items.map(x=>x.id===old.id?item:x):[item,...state.items];ui.modal=null;});
  },
  deleteItem(id){if(!confirm('確定刪除這個商品紀錄？'))return;mutate(()=>{state.items=state.items.filter(x=>x.id!==id);ui.modal=null;});},
  use(id){ui.modal={type:'use',item:clone(state.items.find(x=>x.id===id))};requestRender();},
  saveUse(event,id){
    event.preventDefault();const d=formObject(event.currentTarget),amount=num(d.amount);
    mutate(()=>{state.items=state.items.map(item=>{
      if(item.id!==id)return item;
      let inUse=d.inUseNow===''?num(item.inUse):num(d.inUseNow),unopened=num(item.unopened);
      if(inUse===num(item.inUse)){const fromUse=Math.min(inUse,amount);inUse-=fromUse;unopened=Math.max(0,unopened-(amount-fromUse));}
      const cycleLog=[...(item.cycleLog||[])];if(num(d.cycleDays))cycleLog.push({t:Date.now(),days:num(d.cycleDays),amount:1});
      return {...item,inUse:round(inUse),unopened:round(unopened),quantity:round(unopened),cycleLog:cycleLog.slice(-30),usageLog:[...(item.usageLog||[]),{t:Date.now(),delta:-amount}].slice(-200)};
    });ui.modal=null;});
  },
  restock(id){ui.modal={type:'restock',item:clone(state.items.find(x=>x.id===id))};requestRender();},
  saveRestock(event,id){event.preventDefault();const q=num(formObject(event.currentTarget).quantity);mutate(()=>{state.items=state.items.map(x=>x.id===id?{...x,unopened:round(num(x.unopened)+q),quantity:round(num(x.unopened)+q),usageLog:[...(x.usageLog||[]),{t:Date.now(),delta:q}].slice(-200)}:x);ui.modal=null;});},
  manualBuy(){ui.modal={type:'manual'};requestRender();},
  saveManual(event){event.preventDefault();const d=formObject(event.currentTarget);mutate(()=>{state.shoppingList=[...state.shoppingList,{...d,id:uid(),quantity:num(d.quantity),createdAt:Date.now()}];ui.modal=null;ui.tab='shopping';});},
  removeBuy(id){mutate(()=>{state.shoppingList=state.shoppingList.filter(x=>x.id!==id);});},
  bought(entryId){const entry=shoppingEntries().find(x=>x.id===entryId);if(!entry)return;ui.modal={type:'bought',entry};requestRender();},
  saveBought(event){
    event.preventDefault();const d=formObject(event.currentTarget),q=num(d.quantity);
    mutate(()=>{state.items=state.items.map(x=>x.id===d.itemId?{...x,[d.target]:round(num(x[d.target])+q),...(d.target==='unopened'?{quantity:round(num(x.unopened)+q)}:{}),usageLog:[...(x.usageLog||[]),{t:Date.now(),delta:q}].slice(-200)}:x);
      if(d.entryId&&!d.entryId.startsWith('auto:'))state.shoppingList=state.shoppingList.filter(x=>x.id!==d.entryId);ui.modal=null;});
  },
  openSettings(){ui.modal={type:'settings'};requestRender();},
  saveSettings(event){
    event.preventDefault();const d=formObject(event.currentTarget);
    if(d.cloudUrl&&!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(d.cloudUrl)){alert('Google Apps Script 網址格式不正確。');return;}
    if(d.cloudUrl)localStorage.setItem(CLOUD_URL_KEY,d.cloudUrl.trim());else localStorage.removeItem(CLOUD_URL_KEY);
    mutate(()=>{state.settings={...state.settings,leadDays:num(d.leadDays),bufferDays:num(d.bufferDays)};ui.modal=null;});
  },
  addCategory(){
    const name=prompt('新類別名稱');if(!name?.trim())return;
    mutate(()=>{const used=new Set(state.categories.map(c=>c.color.toLowerCase()));const color=COLORS.find(c=>!used.has(c.toLowerCase()))||generatedColor(state.categories.length);state.categories=[...state.categories,{id:uid(),name:name.trim(),color}];});
  },
  pull(){pullCloud(false);},
  exportData(){
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=`我的庫存櫃備份-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);
  },
  editCollectible(id){const item=id?state.items.find(x=>x.id===id):{status:'wishlist',name:'',price:0};ui.modal={type:'collectible',item:clone(item)};requestRender();},
  saveCollectible(event){event.preventDefault();const d=formObject(event.currentTarget),old=state.items.find(x=>x.id===d.id),item={...old,...d,id:d.id||uid(),type:'collectible',price:num(d.price),createdAt:old?.createdAt||Date.now()};mutate(()=>{state.items=old?state.items.map(x=>x.id===old.id?item:x):[item,...state.items];ui.modal=null;});},
  deleteCollectible(id){if(!confirm('確定刪除？'))return;mutate(()=>{state.items=state.items.filter(x=>x.id!==id);ui.modal=null;});}
};

loadLocal();
render();
if(cloudUrl())pullCloud(true);
setInterval(()=>{if(document.visibilityState==='visible')pullCloud(true);},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pullCloud(true);});
