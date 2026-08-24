(() => {
  const $=(id)=>document.getElementById(id);
  const player=$('playerView');
  const drawer=$('gameMenuDrawer');
  if(!player||!drawer)return;

  const state={busy:false,lastText:'',lastTranslation:'',tesseractReady:false};
  const STOP=new Set('the a an and or but if then to of in on at for from with as is are was were be been being this that these those it its i you he she we they my your his her our their me him us them do does did have has had can could will would should may might not no yes just very really there here what when where who why how'.split(' '));

  function injectMenuEntry(){
    const list=drawer.querySelector('.feature-menu-list');
    if(!list||$('englishStudyOpen'))return;
    const b=document.createElement('button');b.id='englishStudyOpen';b.type='button';
    b.innerHTML='<span><b>📚 英語学習</b><small>今の画面を読み取り・翻訳</small></span><i>›</i>';
    const reload=$('reloadGame'); if(reload)list.insertBefore(b,reload); else list.appendChild(b);
    b.addEventListener('click',()=>{closeSettings();openStudy();});
  }

  function closeSettings(){
    drawer.classList.add('hidden');$('menuBackdrop')?.classList.add('hidden');document.body.classList.remove('menu-open');
  }

  function ensureStudyUi(){
    if($('englishStudySheet'))return;
    const wrap=document.createElement('div');wrap.id='englishStudySheet';wrap.className='study-sheet hidden';
    wrap.innerHTML=`<div class="study-backdrop" data-study-close></div><section class="study-card" aria-label="英語学習モード"><header><div><small>ENGLISH STUDY · 試作</small><strong>今の画面から学ぶ</strong></div><button type="button" data-study-close>×</button></header><div class="study-body"><div class="study-shot-wrap"><canvas id="studyShot" width="256" height="224"></canvas><span id="studyStage">ゲーム画面を取得します</span></div><button class="study-primary" id="studyScan" type="button">今の画面を読み取る</button><p class="study-note">まずはEarthBoundのドット文字でOCR精度を検証します。認識した英文だけを翻訳します。</p><section class="study-result"><label>読み取った英語</label><textarea id="studyEnglish" rows="4" placeholder="ここに英文が表示されます"></textarea><button class="study-small" id="studyTranslate" type="button">この英文を翻訳</button><label>日本語訳</label><div id="studyJapanese" class="study-output">まだ翻訳していません</div><label>学習候補の単語</label><div id="studyWords" class="study-words"><span>英文を読み取ると表示されます</span></div></section></div></section>`;
    player.appendChild(wrap);
    wrap.querySelectorAll('[data-study-close]').forEach(el=>el.addEventListener('click',closeStudy));
    $('studyScan').addEventListener('click',scanCurrentFrame);
    $('studyTranslate').addEventListener('click',()=>translateText($('studyEnglish').value));
  }

  function openStudy(){ensureStudyUi();$('englishStudySheet').classList.remove('hidden');capturePreview();}
  function closeStudy(){$('englishStudySheet')?.classList.add('hidden');}
  function setStage(t){const el=$('studyStage');if(el)el.textContent=t;}

  function findGameCanvas(){
    const canvases=[...document.querySelectorAll('#game canvas')].filter(c=>c.width>64&&c.height>64);
    if(!canvases.length)return null;
    return canvases.sort((a,b)=>(b.width*b.height)-(a.width*a.height))[0];
  }

  function capturePreview(){
    const src=findGameCanvas(),dst=$('studyShot');if(!src||!dst){setStage('ゲーム画面を取得できません');return null;}
    const ctx=dst.getContext('2d');dst.width=src.width;dst.height=src.height;ctx.imageSmoothingEnabled=false;
    try{ctx.drawImage(src,0,0);setStage('現在のゲーム画面');return dst;}catch(e){console.warn(e);setStage('画面取得に失敗しました');return null;}
  }

  function preprocess(src){
    const out=document.createElement('canvas');const scale=3;out.width=src.width*scale;out.height=src.height*scale;
    const c=out.getContext('2d',{willReadFrequently:true});c.imageSmoothingEnabled=false;c.drawImage(src,0,0,out.width,out.height);
    const img=c.getImageData(0,0,out.width,out.height),d=img.data;
    for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];const v=y>145?255:0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}
    c.putImageData(img,0,0);return out;
  }

  async function loadTesseract(){
    if(window.Tesseract)return window.Tesseract;
    setStage('文字認識エンジンを準備中…');
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
    return window.Tesseract;
  }

  async function scanCurrentFrame(){
    if(state.busy)return;state.busy=true;$('studyScan').disabled=true;
    try{
      const shot=capturePreview();if(!shot)throw new Error('no canvas');
      const T=await loadTesseract();setStage('英語を読み取っています…');
      const processed=preprocess(shot);
      const result=await T.recognize(processed,'eng',{logger:m=>{if(m.status==='recognizing text')setStage(`文字認識 ${Math.round((m.progress||0)*100)}%`);}});
      const text=cleanText(result?.data?.text||'');state.lastText=text;$('studyEnglish').value=text;renderWords(text);
      setStage(text?'英文を読み取りました':'英文を認識できませんでした');
      if(text)await translateText(text);
    }catch(e){console.warn(e);setStage('読み取りに失敗しました');$('studyJapanese').textContent='この画面ではOCRできませんでした。会話ウィンドウを表示してもう一度試してください。';}
    finally{state.busy=false;$('studyScan').disabled=false;}
  }

  function cleanText(t){return t.replace(/[^\x20-\x7E\n]/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').split('\n').map(s=>s.trim()).filter(Boolean).join('\n').trim();}

  async function translateText(text){
    text=(text||'').trim();if(!text)return;
    const out=$('studyJapanese');out.textContent='翻訳しています…';
    try{
      const q=text.slice(0,480);const url='https://api.mymemory.translated.net/get?q='+encodeURIComponent(q)+'&langpair=en|ja';
      const r=await fetch(url);if(!r.ok)throw new Error('translate');const j=await r.json();
      const translated=j?.responseData?.translatedText||'';state.lastTranslation=translated;out.textContent=translated||'翻訳結果を取得できませんでした';
    }catch(e){console.warn(e);out.textContent='自動翻訳を取得できませんでした。OCR結果は上の欄で確認できます。';}
  }

  function renderWords(text){
    const box=$('studyWords');if(!box)return;const words=(text.toLowerCase().match(/[a-z][a-z'-]{2,}/g)||[]).filter(w=>!STOP.has(w));
    const unique=[...new Set(words)].slice(0,14);box.innerHTML=unique.length?unique.map(w=>`<button type="button" data-word="${escapeHtml(w)}">${escapeHtml(w)}</button>`).join(''):'<span>単語候補は見つかりませんでした</span>';
  }
  function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

  ensureStudyUi();injectMenuEntry();
  const mo=new MutationObserver(()=>injectMenuEntry());mo.observe(drawer,{childList:true,subtree:true});
})();