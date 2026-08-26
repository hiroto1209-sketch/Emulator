(() => {
  const $=id=>document.getElementById(id);
  const ROOT=document.documentElement;
  const MODE_KEY='retro-pocket-direction-mode-v1';
  const RESTART_KEY='retro-pocket-restart-current-rom-v1';
  const CLEANUP_KEY='retro-pocket-study-cleanup-v1';
  const VALID=new Set(['stick','dpad','both']);
  let mode=localStorage.getItem(MODE_KEY)||'both';
  if(!VALID.has(mode))mode='both';

  function purgeRetiredStudyData(){
    if(localStorage.getItem(CLEANUP_KEY)==='1')return;
    try{indexedDB.deleteDatabase('retro-pocket-study-db');}catch{}
    try{[...Array(localStorage.length)].forEach((_,i)=>{const k=localStorage.key(i);if(k&&/(english.?study|subtitle|simple.?subtitles|live.?study)/i.test(k))localStorage.removeItem(k);});}catch{}
    localStorage.setItem(CLEANUP_KEY,'1');
  }
  purgeRetiredStudyData();

  function openMenu(){$('gameMenuDrawer')?.classList.remove('hidden');$('menuBackdrop')?.classList.remove('hidden');document.body.classList.add('menu-open');}
  $('controllerMenuButton')?.addEventListener('click',e=>{if($('snesController')?.classList.contains('editing'))return;e.preventDefault();e.stopPropagation();openMenu();});

  function hideNativeMenuOnce(){
    const root=$('game');if(!root)return;
    const candidates=root.querySelectorAll('button,[role="button"],[aria-label*="menu" i],[aria-label*="setting" i],[title*="menu" i],[title*="setting" i]');
    candidates.forEach(el=>{
      if(el.classList.contains('retro-native-menu-entry'))return;
      const r=el.getBoundingClientRect?.();if(!r||r.width<24||r.height<24||r.width>100||r.height>100)return;
      const label=`${el.getAttribute?.('aria-label')||''} ${el.getAttribute?.('title')||''}`.toLowerCase();
      const text=(el.textContent||'').trim();const bars=el.querySelectorAll?.('span,div')?.length||0;
      if(label.includes('menu')||label.includes('setting')||(text.length===0&&bars>=3))el.classList.add('retro-menu-relocated');
    });
  }
  [700,1800,4000].forEach(ms=>setTimeout(hideNativeMenuOnce,ms));

  const modeLabel=v=>v==='stick'?'スティック':v==='dpad'?'十字キー':'両方';
  function syncDirectionMode(){
    ROOT.dataset.directionMode=mode;
    const b=$('directionModeToggle');if(b){let s=b.querySelector('span'),strong=b.querySelector('b');if(!s||!strong){b.innerHTML='<span></span><b></b>';s=b.querySelector('span');strong=b.querySelector('b');}s.textContent='方向操作';strong.textContent=modeLabel(mode);}
    window.dispatchEvent(new CustomEvent('retro-direction-mode-change',{detail:{mode}}));
  }
  $('directionModeToggle')?.addEventListener('click',()=>{mode=mode==='stick'?'dpad':mode==='dpad'?'both':'stick';localStorage.setItem(MODE_KEY,mode);syncDirectionMode();});
  syncDirectionMode();

  const restart=$('reloadGame');
  if(restart)restart.onclick=e=>{e?.preventDefault?.();try{sessionStorage.setItem(RESTART_KEY,'1');}catch{}location.reload();};

  async function resumeRestart(){
    let requested=false;try{requested=sessionStorage.getItem(RESTART_KEY)==='1';if(requested)sessionStorage.removeItem(RESTART_KEY);}catch{}
    if(!requested)return;
    for(let i=0;i<40;i++){
      try{if(typeof window.loadCachedRom==='function'&&typeof window.bootRom==='function'){const file=await window.loadCachedRom();if(file){window.bootRom(file,{fromCache:true,autoState:false});return;}}}catch{}
      await new Promise(r=>setTimeout(r,100));
    }
    const b=$('continueGame');if(b&&!b.classList.contains('hidden'))b.click();
  }
  window.addEventListener('load',()=>setTimeout(resumeRestart,80),{once:true});
})();