const romInput = document.getElementById('romInput');
const chooseRom = document.getElementById('chooseRom');
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

const HISTORY_KEY = 'retro-pocket-history-v1';
const supported = ['sfc','smc','fig','gd3','gd7','dx2','bsx','swc'];
let activeFile = null;
let emulatorStarted = false;
let bootTimer = null;

chooseRom.addEventListener('click', () => romInput.click());
changeRom.addEventListener('click', () => romInput.click());
reloadGame.addEventListener('click', () => window.location.reload());
backToLibrary.addEventListener('click', () => window.location.reload());
clearHistory.addEventListener('click', () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); });
romInput.addEventListener('change', (e) => { const file = e.target.files?.[0]; if (file) bootRom(file); });

setupTouchController();
renderHistory();

function bootRom(file) {
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
  showLoading('ゲームを準備しています', 'iPhone / iPad向けの安定モードで起動しています。');

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
  window.EJS_fixedSaveInterval = 10000;
  window.EJS_controlScheme = 'snes';
  window.EJS_color = '#8b7cff';
  window.EJS_backgroundColor = '#000';
  window.EJS_askBeforeExit = false;

  // アプリ側に専用パッドを置くため、EmulatorJS内蔵の仮想パッド設定には依存しない。
  // キーボード標準マッピングを使うので、外付けキーボード/ゲームパッドとも共存できる。
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
  };

  window.EJS_onExit = () => {
    status.textContent = '終了';
  };

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
      if (button.setPointerCapture && event.pointerId !== undefined) {
        try { button.setPointerCapture(event.pointerId); } catch {}
      }
      button.classList.add('pressed');
      emitKey(button, 'keydown');
    };

    const release = (event) => {
      event.preventDefault();
      button.classList.remove('pressed');
      emitKey(button, 'keyup');
    };

    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });

  window.addEventListener('blur', releaseAllControls);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAllControls();
  });
}

function emitKey(button, type) {
  const key = button.dataset.key;
  const code = button.dataset.code;
  const keyCode = Number(button.dataset.keycode || 0);
  const eventInit = { key, code, bubbles: true, cancelable: true, repeat: false };

  const makeEvent = () => {
    const evt = new KeyboardEvent(type, eventInit);
    // 一部エミュレータコアはkeyCode/whichを参照するため互換値も持たせる。
    try { Object.defineProperty(evt, 'keyCode', { get: () => keyCode }); } catch {}
    try { Object.defineProperty(evt, 'which', { get: () => keyCode }); } catch {}
    return evt;
  };

  document.dispatchEvent(makeEvent());
  window.dispatchEvent(makeEvent());
  const canvas = document.querySelector('#game canvas');
  if (canvas) canvas.dispatchEvent(makeEvent());
}

function releaseAllControls() {
  document.querySelectorAll('.pad-btn.pressed').forEach((button) => {
    button.classList.remove('pressed');
    emitKey(button, 'keyup');
  });
}

function showLoading(title, message, warning = false) {
  loadingState.classList.remove('hidden');
  loadingState.innerHTML = `${warning ? '<div class="boot-warning">!</div>' : '<div class="spinner"></div>'}<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>${warning ? '<button class="boot-retry" type="button" onclick="window.location.reload()">再読み込み</button>' : ''}`;
}

function showBootError(message) {
  clearTimeout(bootTimer);
  status.textContent = '起動失敗';
  showLoading('ゲームを起動できませんでした', message, true);
}

function rememberGame(title, ext, size) {
  const history = getHistory().filter(g => g.title !== title);
  history.unshift({ title, ext: ext.toUpperCase(), size, playedAt: Date.now() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 12)));
}
function getHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; } }
function renderHistory() {
  const history = getHistory();
  recentGames.innerHTML = '';
  emptyLibrary.classList.toggle('hidden', history.length > 0);
  history.forEach((g, i) => {
    const card = document.createElement('article');
    card.className = 'game-card';
    card.innerHTML = `<div class="cover"><span>${String(i + 1).padStart(2,'0')}</span><b>16-BIT</b></div><div class="game-info"><strong>${escapeHtml(g.title)}</strong><p>SNES · ${g.ext} · ${formatBytes(g.size)}</p><small>${relativeTime(g.playedAt)}</small></div>`;
    recentGames.appendChild(card);
  });
}
function relativeTime(time) { const d = Date.now() - time; if (d < 60000) return 'たった今'; if (d < 3600000) return `${Math.floor(d/60000)}分前`; if (d < 86400000) return `${Math.floor(d/3600000)}時間前`; return `${Math.floor(d/86400000)}日前`; }
function hashString(s) { let h = 0; for (let i=0;i<s.length;i++) h = ((h<<5)-h+s.charCodeAt(i))|0; return Math.abs(h) || 1; }
function escapeHtml(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function formatBytes(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`; return `${(bytes/1048576).toFixed(1)} MB`; }
