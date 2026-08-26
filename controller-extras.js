(() => {
  const $=id=>document.getElementById(id);
  const ROOT=document.documentElement;
  const MODE_KEY='retro-pocket-direction-mode-v1';
  const RESTART_KEY='retro-pocket-restart-current-rom-v1';
  const VALID=new Set(['stick','dpad','both']);
  let mode=localStorage.getItem(MODE_KEY)||'both';
  if(!VALID.has(mode))mode='both';

  function openMenu(){
    $('gameMenuDrawer')?.classList.remove('hidden');
    $('menuBackdrop')?.classList.remove('hidden');
    document.body.classList.add('menu-open');
  }

  const menuButton=$('controllerMenuButton');
  menuButton?.addEventListener('click',e=>{
    if($('snesController')?.classList.contains('editing'))return;
    e.preventDefault();e.stopPropagation();openMenu();
  });

  function hideGameMenuButtons(){
    document.querySelectorAll('.retro-fallback-menu-button').forEach(el=>el.classList.add('retro-menu-relocated'));
    const root=$('game');if(!root)return;
    [...root.querySelectorAll('button,[role="button"],div')].forEach(el=>{
      if(el.classList.contains('retro-native-menu-entry'))return;
      const r=el.getBoundingClientRect?.();if(!r||r.width<24||r.height<24||r.width>100||r.height>100)return;
      const label=`${el.getAttribute?.('aria-label')||''} ${el.getAttribute?.('title')||''}`.toLowerCase();
      const text=(el.textContent||'').trim();
      const bars=el.querySelectorAll?.('span,div')?.length||0;
      if(label.includes('menu')||label.includes('setting')||(text.length===0&&bars>=3))el.classList.add('retro-menu-relocated');
    });
  }
  const game=$('game');
  if(game)new MutationObserver(()=>requestAnimationFrame(hideGameMenuButtons)).observe(game,{childList:true,subtree:true});
  [0,250,700,1500,3000,6000].forEach(ms=>setTimeout(hideGameMenuButtons,ms));

  function modeLabel(v){return v==='stick'?'スティック':v==='dpad'?'十字キー':'両方';}
  function syncDirectionMode(){
    ROOT.dataset.directionMode=mode;
    const b=$('directionModeToggle');
    if(b){
      let s=b.querySelector('span'),strong=b.querySelector('b');
      if(!s||!strong){b.innerHTML='<span></span><b></b>';s=b.querySelector('span');strong=b.querySelector('b');}
      s.textContent='方向操作';strong.textContent=modeLabel(mode);
    }
    window.dispatchEvent(new CustomEvent('retro-direction-mode-change',{detail:{mode}}));
  }
  $('directionModeToggle')?.addEventListener('click',()=>{
    mode=mode==='stick'?'dpad':mode==='dpad'?'both':'stick';
    localStorage.setItem(MODE_KEY,mode);syncDirectionMode();
  });
  syncDirectionMode();

  function removeEnglishStudy(){
    document.querySelectorAll('#englishStudyEntry,#englishStudyButton,[data-english-study],.english-study-entry').forEach(el=>el.remove());
    document.querySelectorAll('#gameMenuDrawer button').forEach(b=>{if(/英語学習/.test(b.textContent||''))b.remove();});
  }
  const drawer=$('gameMenuDrawer');
  if(drawer)new MutationObserver(removeEnglishStudy).observe(drawer,{childList:true,subtree:true});
  removeEnglishStudy();

  const restart=$('reloadGame');
  if(restart){
    restart.onclick=e=>{
      e?.preventDefault?.();
      try{sessionStorage.setItem(RESTART_KEY,'1');}catch{}
      location.reload();
    };
  }

  async function resumeRestart(){
    let requested=false;
    try{requested=sessionStorage.getItem(RESTART_KEY)==='1';if(requested)sessionStorage.removeItem(RESTART_KEY);}catch{}
    if(!requested)return;
    for(let i=0;i<30;i++){
      const b=$('continueGame');
      if(b&&!b.classList.contains('hidden')){b.click();return;}
      await new Promise(r=>setTimeout(r,120));
    }
  }
  window.addEventListener('load',()=>setTimeout(resumeRestart,80),{once:true});
})();
