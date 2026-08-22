(() => {
  const controller=document.getElementById('snesController');
  const canvas=document.getElementById('layoutCanvas');
  if(!controller||!canvas)return;

  const PREFIX='retro-pocket-precision-layout-v2-';
  const controls=[...controller.querySelectorAll('[data-control]')];
  let toast=null, active=null, raf=0;
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
  function applyOne(el){const s=state[el.dataset.control]||{dx:0,dy:0,scale:1};el.style.transform=`translate3d(${s.dx}px,${s.dy}px,0) scale(${s.scale})`;el.dataset.sizeLabel=`${Math.round(s.scale*100)}%`;}
  function applyAll(){controls.forEach(applyOne);} function save(){localStorage.setItem(storageKey(),JSON.stringify(state));}
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y); const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});

  function showToast(){if(toast)return;toast=document.createElement('div');toast.className='precision-edit-toast';toast.textContent='1本指で移動 ・ 2本指ピンチで個別サイズ変更';document.body.appendChild(toast);}
  function hideToast(){toast?.remove();toast=null;}

  function beginGesture(el){
    const s=state[el.dataset.control]||{dx:0,dy:0,scale:1},pts=[...pointers.values()],ps=parentRenderScale(el);
    active={el,id:el.dataset.control,mode:pts.length>=2?'pinch':'drag',parentScale:ps};
    el.classList.add('precision-active');
    if(pts.length>=2){const a=pts[0],b=pts[1];active.start={distance:Math.max(8,distance(a,b)),mid:midpoint(a,b),dx:s.dx,dy:s.dy,scale:s.scale};}
    else active.start={pointer:{...pts[0]},dx:s.dx,dy:s.dy,scale:s.scale};
  }
  function rebaseGesture(){
    if(!active)return;const pts=[...pointers.values()],s=state[active.id];active.parentScale=parentRenderScale(active.el);
    if(pts.length>=2){const a=pts[0],b=pts[1];active.mode='pinch';active.start={distance:Math.max(8,distance(a,b)),mid:midpoint(a,b),dx:s.dx,dy:s.dy,scale:s.scale};}
    else if(pts.length===1){active.mode='drag';active.start={pointer:{...pts[0]},dx:s.dx,dy:s.dy,scale:s.scale};}
  }
  function updateActive(){
    raf=0;if(!active||!controller.classList.contains('editing'))return;
    const pts=[...pointers.values()],s=state[active.id]||{dx:0,dy:0,scale:1},ps=active.parentScale||1;
    if(pts.length>=2){
      if(active.mode!=='pinch')rebaseGesture();
      const p=[...pointers.values()],a=p[0],b=p[1],mid=midpoint(a,b),ratio=distance(a,b)/active.start.distance;
      s.scale=clamp(active.start.scale*ratio,.5,2);
      s.dx=active.start.dx+(mid.x-active.start.mid.x)/ps;s.dy=active.start.dy+(mid.y-active.start.mid.y)/ps;
    }else if(pts.length===1){
      if(active.mode!=='drag')rebaseGesture();
      const p=pts[0];s.dx=active.start.dx+(p.x-active.start.pointer.x)/ps;s.dy=active.start.dy+(p.y-active.start.pointer.y)/ps;
    }
    state[active.id]=s;applyOne(active.el);
  }
  function queueUpdate(){if(!raf)raf=requestAnimationFrame(updateActive);}

  // One shared gesture surface for every control. Once grabbed, the control follows the finger
  // even when the finger leaves the visual button, matching the analog-stick editing feel.
  canvas.addEventListener('pointerdown',e=>{
    if(!controller.classList.contains('editing'))return;
    const hit=e.target.closest?.('[data-control]');
    if(!active&&!hit)return;
    e.preventDefault();e.stopPropagation();
    try{canvas.setPointerCapture(e.pointerId);}catch{}
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(!active)beginGesture(hit);else rebaseGesture();
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
    else rebaseGesture();
  };
  canvas.addEventListener('pointerup',finish,{capture:true,passive:false});canvas.addEventListener('pointercancel',finish,{capture:true,passive:false});canvas.addEventListener('lostpointercapture',finish,{capture:true,passive:false});

  const observer=new MutationObserver(()=>{
    if(controller.classList.contains('editing')){showToast();canvas.style.touchAction='none';controls.forEach(el=>{el.style.touchAction='none';el.classList.add('precision-editable');});}
    else{hideToast();pointers.clear();if(active)active.el.classList.remove('precision-active');active=null;canvas.style.touchAction='';controls.forEach(el=>el.classList.remove('precision-active','precision-editable'));save();}
  });observer.observe(controller,{attributes:true,attributeFilter:['class']});

  document.getElementById('layoutReset')?.addEventListener('click',()=>{state=defaults();save();applyAll();});
  document.getElementById('layoutSave')?.addEventListener('click',save);document.getElementById('layoutDone')?.addEventListener('click',save);
  window.addEventListener('orientationchange',()=>setTimeout(()=>{state=load();applyAll();},180));window.addEventListener('resize',()=>{if(!controller.classList.contains('editing'))applyAll();});
  applyAll();
})();