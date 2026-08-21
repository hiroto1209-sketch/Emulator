(() => {
  const $ = (id) => document.getElementById(id);
  const player = $('playerView');
  const drawer = $('gameMenuDrawer');
  const backdrop = $('menuBackdrop');
  const closeButton = $('gameMenuClose');
  const snesController = $('snesController');
  const menuGameTitle = $('menuGameTitle');
  const gameRoot = $('game');
  const nativePadToggle = $('nativePadToggle');
  const customPadToggle = $('customPadToggle');

  const NATIVE_PAD_KEY = 'retro-pocket-native-pad-v1';
  const CUSTOM_PAD_KEY = 'retro-pocket-custom-pad-v1';
  let nativePadVisible = localStorage.getItem(NATIVE_PAD_KEY) === '1';
  let customPadVisible = localStorage.getItem(CUSTOM_PAD_KEY) !== '0';
  let nativeMenuButton = null;

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

  closeButton?.addEventListener('click', closeMenu);
  backdrop?.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  function applyPadVisibility() {
    gameRoot?.classList.toggle('retro-native-pad-off', !nativePadVisible);
    document.body.classList.toggle('custom-pad-off', !customPadVisible);
    nativePadToggle?.classList.toggle('active', nativePadVisible);
    customPadToggle?.classList.toggle('active', customPadVisible);
    if (nativePadToggle) nativePadToggle.textContent = `画面内パッド ${nativePadVisible ? 'ON' : 'OFF'}`;
    if (customPadToggle) customPadToggle.textContent = `下部パッド ${customPadVisible ? 'ON' : 'OFF'}`;
  }

  nativePadToggle?.addEventListener('click', () => {
    nativePadVisible = !nativePadVisible;
    localStorage.setItem(NATIVE_PAD_KEY, nativePadVisible ? '1' : '0');
    applyPadVisibility();
  });

  customPadToggle?.addEventListener('click', () => {
    customPadVisible = !customPadVisible;
    localStorage.setItem(CUSTOM_PAD_KEY, customPadVisible ? '1' : '0');
    applyPadVisibility();
  });

  // 配置編集を選んだら設定ドロワーを閉じる。
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

  const translations = new Map([
    ['Save State','ステート保存'],['Load State','ステート読込'],['Save','保存'],['Load','読込'],
    ['Settings','設定'],['Controls','操作設定'],['Cheats','チート'],['Fullscreen','全画面'],
    ['Restart','再起動'],['Reset','リセット'],['Pause','一時停止'],['Resume','再開'],
    ['Exit','終了'],['Mute','消音'],['Unmute','消音解除'],['Volume','音量'],
    ['Fast Forward','早送り'],['Screenshot','スクリーンショット'],['Close','閉じる'],
    ['Back','戻る'],['Gamepad','ゲームパッド'],['Keyboard','キーボード'],
    ['Virtual Gamepad','画面コントローラー'],['Virtual gamepad','画面コントローラー']
  ]);

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

  function visible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 20 && r.height > 20;
  }

  function discoverNativeHamburger() {
    if (!gameRoot) return;
    const candidates = [...gameRoot.querySelectorAll('button,[role="button"]')].filter(visible);
    nativeMenuButton = candidates.find((el) => {
      const label = `${el.getAttribute('aria-label')||''} ${el.getAttribute('title')||''}`.toLowerCase();
      if (label.includes('menu') || label.includes('setting')) return true;
      const text = (el.textContent || '').trim();
      const bars = el.querySelectorAll('span,div').length;
      return text.length === 0 && bars >= 3 && el.getBoundingClientRect().width < 90;
    }) || nativeMenuButton;
  }

  function findNativeMenuPanel() {
    if (!gameRoot) return null;
    const keywords = ['設定','操作設定','ステート保存','全画面','チート','Settings','Controls','Save State','Fullscreen'];
    const candidates = [...gameRoot.querySelectorAll('div,section,aside')].filter((el) => {
      if (!visible(el)) return false;
      if (el.querySelector('.retro-native-menu-entry')) return true;
      const text = (el.innerText || '').slice(0,1000);
      return keywords.some(k => text.includes(k)) && el.querySelectorAll('button,[role="button"]').length >= 2;
    });
    if (!candidates.length) return null;
    return candidates.sort((a,b) => a.getBoundingClientRect().width*a.getBoundingClientRect().height - b.getBoundingClientRect().width*b.getBoundingClientRect().height)[0];
  }

  function closeNativeThenOpen(panel) {
    const close = [...panel.querySelectorAll('button,[role="button"]')].find((b) => {
      const t = (b.textContent || '').trim();
      const l = `${b.getAttribute('aria-label')||''} ${b.getAttribute('title')||''}`.toLowerCase();
      return t === '×' || t === '✕' || t === '閉じる' || l.includes('close');
    });
    if (close) {
      try { close.click(); } catch {}
      setTimeout(openMenu, 30);
      return;
    }
    if (nativeMenuButton) {
      try { nativeMenuButton.click(); } catch {}
      setTimeout(openMenu, 30);
      return;
    }
    openMenu();
  }

  function injectIntoNativeMenu() {
    discoverNativeHamburger();
    const panel = findNativeMenuPanel();
    if (!panel || panel.querySelector('.retro-native-menu-entry')) return;
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'retro-native-menu-entry';
    entry.innerHTML = '<span><strong>Retro Pocket 設定</strong><br><small>保存・チート・速度・配置・パッド</small></span><span class="retro-arrow">›</span>';
    entry.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeNativeThenOpen(panel);
    });
    panel.appendChild(entry);
  }

  if (gameRoot) {
    const mo = new MutationObserver((records) => {
      translateNode(gameRoot);
      applyPadVisibility();
      discoverNativeHamburger();
      injectIntoNativeMenu();
    });
    mo.observe(gameRoot, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class','style'] });
  }

  if (player) new MutationObserver(syncPlayerMode).observe(player, { attributes:true, attributeFilter:['class'] });
  syncPlayerMode();
  applyPadVisibility();

  // EmulatorJSが起動してメニューを生成するタイミングに備えて数回探索する。
  [300,700,1400,2600,5000].forEach(ms => setTimeout(() => {
    applyPadVisibility();
    discoverNativeHamburger();
    injectIntoNativeMenu();
  }, ms));

  window.addEventListener('orientationchange', () => setTimeout(() => {
    if (document.body.classList.contains('player-active')) window.scrollTo(0,0);
    applyPadVisibility();
  }, 80));
})();
