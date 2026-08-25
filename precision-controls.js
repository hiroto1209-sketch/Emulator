(() => {
  const controller=document.getElementById('snesController');
  const canvas=document.getElementById('layoutCanvas');
  if(!controller||!canvas)return;

  const VERSION=5;
  const PREFIX='retro-pocket-precision-layout-v5-';
  const MIGRATION_KEY='retro-pocket-controller-v5-flat-migration';
  const pointers=new Map();
  const shells=[];
  let state={},defaultsByOrientation={},active=null,raf=0,toast=null,resizeTimer=0;

  const orientation=()=>matchMedia('(orientation: landscape)').matches?'landscape':'portrait';
  const storageKey=()=>PREFIX+orientation();
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const canvasRect=()=>canvas.getBoundingClientRect();
  const centerOf=el=>{const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};};

  function disableLegacyEditors(){
    controller.querySelectorAll('.control-unit').forEach(unit=>{
      unit.onpointerdown=null;unit.onpointermove=null;unit.onpointerup=null;
      unit.onpointercancel=null;unit.onlostpointercapture=null;
    });
  }

  function clearLegacyStorageOnce(){
    if(localStorage.getItem(MIGRATION_KEY)==='done')return;
    ['portrait','landscape'].forEach(o=>{
      localStorage.removeItem('retro-pocket-layout-v3-'+o);
      localStorage.removeItem('retro-pocket-precision-layout-v3-'+o);
      localStorage.removeItem('retro-pocket-precision-layout-v4-'+o);
    });
    localStorage.setItem(MIGRATION_KEY,'done');
  }

  function flattenControls(){
    const cr=canvasRect();
    const controls=[...controller.querySelectorAll('[data-control]')];
    const captured=controls.map(el=>{
      const r=el.getBoundingClientRect();
      return{el,id:el.dataset.control,rect:r,x:(r.left+r.width/2-cr.left)/Math.max(1,cr.width),y:(r.top+r.height/2-cr.top)/Math.max(1,cr.height),w:r.width/Math.max(1,cr.width),h:r.height/Math.max(1,cr.height)};
    });

    captured.forEach(c=>{
      const shell=document.createElement('div');
      shell.className='v5-control-shell';
      shell.dataset.v5Control=c.id;
      shell.style.left=`${c.x*100}%`;
      shell.style.top=`${c.y*100}%`;
      shell.style.width=`${c.w*100}%`;
      shell.style.height=`${c.h*100}%`;
      shell.dataset.baseW=String(c.w);
      shell.dataset.baseH=String(c.h);
      canvas.appendChild(shell);
      shell.appendChild(c.el);
      c.el.classList.add('v5-flat-control');
      c.el.style.transform='none';
      c.el.dataset.sizeLabel='100%';
      shells.push(shell);
    });

    controller.querySelectorAll('.control-unit').forEach(unit=>unit.classList.add('v5-legacy-host'));
  }

  function captureCurrentState(resetScale=false){
    const cr=canvasRect(),out={};
    shells.forEach(shell=>{
      const id=shell.dataset.v5Control;
      const r=shell.getBoundingClientRect();
      const scale=resetScale?1:(state[id]?.scale||1);
      out[id]={
        x:clamp((r.left+r.width/2-cr.left)/Math.max(1,cr.width),0,1),
        y:clamp((r.top+r.height/2-cr.top)/Math.max(1,cr.height),0,1),
        w:Number(shell.dataset.baseW)||r.width/Math.max(1,cr.width),
        h:Number(shell.dataset.baseH)||r.height/Math.max(1,cr.height),
        scale
      };
    });
    return out;
  }

  function save(){
    localStorage.setItem(storageKey(),JSON.stringify({version:VERSION,controls:state}));
  }

  function load(){
    try{
      const v=JSON.parse(localStorage.getItem(storageKey()));
      if(v?.version===VERSION&&v.controls)return v.controls;
    }catch{}
    const o=orientation();
    if(!defaultsByOrientation[o])defaultsByOrientation[o]=captureCurrentState(true);
    return JSON.parse(JSON.stringify(defaultsByOrientation[o]));
  }

  function globalScale(){
    const input=document.getElementById('controllerScale');
    const n=Number(input?.value||100)/100;
    return Number.isFinite(n)&&n>.2?n:1;
  }

  function totalScale(s){return clamp((s?.scale||1)*globalScale(),.35,2.7);}

  function renderShell(shell){
    const s=state[shell.dataset.v5Control];if(!s)return;
    shell.style.left=`${s.x*100}%`;
    shell.style.top=`${s.y*100}%`;
    shell.style.width=`${(s.w||Number(shell.dataset.baseW)||.1)*100}%`;
    shell.style.height=`${(s.h||Number(shell.dataset.baseH)||.1)*100}%`;
    shell.style.transform=`translate3d(-50%,-50%,0) scale(${totalScale(s)})`;
    const child=shell.querySelector('[data-control]');
    if(child)child.dataset.sizeLabel=`${Math.round((s.scale||1)*100)}%`;
  }
  const renderAll=()=>shells.forEach(renderShell);

  function viewportPointToNormalized(shell,point,nextScale){
    const cr=canvasRect(),s=state[shell.dataset.v5Control]||{};
    const baseW=(s.w||Number(shell.dataset.baseW)||.1)*cr.width;
    const baseH=(s.h||Number(shell.dataset.baseH)||.1)*cr.height;
    const ts=clamp((nextScale||s.scale||1)*globalScale(),.35,2.7);
    const halfW=Math.min(cr.width/2,baseW*ts/2);
    const halfH=Math.min(cr.height/2,baseH*ts/2);
    const x=clamp(point.x,cr.left+halfW,cr.right-halfW);
    const y=clamp(point.y,cr.top+halfH,cr.bottom-halfH);
    return{x:(x-cr.left)/Math.max(1,cr.width),y:(y-cr.top)/Math.max(1,cr.height)};
  }

  function showToast(){
    if(toast)return;
    toast=document.createElement('div');toast.className='precision-edit-toast';
    toast.textContent='スティックと同じ操作：1本指で移動 ・ 2本指でサイズ変更';
    document.body.appendChild(toast);
  }
  function hideToast(){toast?.remove();toast=null;}

  function beginDrag(shell,p){
    const id=shell.dataset.v5Control;if(!state[id])return;
    const c=centerOf(shell);
    active={shell,id,mode:'drag',grabOffset:{x:c.x-p.x,y:c.y-p.y}};
    shell.classList.add('precision-active');
  }

  function beginPinch(){
    if(!active||pointers.size<2)return;
    const pts=[...pointers.values()],a=pts[0],b=pts[1],mid=midpoint(a,b);
    const c=centerOf(active.shell),s=state[active.id];
    active.mode='pinch';
    active.pinch={
      distance:Math.max(10,distance(a,b)),
      startScale:s.scale||1,
      centerFromMid:{x:c.x-mid.x,y:c.y-mid.y}
    };
  }

  function rebaseDrag(){
    if(!active)return;
    if(pointers.size>=2){beginPinch();return;}
    const p=[...pointers.values()][0];if(!p)return;
    const c=centerOf(active.shell);
    active.mode='drag';active.grabOffset={x:c.x-p.x,y:c.y-p.y};delete active.pinch;
  }

  function update(){
    raf=0;
    if(!active||!controller.classList.contains('editing'))return;
    const pts=[...pointers.values()],s=state[active.id];if(!s)return;

    if(pts.length>=2){
      if(active.mode!=='pinch'||!active.pinch)beginPinch();
      const a=pts[0],b=pts[1],mid=midpoint(a,b),pin=active.pinch;
      const nextScale=clamp(pin.startScale*(distance(a,b)/pin.distance),.5,2.0);
      const ratio=nextScale/pin.startScale;
      const target={x:mid.x+pin.centerFromMid.x*ratio,y:mid.y+pin.centerFromMid.y*ratio};
      const n=viewportPointToNormalized(active.shell,target,nextScale);
      s.x=n.x;s.y=n.y;s.scale=nextScale;
    }else if(pts.length===1){
      if(active.mode!=='drag')rebaseDrag();
      const p=pts[0];
      const target={x:p.x+active.grabOffset.x,y:p.y+active.grabOffset.y};
      const n=viewportPointToNormalized(active.shell,target,s.scale||1);
      s.x=n.x;s.y=n.y;
    }
    renderShell(active.shell);
  }
  const queue=()=>{if(!raf)raf=requestAnimationFrame(update);};

  canvas.addEventListener('pointerdown',e=>{
    if(!controller.classList.contains('editing'))return;
    const shell=e.target.closest?.('.v5-control-shell');
    if(!active&&!shell)return;
    e.preventDefault();e.stopImmediatePropagation();
    try{canvas.setPointerCapture(e.pointerId);}catch{}
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(!active)beginDrag(shell,pointers.get(e.pointerId));
    else if(pointers.size>=2)beginPinch();
  },{capture:true,passive:false});

  canvas.addEventListener('pointermove',e=>{
    if(!controller.classList.contains('editing')||!pointers.has(e.pointerId))return;
    e.preventDefault();e.stopImmediatePropagation();
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});queue();
  },{capture:true,passive:false});

  const finish=e=>{
    if(!pointers.has(e.pointerId))return;
    if(controller.classList.contains('editing')){e.preventDefault();e.stopImmediatePropagation();}
    pointers.delete(e.pointerId);
    if(!pointers.size){
      active?.shell.classList.remove('precision-active');active=null;save();
    }else rebaseDrag();
  };
  canvas.addEventListener('pointerup',finish,{capture:true,passive:false});
  canvas.addEventListener('pointercancel',finish,{capture:true,passive:false});
  canvas.addEventListener('lostpointercapture',finish,{capture:true,passive:false});

  function syncEditingState(){
    disableLegacyEditors();
    const editing=controller.classList.contains('editing');
    if(editing){
      showToast();canvas.style.touchAction='none';
      shells.forEach(shell=>shell.classList.add('precision-editable'));
    }else{
      hideToast();pointers.clear();active?.shell.classList.remove('precision-active');active=null;
      canvas.style.touchAction='';shells.forEach(shell=>shell.classList.remove('precision-active','precision-editable'));save();
    }
  }

  new MutationObserver(syncEditingState).observe(controller,{attributes:true,attributeFilter:['class']});

  document.getElementById('layoutReset')?.addEventListener('click',e=>{
    e.stopImmediatePropagation();
    const o=orientation();
    state=JSON.parse(JSON.stringify(defaultsByOrientation[o]||captureCurrentState(true)));
    save();renderAll();
  },{capture:true});
  document.getElementById('layoutSave')?.addEventListener('click',save);
  document.getElementById('layoutDone')?.addEventListener('click',save);
  document.getElementById('controllerScale')?.addEventListener('input',()=>requestAnimationFrame(()=>{
    shells.forEach(shell=>{
      const s=state[shell.dataset.v5Control];if(!s)return;
      const c=centerOf(shell),n=viewportPointToNormalized(shell,c,s.scale||1);s.x=n.x;s.y=n.y;
    });
    renderAll();
  }));

  function reflow(){
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{
      disableLegacyEditors();
      const o=orientation();
      const stored=(()=>{try{const v=JSON.parse(localStorage.getItem(storageKey()));return v?.version===VERSION?v.controls:null;}catch{return null;}})();
      if(stored)state=stored;
      else{
        defaultsByOrientation[o]=captureCurrentState(true);
        state=JSON.parse(JSON.stringify(defaultsByOrientation[o]));
      }
      renderAll();
    },220);
  }
  window.addEventListener('orientationchange',reflow);
  window.addEventListener('resize',()=>{if(!controller.classList.contains('editing'))reflow();});

  clearLegacyStorageOnce();
  disableLegacyEditors();
  flattenControls();
  defaultsByOrientation[orientation()]=captureCurrentState(true);
  state=load();
  renderAll();
  syncEditingState();
})();
