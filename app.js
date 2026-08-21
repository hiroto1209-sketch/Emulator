const romInput = document.getElementById('romInput');
const chooseRom = document.getElementById('chooseRom');
const resetApp = document.getElementById('resetApp');
const emptyState = document.getElementById('emptyState');
const fileName = document.getElementById('fileName');
const status = document.getElementById('status');

let activeRomUrl = null;
let emulatorStarted = false;

chooseRom.addEventListener('click', () => romInput.click());
resetApp.addEventListener('click', () => window.location.reload());

romInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['sfc', 'smc'].includes(ext)) {
    status.textContent = '非対応ファイル';
    fileName.textContent = '.sfc または .smc を選択してください。';
    romInput.value = '';
    return;
  }

  if (emulatorStarted) {
    window.location.reload();
    return;
  }

  activeRomUrl = URL.createObjectURL(file);
  fileName.textContent = `${file.name} · ${formatBytes(file.size)}`;
  status.textContent = '起動中…';
  chooseRom.disabled = true;
  resetApp.disabled = false;
  emptyState.classList.add('hidden');

  window.EJS_player = '#game';
  window.EJS_core = 'snes';
  window.EJS_gameName = file.name.replace(/\.(sfc|smc)$/i, '');
  window.EJS_gameUrl = activeRomUrl;
  window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';
  window.EJS_startOnLoaded = true;
  window.EJS_language = 'ja-JP';
  window.EJS_threads = false;
  window.EJS_disableDatabases = false;

  const loader = document.createElement('script');
  loader.src = `${window.EJS_pathtodata}loader.js`;
  loader.async = true;
  loader.onload = () => {
    emulatorStarted = true;
    status.textContent = 'プレイ中';
  };
  loader.onerror = () => {
    status.textContent = '読み込み失敗';
    fileName.textContent = 'EmulatorJSを読み込めませんでした。通信環境を確認してください。';
    chooseRom.disabled = false;
  };
  document.body.appendChild(loader);
});

window.addEventListener('beforeunload', () => {
  if (activeRomUrl) URL.revokeObjectURL(activeRomUrl);
});

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
