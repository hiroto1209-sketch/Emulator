(() => {
  const player=document.getElementById('playerView');
  const drawer=document.getElementById('gameMenuDrawer');
  if(!player||!drawer)return;

  const APP_DB='retro-pocket-db',APP_DB_VERSION=2,ROM_STORE='roms',LAST_ROM='last-rom';
  const STUDY_DB='retro-pocket-study-db',STUDY_DB_VERSION=1,INDEX_STORE='indexes',TRANS_STORE='translations';
  const INDEX_KEY='live-v2';
  const LS_KEY='retro-pocket-japanese-subtitles-v2';
  const enabledDefault=localStorage.getItem(LS_KEY)!=='off';
  const state={enabled:enabledDefault,index:null,sorted:null,timer:null,busy:false,lastKey:'',lastSeen:0,failures:0};

  // EarthBound control-code widths used only to walk user-owned ROM text locally.
  const CONTROL_COUNTS=[0,0,0,0,2,2,2,2,3,1,3,1,1,1,1,0,1,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1];
  const EXTRA18={1:1,3:1,5:1,7:4,8:1,9:1,13:1};
  const EXTRA19={2:1,4:0,5:1,16:1,17:1,20:0,22:1,24:1,25:1,26:1,27:1,28:1,29:1,30:0,31:0,32:0,33:1,34:1,35:1,36:1,37:1,38:1,39:1,40:1};
  const EXTRA1A={0:1,1:1,4:0,5:1,6:1,7:0,8:0,9:0,10:0,11:0};
  const EXTRA1C={0:1,1:1,2:1,3:1,4:0,5:1,6:1,7:1,8:1,9:1,10:3,11:3,12:1,13:0,14:0,15:0,17:1,18:1,19:1,20:1,21:1};
  const COMMON=new Set('the and you to of a i is it in that this for on with have do not are be your my me we he she they what where who how why can will would could should want like get go got from at as if but or so just no yes here there one all out up down now then know think good come see take give make going about really please thank hello well let right very much little more some when time look need him her them our us his their into back away still even maybe sure okay start new game'.split(' '));

  function ensureUi(){
    if(!document.getElementById('jpLiveSubtitle')){
      const el=document.createElement('div');el.id='jpLiveSubtitle';el.className='jp-live-subtitle';el.setAttribute('aria-live','polite');
      el.innerHTML='<span id="jpLiveSubtitleText"></span>';
      const stage=player.querySelector('.stage-card')||player;stage.appendChild(el);
    }
    ensureMenu();
  }
  function ensureMenu(){
    const list=drawer.querySelector('.feature-menu-list');if(!list)return;
    let b=document.getElementById('jpSubtitleToggle');
    if(!b){
      b=document.createElement('button');b.id='jpSubtitleToggle';b.type='button';
      const before=document.getElementById('reloadGame');before?list.insertBefore(b,before):list.appendChild(b);
      b.addEventListener('click',()=>setEnabled(!state.enabled));
    }
    b.innerHTML=`<span><b>日本語字幕</b><small>会話を自動翻訳して表示</small></span><i>${state.enabled?'ON':'OFF'}</i>`;
  }
  function setEnabled(v){state.enabled=!!v;localStorage.setItem(LS_KEY,state.enabled?'on':'off');ensureMenu();if(!state.enabled)hideSubtitle();else schedule(80);}
  function showSubtitle(text){
    if(!state.enabled||!text)return;
    const box=document.getElementById('jpLiveSubtitle'),out=document.getElementById('jpLiveSubtitleText');
    if(!box||!out)return;out.textContent=text;box.classList.add('show');
  }
  function hideSubtitle(){document.getElementById('jpLiveSubtitle')?.classList.remove('show');}

  function openDb(name,version,onUpgrade){return new Promise((res,rej)=>{const r=indexedDB.open(name,version);r.onupgradeneeded=()=>onUpgrade?.(r.result);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function getFrom(dbName,ver,store,key,upgrade){const db=await openDb(dbName,ver,upgrade);const v=await new Promise((res,rej)=>{const tx=db.transaction(store,'readonly'),q=tx.objectStore(store).get(key);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error);});db.close();return v;}
  async function putTo(dbName,ver,store,key,val,upgrade){const db=await openDb(dbName,ver,upgrade);await new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(val,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();}
  const studyUpgrade=db=>{if(!db.objectStoreNames.contains(INDEX_STORE))db.createObjectStore(INDEX_STORE);if(!db.objectStoreNames.contains(TRANS_STORE))db.createObjectStore(TRANS_STORE);};
  async function loadRom(){const rec=await getFrom(APP_DB,APP_DB_VERSION,ROM_STORE,LAST_ROM,db=>{if(!db.objectStoreNames.contains(ROM_STORE))db.createObjectStore(ROM_STORE);});return rec?.data?new Uint8Array(rec.data):null;}

  function isPrintable(b){const c=b-0x30;return c>=0x20&&c<=0x7e;}
  function controlOperandBytes(rom,pos){
    const b=rom[pos];if(b>=0x20)return 0;let base=CONTROL_COUNTS[b]||0;if(base<1)return base;
    if([0x18,0x19,0x1a,0x1c,0x1d].includes(b)){
      const sub=rom[pos+1]||0;let extra=0;
      if(b===0x18)extra=EXTRA18[sub]||0;else if(b===0x19)extra=EXTRA19[sub]||0;else if(b===0x1a)extra=EXTRA1A[sub]||0;else if(b===0x1c)extra=EXTRA1C[sub]||0;else extra=(sub===0x20||sub===0x22)?0:1;
      return 1+extra;
    }
    return base;
  }
  function clean(s){return s.replace(/\s+/g,' ').trim().replace(/\s+([,.!?;:])/g,'$1');}
  function scoreEnglish(s){
    if(s.length<6)return-99;const letters=(s.match(/[A-Za-z]/g)||[]).length,words=(s.toLowerCase().match(/[a-z']+/g)||[]),common=words.reduce((n,w)=>n+(COMMON.has(w)?1:0),0),vowels=(s.match(/[aeiouy]/gi)||[]).length,ratio=vowels/Math.max(1,letters);
    return common*3+Math.min(letters,50)/18+(s.match(/ /g)||[]).length*.2-(ratio>.16&&ratio<.72?0:4);
  }
  function decodeAt(rom,start){
    let p=start,out='',controls=0;
    for(let n=0;p<rom.length&&n<900;n++){
      const b=rom[p];if(b===0)break;
      if(isPrintable(b)){out+=String.fromCharCode(b-0x30);p++;continue;}
      if(b<0x20&&controls<18){if([1,2,3].includes(b))out+=' ';p+=1+controlOperandBytes(rom,p);controls++;continue;}
      break;
    }
    return clean(out);
  }
  function stripHeader(rom){return rom.length%1024===512?rom.subarray(512):rom;}
  function buildLocalIndex(romRaw){
    const rom=stripHeader(romRaw),map=new Map();
    // Text starts tend to follow a terminator/control boundary. Scan locally without publishing strings.
    for(let i=0;i<rom.length;i++){
      if(!isPrintable(rom[i]))continue;
      if(i>0&&isPrintable(rom[i-1]))continue;
      const text=decodeAt(rom,i),sc=scoreEnglish(text);
      if(sc<5||text.length<7)continue;
      const key=text.toLowerCase();if(!map.has(key))map.set(key,{offset:i,text,score:sc});
    }
    const items=[...map.values()].sort((a,b)=>a.offset-b.offset).slice(0,6000);
    return{version:2,createdAt:Date.now(),items};
  }
  async function ensureIndex(){
    if(state.index?.items?.length)return true;
    let rec=await getFrom(STUDY_DB,STUDY_DB_VERSION,INDEX_STORE,INDEX_KEY,studyUpgrade).catch(()=>null);
    if(!rec?.items?.length){
      const rom=await loadRom().catch(()=>null);if(!rom)return false;
      rec=buildLocalIndex(rom);await putTo(STUDY_DB,STUDY_DB_VERSION,INDEX_STORE,INDEX_KEY,rec,studyUpgrade).catch(()=>{});
    }
    state.index=rec;state.sorted=rec.items.slice().sort((a,b)=>a.offset-b.offset);return !!state.sorted.length;
  }

  function nearestDialogue(off){
    const a=state.sorted;if(!a?.length)return null;let lo=0,hi=a.length-1,best=-1;
    while(lo<=hi){const m=(lo+hi)>>1;if(a[m].offset<=off){best=m;lo=m+1;}else hi=m-1;}
    if(best<0)return null;const item=a[best],delta=off-item.offset;
    const maxSpan=Math.min(1100,Math.max(96,item.text.length*2+220));
    return delta>=0&&delta<=maxSpan?{item,delta}:null;
  }
  function pointerToOffset(lo,hi,bank){if(bank<0xC0)return-1;return((bank&0x3f)<<16)|(lo|(hi<<8));}

  function detectPointerFromState(bytes){
    let best=null;
    // Strong signal: EarthBound text parser call-stack stores 24-bit text pointers 0x1B bytes apart.
    for(let i=0;i+57<bytes.length;i++){
      const o1=pointerToOffset(bytes[i],bytes[i+1],bytes[i+2]);if(o1<0)continue;
      const m1=nearestDialogue(o1);if(!m1)continue;
      const o2=pointerToOffset(bytes[i+27],bytes[i+28],bytes[i+29]),m2=o2>=0?nearestDialogue(o2):null;
      if(m2){
        const o3=pointerToOffset(bytes[i+54],bytes[i+55],bytes[i+56]),m3=o3>=0?nearestDialogue(o3):null;
        const candidate=m3||m2;const strength=(m3?8:5)-Math.min(3,candidate.delta/150);
        if(!best||strength>best.strength)best={...candidate,strength,source:'parser-stack'};
      }
    }
    if(best)return best;
    // Fallback: count ROM text pointers anywhere in the serialized state; repeats beat accidental matches.
    const counts=new Map();
    for(let i=0;i+2<bytes.length;i+=1){
      const off=pointerToOffset(bytes[i],bytes[i+1],bytes[i+2]);if(off<0)continue;
      const m=nearestDialogue(off);if(!m)continue;const k=m.item.offset;const prev=counts.get(k)||{...m,count:0};prev.count++;if(m.delta<prev.delta)prev.delta=m.delta;counts.set(k,prev);
    }
    for(const c of counts.values()){const strength=c.count*1.5-Math.min(3,c.delta/120);if(c.count>=2&&(!best||strength>best.strength))best={...c,strength,source:'pointer-repeat'};}
    return best;
  }

  function textKey(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return'v2:'+(h>>>0).toString(16);}
  async function translate(text){
    const key=textKey(text),cached=await getFrom(STUDY_DB,STUDY_DB_VERSION,TRANS_STORE,key,studyUpgrade).catch(()=>null);if(cached?.ja)return cached.ja;
    const q=text.slice(0,420);let ja='';
    try{
      const r=await fetch('https://api.mymemory.translated.net/get?q='+encodeURIComponent(q)+'&langpair=en|ja',{cache:'no-store'});if(r.ok){const j=await r.json();ja=(j?.responseData?.translatedText||'').trim();}
    }catch{}
    if(!ja||/^MYMEMORY WARNING/i.test(ja)){
      try{
        const r=await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q='+encodeURIComponent(q),{cache:'no-store'});if(r.ok){const j=await r.json();ja=(j?.[0]||[]).map(x=>x?.[0]||'').join('').trim();}
      }catch{}
    }
    if(ja)await putTo(STUDY_DB,STUDY_DB_VERSION,TRANS_STORE,key,{ja,time:Date.now()},studyUpgrade).catch(()=>{});
    return ja;
  }

  async function tick(){
    if(!state.enabled||state.busy||document.hidden)return schedule(900);
    state.busy=true;
    try{
      const ready=await ensureIndex();if(!ready){hideSubtitle();return;}
      const gm=window.EJS_emulator?.gameManager;if(!gm?.getState){hideSubtitle();return;}
      const raw=await Promise.resolve(gm.getState()),bytes=raw instanceof Uint8Array?raw:new Uint8Array(raw);
      const match=detectPointerFromState(bytes);
      if(!match||match.strength<2.2){state.failures++;if(state.failures>2)hideSubtitle();return;}
      state.failures=0;
      const text=match.item.text,key=match.item.offset+':'+text.slice(0,32);
      state.lastSeen=Date.now();
      if(key===state.lastKey)return;
      state.lastKey=key;
      const ja=await translate(text);
      // Nothing is rendered until a real Japanese translation exists.
      if(ja&&state.enabled&&key===state.lastKey)showSubtitle(ja);else hideSubtitle();
    }catch(e){console.warn('[subtitle-v2]',e);hideSubtitle();}
    finally{state.busy=false;schedule(750);}
  }
  function schedule(ms=700){clearTimeout(state.timer);state.timer=setTimeout(tick,ms);}

  ensureUi();
  new MutationObserver(ensureMenu).observe(drawer,{childList:true,subtree:true});
  window.addEventListener('load',()=>schedule(1200));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hideSubtitle();else schedule(250);});
  setEnabled(state.enabled);
})();