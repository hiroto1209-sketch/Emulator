const romInput = document.getElementById('romInput');
const chooseRom = document.getElementById('chooseRom');
const continueGame = document.getElementById('continueGame');
const cachedGameInfo = document.getElementById('cachedGameInfo');
const changeRom = document.getElementById('changeRom');
const reloadGame = document.getElementById('reloadGame');
const backToLibrary = document.getElementById('backToLibrary');
const clearHistory = document.getElementById('clearHistory');
const libraryView = document.getElementById('libraryView');
const playerView = document.getElementById('playerView');
const loadingState = document.getElementById('loadingState');
const recentGames = document.getElementById('recentGames');
const emptyLibrary = document.getElementById('emptyLibrary');
const nowPlaying = document.getElementById('nowPlaying');
const fileName = document.getElementById('fileName');
const status = document.getElementById('status');
const snesController = document.getElementById('snesController');
const resumeBanner = document.getElementById('resumeBanner');
const resumeNow = document.getElementById('resumeNow');

const HISTORY_KEY = 'retro-pocket-history-v1';
const RESUME_KEY = 'retro-pocket-autoresume-v1';
const DB_NAME = 'retro-pocket-db';
const DB_VERSION = 1;
const STORE = 'roms';
const LAST_ROM = 'last-rom';
const supported = ['sfc','smc','fig','gd3','gd7','dx2','bsx','swc'];
let activeFile = null;
let emulatorStarted = false;
let bootTimer = null;
let returningFromBackground = false;

chooseRom.addEventListener('click', () => romInput.click());
changeRom.addEventListener('click', () => romInput.click());
continueGame.addEventListener('click', async () => {
  const file = await loadCachedRom();
  if (file) bootRom(file, { fromCache: true });
});
reloadGame.addEventListener('click', async () => {
  const file = activeFile || await loadCachedRom();
  if (file) bootRom(file, { fromCache: true, replacePage: true });
});
backToLibrary.addEventListener('click', () => window.location.reload());
resumeNow.addEventListener('click', resumeEmulator);
clearHistory.addEventListener('click', () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); });
romInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await cacheRom(file);
  bootRom(file);
});

setupTouchController();
renderHistory();
refreshCachedGame();

async function bootRom(file, options = {}) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!supported.includes(ext)) {
    status.textContent = '非対応ファイル';
    alert('対応するSNES ROMを選択してください。');
    romInput.value = '';
    return;
  }

  if (options.replacePage && emulatorStarted) {
    sessionStorage.setItem(RESUME_KEY, '1');
    window.location.reload();
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

  // EmulatorJSの入力番号に合わせて明示固定する。
  // 0=B, 1=Y, 8=A, 9=X, 10=L, 11=R。
  window.EJS_defaultControls = {
    0: {
      0: { value: 'z' },
      1: { value: 'a' },
      2: { value: 'shift' },
      3: { value: 'enter' },
      4: { value: 'up arrow' },
      5: { value: 'down arrow' },
      6: { value: 'left arrow' },
      7: { value: 'right arrow' },
      8: { value: 'x' },
      9: { value: 's' },
      10: { value: 'q' },
      11: { value: 'w' },
      24: { value: '1' },
      25: { value: '2' }
    }, 1: {}, 2: {}, 3: {}
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

    // ページを再読み込みして「続ける」から入った時だけ、直前のクイックセーブを試す。
    if (sessionStorage.getItem(RESUME_KEY) === '1') {
      sessionStorage.removeItem(RESUME_KEY);
      setTimeout(() => emitStandaloneKey('2','Digit2',50), 900);
    }
  };

  window.EJS_onExit = () => { status.textContent = '終了'; };

  const oldLoader = document.querySelector('script[data-retro-pocket-loader]');
  if (oldLoader) oldLoader.remove();
  const loader = document.createElement('script');
  loader.src = `${window.EJS_pathtodata}loader.js`;
  loader.async = true;
  loader.dataset.retroPocketLoader = 'true';
  loader.onerror = () => showBootError('EmulatorJSの読み込みに失敗しました。通信状態を確認して再読み込みしてください。');
  document.body.appendChild(loader);

  bootTimer = setTimeout(() => {
    if (!emulatorStarted) {
      status.textContent = '起動確認中';
      showLoading('まだ起動していません', 'ゲーム画面を一度タップしてください。改善しない場合は「再読み込み」を押してください。', true);
    }
  }, 12000);
}

function setupTouchController() {
  if (!snesController) return;
  snesController.addEventListener('contextmenu', (e) => e.preventDefault());
  snesController.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  document.querySelectorAll('.pad-btn').forEach((button) => {
    button.style.touchAction = 'none';
    const press = (event) => {
      event.preventDefault();
      if (button.classList.contains('pressed')) return;
      if (button.setPointerCapture && event.pointerId !== undefined) {
        try { button.setPointerCapture(event.pointerId); } catch {}
      }
      button.classList.add('pressed');
      emitKey(button, 'keydown');
      if (navigator.vibrate) navigator.vibrate(8);
    };
    const release = (event) => {
      event.preventDefault();
      if (!button.classList.contains('pressed')) return;
      button.classList.remove('pressed');
      emitKey(button, 'keyup');
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });

  window.addEventListener('blur', () => {
    releaseAllControls();
    if (emulatorStarted) quickSaveBeforeBackground();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      returningFromBackground = true;
      releaseAllControls();
      if (emulatorStarted) quickSaveBeforeBackground();
      status.textContent = '一時停止中';
    } else if (returningFromBackground) {
      returningFromBackground = false;
      setTimeout(() => {
        releaseAllControls();
        focusGame();
        status.textContent = 'プレイ中';
        resumeBanner.classList.remove('hidden');
        setTimeout(() => resumeBanner.classList.add('hidden'), 2500);
      }, 180);
    }
  });

  window.addEventListener('pageshow', () => {
    releaseAllControls();
    if (emulatorStarted) setTimeout(focusGame, 100);
  });
}

function emitKey(button, type) {
  dispatchKeyboard(type, button.dataset.key, button.dataset.code, Number(button.dataset.keycode || 0));
}

function emitStandaloneKey(key, code, keyCode) {
  dispatchKeyboard('keydown', key, code, keyCode);
  setTimeout(() => dispatchKeyboard('keyup', key, code, keyCode), 80);
}

function dispatchKeyboard(type, key, code, keyCode) {
  const evt = new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true, repeat: false });
  try { Object.defineProperty(evt, 'keyCode', { get: () => keyCode }); } catch {}
  try { Object.defineProperty(evt, 'which', { get: () => keyCode }); } catch {}
  // 一度だけ送る。documentで発火すればwindowまでbubbleする。
  document.dispatchEvent(evt);
}

function releaseAllControls() {
  document.querySelectorAll('.pad-btn.pressed').forEach((button) => {
    button.classList.remove('pressed');
    emitKey(button, 'keyup');
  });
}

function focusGame() {
  const canvas = document.querySelector('#game canvas');
  const target = canvas || document.getElementById('game');
  if (!target) return;
  target.setAttribute('tabindex', '-1');
  try { target.focus({ preventScroll: true }); } catch { try { target.focus(); } catch {} }
}

function resumeEmulator() {
  releaseAllControls();
  focusGame();
  resumeBanner.classList.add('hidden');
  status.textContent = 'プレイ中';
}

function quickSaveBeforeBackground() {
  try { emitStandaloneKey('1','Digit1',49); } catch {}
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheRom(file) {
  try {
    const db = await openDb();
    const data = await file.arrayBuffer();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ name:file.name, type:file.type, lastModified:file.lastModified, data, size:file.size }, LAST_ROM);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await refreshCachedGame();
  } catch (err) {
    console.warn('ROM cache failed', err);
  }
}

async function loadCachedRom() {
  try {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(LAST_ROM);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!record) return null;
    return new File([record.data], record.name, { type:record.type || 'application/octet-stream', lastModified:record.lastModified || Date.now() });
  } catch (err) {
    console.warn('ROM restore failed', err);
    return null;
  }
}

async function refreshCachedGame() {
  const file = await loadCachedRom();
  const has = !!file;
  continueGame.classList.toggle('hidden', !has);
  cachedGameInfo.classList.toggle('hidden', !has);
  if (has) cachedGameInfo.textContent = `保存済み: ${file.name} · ${formatBytes(file.size)}`;
}

function showLoading(title, message, warning = false) {
  loadingState.classList.remove('hidden');
  loadingState.innerHTML = `${warning ? '<div class="boot-warning">!</div>' : '<div class="spinner"></div>'}<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>${warning ? '<button class="boot-retry" type="button" onclick="window.location.reload()">再読み込み</button>' : ''}`;
}
function showBootError(message) { clearTimeout(bootTimer); status.textContent = '起動失敗'; showLoading('ゲームを起動できませんでした', message, true); }
function rememberGame(title, ext, size) { const history=getHistory().filter(g=>g.title!==title); history.unshift({title,ext:ext.toUpperCase(),size,playedAt:Date.now()}); localStorage.setItem(HISTORY_KEY,JSON.stringify(history.slice(0,12))); }
function getHistory(){ try{return JSON.parse(localStorage.getItem(HISTORY_KEY))||[];}catch{return[];} }
function renderHistory(){ const history=getHistory(); recentGames.innerHTML=''; emptyLibrary.classList.toggle('hidden',history.length>0); history.forEach((g,i)=>{ const card=document.createElement('article'); card.className='game-card'; card.innerHTML=`<div class="cover"><span>${String(i+1).padStart(2,'0')}</span><b>16-BIT</b></div><div class="game-info"><strong>${escapeHtml(g.title)}</strong><p>SNES · ${g.ext} · ${formatBytes(g.size)}</p><small>${relativeTime(g.playedAt)}</small></div>`; recentGames.appendChild(card); }); }
function relativeTime(time){ const d=Date.now()-time; if(d<60000)return'たった今'; if(d<3600000)return`${Math.floor(d/60000)}分前`; if(d<86400000)return`${Math.floor(d/3600000)}時間前`; return`${Math.floor(d/86400000)}日前`; }
function hashString(s){ let h=0; for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0; return Math.abs(h)||1; }
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function formatBytes(bytes){ if(bytes<1024)return`${bytes} B`; if(bytes<1048576)return`${(bytes/1024).toFixed(1)} KB`; return`${(bytes/1048576).toFixed(1)} MB`; }
