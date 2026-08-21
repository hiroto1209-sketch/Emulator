const $ = (id) => document.getElementById(id);
const romInput = $('romInput');
const chooseRom = $('chooseRom');
const continueGame = $('continueGame');
const cachedGameInfo = $('cachedGameInfo');
const changeRom = $('changeRom');
const reloadGame = $('reloadGame');
const backToLibrary = $('backToLibrary');
const clearHistory = $('clearHistory');
const libraryView = $('libraryView');
const playerView = $('playerView');
const loadingState = $('loadingState');
const recentGames = $('recentGames');
const emptyLibrary = $('emptyLibrary');
const nowPlaying = $('nowPlaying');
const fileName = $('fileName');
const status = $('status');
const snesController = $('snesController');
const resumeBanner = $('resumeBanner');
const resumeNow = $('resumeNow');
const layoutEditToggle = $('layoutEditToggle');
const layoutPanel = $('layoutPanel');
const layoutDone = $('layoutDone');
const layoutReset = $('layoutReset');
const layoutSave = $('layoutSave');
const controllerScale = $('controllerScale');
const scaleValue = $('scaleValue');
const orientationLabel = $('orientationLabel');
const layoutCanvas = $('layoutCanvas');

const HISTORY_KEY = 'retro-pocket-history-v1';
const RESUME_KEY = 'retro-pocket-autoresume-v1';
const DB_NAME = 'retro-pocket-db';
const DB_VERSION = 1;
const STORE = 'roms';
const LAST_ROM = 'last-rom';
const LAYOUT_PREFIX = 'retro-pocket-layout-v2-';
const supported = ['sfc','smc','fig','gd3','gd7','dx2','bsx','swc'];

const DEFAULT_LAYOUTS = {
  portrait: {
    scale: 100,
    units: {
      l: { x: 4, y: 4 }, r: { x: 82, y: 4 },
      dpad: { x: 4, y: 27 }, system: { x: 39, y: 63 }, face: { x: 68, y: 27 }
    }
  },
  landscape: {
    scale: 92,
    units: {
      l: { x: 3, y: 5 }, r: { x: 87, y: 5 },
      dpad: { x: 8, y: 20 }, system: { x: 41, y: 60 }, face: { x: 72, y: 20 }
    }
  }
};

let activeFile = null;
let emulatorStarted = false;
let bootTimer = null;
let returningFromBackground = false;
let layoutEditing = false;
let currentLayout = null;
let dragState = null;

chooseRom.addEventListener('click', () => romInput.click());
changeRom.addEventListener('click', () => romInput.click());
continueGame.addEventListener('click', async () => {
  const file = await loadCachedRom();
  if (file) bootRom(file, { fromCache: true });
});
reloadGame.addEventListener('click', async () => {
  const file = activeFile || await loadCachedRom();
  if (file) {
    sessionStorage.setItem(RESUME_KEY, '1');
    location.reload();
  }
});
backToLibrary.addEventListener('click', () => location.reload());
resumeNow.addEventListener('click', resumeEmulator);
clearHistory.addEventListener('click', () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); });
romInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await cacheRom(file);
  bootRom(file);
});

layoutEditToggle.addEventListener('click', () => setLayoutEditing(!layoutEditing));
layoutDone.addEventListener('click', () => { saveLayout(); setLayoutEditing(false); });
layoutSave.addEventListener('click', () => { saveLayout(); flashStatus('配置を保存しました'); });
layoutReset.addEventListener('click', resetLayout);
controllerScale.addEventListener('input', () => {
  currentLayout.scale = Number(controllerScale.value);
  scaleValue.textContent = `${currentLayout.scale}%`;
  applyLayout(currentLayout);
});

setupTouchController();
setupLayoutEditor();
renderHistory();
refreshCachedGame();
applySavedLayout();

async function bootRom(file, options = {}) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!supported.includes(ext)) {
    status.textContent = '非対応ファイル';
    alert('対応するSNES ROMを選択してください。');
    romInput.value = '';
    return;
  }

  activeFile = file;
  const title = file.name.replace(/\.[^.]+$/, '');
  rememberGame(title, ext, file.size);
  libraryView.classList.add('hidden');
  playerView.classList.remove('hidden');
  nowPlaying.textContent = title;
  fileName.textContent = `${file.name} · ${formatBytes(file.size)}`;
  status.textContent = 'ROM読込中…';
  showLoading('ゲームを準備しています', options.fromCache ? '端末内に保存したROMから起動しています。' : 'ゲームを起動しています。');
  applySavedLayout();

  window.EJS_player = '#game';
  window.EJS_core = 'snes';
  window.EJS_gameName = title;
  window.EJS_gameUrl = file;
  window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';
  window.EJS_language = 'ja-JP';
  window.EJS_disableAutoLang = true;
  window.EJS_startOnLoaded = true;
  window.EJS_browserMode = 'mobile';
  window.EJS_threads = false;
  window.EJS_forceLegacyCores = false;
  window.EJS_gameID = hashString(`${title}:${file.size}`);
  window.EJS_fixedSaveInterval = 5000;
  window.EJS_controlScheme = 'snes';
  window.EJS_color = '#8b7cff';
  window.EJS_backgroundColor = '#000';
  window.EJS_askBeforeExit = false;

  window.EJS_defaultControls = {
    0: {
      0:{value:'z'}, 1:{value:'a'}, 2:{value:'shift'}, 3:{value:'enter'},
      4:{value:'up arrow'}, 5:{value:'down arrow'}, 6:{value:'left arrow'}, 7:{value:'right arrow'},
      8:{value:'x'}, 9:{value:'s'}, 10:{value:'q'}, 11:{value:'w'}, 24:{value:'1'}, 25:{value:'2'}
    }, 1:{}, 2:{}, 3:{}
  };

  window.EJS_ready = () => {
    status.textContent = 'エミュレータ準備完了';
    showLoading('ROMを起動しています', '最初の画面が出るまで数秒かかることがあります。');
  };

  window.EJS_onGameStart = () => {
    emulatorStarted = true;
    clearTimeout(bootTimer);
    loadingState.classList.add('hidden');
    snesController.classList.add('ready');
    status.textContent = 'プレイ中';
    focusGame();
    if (sessionStorage.getItem(RESUME_KEY) === '1') {
      sessionStorage.removeItem(RESUME_KEY);
      setTimeout(() => emitStandaloneKey('2','Digit2',50), 700);
    }
  };
  window.EJS_onExit = () => { status.textContent = '終了'; };

  const oldLoader = document.querySelector('script[data-retro-pocket-loader]');
  if (oldLoader) oldLoader.remove();
  const loader = document.createElement('script');
  loader.src = `${window.EJS_pathtodata}loader.js`;
  loader.async = true;
  loader.dataset.retroPocketLoader = 'true';
  loader.onerror = () => showBootError('EmulatorJSの読み込みに失敗しました。通信状態を確認してください。');
  document.body.appendChild(loader);

  bootTimer = setTimeout(() => {
    if (!emulatorStarted) {
      status.textContent = '起動確認中';
      showLoading('まだ起動していません', 'ゲーム画面を一度タップしてください。改善しない場合は再読み込みしてください。', true);
    }
  }, 12000);
}

function setupTouchController() {
  if (!snesController) return;
  snesController.addEventListener('contextmenu', (e) => e.preventDefault());
  snesController.addEventListener('touchmove', (e) => e.preventDefault(), { passive:false });

  document.querySelectorAll('.pad-btn').forEach((button) => {
    button.style.touchAction = 'none';

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (layoutEditing || button.classList.contains('pressed')) return;

      // 最短経路: pointerdownを受けた瞬間にまずゲームへ入力を送る。
      emitKey(button, 'keydown');
      button.classList.add('pressed');
      if (button.setPointerCapture && event.pointerId !== undefined) {
        try { button.setPointerCapture(event.pointerId); } catch {}
      }
    }, { passive:false });

    const release = (event) => {
      event.preventDefault();
      if (layoutEditing || !button.classList.contains('pressed')) return;
      // keyupも先に送って押しっぱなしを防ぐ。
      emitKey(button, 'keyup');
      button.classList.remove('pressed');
    };

    button.addEventListener('pointerup', release, { passive:false });
    button.addEventListener('pointercancel', release, { passive:false });
    button.addEventListener('lostpointercapture', release, { passive:false });
  });

  window.addEventListener('blur', backgroundPause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) backgroundPause();
    else if (returningFromBackground) {
      returningFromBackground = false;
      requestAnimationFrame(() => {
        releaseAllControls();
        focusGame();
        status.textContent = 'プレイ中';
        resumeBanner.classList.remove('hidden');
        setTimeout(() => resumeBanner.classList.add('hidden'), 1800);
      });
    }
  });
  window.addEventListener('pageshow', () => {
    releaseAllControls();
    if (emulatorStarted) requestAnimationFrame(focusGame);
  });
}

function backgroundPause() {
  returningFromBackground = true;
  releaseAllControls();
  if (emulatorStarted) quickSaveBeforeBackground();
  status.textContent = '一時停止中';
}

function emitKey(button, type) {
  dispatchKeyboard(type, button.dataset.key, button.dataset.code, Number(button.dataset.keycode || 0));
}
function emitStandaloneKey(key, code, keyCode) {
  dispatchKeyboard('keydown', key, code, keyCode);
  setTimeout(() => dispatchKeyboard('keyup', key, code, keyCode), 55);
}
function dispatchKeyboard(type, key, code, keyCode) {
  const evt = new KeyboardEvent(type, { key, code, bubbles:true, cancelable:true, repeat:false });
  try { Object.defineProperty(evt, 'keyCode', { get:() => keyCode }); } catch {}
  try { Object.defineProperty(evt, 'which', { get:() => keyCode }); } catch {}
  document.dispatchEvent(evt);
}
function releaseAllControls() {
  document.querySelectorAll('.pad-btn.pressed').forEach((button) => {
    emitKey(button, 'keyup');
    button.classList.remove('pressed');
  });
}
function focusGame() {
  const target = document.querySelector('#game canvas') || $('game');
  if (!target) return;
  target.setAttribute('tabindex','-1');
  try { target.focus({preventScroll:true}); } catch { try { target.focus(); } catch {} }
}
function resumeEmulator() {
  releaseAllControls();
  focusGame();
  resumeBanner.classList.add('hidden');
  status.textContent = 'プレイ中';
}
function quickSaveBeforeBackground() { try { emitStandaloneKey('1','Digit1',49); } catch {} }

function setupLayoutEditor() {
  document.querySelectorAll('.control-unit').forEach((unit) => {
    unit.addEventListener('pointerdown', (event) => {
      if (!layoutEditing) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = layoutCanvas.getBoundingClientRect();
      const unitRect = unit.getBoundingClientRect();
      dragState = {
        unit,
        pointerId:event.pointerId,
        offsetX:event.clientX-unitRect.left,
        offsetY:event.clientY-unitRect.top,
        canvas:rect
      };
      unit.classList.add('dragging');
      try { unit.setPointerCapture(event.pointerId); } catch {}
    }, {passive:false});

    unit.addEventListener('pointermove', (event) => {
      if (!layoutEditing || !dragState || dragState.unit !== unit) return;
      event.preventDefault();
      const c = dragState.canvas;
      const xPx = event.clientX-c.left-dragState.offsetX;
      const yPx = event.clientY-c.top-dragState.offsetY;
      const maxX = Math.max(0, c.width-unit.offsetWidth);
      const maxY = Math.max(0, c.height-unit.offsetHeight);
      const x = clamp((xPx/maxX)*100, 0, 100);
      const y = clamp((yPx/maxY)*100, 0, 100);
      const id = unit.dataset.unit;
      currentLayout.units[id] = {x, y};
      positionUnit(unit, currentLayout.units[id]);
    }, {passive:false});

    const endDrag = (event) => {
      if (!dragState || dragState.unit !== unit) return;
      event.preventDefault();
      unit.classList.remove('dragging');
      dragState = null;
    };
    unit.addEventListener('pointerup', endDrag, {passive:false});
    unit.addEventListener('pointercancel', endDrag, {passive:false});
    unit.addEventListener('lostpointercapture', endDrag, {passive:false});
  });

  window.addEventListener('orientationchange', () => setTimeout(() => {
    setLayoutEditing(false);
    applySavedLayout();
  }, 180));
  window.addEventListener('resize', debounce(() => {
    if (!layoutEditing) applySavedLayout();
  }, 160));
}

function orientationKey() { return matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait'; }
function layoutStorageKey() { return LAYOUT_PREFIX + orientationKey(); }
function cloneDefaultLayout() { return JSON.parse(JSON.stringify(DEFAULT_LAYOUTS[orientationKey()])); }
function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(layoutStorageKey()));
    if (saved?.units) return saved;
  } catch {}
  return cloneDefaultLayout();
}
function applySavedLayout() {
  currentLayout = loadLayout();
  applyLayout(currentLayout);
  orientationLabel.textContent = orientationKey()==='landscape' ? '横画面用' : '縦画面用';
}
function applyLayout(layout) {
  if (!layout) return;
  controllerScale.value = layout.scale || 100;
  scaleValue.textContent = `${layout.scale || 100}%`;
  layoutCanvas.style.setProperty('--controller-scale', (layout.scale || 100)/100);
  document.querySelectorAll('.control-unit').forEach((unit) => {
    const p = layout.units[unit.dataset.unit];
    if (p) positionUnit(unit,p);
  });
}
function positionUnit(unit,p) {
  unit.style.left = `${p.x}%`;
  unit.style.top = `${p.y}%`;
}
function saveLayout() { localStorage.setItem(layoutStorageKey(), JSON.stringify(currentLayout)); }
function resetLayout() {
  currentLayout = cloneDefaultLayout();
  applyLayout(currentLayout);
  saveLayout();
  flashStatus('初期配置に戻しました');
}
function setLayoutEditing(enabled) {
  layoutEditing = enabled;
  releaseAllControls();
  snesController.classList.toggle('editing', enabled);
  layoutPanel.classList.toggle('hidden', !enabled);
  layoutEditToggle.classList.toggle('active', enabled);
  layoutEditToggle.textContent = enabled ? '編集中' : '配置設定';
  orientationLabel.textContent = orientationKey()==='landscape' ? '横画面用' : '縦画面用';
  if (enabled) {
    currentLayout = loadLayout();
    applyLayout(currentLayout);
    layoutPanel.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
}
function flashStatus(text) {
  const before = status.textContent;
  status.textContent = text;
  setTimeout(() => { if (status.textContent===text) status.textContent = before; }, 1200);
}
function clamp(v,min,max){ return Math.min(max,Math.max(min,v)); }
function debounce(fn,ms){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args),ms); }; }

function openDb() {
  return new Promise((resolve,reject) => {
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE); };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
async function cacheRom(file) {
  try {
    const db=await openDb(); const data=await file.arrayBuffer();
    await new Promise((resolve,reject)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put({name:file.name,type:file.type,lastModified:file.lastModified,data,size:file.size},LAST_ROM); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); });
    db.close(); await refreshCachedGame();
  } catch(err){ console.warn('ROM cache failed',err); }
}
async function loadCachedRom() {
  try {
    const db=await openDb();
    const record=await new Promise((resolve,reject)=>{ const tx=db.transaction(STORE,'readonly'); const req=tx.objectStore(STORE).get(LAST_ROM); req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error); });
    db.close(); if(!record)return null;
    return new File([record.data],record.name,{type:record.type||'application/octet-stream',lastModified:record.lastModified||Date.now()});
  } catch(err){ console.warn('ROM restore failed',err); return null; }
}
async function refreshCachedGame() {
  const file=await loadCachedRom(); const has=!!file;
  continueGame.classList.toggle('hidden',!has); cachedGameInfo.classList.toggle('hidden',!has);
  if(has)cachedGameInfo.textContent=`保存済み: ${file.name} · ${formatBytes(file.size)}`;
}

function showLoading(title,message,warning=false){ loadingState.classList.remove('hidden'); loadingState.innerHTML=`${warning?'<div class="boot-warning">!</div>':'<div class="spinner"></div>'}<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>${warning?'<button class="boot-retry" type="button" onclick="location.reload()">再読み込み</button>':''}`; }
function showBootError(message){ clearTimeout(bootTimer); status.textContent='起動失敗'; showLoading('ゲームを起動できませんでした',message,true); }
function rememberGame(title,ext,size){ const h=getHistory().filter(g=>g.title!==title); h.unshift({title,ext:ext.toUpperCase(),size,playedAt:Date.now()}); localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(0,12))); }
function getHistory(){ try{return JSON.parse(localStorage.getItem(HISTORY_KEY))||[];}catch{return[];} }
function renderHistory(){ const h=getHistory(); recentGames.innerHTML=''; emptyLibrary.classList.toggle('hidden',h.length>0); h.forEach((g,i)=>{ const card=document.createElement('article'); card.className='game-card'; card.innerHTML=`<div class="cover"><span>${String(i+1).padStart(2,'0')}</span><b>16-BIT</b></div><div class="game-info"><strong>${escapeHtml(g.title)}</strong><p>SNES · ${g.ext} · ${formatBytes(g.size)}</p><small>${relativeTime(g.playedAt)}</small></div>`; recentGames.appendChild(card); }); }
function relativeTime(time){ const d=Date.now()-time; if(d<60000)return'たった今'; if(d<3600000)return`${Math.floor(d/60000)}分前`; if(d<86400000)return`${Math.floor(d/3600000)}時間前`; return`${Math.floor(d/86400000)}日前`; }
function hashString(s){ let h=0; for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0; return Math.abs(h)||1; }
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function formatBytes(bytes){ if(bytes<1024)return`${bytes} B`; if(bytes<1048576)return`${(bytes/1024).toFixed(1)} KB`; return`${(bytes/1048576).toFixed(1)} MB`; }
