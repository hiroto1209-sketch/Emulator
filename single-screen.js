(() => {
  const $ = id => document.getElementById(id);
  const player=$('playerView'), drawer=$('gameMenuDrawer'), backdrop=$('menuBackdrop');
  const closeButton=$('gameMenuClose'), snesController=$('snesController'), menuGameTitle=$('menuGameTitle');
  const gameRoot=$('game'), nativePadToggle=$('nativePadToggle'), customPadToggle=$('customPadToggle');
  const NATIVE_PAD_KEY='retro-pocket-native-pad-v1', CUSTOM_PAD_KEY='retro-pocket-custom-pad-v1';
  let nativePadVisible=localStorage.getItem(NATIVE_PAD_KEY)==='1';
  let customPadVisible=localStorage.getItem(CUSTOM_PAD_KEY)!=='0';
  let fallbackButton=null;

  const setStructuredToggle=(button,label,value)=>{
    if(!button)return;
    let span=button.querySelector('span'),b=button.querySelector('b');
    if(!span||!b){button.innerHTML='';span=document.createElement('span');b=document.createElement('b');button.append(span,b);}
    span.textContent=label;b.textContent=value;
  };

  function openMenu(){
    drawer?.classList.remove('hidden');backdrop?.classList.remove('hidden');document.body.classList.add('menu-open');
    const title=$('nowPlaying')?.textContent?.trim();if(title&&menuGameTitle)menuGameTitle.textContent=title;
  }
  function closeMenu(){drawer?.classList.add('hidden');backdrop?.classList.add('hidden');document.body.classList.remove('menu-open');}
  closeButton?.addEventListener('click',closeMenu);backdrop?.addEventListener('click',closeMenu);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});

  function ensureFallbackButton(){
    if(fallbackButton?.isConnected)return fallbackButton;
    fallbackButton=document.createElement('button');fallbackButton.type='button';fallbackButton.className='retro-fallback-menu-button';fallbackButton.setAttribute('aria-label','Retro Pocket 設定');
    fallbackButton.innerHTML='<span></span><span></span><span></span>';
    fallbackButton.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openMenu();});
    document.querySelector('.fixed-stage')?.appendChild(fallbackButton);return fallbackButton;
  }
  function syncFallbackMenu(){
    const b=ensureFallbackButton();if(!b)return;
    const playing=player&&!player.classList.contains('hidden');
    b.classList.toggle('hidden',!playing);
  }

  function syncPlayerMode(){
    const playing=player&&!player.classList.contains('hidden');
    document.body.classList.toggle('player-active',!!playing);
    if(playing){window.scrollTo(0,0);const title=$('nowPlaying')?.textContent?.trim();if(title&&menuGameTitle)menuGameTitle.textContent=title;}
    syncFallbackMenu();
  }

  function showNativeVirtualControls(){gameRoot?.querySelectorAll('.retro-force-hide-native-control').forEach(el=>el.classList.remove('retro-force-hide-native-control'));}
  function hideNativeVirtualControls(){
    if(!gameRoot)return;
    const unwanted=/^(select|start|fast|rewind|slow|l|r|a|b|x|y|▲|▼|◀|▶)$/i;
    gameRoot.querySelectorAll('button,[role="button"]').forEach(el=>{
      const text=(el.textContent||'').trim();
      const label=`${el.getAttribute('aria-label')||''} ${el.getAttribute('title')||''}`.trim();
      if(/menu|setting|設定/i.test(label))return;
      if(unwanted.test(text))el.classList.add('retro-force-hide-native-control');
    });
    gameRoot.querySelectorAll('[id*="virtualGamepad"],[class*="virtualGamepad"],[class*="virtual-gamepad"]').forEach(el=>el.classList.add('retro-force-hide-native-control'));
  }
  function applyPadVisibility(){
    gameRoot?.classList.toggle('retro-native-pad-off',!nativePadVisible);
    document.body.classList.toggle('custom-pad-off',!customPadVisible);
    document.body.classList.toggle('custom-pad-on',customPadVisible);
    document.body.classList.toggle('native-pad-on',nativePadVisible);
    document.body.classList.toggle('native-pad-off',!nativePadVisible);
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

  if(player)new MutationObserver(syncPlayerMode).observe(player,{attributes:true,attributeFilter:['class']});
  syncPlayerMode();ensureFallbackButton();applyPadVisibility();setStructuredToggle(turbo,'連打','OFF');

  [700,1800,4000].forEach(ms=>setTimeout(()=>{if(!nativePadVisible)hideNativeVirtualControls();},ms));
  window.addEventListener('orientationchange',()=>setTimeout(()=>{if(document.body.classList.contains('player-active'))window.scrollTo(0,0);syncFallbackMenu();},80));
})();