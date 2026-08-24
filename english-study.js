(() => {
  const $=(id)=>document.getElementById(id);
  const player=$('playerView'),drawer=$('gameMenuDrawer');
  if(!player||!drawer)return;

  const APP_DB='retro-pocket-db',APP_DB_VERSION=2,ROM_STORE='roms',LAST_ROM='last-rom';
  const STUDY_DB='retro-pocket-study-db',STUDY_DB_VERSION=1,INDEX_STORE='indexes',TRANS_STORE='translations';
  const KNOWN_EB_SHA256='a8fe2226728002786d68c27ddddf0b90a894db52e4dfe268fdf72a68cae5f02e';
  const PTR_TABLES=[0x8CDED,0x8D1ED,0x8D5ED];
  const CONTROL_COUNTS=[0,0,0,0,2,2,2,2,3,1,3,1,1,1,1,0,1,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1];
  const EXTRA18={1:1,3:1,5:1,7:4,8:1,9:1,13:1};
  const EXTRA19={2:1,4:0,5:1,16:1,17:1,20:0,22:1,24:1,25:1,26:1,27:1,28:1,29:1,30:0,31:0,32:0,33:1,34:1,35:1,36:1,37:1,38:1,39:1,40:1};
  const EXTRA1A={0:1,1:1,4:0,5:1,6:1,7:0,8:0,9:0,10:0,11:0};
  const EXTRA1C={0:1,1:1,2:1,3:1,4:0,5:1,6:1,7:1,8:1,9:1,10:3,11:3,12:1,13:0,14:0,15:0,17:1,18:1,19:1,20:1,21:1};
  const COMMON=new Set('the and you to of a i is it in that this for on with have do not are be your my me we he she they what where who how why can will would could should want like get go got from at as if but or so just no yes here there one all out up down now then know think good come see take give make going about really please thank hello well let right very much little more some when time look need him her them our us his their into back away still even maybe sure okay'.split(' '));
  const state={busy:false,index:null,romHash:'',selected:null};

  function injectMenuEntry(){
    const list=drawer.querySelector('.feature-menu-list');if(!list||$('englishStudyOpen'))return;
    const b=document.createElement('button');b.id='englishStudyOpen';b.type='button';
    b.innerHTML='<span><b>📚 英語学習</b><small>ROM内の台詞を解析・翻訳</small></span><i>›</i>';
    const reload=$('reloadGame');if(reload)list.insertBefore(b,reload);else list.appendChild(b);
    b.addEventListener('click',()=>{closeSettings();openStudy();});
  }
  function closeSettings(){drawer.classList.add('hidden');$('menuBackdrop')?.classList.add('hidden');document.body.classList.remove('menu-open');}

  function ensureStudyUi(){
    if($('englishStudySheet'))return;
    const wrap=document.createElement('div');wrap.id='englishStudySheet';wrap.className='study-sheet hidden';
    wrap.innerHTML=`<div class="study-backdrop" data-study-close></div><section class="study-card" aria-label="英語学習モード"><header><div><small>ENGLISH STUDY · LOCAL ROM</small><strong>EarthBound 台詞ラボ</strong></div><button type="button" data-study-close>×</button></header><div class="study-body">
      <div class="study-privacy"><b>🔒 端末内解析</b><span>ROMと抽出した台詞はGitHubへ送信・保存しません。</span></div>
      <div class="study-db-card"><div><small>ROM台詞データベース</small><strong id="studyDbStatus">未作成</strong><span id="studyDbMeta">保存済みROMから作成できます</span></div><button id="studyBuildDb" type="button">ROMを解析</button></div>
      <p class="study-note">一般的なOCRではなく、EarthBoundのROM文字コードと会話ポインタを直接解析します。現在表示中の台詞との完全自動同期は次の段階です。</p>
      <div class="study-search"><label>台詞を検索</label><input id="studySearch" type="search" placeholder="例: Pokey / want to / meteorite" autocomplete="off"><small>英語の一部を入力するとROMから抽出した候補を表示します。</small></div>
      <div id="studyMatches" class="study-matches"><div class="study-empty">まず「ROMを解析」を押してください</div></div>
      <section id="studyDetail" class="study-detail hidden"><label>英語原文</label><div id="studyEnglish" class="study-output"></div><button class="study-small" id="studyTranslate" type="button">この英文だけ日本語に翻訳</button><p class="study-network-note">翻訳時のみ、上の英文だけを外部翻訳サービスへ送ります。ROMやゲーム画面は送りません。</p><label>日本語訳</label><div id="studyJapanese" class="study-output">まだ翻訳していません</div><label>学習候補の単語</label><div id="studyWords" class="study-words"></div></section>
    </div></section>`;
    player.appendChild(wrap);
    wrap.querySelectorAll('[data-study-close]').forEach(el=>el.addEventListener('click',closeStudy));
    $('studyBuildDb').addEventListener('click',buildDialogueDb);
    $('studySearch').addEventListener('input',renderSearch);
    $('studyTranslate').addEventListener('click',()=>state.selected&&translateSelected(state.selected));
  }
  function openStudy(){ensureStudyUi();$('englishStudySheet').classList.remove('hidden');restoreIndex();}
  function closeStudy(){$('englishStudySheet')?.classList.add('hidden');}
  function setDbStatus(main,meta=''){if($('studyDbStatus'))$('studyDbStatus').textContent=main;if($('studyDbMeta'))$('studyDbMeta').textContent=meta;}

  function openAppDb(){return new Promise((res,rej)=>{const r=indexedDB.open(APP_DB,APP_DB_VERSION);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function loadCachedRom(){const db=await openAppDb();const rec=await new Promise((res,rej)=>{const tx=db.transaction(ROM_STORE,'readonly'),q=tx.objectStore(ROM_STORE).get(LAST_ROM);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error);});db.close();return rec?new File([rec.data],rec.name,{type:rec.type||'application/octet-stream',lastModified:rec.lastModified||Date.now()}):null;}
  function openStudyDb(){return new Promise((res,rej)=>{const r=indexedDB.open(STUDY_DB,STUDY_DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(INDEX_STORE))db.createObjectStore(INDEX_STORE);if(!db.objectStoreNames.contains(TRANS_STORE))db.createObjectStore(TRANS_STORE);};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function studyGet(store,key){const db=await openStudyDb();const v=await new Promise((res,rej)=>{const tx=db.transaction(store,'readonly'),q=tx.objectStore(store).get(key);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error);});db.close();return v;}
  async function studyPut(store,key,val){const db=await openStudyDb();await new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(val,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();}

  async function sha256(bytes){const h=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('');}
  function stripHeader(u8){return u8.length%1024===512?u8.subarray(512):u8;}
  function isStoredPrintable(b){const c=b-0x30;return c>=0x20&&c<=0x7e;}
  function controlOperandBytes(rom,pos){const b=rom[pos];if(b>=0x20)return 0;let base=CONTROL_COUNTS[b]||0;if(base<1)return base;if([0x18,0x19,0x1a,0x1c,0x1d].includes(b)){const sub=rom[pos+1]||0;let extra=0;if(b===0x18)extra=EXTRA18[sub]||0;else if(b===0x19)extra=EXTRA19[sub]||0;else if(b===0x1a)extra=EXTRA1A[sub]||0;else if(b===0x1c)extra=EXTRA1C[sub]||0;else extra=(sub===0x20||sub===0x22)?0:1;return 1+extra;}return base;}
  function cleanEnglish(s){return s.replace(/\s+/g,' ').replace(/^\s+|\s+$/g,'').replace(/\s+([,.!?;:])/g,'$1');}
  function englishScore(s){if(s.length<7)return-99;const letters=(s.match(/[A-Za-z]/g)||[]).length,spaces=(s.match(/ /g)||[]).length,bad=(s.match(/[^A-Za-z0-9 .,!?\-'@:;()/]/g)||[]).length,words=(s.toLowerCase().match(/[a-z']+/g)||[]);const common=words.reduce((n,w)=>n+(COMMON.has(w)?1:0),0),vowels=(s.match(/[aeiouy]/gi)||[]).length,vr=vowels/Math.max(1,letters);return common*3+Math.min(letters,40)/20+spaces*.3-bad*2-(vr>.2&&vr<.66?0:3);}
  function addCandidate(map,text,offset,source,score){text=cleanEnglish(text);if(text.length<7||score<5)return;const key=text.toLowerCase();const old=map.get(key);if(!old||score>old.score)map.set(key,{text,offset,source,score});}

  function decodePointerBlock(rom,off){let pos=off,out='',safety=0;while(pos<rom.length&&safety++<4096){const b=rom[pos];if(b===0)break;if(isStoredPrintable(b)){out+=String.fromCharCode(b-0x30);pos++;continue;}if(b<0x20){if(b===1||b===2||b===3)out+=' ';pos+=1+controlOperandBytes(rom,pos);continue;}break;}return cleanEnglish(out);}
  function resolvePtr(rom,table,id){const p=table+id*4;if(p+3>=rom.length)return-1;const addr=rom[p]|(rom[p+1]<<8),bank=rom[p+2];const off=((bank&0x3f)<<16)|addr;return off>=0&&off<rom.length?off:-1;}
  function extractDialogue(rom){
    const map=new Map();let pointerHits=0;
    for(let t=0;t<PTR_TABLES.length;t++)for(let id=0;id<256;id++){const off=resolvePtr(rom,PTR_TABLES[t],id);if(off<0)continue;const text=decodePointerBlock(rom,off),sc=englishScore(text);if(sc>=5){pointerHits++;addCandidate(map,text,off,`ptr${t}:${id}`,sc+2);}}
    for(let i=0;i<rom.length;){if(!isStoredPrintable(rom[i])){i++;continue;}const start=i;let pos=i,out='',controls=0;while(pos<rom.length&&pos-start<700){const b=rom[pos];if(isStoredPrintable(b)){out+=String.fromCharCode(b-0x30);pos++;continue;}if(b<0x20&&b!==0&&controls<10){out+=' ';pos+=1+controlOperandBytes(rom,pos);controls++;continue;}break;}const text=cleanEnglish(out),sc=englishScore(text);if(sc>=5)addCandidate(map,text,start,'scan',sc);i=Math.max(i+1,pos);}
    const items=[...map.values()].sort((a,b)=>b.score-a.score).slice(0,2500);return{items,pointerHits,scanned:map.size};
  }

  async function buildDialogueDb(){
    if(state.busy)return;state.busy=true;$('studyBuildDb').disabled=true;setDbStatus('ROMを解析中…','端末内だけで処理しています');
    try{
      const f=await loadCachedRom();if(!f)throw new Error('保存済みROMがありません');
      const raw=await f.arrayBuffer(),hash=await sha256(raw),rom=stripHeader(new Uint8Array(raw));state.romHash=hash;
      const result=extractDialogue(rom);const rec={hash,name:f.name,size:f.size,createdAt:Date.now(),knownEarthBound:hash===KNOWN_EB_SHA256,pointerHits:result.pointerHits,items:result.items};
      await studyPut(INDEX_STORE,hash,rec);await studyPut(INDEX_STORE,'last',rec);state.index=rec;
      setDbStatus(`${rec.items.length.toLocaleString()}件を抽出`,`${rec.knownEarthBound?'EarthBound USAを確認':'ROMを解析'} · 共通会話ポインタ ${rec.pointerHits}件`);renderSearch();
    }catch(e){console.warn(e);setDbStatus('解析できませんでした',e.message||'ROMを確認してください');}
    finally{state.busy=false;$('studyBuildDb').disabled=false;}
  }
  async function restoreIndex(){try{const rec=await studyGet(INDEX_STORE,'last');if(rec?.items?.length){state.index=rec;state.romHash=rec.hash;setDbStatus(`${rec.items.length.toLocaleString()}件を保存済み`,`${rec.knownEarthBound?'EarthBound USA':'ROM'} · ${new Date(rec.createdAt).toLocaleString('ja-JP')}`);renderSearch();}}catch(e){console.warn(e);}}

  function renderSearch(){const box=$('studyMatches');if(!box)return;if(!state.index?.items?.length){box.innerHTML='<div class="study-empty">まず「ROMを解析」を押してください</div>';return;}const q=($('studySearch')?.value||'').trim().toLowerCase();let list=state.index.items;if(q)list=list.filter(x=>x.text.toLowerCase().includes(q));else list=list.slice(0,12);list=list.slice(0,40);box.innerHTML='';if(!list.length){box.innerHTML='<div class="study-empty">一致する台詞がありません</div>';return;}for(const item of list){const b=document.createElement('button');b.type='button';b.className='study-match';b.innerHTML=`<span>${escapeHtml(item.text.slice(0,220))}${item.text.length>220?'…':''}</span><small>ROM 0x${item.offset.toString(16).toUpperCase()} · ${item.source}</small>`;b.addEventListener('click',()=>selectItem(item));box.appendChild(b);}}
  async function selectItem(item){state.selected=item;$('studyDetail').classList.remove('hidden');$('studyEnglish').textContent=item.text;$('studyJapanese').textContent='翻訳する場合は上のボタンを押してください';renderWords(item.text);const cached=await studyGet(TRANS_STORE,textKey(item.text));if(cached?.ja)$('studyJapanese').textContent=cached.ja;}
  function textKey(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(state.romHash||'rom')+':'+(h>>>0).toString(16);}
  async function translateSelected(item){const out=$('studyJapanese');out.textContent='翻訳しています…';try{const cached=await studyGet(TRANS_STORE,textKey(item.text));if(cached?.ja){out.textContent=cached.ja;return;}const q=item.text.slice(0,480),url='https://api.mymemory.translated.net/get?q='+encodeURIComponent(q)+'&langpair=en|ja';const r=await fetch(url);if(!r.ok)throw new Error('翻訳サービスに接続できません');const j=await r.json(),ja=j?.responseData?.translatedText||'';if(!ja)throw new Error('翻訳結果がありません');out.textContent=ja;await studyPut(TRANS_STORE,textKey(item.text),{en:item.text,ja,time:Date.now()});}catch(e){console.warn(e);out.textContent='翻訳を取得できませんでした。ROM内の英語データは端末に残っています。';}}
  function renderWords(text){const box=$('studyWords');if(!box)return;const stop=new Set('the a an and or but if then to of in on at for from with as is are was were be this that it i you he she we they my your his her our their me him us them do does did have has had can could will would should may might not no yes'.split(' '));const words=(text.toLowerCase().match(/[a-z][a-z'-]{2,}/g)||[]).filter(w=>!stop.has(w));const u=[...new Set(words)].slice(0,18);box.innerHTML=u.length?u.map(w=>`<span>${escapeHtml(w)}</span>`).join(''):'<span>単語候補なし</span>';}
  function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

  ensureStudyUi();injectMenuEntry();new MutationObserver(injectMenuEntry).observe(drawer,{childList:true,subtree:true});
})();