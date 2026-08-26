(() => {
  const controller=document.getElementById('snesController');
  const canvas=document.getElementById('layoutCanvas');
  const player=document.getElementById('playerView');
  if(!controller||!canvas)return;

  const VERSION=7, PREFIX='retro-pocket-precision-layout-v7-';
  const pointers=new Map(), shells=[];
  let state={}, defaults={}, active=null, raf=0, toast=null, confirmButton=null, initialized=false, resizeTimer=0;
  const orientation=()=>matchMedia('(orientation: landscape)').matches?'landscape':'portrait';
  const key=()=>PREFIX+orientation();
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const rect=()=>canvas.getBoundingClientRect();
  const center=el=>{const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};};

  function disableLegacy(){controller.querySelectorAll('.control-unit').forEach(u=>{u.onpointerdown=u.onpointermove=u.onpointerup=u.onpointercancel=u.onlostpointercapture=null;});}
  function clearOlderLayouts(){
    if(localStorage.getItem('retro-pocket-v7-migrated'))return;
    ['portrait','landscape'].forEach(o=>{
      ['retro-pocket-layout-v3-','retro-pocket-precision-layout-v3-','retro-pocket-precision-layout-v4-','retro-pocket-precision-layout-v5-','retro-pocket-precision-layout-v6-'].forEach(p=>localStorage.removeItem(p+o));
    });
    localStorage.setItem('retro-pocket-v7-migrated','1');
  }
  function visible(){const r=rect();return r.width>100&&r.height>100&&player&&!player.classList.contains('hidden');}

  function flatten(){
    const cr=rect(), controls=[...controller.querySelectorAll('[data-control]')];
    const captured=controls.map(el=>{const r=el.getBoundingClientRect();return{el,id:el.dataset.control,x:(r.left+r.width/2-cr.left)/cr.width,y:(r.top+r.height/2-cr.top)/cr.height,w:Math.max(.025,r.width/cr.width),h:Math.max(.025,r.height/cr.height)};});
    captured.forEach(c=>{
      const s=document.createElement('div');
      s.className='v5-control-shell';s.dataset.v5Control=c.id;s.dataset.baseW=c.w;s.dataset.baseH=c.h;
      s.style.left=`${c.x*100}%`;s.style.top=`${c.y*100}%`;s.style.width=`${c.w*100}%`;s.style.height=`${c.h*100}%`;
      canvas.appendChild(s);s.appendChild(c.el);c.el.classList.add('v5-flat-control');c.el.style.transform='none';shells.push(s);
    });
    controller.querySelectorAll('.control-unit').forEach(u=>u.classList.add('v5-legacy-host'));
  }

  function capture(){
    const cr=rect(),o={};
    shells.forEach(s=>{const r=s.getBoundingClientRect();o[s.dataset.v5Control]={x:(r.left+r.width/2-cr.left)/cr.width,y:(r.top+r.height/2-cr.top)/cr.height,w:+s.dataset.baseW,h:+s.dataset.baseH,scale:1};});
    return o;
  }
  function load(){
    try{const v=JSON.parse(localStorage.getItem(key()));if(v?.version===VERSION&&v.controls)return v.controls;}catch{}
    const o=orientation();
    return JSON.parse(JSON.stringify(defaults[o]||capture()));
  }
  function save(){if(initialized)localStorage.setItem(key(),JSON.stringify({version:VERSION,controls:state}));}
  function gscale(){return Math.max(.2,Number(document.getElementById('controllerScale')?.value||100)/100);}
  function totalScale(v){return clamp((v?.scale||1)*gscale(),.35,2.7);}

  function fitEntry(v){
    const ts=totalScale(v),hw=Math.min(.49,(v.w||.08)*ts/2),hh=Math.min(.49,(v.h||.08)*ts/2);
    v.x=clamp(Number.isFinite(v.x)?v.x:.5,hw,1-hw);
    v.y=clamp(Number.isFinite(v.y)?v.y:.5,hh,1-hh);
    return v;
  }
  function fitAll(){Object.values(state).forEach(fitEntry);}

  function render(s){
    const v=state[s.dataset.v5Control];if(!v)return;
    fitEntry(v);
    s.style.left=`${v.x*100}%`;s.style.top=`${v.y*100}%`;s.style.width=`${v.w*100}%`;s.style.height=`${v.h*100}%`;
    s.style.transform=`translate3d(-50%,-50%,0) scale(${totalScale(v)})`;
    const c=s.firstElementChild;if(c)c.dataset.sizeLabel=`${Math.round(v.scale*100)}%`;
  }
  const renderAll=()=>shells.forEach(render);

  function norm(s,p,scale){
    const cr=rect(),v=state[s.dataset.v5Control],ts=clamp(scale*gscale(),.35,2.7);
    const hw=Math.min(cr.width/2,v.w*cr.width*ts/2),hh=Math.min(cr.height/2,v.h*cr.height*ts/2);
    return{x:(clamp(p.x,cr.left+hw,cr.right-hw)-cr.left)/cr.width,y:(clamp(p.y,cr.top+hh,cr.bottom-hh)-cr.top)/cr.height};
  }

  function begin(s,p){const c=center(s);active={s,id:s.dataset.v5Control,mode:'drag',off:{x:c.x-p.x,y:c.y-p.y}};s.classList.add('precision-active');}
  function pinch(){if(!active||pointers.size<2)return;const [a,b]=[...pointers.values()],m=mid(a,b),c=center(active.s),v=state[active.id];active.mode='pinch';active.pin={d:Math.max(10,dist(a,b)),scale:v.scale,off:{x:c.x-m.x,y:c.y-m.y}};}
  function rebase(){if(!active)return;if(pointers.size>1)return pinch();const p=[...pointers.values()][0];if(!p)return;const c=center(active.s);active.mode='drag';active.off={x:c.x-p.x,y:c.y-p.y};delete active.pin;}
  function update(){
    raf=0;if(!active||!controller.classList.contains('editing'))return;
    const ps=[...pointers.values()],v=state[active.id];
    if(ps.length>1){
      if(active.mode!=='pinch')pinch();const [a,b]=ps,m=mid(a,b),q=active.pin,ns=clamp(q.scale*dist(a,b)/q.d,.5,2),ratio=ns/q.scale;
      const n=norm(active.s,{x:m.x+q.off.x*ratio,y:m.y+q.off.y*ratio},ns);v.x=n.x;v.y=n.y;v.scale=ns;
    }else if(ps.length===1){
      if(active.mode!=='drag')rebase();const p=ps[0],n=norm(active.s,{x:p.x+active.off.x,y:p.y+active.off.y},v.scale);v.x=n.x;v.y=n.y;
    }
    render(active.s);
  }
  const queue=()=>{if(!raf)raf=requestAnimationFrame(update);};

  canvas.addEventListener('pointerdown',e=>{
    if(!initialized||!controller.classList.contains('editing'))return;
    const s=e.target.closest?.('.v5-control-shell');if(!active&&!s)return;
    e.preventDefault();e.stopImmediatePropagation();try{canvas.setPointerCapture(e.pointerId);}catch{}
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(!active)begin(s,pointers.get(e.pointerId));else pinch();
  },{capture:true,passive:false});
  canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;e.preventDefault();e.stopImmediatePropagation();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});queue();},{capture:true,passive:false});
  const end=e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(!pointers.size){active?.s.classList.remove('precision-active');active=null;fitAll();save();}else rebase();};
  canvas.addEventListener('pointerup',end,{capture:true});canvas.addEventListener('pointercancel',end,{capture:true});canvas.addEventListener('lostpointercapture',end,{capture:true});

  function ensureConfirm(){
    if(confirmButton?.isConnected)return confirmButton;
    confirmButton=document.createElement('button');confirmButton.type='button';confirmButton.className='precision-edit-confirm';confirmButton.textContent='変更を確定';
    confirmButton.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();fitAll();save();document.getElementById('layoutDone')?.click();});
    document.body.appendChild(confirmButton);return confirmButton;
  }

  function sync(){
    if(!initialized)return;disableLegacy();const on=controller.classList.contains('editing');
    document.body.classList.toggle('layout-edit-active',on);
    if(on){
      ensureConfirm();canvas.style.touchAction='none';shells.forEach(s=>s.classList.add('precision-editable'));
      if(!toast){toast=document.createElement('div');toast.className='precision-edit-toast';toast.textContent='1本指で移動 ・ 2本指でサイズ変更';document.body.appendChild(toast);}
    }else{
      canvas.style.touchAction='';shells.forEach(s=>s.classList.remove('precision-editable','precision-active'));toast?.remove();toast=null;pointers.clear();active=null;fitAll();save();
    }
  }
  new MutationObserver(sync).observe(controller,{attributes:true,attributeFilter:['class']});

  document.getElementById('layoutReset')?.addEventListener('click',e=>{if(!initialized)return;e.stopImmediatePropagation();state=JSON.parse(JSON.stringify(defaults[orientation()]||capture()));fitAll();save();renderAll();},{capture:true});
  document.getElementById('layoutSave')?.addEventListener('click',()=>{fitAll();save();});
  document.getElementById('layoutDone')?.addEventListener('click',()=>{fitAll();save();});
  document.getElementById('controllerScale')?.addEventListener('input',()=>initialized&&requestAnimationFrame(()=>{fitAll();renderAll();}));

  function init(){
    if(initialized||!visible())return false;
    clearOlderLayouts();disableLegacy();flatten();
    defaults[orientation()]=capture();state=load();fitAll();defaults[orientation()]=JSON.parse(JSON.stringify(state));
    initialized=true;renderAll();sync();return true;
  }
  function waitForPlayer(){if(init())return;requestAnimationFrame(waitForPlayer);}
  waitForPlayer();

  window.addEventListener('orientationchange',()=>{
    clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{
      if(!initialized)return;
      const o=orientation();
      if(!defaults[o])defaults[o]=JSON.parse(JSON.stringify(state));
      state=load();fitAll();renderAll();
    },320);
  });
})();