(() => {
  const $ = (id) => document.getElementById(id);
  const LS_KEY = 'retro-pocket-simple-subtitles';
  let wantedOn = localStorage.getItem(LS_KEY) !== 'off';
  let booted = false;

  function setSimpleMenu() {
    const original = $('englishStudyOpen');
    if (!original || original.dataset.simple === '1') return;
    const clone = original.cloneNode(true);
    clone.dataset.simple = '1';
    clone.innerHTML = `<span><b>日本語字幕</b><small>ゲーム中の英文を自動翻訳</small></span><i id="simpleSubtitleState">${wantedOn ? 'ON' : 'OFF'}</i>`;
    original.replaceWith(clone);
    clone.addEventListener('click', () => {
      wantedOn = !wantedOn;
      localStorage.setItem(LS_KEY, wantedOn ? 'on' : 'off');
      syncLiveState(true);
      const s = $('simpleSubtitleState');
      if (s) s.textContent = wantedOn ? 'ON' : 'OFF';
    });
  }

  async function makeDbReady() {
    const status = $('studyDbStatus');
    const build = $('studyBuildDb');
    if (!status || !build) return;
    const txt = status.textContent || '';
    if (/未作成|解析できません/.test(txt) && !build.disabled) {
      build.click();
    }
  }

  function syncLiveState(userAction = false) {
    const toggle = $('liveStudyToggle');
    const auto = $('liveAutoTranslate');
    if (!toggle) return;
    if (auto) {
      auto.checked = true;
      auto.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const isOn = (toggle.textContent || '').trim().toUpperCase() === 'ON';
    if (wantedOn !== isOn) toggle.click();
    const s = $('simpleSubtitleState');
    if (s) s.textContent = wantedOn ? 'ON' : 'OFF';
    if (userAction && wantedOn) makeDbReady();
  }

  function simplifyOverlay() {
    const box = $('liveStudySubtitle');
    if (!box) return;
    const en = $('liveStudyEn');
    const conf = $('liveStudyConfidence');
    if (en) en.style.display = 'none';
    if (conf) conf.style.display = 'none';
    box.setAttribute('aria-label', '日本語字幕');
  }

  function hideDeveloperStudyUi() {
    const sheet = $('englishStudySheet');
    if (sheet) sheet.classList.add('simple-hidden-study');
  }

  function boot() {
    setSimpleMenu();
    simplifyOverlay();
    hideDeveloperStudyUi();
    syncLiveState(false);
    if (wantedOn) makeDbReady();
    booted = true;
  }

  const obs = new MutationObserver(() => {
    setSimpleMenu();
    simplifyOverlay();
    hideDeveloperStudyUi();
    if (!booted) boot();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('load', () => setTimeout(boot, 700));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(() => { boot(); }, 300);
  });
})();
