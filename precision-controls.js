(() => {
  const controller=document.getElementById('snesController');
  const canvas=document.getElementById('layoutCanvas');
  if(!controller||!canvas)return;

  const PREFIX='retro-pocket-precision-layout-v1-';
  const controls=[...controller.querySelectorAll('[data-control]')];
  const gestures=new Map();
  let toast=null;

  const orientation=()=>matchMedia('(orientation: landscape)').matches?'landscape':'portrait';
  const storageKey=()=>PREFIX+orientation();
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const defaults=()=>Object.fromEntries(controls.map(el=>[el.dataset.control,{dx:0,dy:0,scale:1}]));

  function load(){
    try{return {...defaults(),...(JSON.parse(localStorage.getItem(storageKey()))||{})};}
    catch{return defaults();}
  }
  let state=load();

  function parentRenderScale(el){
    const unit=el.closest('.control-unit');
    if(!unit)return 1;
    const rect=unit.getBoundingClientRect();
    const w=unit.offsetWidth||rect.width;
    const h=unit.offsetHeight||rect.height;
    const sx=w?rect.width/w:1;
    const sy=h?rect.height/h:1;
    const s=(sx+sy)/2;
    return Number.isFinite(s)&&s>0.05?s:1;
  }

  function applyOne(el){
    const id=el.dataset.control,s=state[id]||{dx:0,dy:0,scale:1};
    el.style.transform=`translate3d(${s.dx}px,${s.dy}px,0) scale(${s.scale})`;
    el.dataset.sizeLabel=`${Math.round(s.scale*100)}%`;
  }
  function applyAll(){controls.forEach(applyOne);}
  function save(){localStorage.setItem(storageKey(),JSON.stringify(state));}

  function showToast(){
    if(toast)return;
    toast=document.createElement('div');toast.className='precision-edit-toast';
    toast.textContent='1本指で移動 ・ 2本指ピンチで個別サイズ変更';document.body.appendChild(toast);
  }
  function hideToast(){toast?.remove();toast=null;}

  function pointDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function midpoint(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2};}

  controls.forEach(el=>{
    const id=el.dataset.control;
    const g={pointers:new Map(),mode:null,start:null};gestures.set(el,g);

    el.addEventListener('pointerdown',e=>{
      if(!controller.classList.contains('editing'))return;
      e.preventDefault();e.stopPropagation();
      try{el.setPointerCapture(e.pointerId);}catch{}
      g.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      el.classList.add('precision-active');
      const s=state[id]||{dx:0,dy:0,scale:1};
      const pts=[...g.pointers.values()];
      const parentScale=parentRenderScale(el);
      if(pts.length===1){
        g.mode='drag';g.start={pointer:{...pts[0]},dx:s.dx,dy:s.dy,scale:s.scale,parentScale};
      }else{
        const a=pts[0],b=pts[1];g.mode='pinch';g.start={distance:Math.max(8,pointDistance(a,b)),mid:midpoint(a,b),dx:s.dx,dy:s.dy,scale:s.scale,parentScale};
      }
    },{capture:true,passive:false});

    el.addEventListener('pointermove',e=>{
      if(!controller.classList.contains('editing')||!g.pointers.has(e.pointerId))return;
      e.preventDefault();e.stopPropagation();
      g.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      const pts=[...g.pointers.values()],s=state[id]||{dx:0,dy:0,scale:1};
      if(pts.length>=2){
        if(g.mode!=='pinch'){
          const a=pts[0],b=pts[1];g.mode='pinch';g.start={distance:Math.max(8,pointDistance(a,b)),mid:midpoint(a,b),dx:s.dx,dy:s.dy,scale:s.scale,parentScale:parentRenderScale(el)};
        }
        const a=pts[0],b=pts[1],mid=midpoint(a,b),ratio=pointDistance(a,b)/g.start.distance;
        const ps=g.start.parentScale||1;
        s.scale=clamp(g.start.scale*ratio,.5,2.0);
        s.dx=g.start.dx+(mid.x-g.start.mid.x)/ps;
        s.dy=g.start.dy+(mid.y-g.start.mid.y)/ps;
      }else if(pts.length===1){
        if(g.mode!=='drag'){
          g.mode='drag';g.start={pointer:{...pts[0]},dx:s.dx,dy:s.dy,scale:s.scale,parentScale:parentRenderScale(el)};
        }
        const ps=g.start.parentScale||1;
        s.dx=g.start.dx+(pts[0].x-g.start.pointer.x)/ps;
        s.dy=g.start.dy+(pts[0].y-g.start.pointer.y)/ps;
      }
      state[id]=s;applyOne(el);
    },{capture:true,passive:false});

    const finish=e=>{
      if(!g.pointers.has(e.pointerId))return;
      if(controller.classList.contains('editing')){e.preventDefault();e.stopPropagation();}
      g.pointers.delete(e.pointerId);
      if(g.pointers.size===0){g.mode=null;g.start=null;el.classList.remove('precision-active');save();}
      else{
        const p=[...g.pointers.values()][0],s=state[id];
        g.mode='drag';g.start={pointer:{...p},dx:s.dx,dy:s.dy,scale:s.scale,parentScale:parentRenderScale(el)};
      }
    };
    el.addEventListener('pointerup',finish,{capture:true,passive:false});
    el.addEventListener('pointercancel',finish,{capture:true,passive:false});
  });

  const observer=new MutationObserver(()=>{
    if(controller.classList.contains('editing')){showToast();controls.forEach(el=>el.style.touchAction='none');}
    else{hideToast();controls.forEach(el=>el.classList.remove('precision-active'));save();}
  });
  observer.observe(controller,{attributes:true,attributeFilter:['class']});

  document.getElementById('layoutReset')?.addEventListener('click',()=>{
    state=defaults();save();applyAll();
  });
  document.getElementById('layoutSave')?.addEventListener('click',save);
  document.getElementById('layoutDone')?.addEventListener('click',save);

  window.addEventListener('orientationchange',()=>setTimeout(()=>{state=load();applyAll();},180));
  window.addEventListener('resize',()=>{if(!controller.classList.contains('editing'))applyAll();});
  applyAll();
})();