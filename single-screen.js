(() => {
  const $ = (id) => document.getElementById(id);
  const player = $('playerView');
  const drawer = $('gameMenuDrawer');
  const backdrop = $('menuBackdrop');
  const openButton = $('gameMenuButton');
  const closeButton = $('gameMenuClose');
  const snesController = $('snesController');
  const menuGameTitle = $('menuGameTitle');

  function syncPlayerMode() {
    const playing = player && !player.classList.contains('hidden');
    document.body.classList.toggle('player-active', !!playing);
    if (playing) {
      window.scrollTo(0, 0);
      const title = $('nowPlaying')?.textContent?.trim();
      if (title && menuGameTitle) menuGameTitle.textContent = title;
    }
  }

  function openMenu() {
    drawer?.classList.remove('hidden');
    backdrop?.classList.remove('hidden');
    document.body.classList.add('menu-open');
    const title = $('nowPlaying')?.textContent?.trim();
    if (title && menuGameTitle) menuGameTitle.textContent = title;
  }

  function closeMenu() {
    drawer?.classList.add('hidden');
    backdrop?.classList.add('hidden');
    document.body.classList.remove('menu-open');
  }

  openButton?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openMenu(); });
  closeButton?.addEventListener('click', closeMenu);
  backdrop?.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  // 配置編集を選んだらメニューを閉じ、ゲーム画面とパッドだけの状態で配置を触れるようにする。
  $('layoutEditToggle')?.addEventListener('click', () => {
    requestAnimationFrame(() => {
      if (snesController?.classList.contains('editing')) closeMenu();
    });
  });

  // 動的に変更される英語ラベルも日本語へ統一。
  const turbo = $('turboToggle');
  if (turbo) {
    const translateTurbo = () => {
      const t = turbo.textContent.trim().toUpperCase();
      if (t === 'TURBO ON') turbo.textContent = '連打 ON';
      if (t === 'TURBO OFF') turbo.textContent = '連打 OFF';
    };
    new MutationObserver(translateTurbo).observe(turbo, { childList:true, subtree:true, characterData:true });
    translateTurbo();
  }

  // EmulatorJSがDOMで表示する代表的な英語UIを安全に日本語化する。
  // ゲーム映像はcanvasなので、この処理がゲーム内文字へ触れることはない。
  const translations = new Map([
    ['Save State','ステート保存'],['Load State','ステート読込'],['Save','保存'],['Load','読込'],
    ['Settings','設定'],['Controls','操作設定'],['Cheats','チート'],['Fullscreen','全画面'],
    ['Restart','再起動'],['Reset','リセット'],['Pause','一時停止'],['Resume','再開'],
    ['Exit','終了'],['Mute','消音'],['Unmute','消音解除'],['Volume','音量'],
    ['Fast Forward','早送り'],['Screenshot','スクリーンショット'],['Close','閉じる'],
    ['Back','戻る'],['Gamepad','ゲームパッド'],['Keyboard','キーボード']
  ]);
  const gameRoot = $('game');
  function translateNode(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const raw = n.nodeValue;
      const key = raw?.trim();
      if (!key || !translations.has(key)) continue;
      n.nodeValue = raw.replace(key, translations.get(key));
    }
  }
  if (gameRoot) {
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') translateNode(r.target.parentNode);
        for (const n of r.addedNodes) if (n.nodeType === 1) translateNode(n);
      }
    });
    mo.observe(gameRoot, { childList:true, subtree:true, characterData:true });
  }

  if (player) new MutationObserver(syncPlayerMode).observe(player, { attributes:true, attributeFilter:['class'] });
  syncPlayerMode();

  // プレイ中は向き変更後もページ位置を固定。
  window.addEventListener('orientationchange', () => setTimeout(() => {
    if (document.body.classList.contains('player-active')) window.scrollTo(0,0);
  }, 80));
})();
