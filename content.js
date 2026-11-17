(() => {
  if (window.__videoQol) return;
  window.__videoQol = true;

  const { MIN_RATE, MAX_RATE } = VIDEO_QOL_SETTINGS;
  const STEP = 0.25;
  const SEEK_STEP = 5;
  let desiredRate = 1;
  let previousRate = 1.5;
  let activeVideo = null;
  let hideTimer = 0;
  let fadeTimer = 0;
  let barHovered = false;
  let armedVideo = null;
  let pipVideo = null;

  // After the extension reloads or updates, this copy keeps running in open tabs but loses its chrome.* APIs.
  const extensionAlive = () => {
    try { return !!chrome.runtime?.id; } catch { return false; }
  };

  // Embedded players take the speed of the page they're embedded in.
  const SITE = location.ancestorOrigins?.length
    ? new URL(location.ancestorOrigins[location.ancestorOrigins.length - 1]).hostname
    : location.hostname;
  let manualRate = false;
  let settings = VIDEO_QOL_SETTINGS.DEFAULTS;

  chrome.storage.sync.get(VIDEO_QOL_SETTINGS.DEFAULTS, (s) => {
    settings = s;
    desiredRate = VIDEO_QOL_SETTINGS.speedFor(SITE, s);
    document.querySelectorAll('video').forEach(attach);
    for (const v of document.querySelectorAll('video')) if (!v.paused) maybeAutoArm(v);
  });

  // Options changes reach open tabs; the speed only if it wasn't already changed by hand on this page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !extensionAlive()) return;
    chrome.storage.sync.get(VIDEO_QOL_SETTINGS.DEFAULTS, (s) => {
      settings = s;
      if (!manualRate) {
        desiredRate = VIDEO_QOL_SETTINGS.speedFor(SITE, s);
        for (const v of document.querySelectorAll('video')) if (attached.has(v)) v.playbackRate = desiredRate;
        updateLabel();
      }
      for (const v of document.querySelectorAll('video')) if (!v.paused) maybeAutoArm(v);
    });
  });

  // ---------- overlay ----------

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;pointer-events:none;display:none;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      .bar { display:flex; gap:2px; align-items:center; pointer-events:auto;
        font:600 12px/1 system-ui, sans-serif; color:#fff; background:rgba(0,0,0,.65);
        border-radius:6px; padding:3px; opacity:.9; user-select:none; }
      .bar:hover { opacity:1; }
      button { all:unset; cursor:pointer; display:flex; align-items:center; justify-content:center;
        height:26px; padding:0 5px; border-radius:4px; }
      button svg { display:block; width:18px; height:18px; }
      button[hidden] { display:none; }
      button:hover { background:rgba(255,255,255,.2); }
      button.on { background:rgba(80,160,255,.65); }
      .rate { min-width:3.4em; text-align:center; }
      .toast { position:absolute; top:34px; left:0; white-space:nowrap; padding:5px 8px;
        border-radius:5px; background:rgba(0,0,0,.75); color:#fff; font:12px system-ui, sans-serif;
        opacity:0; transition:opacity .2s; }
      .toast.show { opacity:1; }
    </style>
    <div class="bar">
      <button data-act="slower" data-icon="minus" title="Slower  ["></button>
      <button data-act="reset" class="rate" title="Toggle 1×  \\">1×</button>
      <button data-act="faster" data-icon="plus" title="Faster  ]"></button>
      <button data-act="shot" data-icon="camera" title="Screenshot  Alt+S"></button>
      <button data-act="download" data-icon="download" class="dl" title="Download video"></button>
      <button data-act="pip" class="pip" title="Pop out when switching tabs  Alt+P (now: Alt+Shift+P)" data-icon="popout"></button>
    </div>
    <div class="toast"></div>`;
  const rateLabel = root.querySelector('.rate');
  const toastEl = root.querySelector('.toast');
  const pipBtn = root.querySelector('.pip');
  const dlBtn = root.querySelector('.dl');
  root.querySelectorAll('[data-icon]').forEach((b) => b.append(VIDEO_QOL_ICONS(document, b.dataset.icon)));

  root.querySelector('.bar').addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act || !activeVideo) return;
    e.stopPropagation();
    e.preventDefault();
    run(act, activeVideo);
  });
  // Keep the site's player from treating clicks on the bar as play/pause.
  for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick']) {
    root.querySelector('.bar').addEventListener(type, (e) => e.stopPropagation());
  }
  // Hovering the bar keeps it solid, and rescues it mid-fade.
  root.querySelector('.bar').addEventListener('pointerenter', () => {
    barHovered = true;
    clearTimeout(hideTimer);
    fadeIn();
  });
  root.querySelector('.bar').addEventListener('pointerleave', () => {
    barHovered = false;
    scheduleFadeOut(1500);
  });

  function mountHost() {
    const parent = document.fullscreenElement || document.body || document.documentElement;
    if (host.parentNode !== parent) parent.appendChild(host);
  }

  function isShown(video) {
    if (!video.isConnected || video.ownerDocument !== document) return false;
    const r = visibleRect(video);
    if (r.width < 40 || r.height < 40) return false;
    return video.checkVisibility ? video.checkVisibility({ visibilityProperty: true, opacityProperty: true }) : true;
  }

  // The part of the video actually on screen: its box cut by the viewport and by ancestors that clip overflow.
  function visibleRect(video) {
    const r = video.getBoundingClientRect();
    let left = Math.max(r.left, 0);
    let top = Math.max(r.top, 0);
    let right = Math.min(r.right, innerWidth);
    let bottom = Math.min(r.bottom, innerHeight);
    for (let el = video.parentElement || video.getRootNode().host; el && el !== document.body && el !== document.documentElement;
      el = el.parentElement || el.getRootNode().host) {
      const cs = getComputedStyle(el);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const c = el.getBoundingClientRect();
        if (cs.overflowX !== 'visible') { left = Math.max(left, c.left); right = Math.min(right, c.right); }
        if (cs.overflowY !== 'visible') { top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom); }
      }
      if (cs.position === 'fixed') break;
    }
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  const FADE_IN_MS = 120;
  const FADE_OUT_MS = 350;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function hideOverlay() {
    clearTimeout(hideTimer);
    clearTimeout(fadeTimer);
    barHovered = false;
    host.style.display = 'none';
    host.style.opacity = '0';
  }

  function fadeIn() {
    clearTimeout(fadeTimer);
    const wasHidden = host.style.display === 'none';
    host.style.display = 'block';
    if (wasHidden) {
      host.style.transition = 'none';
      host.style.opacity = '0';
      void host.offsetWidth;
      requestAnimationFrame(trackPosition);
    }
    host.style.transition = reducedMotion.matches ? 'none' : `opacity ${FADE_IN_MS}ms ease-out`;
    host.style.opacity = '1';
  }

  function fadeOut() {
    if (barHovered) return;
    if (reducedMotion.matches) return hideOverlay();
    host.style.transition = `opacity ${FADE_OUT_MS}ms ease-in`;
    host.style.opacity = '0';
    fadeTimer = setTimeout(hideOverlay, FADE_OUT_MS);
  }

  function scheduleFadeOut(delay = 2500) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(fadeOut, delay);
  }

  const parentOf = (el) => el.parentElement || el.getRootNode().host || null;

  // Topmost page element at a point, looking into open shadow roots and past our own bar.
  function topElementAt(x, y) {
    let el = document.elementsFromPoint(x, y).find((e) => e !== host);
    while (el && el.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }

  // Whether what's on top at a point is the video's own player (its controls, overlays) rather than
  // an unrelated layer covering it, like a popup or emoji panel: they must share a container about the video's size.
  function isUncovered(video, x, y) {
    const top = topElementAt(x, y);
    if (!top) return false;
    const chain = new Set();
    for (let el = top; el; el = parentOf(el)) chain.add(el);
    let common = video;
    while (common && !chain.has(common)) common = parentOf(common);
    if (!common || common === document.body || common === document.documentElement) return false;
    const v = video.getBoundingClientRect();
    const c = common.getBoundingClientRect();
    return c.width * c.height <= v.width * v.height * 2;
  }

  // Returns false, hiding the bar, when the video has no visible, uncovered corner to sit on.
  function positionHost() {
    if (!activeVideo || !isShown(activeVideo)) return hideOverlay(), false;
    const r = visibleRect(activeVideo);
    if (!isUncovered(activeVideo, r.left + 12, r.top + 12)) return hideOverlay(), false;
    host.style.transform = `translate(${r.left + 8}px, ${r.top + 8}px)`;
    return true;
  }

  // Follow the video while the bar is up; players resize and move without scroll/resize events.
  function trackPosition() {
    if (host.style.display === 'none') return;
    positionHost();
    requestAnimationFrame(trackPosition);
  }

  function showOverlay(video) {
    if (video !== activeVideo) {
      activeVideo = video;
      updateLabel();
    }
    if (!isShown(video)) return hideOverlay();
    pipBtn.classList.toggle('on', armedVideo === video);
    dlBtn.hidden = videoSource(video).kind !== 'file';
    mountHost();
    if (!positionHost()) return;
    fadeIn();
    scheduleFadeOut();
  }

  let toastTimer = 0;
  function toast(text, video = activeVideo) {
    document.dispatchEvent(new CustomEvent('videoqol-toast', { detail: text }));
    if (!video || video.ownerDocument !== document) return;
    showOverlay(video);
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1500);
  }

  function updateLabel() {
    const rate = activeVideo ? activeVideo.playbackRate : desiredRate;
    rateLabel.textContent = formatRate(rate);
  }

  const formatRate = (r) => `${+r.toFixed(2)}×`;

  // ---------- video tracking ----------

  const attached = new WeakSet();

  function attach(video) {
    if (attached.has(video)) return;
    attached.add(video);
    const apply = () => {
      if (Math.abs(video.playbackRate - desiredRate) > 1e-3) video.playbackRate = desiredRate;
    };
    // Sites often reset the rate when a new source loads; reassert ours.
    video.addEventListener('loadedmetadata', () => { frameDur.delete(video); apply(); });
    video.addEventListener('play', () => {
      apply();
      if (!frameDur.has(video)) sampleFrameRate(video);
      checkPage();
      maybeAutoArm(video);
    });
    video.addEventListener('loadstart', checkPage);
    video.addEventListener('volumechange', () => maybeAutoArm(video));
    if (!frameDur.has(video)) sampleFrameRate(video);
    video.addEventListener('ratechange', () => { if (video === activeVideo) updateLabel(); });
    apply();
  }

  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'VIDEO') attach(n);
        else if (n.querySelector) n.querySelectorAll('video').forEach(attach);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  function videoAt(x, y) {
    for (const v of document.querySelectorAll('video')) {
      const r = visibleRect(v);
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && isShown(v) && isUncovered(v, x, y)) return v;
    }
    return null;
  }

  // Keyboard target: the last hovered video if it's still on screen, else the biggest visible one.
  function pickVideo() {
    if (activeVideo && (isShown(activeVideo) || activeVideo === pipVideo && activeVideo.isConnected)) return activeVideo;
    let best = null;
    let bestScore = 0;
    for (const v of document.querySelectorAll('video')) {
      if (!isShown(v)) continue;
      const r = visibleRect(v);
      const score = r.width * r.height * (v.paused ? 1 : 4);
      if (score > bestScore) { best = v; bestScore = score; }
    }
    return best;
  }

  // Site controls usually sit on top of the video, so hit-test by geometry instead of mouseenter.
  let moveQueued = false;
  document.addEventListener('pointermove', (e) => {
    if (moveQueued) return;
    moveQueued = true;
    requestAnimationFrame(() => {
      moveQueued = false;
      const v = videoAt(e.clientX, e.clientY);
      if (v) { attach(v); showOverlay(v); }
    });
  }, { capture: true, passive: true });

  window.addEventListener('scroll', () => host.style.display !== 'none' && positionHost(), { capture: true, passive: true });
  window.addEventListener('resize', positionHost);
  document.addEventListener('fullscreenchange', () => { mountHost(); positionHost(); });

  // ---------- actions ----------

  function setRate(video, rate) {
    rate = Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(rate * 100) / 100));
    desiredRate = rate;
    manualRate = true;
    video.playbackRate = rate;
    activeVideo = video;
    updateLabel();
    toast(`Speed ${formatRate(rate)}`, video);
  }

  function run(act, video) {
    switch (act) {
      case 'slower': setRate(video, video.playbackRate - STEP); break;
      case 'faster': setRate(video, video.playbackRate + STEP); break;
      case 'reset': {
        const cur = video.playbackRate;
        if (Math.abs(cur - 1) < 1e-3) setRate(video, previousRate);
        else { previousRate = cur; setRate(video, 1); }
        break;
      }
      case 'shot': screenshot(video); break;
      case 'pip': toggleAutoPip(video); break;
      case 'popout': popOut(video); break;
      case 'download': downloadVideo(video); break;
      case 'frameBack': stepFrame(video, -1); break;
      case 'frameFwd': stepFrame(video, 1); break;
      case 'back5': seekBy(video, -SEEK_STEP); break;
      case 'fwd5': seekBy(video, SEEK_STEP); break;
      case 'activate-tab': askBackground({ type: 'activate-tab' }); break;
      case 'fullscreen-failed': toast('This page didn’t allow fullscreen', video); break;
    }
  }

  const clampTime = (video, t) => Math.max(0, Number.isFinite(video.duration) ? Math.min(video.duration, t) : t);

  const formatClock = (t) => {
    const m = Math.floor(t / 60);
    return `${m}:${(t % 60).toFixed(3).padStart(6, '0')}`;
  };

  function stepFrame(video, dir) {
    video.pause();
    video.currentTime = clampTime(video, video.currentTime + dir * (frameDur.get(video) || 1 / 30));
    toast(`${dir > 0 ? 'Next' : 'Previous'} frame · ${formatClock(video.currentTime)}`, video);
  }

  function seekBy(video, seconds) {
    video.currentTime = clampTime(video, video.currentTime + seconds);
    toast(`${seconds > 0 ? '+' : '−'}${Math.abs(seconds)}s`, video);
  }

  // Frame length, measured from consecutive presented frames; the shortest gap survives dropped frames.
  const frameDur = new WeakMap();
  function sampleFrameRate(video) {
    if (!video.requestVideoFrameCallback || video.paused) return;
    let last = null;
    let best = Infinity;
    let n = 0;
    const onFrame = (now, meta) => {
      if (last !== null) {
        const d = meta.mediaTime - last;
        if (d > 1 / 240 && d < best) best = d;
      }
      last = meta.mediaTime;
      if (++n < 15 && !video.paused) video.requestVideoFrameCallback(onFrame);
      else if (best <= 0.1) frameDur.set(video, best);
    };
    video.requestVideoFrameCallback(onFrame);
  }

  // Arming belongs to the page it was made on: a new address (YouTube's next video, a playlist) clears it.
  // Timestamps and the hash don't count as a new page.
  const pageKey = () => {
    const u = new URL(location.href);
    u.hash = '';
    for (const p of ['t', 'start', 'time_continue']) u.searchParams.delete(p);
    return u.href;
  };
  let armedPage = null;
  let declinedPage = null;

  function arm(video) {
    armedVideo = pipVideo = video;
    armedPage = pageKey();
    video.dispatchEvent(new CustomEvent('videoqol-arm', { bubbles: true, composed: true }));
    pipBtn.classList.toggle('on', activeVideo === video);
  }

  function disarm() {
    armedVideo = null;
    armedPage = null;
    document.dispatchEvent(new CustomEvent('videoqol-disarm'));
    pipBtn.classList.remove('on');
  }

  function checkPage() {
    if (armedVideo && armedPage !== pageKey()) disarm();
  }

  // On auto-arm sites, the main video arms itself once it plays with sound; previews and small videos don't.
  function maybeAutoArm(video) {
    if (window !== window.top || !VIDEO_QOL_SETTINGS.autoArms(SITE, settings)) return;
    if (declinedPage === pageKey() || video.paused || video.muted || video.volume === 0) return;
    if (armedVideo && armedVideo.isConnected && !armedVideo.paused) return;
    const r = video.getBoundingClientRect();
    if (r.width < 240 || r.height < 135 || !isShown(video)) return;
    arm(video);
  }

  function toggleAutoPip(video) {
    if (window !== window.top) return toast('Pop-out only works for videos in the main page', video);
    if (armedVideo === video) {
      disarm();
      declinedPage = pageKey();
      toast('Pop-out off', video);
    } else {
      declinedPage = null;
      arm(video);
      toast('Pops out when you switch tabs', video);
    }
  }

  function popOut(video) {
    if (window !== window.top) return toast('Pop-out only works for videos in the main page', video);
    pipVideo = video;
    video.dispatchEvent(new CustomEvent('videoqol-popout', { bubbles: true, composed: true }));
  }

  // Buttons and keys inside the pop-out window arrive from pip.js.
  document.addEventListener('videoqol-action', (e) => {
    if (pipVideo && typeof e.detail === 'string') run(e.detail, pipVideo);
  });

  // What the video plays from: a whole file we can save, or something we can't.
  function videoSource(video) {
    if (video.srcObject) return { kind: 'live' };
    if (video.mediaKeys) return { kind: 'drm' };
    const src = video.currentSrc || video.src || video.querySelector('source[src]')?.src || '';
    if (!src) return { kind: 'none' };
    if (src.startsWith('blob:')) {
      const isStream = !video.dispatchEvent(new CustomEvent('videoqol-is-stream', { cancelable: true, composed: true }));
      return isStream ? { kind: 'stream' } : { kind: 'file', src };
    }
    if (/^https?:/.test(src)) return { kind: 'file', src };
    return { kind: 'none' };
  }

  const NO_DOWNLOAD = {
    live: 'This is a live camera or screen stream, not a file',
    drm: 'This video is DRM-protected',
    stream: 'This site streams the video in pieces, so there is no single file to save',
    none: 'No video file found',
  };

  async function downloadVideo(video) {
    const source = videoSource(video);
    if (source.kind !== 'file') return toast(NO_DOWNLOAD[source.kind], video);
    const ext = source.src.match(/\.(mp4|webm|mkv|mov|m4v|ogv|ogg)(?:[?#]|$)/i)?.[1].toLowerCase() || 'mp4';
    const name = `${pageTitle()}.${ext}`;
    if (source.src.startsWith('blob:')) {
      download(source.src, name);
      return toast('Saving video', video);
    }
    const res = await askBackground({ type: 'download', url: source.src, filename: name });
    toast(res?.error ? `Download failed: ${res.error}` : 'Downloading video', video);
  }

  function pageTitle() {
    return (document.title || location.hostname).replace(/[\\/:*?"<>|~]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'video';
  }

  function fileName(video) {
    const t = video.currentTime;
    const stamp = `${Math.floor(t / 3600)}h${String(Math.floor(t / 60) % 60).padStart(2, '0')}m${String(Math.floor(t % 60)).padStart(2, '0')}s`;
    return `${pageTitle()} ${stamp}.png`;
  }

  async function askBackground(msg) {
    if (!extensionAlive()) return { error: 'the extension was updated; reload the page' };
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch {
      return { error: 'the extension was updated; reload the page' };
    }
  }

  function download(href, name) {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
  }

  async function screenshot(video) {
    if (!video.videoWidth) return toast('No frame to capture yet', video);
    const name = fileName(video);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise((res, rej) => {
        try { canvas.toBlob((b) => (b ? res(b) : rej(new Error('empty'))), 'image/png'); } catch (e) { rej(e); }
      });
      const url = URL.createObjectURL(blob);
      download(url, name);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast(`Saved ${video.videoWidth}×${video.videoHeight} frame`, video);
    } catch {
      screenshotFromTab(video, name);
    }
  }

  // Cross-origin video taints the canvas; grab the visible pixels from the tab instead.
  async function screenshotFromTab(video, name) {
    if (window !== window.top) return toast('Can’t capture this embedded video', video);
    if (document.hidden || video.ownerDocument !== document) {
      return toast('This site blocks frame capture; return the video to the tab to screenshot it', video);
    }
    hideOverlay();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = video.getBoundingClientRect();
    const res = await askBackground({
      type: 'capture-rect',
      rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      dpr: window.devicePixelRatio,
    });
    if (res?.dataUrl) {
      download(res.dataUrl, name);
      toast('Saved screen capture (site blocks direct frame access)', video);
    } else {
      toast(`Screenshot failed: ${res?.error || 'unknown error'}`, video);
    }
  }

  // ---------- keyboard ----------

  const KEYS = {
    '[': 'slower',
    ']': 'faster',
    '\\': 'reset',
    ',': 'frameBack',
    '.': 'frameFwd',
  };
  const ALT_CODES = { KeyS: 'shot', KeyP: 'pip', Comma: 'back5', Period: 'fwd5' };
  // Frame keys only act on a paused video, so sites keep , and . while playing (X uses . for new posts).
  const PAUSED_ONLY = new Set(['frameBack', 'frameFwd']);
  const ALT_SHIFT_CODES = { KeyP: 'popout' };

  function isTyping(e) {
    const el = e.composedPath()[0];
    if (!(el instanceof Element)) return false;
    return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || isTyping(e)) return;
    const act = e.altKey
      ? (e.shiftKey ? ALT_SHIFT_CODES : ALT_CODES)[e.code]
      : (!e.shiftKey && KEYS[e.key]);
    if (!act) return;
    const video = pickVideo();
    if (!video || (PAUSED_ONLY.has(act) && !video.paused)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    run(act, video);
  }, true);
})();
