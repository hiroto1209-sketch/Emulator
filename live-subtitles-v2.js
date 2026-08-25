(() => {
  const player=document.getElementById('playerView');
  const drawer=document.getElementById('gameMenuDrawer');
  if(!player||!drawer)return;

  const APP_DB='retro-pocket-db',APP_DB_VERSION=2,ROM_STORE='roms',LAST_ROM='last-rom';
  const STUDY_DB='retro-pocket-study-db',STUDY_DB_VERSION=1,INDEX_STORE='indexes',TRANS_STORE='translations';
  const INDEX_KEY='live-v2';
  const LS_KEY='retro-pocket-japanese-subtitles-v2';
  const state={
    enabled:localStorage.getItem(LS_KEY)!=='off',
    index:null,sorted:null,timer:null,busy:false,lastKey:'',failures:0,
    gameReadyAt:0,indexBuildStarted:false
  };
  const COMMON=new Set('the and you to of a i is it in that this for on with have do not are be your my me we he she they what where who how why can will would could should want like get go got from at as if but or so just no yes here there one all out up down now then know think good come see take give make going about really please thank hello well let right very much little more some when time look need him her them our us his their into back away still even maybe sure okay start new game'.split(' '));

  function ensureUi(){
    if(!document.getElementById('jpLiveSubtitle')){
      const el=document.createElement('div');el.id='jpLiveSubtitle';el.className='jp-live-subtitle';
      el.innerHTML='<span id="jpLiveSubtitleText"></span>';
      (player.querySelector('.stage-card')||player).appendChild(el);
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
  function setEnabled(v){
    state.enabled=!!v;localStorage.setItem(LS_KEY,state.enabled?'on':'off');ensureMenu();
    if(!state.enabled){hideSubtitle();clearTimeout(state.timer);return;}
    schedule(1200);
  }
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
  function clean(s){return s.replace(/\s+/g,' ').trim().replace(/\s+([,.!?;:])/g,'$1');}
  function scoreEnglish(s){if(s.length<6)return-99;const letters=(s.match(/[A-Za-z]/g)||[]).length,words=(s.toLowerCase().match(/[a-z']+/g)||[]),common=words.reduce((n,w)=>n+(COMMON.has(w)?1:0),0);return common*3+Math.min(letters,50)/18+(s.match(/ /g)||[]).length*.2;}
  function stripHeader(rom){return rom.length%1024===512?rom.subarray(512):rom;}
  function decodeAt(rom,start){let p=start,out='';for(let n=0;p<rom.length&&n<420;n++,p++){const b=rom[p];if(b===0)break;if(isPrintable(b))out+=String.fromCharCode(b-0x30);else if(b<0x20)out+=' ';else break;}return clean(out);}

  async function buildIndexIdle(romRaw){
    const rom=stripHeader(romRaw),map=new Map();let i=0;
    return new Promise(resolve=>{
      const run=deadline=>{
        const started=performance.now();
        while(i<rom.length && ((deadline?.timeRemaining?.()||0)>2 || performance.now()-started<8)){
          if(isPrintable(rom[i])&&(i===0||!isPrintable(rom[i-1]))){
            const text=decodeAt(rom,i),sc=scoreEnglish(text);
            if(sc>=5&&text.length>=7&&!map.has(text.toLowerCase()))map.set(text.toLowerCase(),{offset:i,text,score:sc});
          }
          i++;
        }
        if(i<rom.length){
          if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:700});else setTimeout(()=>run(null),35);
        }else resolve({version:3,createdAt:Date.now(),items:[...map.values()].sort((a,b)=>a.offset-b.offset).slice(0,6000)});
      };
      if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:1500});else setTimeout(()=>run(null),100);
    });
  }

  async function ensureIndex(){
    if(state.index?.items?.length)return true;
    const cached=await getFrom(STUDY_DB,STUDY_DB_VERSION,INDEX_STORE,INDEX_KEY,studyUpgrade).catch(()=>null);
    if(cached?.items?.length){state.index=cached;state.sorted=cached.items.slice().sort((a,b)=>a.offset-b.offset);return true;}
    if(state.indexBuildStarted)return false;
    state.indexBuildStarted=true;
    setTimeout(async()=>{
      try{
        const rom=await loadRom();if(!rom)return;
        const rec=await buildIndexIdle(rom);
        await putTo(STUDY_DB,STUDY_DB_VERSION,INDEX_STORE,INDEX_KEY,rec,studyUpgrade).catch(()=>{});
        state.index=rec;state.sorted=rec.items.slice().sort((a,b)=>a.offset-b.offset);
      }catch(e){console.warn('[subtitle-index]',e);}
    },2500);
    return false;
  }

  function nearestDialogue(off){const a=state.sorted;if(!a?.length)return null;let lo=0,hi=a.length-1,best=-1;while(lo<=hi){const m=(lo+hi)>>1;if(a[m].offset<=off){best=m;lo=m+1}else hi=m-1;}if(best<0)return null;const item=a[best],delta=off-item.offset;return delta>=0&&delta<=Math.min(900,Math.max(100,item.text.length*2+180))?{item,delta}:null;}
  function pointerToOffset(lo,hi,bank){if(bank<0xC0)return-1;return((bank&0x3f)<<16)|(lo|(hi<<8));}
  function detectPointerFromState(bytes){
    let best=null;
    for(let i=0;i+29<bytes.length;i+=4){
      const o1=pointerToOffset(bytes[i],bytes[i+1],bytes[i+2]);if(o1<0)continue;
      const m1=nearestDialogue(o1);if(!m1)continue;
      const j=i+27,o2=j+2<bytes.length?pointerToOffset(bytes[j],bytes[j+1],bytes[j+2]):-1,m2=o2>=0?nearestDialogue(o2):null;
      const c=m2||m1,strength=(m2?5:2.5)-Math.min(2,c.delta/180);
      if(!best||strength>best.strength)best={...c,strength};
    }
    return best;
  }

  function textKey(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return'v2:'+(h>>>0).toString(16);}
  async function translate(text){
    const key=textKey(text),cached=await getFrom(STUDY_DB,STUDY_DB_VERSION,TRANS_STORE,key,studyUpgrade).catch(()=>null);if(cached?.ja)return cached.ja;
    const q=text.slice(0,360);let ja='';
    try{const r=await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q='+encodeURIComponent(q),{cache:'no-store'});if(r.ok){const j=await r.json();ja=(j?.[0]||[]).map(x=>x?.[0]||'').join('').trim();}}catch{}
    if(ja)await putTo(STUDY_DB,STUDY_DB_VERSION,TRANS_STORE,key,{ja,time:Date.now()},studyUpgrade).catch(()=>{});
    return ja;
  }

  async function tick(){
    if(!state.enabled||state.busy||document.hidden)return schedule(3000);
    if(!window.EJS_emulator?.gameManager)return schedule(1800);
    if(!state.gameReadyAt)state.gameReadyAt=Date.now();
    if(Date.now()-state.gameReadyAt<6000)return schedule(1800);
    const ready=await ensureIndex();if(!ready)return schedule(3000);
    state.busy=true;
    try{
      const gm=window.EJS_emulator?.gameManager;if(!gm?.getState)return;
      const raw=await Promise.resolve(gm.getState()),bytes=raw instanceof Uint8Array?raw:new Uint8Array(raw);
      const match=detectPointerFromState(bytes);
      if(!match||match.strength<2.2){state.failures++;if(state.failures>1)hideSubtitle();return;}
      state.failures=0;
      const text=match.item.text,key=match.item.offset+':'+text.slice(0,24);if(key===state.lastKey)return;state.lastKey=key;
      const ja=await translate(text);if(ja&&key===state.lastKey&&state.enabled)showSubtitle(ja);else hideSubtitle();
    }catch(e){console.warn('[subtitle-lite]',e);hideSubtitle();}
    finally{state.busy=false;schedule(3000);}
  }
  function schedule(ms=3000){clearTimeout(state.timer);state.timer=setTimeout(tick,ms);}

  ensureUi();
  new MutationObserver(ensureMenu).observe(drawer,{childList:true,subtree:true});
  window.addEventListener('load',()=>schedule(2500));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hideSubtitle();else schedule(1500);});
  setEnabled(state.enabled);
})();