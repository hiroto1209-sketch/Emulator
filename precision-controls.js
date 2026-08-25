(() => {
  const controller=document.getElementById('snesController');
  const canvas=document.getElementById('layoutCanvas');
  if(!controller||!canvas)return;

  const PREFIX='retro-pocket-precision-layout-v4-';
  const MIGRATION_KEY='retro-pocket-final-stable-layout-migration-v1';
  const controls=[...controller.querySelectorAll('[data-control]')];
  const pointers=new Map();
  let state={},defaultsState={},active=null,raf=0,toast=null,resizeTimer=0;

  const orientation=()=>matchMedia('(orientation: landscape)').matches?'landscape':'portrait';
  const storageKey=()=>PREFIX+orientation();
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});

  function disableLegacyGroupEditor(){
    controller.querySelectorAll('.control-unit').forEach(unit=>{
      unit.onpointerdown=null;unit.onpointermove=null;unit.onpointerup=null;
      unit.onpointercancel=null;unit.onlostpointercapture=null;
    });
  }

  function migrateLegacyBaseOnce(){
    if(localStorage.getItem(MIGRATION_KEY)==='done')return;
    ['portrait','landscape'].forEach(o=>{
      localStorage.removeItem('retro-pocket-layout-v3-'+o);
      localStorage.removeItem('retro-pocket-precision-layout-v3-'+o);
    });
    localStorage.setItem(MIGRATION_KEY,'done');
    try{window.applySavedLayout?.();}catch{}
  }

  const canvasRect=()=>canvas.getBoundingClientRect();
  function centerOf(el){const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};}
  function ancestorScale(el){
    const unit=el.closest('.control-unit')||el.parentElement;if(!unit)return 1;
    const r=unit.getBoundingClientRect(),w=unit.offsetWidth||r.width,h=unit.offsetHeight||r.height;
    const sx=w?r.width/w:1,sy=h?r.height/h:1,s=(sx+sy)/2;
    return Number.isFinite(s)&&s>.05?s:1;
  }
  function fromNormalized(p){const r=canvasRect();return{x:r.left+p.x*r.width,y:r.top+p.y*r.height};}

  function normalizeFor(el,point,nextScale){
    const cr=canvasRect(),er=el.getBoundingClientRect();
    const currentScale=Math.max(.01,state[el.dataset.control]?.scale||1);
    const ratio=Math.max(.01,(nextScale||currentScale)/currentScale);
    const halfW=Math.min(cr.width/2,er.width*ratio/2),halfH=Math.min(cr.height/2,er.height*ratio/2);
    const x=clamp(point.x,cr.left+halfW,cr.right-halfW);
    const y=clamp(point.y,cr.top+halfH,cr.bottom-halfH);
    return{x:(x-cr.left)/Math.max(1,cr.width),y:(y-cr.top)/Math.max(1,cr.height)};
  }

  function readNaturalCenters(){
    const saved=controls.map(el=>el.style.transform);
    controls.forEach(el=>el.style.transform='none');
    const cr=canvasRect(),out={};
    controls.forEach(el=>{const c=centerOf(el);out[el.dataset.control]={x:clamp((c.x-cr.left)/Math.max(1,cr.width),0,1),y:clamp((c.y-cr.top)/Math.max(1,cr.height),0,1),scale:1};});
    controls.forEach((el,i)=>el.style.transform=saved[i]);
    return out;
  }
  function load(){
    try{const v=JSON.parse(localStorage.getItem(storageKey()));if(v&&v.version===4&&v.controls)return v.controls;}catch{}
    return JSON.parse(JSON.stringify(defaultsState));
  }
  function save(){localStorage.setItem(storageKey(),JSON.stringify({version:4,controls:state}));}

  function applyOne(el){
    const s=state[el.dataset.control];if(!s)return;
    const old=el.style.transform;el.style.transform='none';
    const natural=centerOf(el),target=fromNormalized(s),ps=ancestorScale(el);
    el.style.transform=old;
    const dx=(target.x-natural.x)/ps,dy=(target.y-natural.y)/ps;
    el.style.transform=`translate3d(${dx}px,${dy}px,0) scale(${s.scale||1})`;
    el.dataset.sizeLabel=`${Math.round((s.scale||1)*100)}%`;
  }
  const applyAll=()=>controls.forEach(applyOne);

  function showToast(){
    if(toast)return;toast=document.createElement('div');toast.className='precision-edit-toast';
    toast.textContent='1本指で移動 ・ 2本指で大きさ変更';document.body.appendChild(toast);
  }
  function hideToast(){toast?.remove();toast=null;}

  function beginDrag(el,p){
    const id=el.dataset.control,s=state[id];if(!s)return;
    const c=centerOf(el);active={el,id,mode:'drag',grabOffset:{x:c.x-p.x,y:c.y-p.y}};
    el.classList.add('precision-active');
  }
  function beginPinch(){
    if(!active||pointers.size<2)return;
    const pts=[...pointers.values()],a=pts[0],b=pts[1],mid=midpoint(a,b),s=state[active.id],c=centerOf(active.el);
    active.mode='pinch';active.pinch={distance:Math.max(10,distance(a,b)),startScale:s.scale||1,centerFromMid:{x:c.x-mid.x,y:c.y-mid.y}};
  }
  function rebaseDrag(){
    if(!active)return;if(pointers.size>=2){beginPinch();return;}
    const p=[...pointers.values()][0];if(!p)return;
    const c=centerOf(active.el);active.mode='drag';active.grabOffset={x:c.x-p.x,y:c.y-p.y};delete active.pinch;
  }

  function update(){
    raf=0;if(!active||!controller.classList.contains('editing'))return;
    const pts=[...pointers.values()],s=state[active.id];if(!s)return;
    if(pts.length>=2){
      if(active.mode!=='pinch'||!active.pinch)beginPinch();
      const a=pts[0],b=pts[1],mid=midpoint(a,b),pin=active.pinch;
      const nextScale=clamp(pin.startScale*(distance(a,b)/pin.distance),.5,2.0);
      const ratio=nextScale/pin.startScale;
      const target={x:mid.x+pin.centerFromMid.x*ratio,y:mid.y+pin.centerFromMid.y*ratio};
      const n=normalizeFor(active.el,target,nextScale);s.x=n.x;s.y=n.y;s.scale=nextScale;
    }else if(pts.length===1){
      if(active.mode!=='drag')rebaseDrag();
      const p=pts[0],target={x:p.x+active.grabOffset.x,y:p.y+active.grabOffset.y};
      const n=normalizeFor(active.el,target,s.scale||1);s.x=n.x;s.y=n.y;
    }
    applyOne(active.el);
  }
  const queue=()=>{if(!raf)raf=requestAnimationFrame(update);};

  canvas.addEventListener('pointerdown',e=>{
    if(!controller.classList.contains('editing'))return;
    const hit=e.target.closest?.('[data-control]');if(!active&&!hit)return;
    e.preventDefault();e.stopImmediatePropagation();
    try{canvas.setPointerCapture(e.pointerId);}catch{}
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(!active)beginDrag(hit,pointers.get(e.pointerId));else if(pointers.size>=2)beginPinch();
  },{capture:true,passive:false});
  canvas.addEventListener('pointermove',e=>{
    if(!controller.classList.contains('editing')||!pointers.has(e.pointerId))return;
    e.preventDefault();e.stopImmediatePropagation();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});queue();
  },{capture:true,passive:false});
  const finish=e=>{
    if(!pointers.has(e.pointerId))return;
    if(controller.classList.contains('editing')){e.preventDefault();e.stopImmediatePropagation();}
    pointers.delete(e.pointerId);
    if(!pointers.size){active?.el.classList.remove('precision-active');active=null;save();}else rebaseDrag();
  };
  canvas.addEventListener('pointerup',finish,{capture:true,passive:false});
  canvas.addEventListener('pointercancel',finish,{capture:true,passive:false});
  canvas.addEventListener('lostpointercapture',finish,{capture:true,passive:false});

  function syncEditingState(){
    disableLegacyGroupEditor();const editing=controller.classList.contains('editing');
    if(editing){showToast();canvas.style.touchAction='none';controls.forEach(el=>{el.style.touchAction='none';el.classList.add('precision-editable');});}
    else{hideToast();pointers.clear();active?.el.classList.remove('precision-active');active=null;canvas.style.touchAction='';controls.forEach(el=>el.classList.remove('precision-active','precision-editable'));save();}
  }
  new MutationObserver(syncEditingState).observe(controller,{attributes:true,attributeFilter:['class']});

  document.getElementById('layoutReset')?.addEventListener('click',()=>setTimeout(()=>{
    controls.forEach(el=>el.style.transform='none');defaultsState=readNaturalCenters();state=JSON.parse(JSON.stringify(defaultsState));save();applyAll();
  },0));
  document.getElementById('layoutSave')?.addEventListener('click',save);
  document.getElementById('layoutDone')?.addEventListener('click',save);
  document.getElementById('controllerScale')?.addEventListener('input',()=>requestAnimationFrame(applyAll));

  function reflow(){
    clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{
      disableLegacyGroupEditor();if(!Object.keys(defaultsState).length)defaultsState=readNaturalCenters();state=load();applyAll();
    },120);
  }
  window.addEventListener('orientationchange',reflow);
  window.addEventListener('resize',()=>{if(!controller.classList.contains('editing'))reflow();});

  migrateLegacyBaseOnce();disableLegacyGroupEditor();
  controls.forEach(el=>el.style.transform='none');defaultsState=readNaturalCenters();state=load();applyAll();syncEditingState();
})();
