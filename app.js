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

const HISTORY_KEY = 'retro-pocket-history-v1';
const supported = ['sfc','smc','fig','gd3','gd7','dx2','bsx','swc'];
let activeRomUrl = null;
let activeFile = null;
let emulatorStarted = false;

chooseRom.addEventListener('click', () => romInput.click());
changeRom.addEventListener('click', () => romInput.click());
reloadGame.addEventListener('click', () => activeFile && bootRom(activeFile, true));
backToLibrary.addEventListener('click', () => window.location.reload());
clearHistory.addEventListener('click', () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); });
romInput.addEventListener('change', (e) => { const file = e.target.files?.[0]; if (file) bootRom(file); });

renderHistory();

function bootRom(file, forceReload = false) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!supported.includes(ext)) {
    status.textContent = '非対応ファイル';
    alert('対応するSNES ROMを選択してください。');
    romInput.value = '';
    return;
  }
  if (emulatorStarted && !forceReload) { window.location.reload(); return; }
  if (forceReload) { window.location.reload(); return; }

  activeFile = file;
  activeRomUrl = URL.createObjectURL(file);
  const title = file.name.replace(/\.[^.]+$/, '');
  rememberGame(title, ext, file.size);
  libraryView.classList.add('hidden');
  playerView.classList.remove('hidden');
  nowPlaying.textContent = title;
  fileName.textContent = `${file.name} · ${formatBytes(file.size)}`;
  status.textContent = '起動中…';

  window.EJS_player = '#game';
  window.EJS_core = 'snes';
  window.EJS_gameName = title;
  window.EJS_gameUrl = activeRomUrl;
  window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';
  window.EJS_startOnLoaded = true;
  window.EJS_language = 'ja-JP';
  window.EJS_browserMode = 'mobile';
  window.EJS_threads = false;
  window.EJS_gameID = hashString(title);
  window.EJS_fixedSaveInterval = 10000;
  window.EJS_onGameStart = () => {
    emulatorStarted = true;
    loadingState.classList.add('hidden');
    status.textContent = 'プレイ中';
  };

  const loader = document.createElement('script');
  loader.src = `${window.EJS_pathtodata}loader.js`;
  loader.async = true;
  loader.onerror = () => { status.textContent = '読み込み失敗'; loadingState.innerHTML = '<strong>EmulatorJSを読み込めませんでした</strong><p>通信環境を確認して再読み込みしてください。</p>'; };
  document.body.appendChild(loader);
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
window.addEventListener('beforeunload', () => { if (activeRomUrl) URL.revokeObjectURL(activeRomUrl); });