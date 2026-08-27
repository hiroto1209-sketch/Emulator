(() => {
  // Install these guards before app-v3 boots EmulatorJS.
  // app-v3 currently asks EmulatorJS to save every 7 seconds and to keep rewind enabled.
  // On iOS Safari the core is intentionally non-threaded, so both can steal time from audio.
  let fixedSaveInterval = 60000;
  try {
    Object.defineProperty(window, 'EJS_fixedSaveInterval', {
      configurable: true,
      get(){ return fixedSaveInterval; },
      set(value){
        const n = Number(value);
        fixedSaveInterval = Number.isFinite(n) ? Math.max(60000, n) : 60000;
      }
    });
  } catch {}

  let defaultOptions = {};
  try {
    Object.defineProperty(window, 'EJS_defaultOptions', {
      configurable: true,
      get(){ return defaultOptions; },
      set(value){
        defaultOptions = {
          ...(value && typeof value === 'object' ? value : {}),
          rewindEnabled: 'disabled'
        };
      }
    });
  } catch {}

  const initTouchGuards = () => {
    const controller = document.getElementById('snesController');
    if (!controller || controller.dataset.iosZoomGuard === '1') return;
    controller.dataset.iosZoomGuard = '1';
    controller.style.touchAction = 'none';
    controller.style.webkitUserSelect = 'none';

    let lastTouchEnd = 0;
    controller.addEventListener('touchend', e => {
      if (controller.classList.contains('editing')) return;
      const now = performance.now();
      if (now - lastTouchEnd < 340) e.preventDefault();
      lastTouchEnd = now;
    }, {capture:true, passive:false});

    controller.addEventListener('dblclick', e => {
      e.preventDefault();
      e.stopPropagation();
    }, {capture:true});

    // iOS emits gesture events for browser pinch zoom independently of pointer events.
    // Keep page zoom disabled over the controller; the layout editor handles its own 2-finger scaling.
    ['gesturestart','gesturechange','gestureend'].forEach(type => {
      controller.addEventListener(type, e => e.preventDefault(), {capture:true, passive:false});
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTouchGuards, {once:true});
  } else {
    initTouchGuards();
  }

  // When Safari returns from the background, make sure fast-forward is not accidentally left active.
  // This also avoids stretched/rough audio after app switching.
  const normalizePlayback = () => {
    const gm = window.EJS_emulator?.gameManager;
    if (!gm) return;
    try { gm.toggleFastForward(0); } catch {}
    try { gm.toggleMainLoop(1); } catch {}
  };
  window.addEventListener('pageshow', () => setTimeout(normalizePlayback, 80));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(normalizePlayback, 120);
  });
})();
