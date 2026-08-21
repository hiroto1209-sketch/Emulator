(() => {
  const $ = (id) => document.getElementById(id);
  const player = $('playerView'), drawer = $('gameMenuDrawer'), backdrop = $('menuBackdrop');
  const closeButton = $('gameMenuClose'), snesController = $('snesController'), menuGameTitle = $('menuGameTitle');
  const gameRoot = $('game'), nativePadToggle = $('nativePadToggle'), customPadToggle = $('customPadToggle');
  const NATIVE_PAD_KEY='retro-pocket-native-pad-v1', CUSTOM_PAD_KEY='retro-pocket-custom-pad-v1';
  let nativePadVisible=localStorage.getItem(NATIVE_PAD_KEY)==='1';
  let customPadVisible=localStorage.getItem(CUSTOM_PAD_KEY)!=='0';
  let nativeMenuButton=null, nativeMenuPanel=null;

  const setStructuredToggle=(button,label,value)=>{
    if(!button)return;
    const span=button.querySelector('span'), b=button.querySelector('b');
    if(span&&b){span.textContent=label;b.textContent=value;}
    else button.textContent=`${label} ${value}`;
  };

  function syncPlayerMode(){
    const playing=player&&!player.classList.contains('hidden');
    document.body.classList.toggle('player-active',!!playing);
    if(playing){window.scrollTo(0,0);const title=$('nowPlaying')?.textContent?.trim();if(title&&menuGameTitle)menuGameTitle.textContent=title;}
  }
  function openMenu(){
    hideNativeMenu();
    drawer?.classList.remove('hidden');backdrop?.classList.remove('hidden');document.body.classList.add('menu-open');
    const title=$('nowPlaying')?.textContent?.trim();if(title&&menuGameTitle)menuGameTitle.textContent=title;
  }
  function closeMenu(){drawer?.classList.add('hidden');backdrop?.classList.add('hidden');document.body.classList.remove('menu-open');}
  closeButton?.addEventListener('click',closeMenu);backdrop?.addEventListener('click',closeMenu);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});

  function applyPadVisibility(){
    gameRoot?.classList.toggle('retro-native-pad-off',!nativePadVisible);
    document.body.classList.toggle('custom-pad-off',!customPadVisible);
    nativePadToggle?.classList.toggle('active',nativePadVisible);customPadToggle?.classList.toggle('active',customPadVisible);
    setStructuredToggle(nativePadToggle,'画面内パッド',nativePadVisible?'ON':'OFF');
    setStructuredToggle(customPadToggle,'下部パッド',customPadVisible?'ON':'OFF');
    if(!nativePadVisible) hideNativeVirtualControls();
  }
  nativePadToggle?.addEventListener('click',()=>{nativePadVisible=!nativePadVisible;localStorage.setItem(NATIVE_PAD_KEY,nativePadVisible?'1':'0');applyPadVisibility();});
  customPadToggle?.addEventListener('click',()=>{customPadVisible=!customPadVisible;localStorage.setItem(CUSTOM_PAD_KEY,customPadVisible?'1':'0');applyPadVisibility();});

  $('layoutEditToggle')?.addEventListener('click',()=>requestAnimationFrame(()=>{if(snesController?.classList.contains('editing'))closeMenu();}));

  const translations=new Map([
    ['Save State','ステート保存'],['Load State','ステート読込'],['Save','保存'],['Load','読込'],['Settings','設定'],
    ['Controls','操作設定'],['Control Settings','操作設定'],['Cheats','チート'],['Fullscreen','全画面'],['Restart','再起動'],
    ['Reset','リセット'],['Pause','一時停止'],['Resume','再開'],['Exit','終了'],['Mute','消音'],['Unmute','消音解除'],
    ['Volume','音量'],['Fast Forward','早送り'],['Screenshot','スクリーンショット'],['Close','閉じる'],['Back','戻る'],
    ['Gamepad','ゲームパッド'],['Keyboard','キーボード'],['Cache Manager','キャッシュ管理'],['Export Save File','セーブを書き出す'],
    ['Import Save File','セーブを読み込む'],['Context Menu','コンテキストメニュー']
  ]);
  function translateNode(root){if(!root)return;const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(w.nextNode())nodes.push(w.currentNode);for(const n of nodes){const raw=n.nodeValue,key=raw?.trim();if(key&&translations.has(key))n.nodeValue=raw.replace(key,translations.get(key));}}
  function visible(el){if(!el||!(el instanceof HTMLElement))return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>20&&r.height>20;}

  function hideNativeVirtualControls(){
    if(!gameRoot)return;
    const unwanted=/^(select|start|fast|rewind|slow|l|r|a|b|x|y|▲|▼|◀|▶)$/i;
    gameRoot.querySelectorAll('button,[role="button"]').forEach(el=>{
      if(el===nativeMenuButton)return;
      const text=(el.textContent||'').trim();
      const label=`${el.getAttribute('aria-label')||''} ${el.getAttribute('title')||''}`.trim();
      const isMenu=/menu|setting|設定/i.test(label);
      if(isMenu)return;
      if(unwanted.test(text)||/virtual.*gamepad|gamepad.*button|control.*button/i.test(`${el.className||''} ${el.id||''}`)) el.classList.add('retro-force-hide-native-control');
    });
    gameRoot.querySelectorAll('[id*="virtualGamepad"],[class*="virtualGamepad"],[class*="virtual-gamepad"]').forEach(el=>el.classList.add('retro-force-hide-native-control'));
  }

  function discoverNativeHamburger(){
    if(!gameRoot)return;
    const candidates=[...gameRoot.querySelectorAll('button,[role="button"]')].filter(visible);
    nativeMenuButton=candidates.find(el=>{
      const label=`${el.getAttribute('aria-label')||''} ${el.getAttribute('title')||''}`.toLowerCase();
      if(label.includes('menu')||label.includes('setting'))return true;
      const text=(el.textContent||'').trim(),bars=el.querySelectorAll('span,div').length;
      return text.length===0&&bars>=3&&el.getBoundingClientRect().width<90;
    })||nativeMenuButton;
  }
  function findNativeMenuPanel(){
    if(!gameRoot)return null;
    const keywords=['設定','操作設定','ステート保存','全画面','チート','Settings','Controls','Save State','Fullscreen'];
    const candidates=[...gameRoot.querySelectorAll('div,section,aside')].filter(el=>{
      if(!visible(el)||el.closest('#gameMenuDrawer'))return false;
      const text=(el.innerText||'').slice(0,1200);return keywords.some(k=>text.includes(k))&&el.querySelectorAll('button,[role="button"]').length>=2;
    });
    if(!candidates.length)return null;
    nativeMenuPanel=candidates.sort((a,b)=>a.getBoundingClientRect().width*a.getBoundingClientRect().height-b.getBoundingClientRect().width*b.getBoundingClientRect().height)[0];
    return nativeMenuPanel;
  }
  function hideNativeMenu(){
    if(nativeMenuPanel){nativeMenuPanel.classList.add('retro-native-menu-suspended');return;}
    const p=findNativeMenuPanel();if(p)p.classList.add('retro-native-menu-suspended');
  }
  function injectIntoNativeMenu(){
    discoverNativeHamburger();const panel=findNativeMenuPanel();if(!panel||panel.querySelector('.retro-native-menu-entry'))return;
    panel.classList.remove('retro-native-menu-suspended');
    const entry=document.createElement('button');entry.type='button';entry.className='retro-native-menu-entry';
    entry.innerHTML='<span><strong>Retro Pocket 設定</strong><br><small>保存・チート・速度・操作配置</small></span><span class="retro-arrow">›</span>';
    entry.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();nativeMenuPanel=panel;panel.classList.add('retro-native-menu-suspended');setTimeout(openMenu,0);});
    panel.appendChild(entry);
  }

  if(gameRoot){
    const mo=new MutationObserver(()=>{translateNode(gameRoot);discoverNativeHamburger();injectIntoNativeMenu();applyPadVisibility();});
    mo.observe(gameRoot,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style']});
  }
  if(player)new MutationObserver(syncPlayerMode).observe(player,{attributes:true,attributeFilter:['class']});
  syncPlayerMode();applyPadVisibility();
  [250,600,1200,2400,4800].forEach(ms=>setTimeout(()=>{discoverNativeHamburger();injectIntoNativeMenu();applyPadVisibility();},ms));
  window.addEventListener('orientationchange',()=>setTimeout(()=>{if(document.body.classList.contains('player-active'))window.scrollTo(0,0);applyPadVisibility();},80));
})();