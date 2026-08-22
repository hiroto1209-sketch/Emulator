(() => {
  const controller=document.getElementById('snesController');
  const canvas=document.getElementById('layoutCanvas');
  if(!controller||!canvas)return;

  const PREFIX='retro-pocket-precision-layout-v3-';
  const controls=[...controller.querySelectorAll('[data-control]')];
  let toast=null,active=null,raf=0;
  const pointers=new Map();

  const orientation=()=>matchMedia('(orientation: landscape)').matches?'landscape':'portrait';
  const storageKey=()=>PREFIX+orientation();
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const defaults=()=>Object.fromEntries(controls.map(el=>[el.dataset.control,{dx:0,dy:0,scale:1}]));
  function load(){try{return {...defaults(),...(JSON.parse(localStorage.getItem(storageKey()))||{})};}catch{return defaults();}}
  let state=load();

  function parentRenderScale(el){
    const unit=el.closest('.control-unit');if(!unit)return 1;
    const rect=unit.getBoundingClientRect(),w=unit.offsetWidth||rect.width,h=unit.offsetHeight||rect.height;
    const sx=w?rect.width/w:1,sy=h?rect.height/h:1,s=(sx+sy)/2;
    return Number.isFinite(s)&&s>.05?s:1;
  }
  function centerOf(el){const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};}
  function applyOne(el){const s=state[el.dataset.control]||{dx:0,dy:0,scale:1};el.style.transform=`translate3d(${s.dx}px,${s.dy}px,0) scale(${s.scale})`;el.dataset.sizeLabel=`${Math.round(s.scale*100)}%`;}
  function applyAll(){controls.forEach(applyOne);} function save(){localStorage.setItem(storageKey(),JSON.stringify(state));}
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});

  function showToast(){if(toast)return;toast=document.createElement('div');toast.className='precision-edit-toast';toast.textContent='1本指で移動 ・ 2本指の中点を中心に拡大縮小';document.body.appendChild(toast);}
  function hideToast(){toast?.remove();toast=null;}

  function beginDrag(el,p){
    const s=state[el.dataset.control]||{dx:0,dy:0,scale:1};
    const c=centerOf(el),ps=parentRenderScale(el);
    active={el,id:el.dataset.control,mode:'drag',parentScale:ps,start:{pointer:{...p},center:c,grabOffset:{x:c.x-p.x,y:c.y-p.y},dx:s.dx,dy:s.dy,scale:s.scale}};
    el.classList.add('precision-active');
  }

  function beginPinch(){
    if(!active)return;
    const pts=[...pointers.values()];if(pts.length<2)return;
    const s=state[active.id],a=pts[0],b=pts[1],mid=midpoint(a,b),c=centerOf(active.el);
    active.mode='pinch';active.parentScale=parentRenderScale(active.el);
    active.start={distance:Math.max(8,distance(a,b)),mid,center:c,centerFromMid:{x:c.x-mid.x,y:c.y-mid.y},dx:s.dx,dy:s.dy,scale:s.scale};
  }

  function rebaseToRemainingPointer(){
    if(!active)return;
    const pts=[...pointers.values()];
    if(pts.length>=2){beginPinch();return;}
    if(pts.length===1){
      const p=pts[0],s=state[active.id],c=centerOf(active.el);
      active.mode='drag';active.parentScale=parentRenderScale(active.el);
      active.start={pointer:{...p},center:c,grabOffset:{x:c.x-p.x,y:c.y-p.y},dx:s.dx,dy:s.dy,scale:s.scale};
    }
  }

  function updateActive(){
    raf=0;if(!active||!controller.classList.contains('editing'))return;
    const pts=[...pointers.values()],s=state[active.id]||{dx:0,dy:0,scale:1},ps=active.parentScale||1;
    if(pts.length>=2){
      if(active.mode!=='pinch')beginPinch();
      const a=pts[0],b=pts[1],mid=midpoint(a,b),ratio=distance(a,b)/active.start.distance;
      const nextScale=clamp(active.start.scale*ratio,.5,2);
      const effectiveRatio=nextScale/active.start.scale;
      const targetCenter={
        x:mid.x+active.start.centerFromMid.x*effectiveRatio,
        y:mid.y+active.start.centerFromMid.y*effectiveRatio
      };
      s.scale=nextScale;
      s.dx=active.start.dx+(targetCenter.x-active.start.center.x)/ps;
      s.dy=active.start.dy+(targetCenter.y-active.start.center.y)/ps;
    }else if(pts.length===1){
      if(active.mode!=='drag')rebaseToRemainingPointer();
      const p=pts[0];
      const targetCenter={x:p.x+active.start.grabOffset.x,y:p.y+active.start.grabOffset.y};
      s.dx=active.start.dx+(targetCenter.x-active.start.center.x)/ps;
      s.dy=active.start.dy+(targetCenter.y-active.start.center.y)/ps;
    }
    state[active.id]=s;applyOne(active.el);
  }
  function queueUpdate(){if(!raf)raf=requestAnimationFrame(updateActive);}

  canvas.addEventListener('pointerdown',e=>{
    if(!controller.classList.contains('editing'))return;
    const hit=e.target.closest?.('[data-control]');if(!active&&!hit)return;
    e.preventDefault();e.stopPropagation();
    try{canvas.setPointerCapture(e.pointerId);}catch{}
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(!active)beginDrag(hit,pointers.get(e.pointerId));
    else if(pointers.size>=2)beginPinch();
  },{capture:true,passive:false});

  canvas.addEventListener('pointermove',e=>{
    if(!controller.classList.contains('editing')||!pointers.has(e.pointerId))return;
    e.preventDefault();e.stopPropagation();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});queueUpdate();
  },{capture:true,passive:false});

  const finish=e=>{
    if(!pointers.has(e.pointerId))return;
    if(controller.classList.contains('editing')){e.preventDefault();e.stopPropagation();}
    pointers.delete(e.pointerId);
    if(!pointers.size){if(active)active.el.classList.remove('precision-active');active=null;save();}
    else rebaseToRemainingPointer();
  };
  canvas.addEventListener('pointerup',finish,{capture:true,passive:false});
  canvas.addEventListener('pointercancel',finish,{capture:true,passive:false});
  canvas.addEventListener('lostpointercapture',finish,{capture:true,passive:false});

  const observer=new MutationObserver(()=>{
    if(controller.classList.contains('editing')){showToast();canvas.style.touchAction='none';controls.forEach(el=>{el.style.touchAction='none';el.classList.add('precision-editable');});}
    else{hideToast();pointers.clear();if(active)active.el.classList.remove('precision-active');active=null;canvas.style.touchAction='';controls.forEach(el=>el.classList.remove('precision-active','precision-editable'));save();}
  });observer.observe(controller,{attributes:true,attributeFilter:['class']});

  document.getElementById('layoutReset')?.addEventListener('click',()=>{state=defaults();save();applyAll();});
  document.getElementById('layoutSave')?.addEventListener('click',save);
  document.getElementById('layoutDone')?.addEventListener('click',save);
  window.addEventListener('orientationchange',()=>setTimeout(()=>{state=load();applyAll();},180));
  window.addEventListener('resize',()=>{if(!controller.classList.contains('editing'))applyAll();});
  applyAll();
})();