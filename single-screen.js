(() => {
  const $ = (id) => document.getElementById(id);
  const player = $('playerView'), drawer = $('gameMenuDrawer'), backdrop = $('menuBackdrop');
  const closeButton = $('gameMenuClose'), snesController = $('snesController'), menuGameTitle = $('menuGameTitle');
  const gameRoot = $('game'), nativePadToggle = $('nativePadToggle'), customPadToggle = $('customPadToggle');
  const NATIVE_PAD_KEY='retro-pocket-native-pad-v1', CUSTOM_PAD_KEY='retro-pocket-custom-pad-v1';
  let nativePadVisible=localStorage.getItem(NATIVE_PAD_KEY)==='1';
  let customPadVisible=localStorage.getItem(CUSTOM_PAD_KEY)!=='0';
  let nativeMenuButton=null, nativeMenuPanel=null, enhanceQueued=false, fallbackButton=null;

  const setStructuredToggle=(button,label,value)=>{
    if(!button)return;
    let span=button.querySelector('span'), b=button.querySelector('b');
    if(!span||!b){button.innerHTML='';span=document.createElement('span');b=document.createElement('b');button.append(span,b);}
    span.textContent=label;b.textContent=value;
  };

  function syncPlayerMode(){
    const playing=player&&!player.classList.contains('hidden');
    document.body.classList.toggle('player-active',!!playing);
    if(playing){window.scrollTo(0,0);const title=$('nowPlaying')?.textContent?.trim();if(title&&menuGameTitle)menuGameTitle.textContent=title;}
    syncFallbackMenu();
  }
  function openMenu(){
    if(nativeMenuPanel)nativeMenuPanel.classList.add('retro-native-menu-suspended');
    drawer?.classList.remove('hidden');backdrop?.classList.remove('hidden');document.body.classList.add('menu-open');
    const title=$('nowPlaying')?.textContent?.trim();if(title&&menuGameTitle)menuGameTitle.textContent=title;
  }
  function closeMenu(){
    drawer?.classList.add('hidden');backdrop?.classList.add('hidden');document.body.classList.remove('menu-open');
    nativeMenuPanel?.classList.remove('retro-native-menu-suspended');
  }
  closeButton?.addEventListener('click',closeMenu);backdrop?.addEventListener('click',closeMenu);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});

  function ensureFallbackButton(){
    if(fallbackButton?.isConnected)return fallbackButton;
    fallbackButton=document.createElement('button');
    fallbackButton.type='button';fallbackButton.className='retro-fallback-menu-button';fallbackButton.setAttribute('aria-label','Retro Pocket 設定');
    fallbackButton.innerHTML='<span></span><span></span><span></span>';
    fallbackButton.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openMenu();});
    document.querySelector('.fixed-stage')?.appendChild(fallbackButton);
    return fallbackButton;
  }
  function syncFallbackMenu(){
    const b=ensureFallbackButton();if(!b)return;
    const playing=player&&!player.classList.contains('hidden');
    const nativeAvailable=!!(nativeMenuButton&&nativeMenuButton.isConnected&&visible(nativeMenuButton));
    b.classList.toggle('hidden',!playing||nativeAvailable);
  }

  function showNativeVirtualControls(){gameRoot?.querySelectorAll('.retro-force-hide-native-control').forEach(el=>el.classList.remove('retro-force-hide-native-control'));}
  function hideNativeVirtualControls(){
    if(!gameRoot)return;
    // Only hide exact gamepad buttons. Never infer from broad class names; that previously hid the hamburger too.
    const unwanted=/^(select|start|fast|rewind|slow|l|r|a|b|x|y|▲|▼|◀|▶)$/i;
    gameRoot.querySelectorAll('.retro-force-hide-native-control').forEach(el=>el.classList.remove('retro-force-hide-native-control'));
    gameRoot.querySelectorAll('button,[role="button"]').forEach(el=>{
      if(el===nativeMenuButton)return;
      const text=(el.textContent||'').trim();
      const label=`${el.getAttribute('aria-label')||''} ${el.getAttribute('title')||''}`.trim();
      if(/menu|setting|設定/i.test(label))return;
      if(unwanted.test(text))el.classList.add('retro-force-hide-native-control');
    });
    gameRoot.querySelectorAll('[id*="virtualGamepad"],[class*="virtualGamepad"],[class*="virtual-gamepad"]').forEach(el=>{
      if(!el.contains(nativeMenuButton))el.classList.add('retro-force-hide-native-control');
    });
  }
  function applyPadVisibility(){
    gameRoot?.classList.toggle('retro-native-pad-off',!nativePadVisible);
    document.body.classList.toggle('custom-pad-off',!customPadVisible);
    nativePadToggle?.classList.toggle('active',nativePadVisible);customPadToggle?.classList.toggle('active',customPadVisible);
    setStructuredToggle(nativePadToggle,'画面内パッド',nativePadVisible?'ON':'OFF');
    setStructuredToggle(customPadToggle,'下部パッド',customPadVisible?'ON':'OFF');
    if(nativePadVisible)showNativeVirtualControls();else hideNativeVirtualControls();
    syncFallbackMenu();
  }
  nativePadToggle?.addEventListener('click',()=>{nativePadVisible=!nativePadVisible;localStorage.setItem(NATIVE_PAD_KEY,nativePadVisible?'1':'0');applyPadVisibility();});
  customPadToggle?.addEventListener('click',()=>{customPadVisible=!customPadVisible;localStorage.setItem(CUSTOM_PAD_KEY,customPadVisible?'1':'0');applyPadVisibility();});

  const turbo=$('turboToggle');
  if(turbo)new MutationObserver(()=>{if(turbo.querySelector('span')&&turbo.querySelector('b'))return;const on=(turbo.textContent||'').toUpperCase().includes('ON');setStructuredToggle(turbo,'連打',on?'ON':'OFF');}).observe(turbo,{childList:true,subtree:true,characterData:true});
  $('layoutEditToggle')?.addEventListener('click',()=>requestAnimationFrame(()=>{if(snesController?.classList.contains('editing'))closeMenu();}));

  const translations=new Map([
    ['Save State','ステート保存'],['Load State','ステート読込'],['Save','保存'],['Load','読込'],['Settings','設定'],['Controls','操作設定'],['Control Settings','操作設定'],['Cheats','チート'],['Fullscreen','全画面'],['Restart','再起動'],['Reset','リセット'],['Pause','一時停止'],['Resume','再開'],['Exit','終了'],['Mute','消音'],['Unmute','消音解除'],['Volume','音量'],['Fast Forward','早送り'],['Screenshot','スクリーンショット'],['Close','閉じる'],['Back','戻る'],['Gamepad','ゲームパッド'],['Keyboard','キーボード'],['Cache Manager','キャッシュ管理'],['Export Save File','セーブを書き出す'],['Import Save File','セーブを読み込む'],['Context Menu','コンテキストメニュー']
  ]);
  function translateNode(root){if(!root)return;const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(w.nextNode())nodes.push(w.currentNode);for(const n of nodes){const raw=n.nodeValue,key=raw?.trim();if(key&&translations.has(key))n.nodeValue=raw.replace(key,translations.get(key));}}
  function visible(el){if(!el||!(el instanceof HTMLElement))return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'&&r.width>20&&r.height>20;}

  function discoverNativeHamburger(){
    if(!gameRoot)return;
    const candidates=[...gameRoot.querySelectorAll('button,[role="button"],div')].filter(el=>visible(el)&&el.getBoundingClientRect().width<96&&el.getBoundingClientRect().height<96);
    const found=candidates.find(el=>{
      const label=`${el.getAttribute('aria-label')||''} ${el.getAttribute('title')||''}`.toLowerCase();
      if(label.includes('menu')||label.includes('setting'))return true;
      if(el.matches('button,[role="button"]')){const text=(el.textContent||'').trim(),bars=el.querySelectorAll('span,div').length;return text.length===0&&bars>=3;}
      return false;
    });
    if(found)nativeMenuButton=found;
    syncFallbackMenu();
  }
  function findNativeMenuPanel(){
    if(!gameRoot)return null;
    const keywords=['設定','操作設定','ステート保存','全画面','チート','Settings','Controls','Save State','Fullscreen'];
    const candidates=[...gameRoot.querySelectorAll('div,section,aside')].filter(el=>{if(!visible(el))return false;const text=(el.innerText||'').slice(0,1200);return keywords.some(k=>text.includes(k))&&el.querySelectorAll('button,[role="button"]').length>=2;});
    if(!candidates.length)return null;
    nativeMenuPanel=candidates.sort((a,b)=>a.getBoundingClientRect().width*a.getBoundingClientRect().height-b.getBoundingClientRect().width*b.getBoundingClientRect().height)[0];return nativeMenuPanel;
  }
  function injectIntoNativeMenu(){
    if(document.body.classList.contains('menu-open'))return;
    const panel=findNativeMenuPanel();if(!panel||panel.querySelector('.retro-native-menu-entry'))return;
    const entry=document.createElement('button');entry.type='button';entry.className='retro-native-menu-entry';entry.innerHTML='<span><strong>Retro Pocket 設定</strong><br><small>保存・チート・速度・操作配置</small></span><span class="retro-arrow">›</span>';
    entry.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();nativeMenuPanel=panel;panel.classList.add('retro-native-menu-suspended');requestAnimationFrame(openMenu);});panel.appendChild(entry);
  }

  function enhanceNativeUi(){enhanceQueued=false;if(!gameRoot)return;translateNode(gameRoot);discoverNativeHamburger();injectIntoNativeMenu();applyPadVisibility();}
  function queueEnhance(){if(enhanceQueued)return;enhanceQueued=true;requestAnimationFrame(enhanceNativeUi);}
  if(gameRoot){const mo=new MutationObserver(queueEnhance);mo.observe(gameRoot,{childList:true,subtree:true,characterData:true});}
  if(player)new MutationObserver(syncPlayerMode).observe(player,{attributes:true,attributeFilter:['class']});
  syncPlayerMode();ensureFallbackButton();applyPadVisibility();setStructuredToggle(turbo,'連打','OFF');
  [250,600,1200,2400,4800,8000].forEach(ms=>setTimeout(queueEnhance,ms));
  window.addEventListener('orientationchange',()=>setTimeout(()=>{if(document.body.classList.contains('player-active'))window.scrollTo(0,0);queueEnhance();},80));
})();