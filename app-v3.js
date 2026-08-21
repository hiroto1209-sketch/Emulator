const $ = (id) => document.getElementById(id);
const HISTORY_KEY='retro-pocket-history-v1', DB_NAME='retro-pocket-db', DB_VERSION=2, ROM_STORE='roms', STATE_STORE='states', LAST_ROM='last-rom', LAYOUT_PREFIX='retro-pocket-layout-v3-';
const supported=['sfc','smc','fig','gd3','gd7','dx2','bsx','swc'];
const DEFAULT_LAYOUTS={portrait:{scale:100,units:{l:{x:3,y:3},r:{x:85,y:3},stick:{x:3,y:25},dpad:{x:25,y:25},system:{x:42,y:68},face:{x:70,y:27}}},landscape:{scale:90,units:{l:{x:2,y:3},r:{x:89,y:3},stick:{x:4,y:22},dpad:{x:24,y:22},system:{x:43,y:61},face:{x:74,y:22}}}};
const EARTHBOUND_CHEATS=[
 {name:'無限HP（全員）',code:'8251-57D6',tag:'常時'},
 {name:'戦闘をほぼ即勝利',code:'DD15-ED6B+DD13-EF0B',tag:'常時'},
 {name:'壁・地形をすり抜け',code:'FD93-776F',tag:'常時'},
 {name:'戦闘後 Lv99',code:'EE2E-54A1',tag:'常時'},
 {name:'毎戦闘でレベルUP',code:'F2EB-54D1',tag:'常時'},
 {name:'開始時 Lv9',code:'DB23-77D1',tag:'開始時'},
 {name:'開始時 Lv15',code:'DE23-77D1',tag:'開始時'},
 {name:'開始時 Lv50',code:'7423-77D1',tag:'開始時'},
 {name:'開始時 Lv100',code:'1723-77D1',tag:'開始時'},
 {name:'開始時 Lv255',code:'EE23-77D1',tag:'開始時'},
 {name:'開始時 超強力',code:'EE2E-7D01',tag:'開始時'},
 {name:'開始時 HP大量',code:'BB2D-5461',tag:'開始時'},
 {name:'開始時 PSI大量',code:'BB2F-54A1',tag:'開始時'},
 {name:'無限 Super Bomb',code:'DE1C-81F9',tag:'アイテム'},
 {name:'無限 Big Bottle Rocket',code:'D017-8029',tag:'アイテム'},
 {name:'無限 Magic Truffle',code:'DE97-E095',tag:'アイテム'}
];

let activeFile=null, activeGameId=null, emulatorStarted=false, layoutEditing=false, currentLayout=null, dragState=null, turboMode=false, fastForward=false, stickPointer=null, stickDirs=new Set(), backgrounded=false;
const pressedPointers=new Map(), turboTimers=new Map(), cheatStates=new Map();

const els={romInput:$('romInput'),chooseRom:$('chooseRom'),continueGame:$('continueGame'),cachedGameInfo:$('cachedGameInfo'),changeRom:$('changeRom'),reloadGame:$('reloadGame'),backToLibrary:$('backToLibrary'),clearHistory:$('clearHistory'),libraryView:$('libraryView'),playerView:$('playerView'),loadingState:$('loadingState'),recentGames:$('recentGames'),emptyLibrary:$('emptyLibrary'),nowPlaying:$('nowPlaying'),fileName:$('fileName'),status:$('status'),snesController:$('snesController'),resumeBanner:$('resumeBanner'),resumeNow:$('resumeNow'),layoutEditToggle:$('layoutEditToggle'),layoutPanel:$('layoutPanel'),layoutDone:$('layoutDone'),layoutReset:$('layoutReset'),layoutSave:$('layoutSave'),controllerScale:$('controllerScale'),scaleValue:$('scaleValue'),orientationLabel:$('orientationLabel'),layoutCanvas:$('layoutCanvas'),savePanel:$('savePanel'),cheatPanel:$('cheatPanel'),savePanelToggle:$('savePanelToggle'),cheatPanelToggle:$('cheatPanelToggle'),turboToggle:$('turboToggle'),fastForwardToggle:$('fastForwardToggle'),cheatGrid:$('cheatGrid'),disableAllCheats:$('disableAllCheats'),analogStick:$('analogStick'),stickKnob:$('stickKnob'),loadAutoResume:$('loadAutoResume')};

els.chooseRom.onclick=()=>els.romInput.click(); els.changeRom.onclick=()=>els.romInput.click();
els.continueGame.onclick=async()=>{const f=await loadCachedRom();if(f)bootRom(f,{fromCache:true,autoState:true});};
els.reloadGame.onclick=async()=>{const f=activeFile||await loadCachedRom();if(f){await saveStateSlot('auto',true);location.reload();}};
els.backToLibrary.onclick=()=>location.reload(); els.resumeNow.onclick=resumeAfterBackground;
els.clearHistory.onclick=()=>{localStorage.removeItem(HISTORY_KEY);renderHistory();};
els.romInput.onchange=async(e)=>{const f=e.target.files?.[0];if(!f)return;await cacheRom(f);bootRom(f,{fromCache:false,autoState:false});};
els.savePanelToggle.onclick=()=>togglePanel(els.savePanel); els.cheatPanelToggle.onclick=()=>togglePanel(els.cheatPanel);
els.turboToggle.onclick=()=>{turboMode=!turboMode;els.turboToggle.classList.toggle('active',turboMode);els.turboToggle.textContent=turboMode?'TURBO ON':'TURBO OFF';};
els.fastForwardToggle.onclick=()=>{const gm=gameManager();if(!gm)return;fastForward=!fastForward;try{gm.setFastForwardRatio(2);gm.toggleFastForward(fastForward?1:0);}catch{}els.fastForwardToggle.classList.toggle('active',fastForward);};

document.querySelectorAll('[data-close-panel]').forEach(b=>b.onclick=()=>$(b.dataset.closePanel).classList.add('hidden'));
document.querySelectorAll('[data-save-slot]').forEach(b=>b.onclick=()=>saveStateSlot(b.dataset.saveSlot));
document.querySelectorAll('[data-load-slot]').forEach(b=>b.onclick=()=>loadStateSlot(b.dataset.loadSlot));
els.loadAutoResume.onclick=()=>loadStateSlot('auto');
els.disableAllCheats.onclick=disableAllCheats;

setupController(); setupStick(); setupLayoutEditor(); renderHistory(); refreshCachedGame(); refreshSlotStatuses(); renderCheats(); applySavedLayout();

async function bootRom(file,options={}){
 const ext=file.name.split('.').pop()?.toLowerCase(); if(!supported.includes(ext)){alert('対応するSNES ROMを選択してください。');return;}
 activeFile=file; const title=file.name.replace(/\.[^.]+$/,''); activeGameId=hashString(`${title}:${file.size}`); rememberGame(title,ext,file.size);
 els.libraryView.classList.add('hidden'); els.playerView.classList.remove('hidden'); els.nowPlaying.textContent=title; els.fileName.textContent=`${file.name} · ${formatBytes(file.size)}`; els.status.textContent='ROM読込中…'; showLoading(options.fromCache?'端末内ROMから起動しています':'ゲームを起動しています'); applySavedLayout(); renderCheats(title);
 window.EJS_player='#game'; window.EJS_core='snes'; window.EJS_gameName=title; window.EJS_gameUrl=file; window.EJS_pathtodata='https://cdn.emulatorjs.org/stable/data/'; window.EJS_language='ja-JP'; window.EJS_disableAutoLang=true; window.EJS_startOnLoaded=true; window.EJS_browserMode='mobile'; window.EJS_threads=false; window.EJS_gameID=activeGameId; window.EJS_fixedSaveInterval=7000; window.EJS_controlScheme='snes'; window.EJS_askBeforeExit=false; window.EJS_defaultOptions={'save-state-location':'browser',rewindEnabled:'enabled'};
 window.EJS_cheats=title.toLowerCase().includes('earthbound')?EARTHBOUND_CHEATS.map(c=>[c.name,c.code]):[];
 window.EJS_ready=()=>{els.status.textContent='エミュレータ準備完了';};
 window.EJS_onGameStart=async()=>{emulatorStarted=true;els.loadingState.classList.add('hidden');els.status.textContent='プレイ中';focusGame();await refreshSlotStatuses();if(options.autoState){setTimeout(async()=>{const ok=await loadStateSlot('auto',true);if(ok)flashStatus('前回の状態を復元しました');},650);}};
 const old=document.querySelector('script[data-retro-loader]');if(old)old.remove();const loader=document.createElement('script');loader.src=window.EJS_pathtodata+'loader.js';loader.async=true;loader.dataset.retroLoader='1';loader.onerror=()=>showLoading('EmulatorJSの読み込みに失敗しました');document.body.appendChild(loader);
}

function gameManager(){return window.EJS_emulator?.gameManager||null;}
function directInput(index,value){const gm=gameManager();if(!gm||layoutEditing)return false;try{gm.simulateInput(0,Number(index),value?1:0);return true;}catch{return false;}}

function setupController(){
 document.querySelectorAll('.pad-btn[data-input]').forEach(btn=>{
  btn.style.touchAction='none';
  btn.addEventListener('pointerdown',e=>{e.preventDefault();if(layoutEditing)return;const idx=Number(btn.dataset.input);try{btn.setPointerCapture(e.pointerId);}catch{} pressedPointers.set(e.pointerId,{btn,idx});directInput(idx,1);btn.classList.add('pressed');if(turboMode&&btn.dataset.turbo==='true')startTurbo(e.pointerId,idx);},{passive:false});
  const up=e=>{e.preventDefault();const p=pressedPointers.get(e.pointerId);if(!p)return;stopTurbo(e.pointerId);directInput(p.idx,0);p.btn.classList.remove('pressed');pressedPointers.delete(e.pointerId);};
  btn.addEventListener('pointerup',up,{passive:false});btn.addEventListener('pointercancel',up,{passive:false});btn.addEventListener('lostpointercapture',up,{passive:false});
 });
 window.addEventListener('blur',onBackground);document.addEventListener('visibilitychange',()=>document.hidden?onBackground():resumeAfterBackground());window.addEventListener('pageshow',()=>{releaseAll();if(emulatorStarted)resumeCore();});
}
function startTurbo(pointerId,index){stopTurbo(pointerId);let on=true;turboTimers.set(pointerId,setInterval(()=>{on=!on;directInput(index,on?1:0);},42));}
function stopTurbo(pointerId){const t=turboTimers.get(pointerId);if(t){clearInterval(t);turboTimers.delete(pointerId);}}
function releaseAll(){for(const [pid,p] of pressedPointers){stopTurbo(pid);directInput(p.idx,0);p.btn.classList.remove('pressed');}pressedPointers.clear();releaseStick();}

function setupStick(){if(!els.analogStick)return;els.analogStick.style.touchAction='none';els.analogStick.onpointerdown=e=>{if(layoutEditing)return;e.preventDefault();stickPointer=e.pointerId;try{els.analogStick.setPointerCapture(e.pointerId);}catch{}updateStick(e);};els.analogStick.onpointermove=e=>{if(e.pointerId===stickPointer&&!layoutEditing)updateStick(e);};const end=e=>{if(e.pointerId===stickPointer){releaseStick();stickPointer=null;}};els.analogStick.onpointerup=end;els.analogStick.onpointercancel=end;els.analogStick.onlostpointercapture=end;}
function updateStick(e){const r=els.analogStick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.32,mag=Math.hypot(dx,dy)||1,scale=Math.min(1,max/mag),x=dx*scale,y=dy*scale;els.stickKnob.style.transform=`translate(${x}px,${y}px)`;const threshold=r.width*.12,newDirs=new Set();if(dx>threshold)newDirs.add(7);if(dx<-threshold)newDirs.add(6);if(dy>threshold)newDirs.add(5);if(dy<-threshold)newDirs.add(4);for(const d of stickDirs)if(!newDirs.has(d))directInput(d,0);for(const d of newDirs)if(!stickDirs.has(d))directInput(d,1);stickDirs=newDirs;}
function releaseStick(){for(const d of stickDirs)directInput(d,0);stickDirs.clear();if(els.stickKnob)els.stickKnob.style.transform='translate(0,0)';}

async function onBackground(){if(!emulatorStarted||backgrounded)return;backgrounded=true;releaseAll();els.status.textContent='バックグラウンド保存中';const gm=gameManager();try{gm?.toggleMainLoop(0);}catch{};await saveStateSlot('auto',true);els.status.textContent='一時停止中';}
function resumeCore(){const gm=gameManager();try{gm?.toggleMainLoop(1);}catch{}focusGame();els.status.textContent='プレイ中';}
function resumeAfterBackground(){if(!emulatorStarted)return;releaseAll();resumeCore();if(backgrounded){backgrounded=false;els.resumeBanner.classList.remove('hidden');setTimeout(()=>els.resumeBanner.classList.add('hidden'),1800);}}

async function saveStateSlot(slot,silent=false){const gm=gameManager();if(!gm||!activeGameId)return false;try{const wasBg=backgrounded;if(!wasBg)gm.toggleMainLoop(0);await delay(35);const raw=await Promise.resolve(gm.getState());const state=raw instanceof Uint8Array?raw:new Uint8Array(raw);await putState(slot,state);if(!wasBg)gm.toggleMainLoop(1);if(!silent)flashStatus(`スロット ${slot} に保存しました`);await refreshSlotStatuses();return true;}catch(e){console.warn(e);if(!silent)flashStatus('ステート保存に失敗しました');return false;}}
async function loadStateSlot(slot,silent=false){const gm=gameManager();if(!gm||!activeGameId)return false;const rec=await getState(slot);if(!rec||rec.gameId!==activeGameId){if(!silent)flashStatus('このスロットに保存データがありません');return false;}try{gm.toggleMainLoop(0);await delay(60);gm.loadState(new Uint8Array(rec.data));await delay(80);gm.toggleMainLoop(1);focusGame();if(!silent)flashStatus(`スロット ${slot} を読み込みました`);return true;}catch(e){console.warn(e);try{gm.toggleMainLoop(1);}catch{}if(!silent)flashStatus('ステート読み込みに失敗しました');return false;}}

function renderCheats(title=els.nowPlaying?.textContent||''){if(!els.cheatGrid)return;const isEarth=title.toLowerCase().includes('earthbound')||title==='Game';els.cheatGrid.innerHTML='';if(!isEarth){els.cheatGrid.innerHTML='<p class="panel-note">現在はEarthBound用プリセットを収録しています。</p>';return;}EARTHBOUND_CHEATS.forEach((c,i)=>{const b=document.createElement('button');b.className='cheat-card';b.innerHTML=`<strong>${escapeHtml(c.name)}</strong><small>${c.tag} · ${c.code}</small><span>OFF</span>`;b.onclick=()=>toggleCheat(i,c,b);els.cheatGrid.appendChild(b);});}
function toggleCheat(index,cheat,button){const gm=gameManager();if(!gm){flashStatus('ゲーム起動後に使用できます');return;}const enabled=!cheatStates.get(index);try{gm.setCheat(index,enabled?1:0,cheat.code);cheatStates.set(index,enabled);button.classList.toggle('active',enabled);button.querySelector('span').textContent=enabled?'ON':'OFF';flashStatus(`${cheat.name}: ${enabled?'ON':'OFF'}`);}catch(e){console.warn(e);flashStatus('このコードを適用できませんでした');}}
function disableAllCheats(){const gm=gameManager();try{gm?.resetCheat();}catch{}cheatStates.clear();document.querySelectorAll('.cheat-card.active').forEach(b=>{b.classList.remove('active');const s=b.querySelector('span');if(s)s.textContent='OFF';});flashStatus('チートをすべてOFFにしました');}

function togglePanel(panel){panel.classList.toggle('hidden');}
function setupLayoutEditor(){els.layoutEditToggle.onclick=()=>setLayoutEditing(!layoutEditing);els.layoutDone.onclick=()=>{saveLayout();setLayoutEditing(false)};els.layoutSave.onclick=()=>{saveLayout();flashStatus('配置を保存しました')};els.layoutReset.onclick=()=>{currentLayout=cloneDefault();applyLayout(currentLayout);saveLayout()};els.controllerScale.oninput=()=>{currentLayout.scale=Number(els.controllerScale.value);applyLayout(currentLayout)};document.querySelectorAll('.control-unit').forEach(unit=>{unit.onpointerdown=e=>{if(!layoutEditing)return;e.preventDefault();e.stopPropagation();const c=els.layoutCanvas.getBoundingClientRect(),u=unit.getBoundingClientRect();dragState={unit,id:e.pointerId,c,ox:e.clientX-u.left,oy:e.clientY-u.top};try{unit.setPointerCapture(e.pointerId)}catch{}};unit.onpointermove=e=>{if(!dragState||dragState.unit!==unit)return;const c=dragState.c,maxX=Math.max(1,c.width-unit.offsetWidth),maxY=Math.max(1,c.height-unit.offsetHeight),x=clamp((e.clientX-c.left-dragState.ox)/maxX*100,0,100),y=clamp((e.clientY-c.top-dragState.oy)/maxY*100,0,100);currentLayout.units[unit.dataset.unit]={x,y};positionUnit(unit,{x,y})};const end=()=>{if(dragState?.unit===unit)dragState=null};unit.onpointerup=end;unit.onpointercancel=end;unit.onlostpointercapture=end;});window.addEventListener('orientationchange',()=>setTimeout(applySavedLayout,180));}
function orientationKey(){return matchMedia('(orientation: landscape)').matches?'landscape':'portrait'}function layoutKey(){return LAYOUT_PREFIX+orientationKey()}function cloneDefault(){return JSON.parse(JSON.stringify(DEFAULT_LAYOUTS[orientationKey()]))}function loadLayout(){try{const x=JSON.parse(localStorage.getItem(layoutKey()));if(x?.units)return x}catch{}return cloneDefault()}function applySavedLayout(){currentLayout=loadLayout();applyLayout(currentLayout);if(els.orientationLabel)els.orientationLabel.textContent=orientationKey()==='landscape'?'横画面用':'縦画面用'}function applyLayout(l){if(!l)return;els.controllerScale.value=l.scale||100;els.scaleValue.textContent=`${l.scale||100}%`;els.layoutCanvas.style.setProperty('--controller-scale',(l.scale||100)/100);document.querySelectorAll('.control-unit').forEach(u=>{const p=l.units[u.dataset.unit];if(p)positionUnit(u,p)})}function positionUnit(u,p){u.style.left=`${p.x}%`;u.style.top=`${p.y}%`}function saveLayout(){localStorage.setItem(layoutKey(),JSON.stringify(currentLayout))}function setLayoutEditing(v){layoutEditing=v;releaseAll();els.snesController.classList.toggle('editing',v);els.layoutPanel.classList.toggle('hidden',!v);els.layoutEditToggle.classList.toggle('active',v);els.layoutEditToggle.textContent=v?'編集中':'配置設定'}

function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(ROM_STORE))db.createObjectStore(ROM_STORE);if(!db.objectStoreNames.contains(STATE_STORE))db.createObjectStore(STATE_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function cacheRom(file){const db=await openDb(),data=await file.arrayBuffer();await txPut(db,ROM_STORE,LAST_ROM,{name:file.name,type:file.type,lastModified:file.lastModified,data,size:file.size});db.close();await refreshCachedGame()}
async function loadCachedRom(){try{const db=await openDb(),r=await txGet(db,ROM_STORE,LAST_ROM);db.close();return r?new File([r.data],r.name,{type:r.type||'application/octet-stream',lastModified:r.lastModified||Date.now()}):null}catch{return null}}
async function putState(slot,state){const db=await openDb(),copy=state.slice().buffer;await txPut(db,STATE_STORE,String(slot),{gameId:activeGameId,data:copy,time:Date.now()});db.close()}
async function getState(slot){try{const db=await openDb(),r=await txGet(db,STATE_STORE,String(slot));db.close();return r}catch{return null}}
function txPut(db,store,key,val){return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(val,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}function txGet(db,store,key){return new Promise((res,rej)=>{const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).get(key);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)})}
async function refreshCachedGame(){const f=await loadCachedRom();els.continueGame.classList.toggle('hidden',!f);els.cachedGameInfo.classList.toggle('hidden',!f);if(f)els.cachedGameInfo.textContent=`保存済み: ${f.name} · ${formatBytes(f.size)}`}
async function refreshSlotStatuses(){for(const n of [1,2,3]){const el=$(`slot${n}Status`);if(!el)continue;const r=await getState(String(n));el.textContent=r&&(!activeGameId||r.gameId===activeGameId)?new Date(r.time).toLocaleString('ja-JP'):'未保存'}}

function rememberGame(title,ext,size){const h=getHistory().filter(g=>g.title!==title);h.unshift({title,ext:ext.toUpperCase(),size,playedAt:Date.now()});localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(0,12)))}function getHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY))||[]}catch{return[]}}function renderHistory(){const h=getHistory();els.recentGames.innerHTML='';els.emptyLibrary.classList.toggle('hidden',h.length>0);h.forEach((g,i)=>{const c=document.createElement('article');c.className='game-card';c.innerHTML=`<div class="cover"><span>${String(i+1).padStart(2,'0')}</span><b>16-BIT</b></div><div class="game-info"><strong>${escapeHtml(g.title)}</strong><p>SNES · ${g.ext} · ${formatBytes(g.size)}</p></div>`;els.recentGames.appendChild(c)})}
function showLoading(msg){els.loadingState.classList.remove('hidden');els.loadingState.innerHTML=`<div class="spinner"></div><strong>${escapeHtml(msg)}</strong><p id="fileName">${activeFile?escapeHtml(activeFile.name):''}</p>`}function flashStatus(msg){els.status.textContent=msg;setTimeout(()=>{if(emulatorStarted)els.status.textContent='プレイ中'},1600)}function focusGame(){const t=document.querySelector('#game canvas')||$('game');if(!t)return;t.setAttribute('tabindex','-1');try{t.focus({preventScroll:true})}catch{}}function delay(ms){return new Promise(r=>setTimeout(r,ms))}function clamp(v,a,b){return Math.max(a,Math.min(b,v))}function hashString(s){let h=0;for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return Math.abs(h)||1}function escapeHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}function formatBytes(b){return b<1048576?`${(b/1024).toFixed(1)} KB`:`${(b/1048576).toFixed(1)} MB`}
