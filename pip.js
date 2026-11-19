// Runs in the page's own JS world: Media Session and Document Picture-in-Picture belong to the page.
// Talks to content.js through DOM events (videoqol-*), since the two scripts can't share variables.
(() => {
  if (window.top !== window || window.__videoQolPip) return;
  window.__videoQolPip = true;

  const ms = navigator.mediaSession;
  const origSetActionHandler = ms && MediaSession.prototype.setActionHandler;
  let siteHandler = null;
  let armed = null;
  let pip = null;

  // Remember the site's own auto-PiP handler so it can be restored when the user disarms.
  if (ms) {
    MediaSession.prototype.setActionHandler = function (action, handler) {
      if (action === 'enterpictureinpicture') {
        siteHandler = handler;
        if (armed) return;
      }
      return origSetActionHandler.call(this, action, handler);
    };
  }

  function setPipHandler(handler) {
    try { origSetActionHandler.call(ms, 'enterpictureinpicture', handler); } catch { /* action unsupported */ }
  }

  // Trace of recent pop-out and fullscreen activity, for bug reports: copy(__videoQolTrace.join('\n')) in the page's console.
  const BUILD = 'pip-4';
  const trace = (window.__videoQolTrace = []);
  const dbg = (...args) => {
    trace.push(`${new Date().toISOString().slice(11, 23)} ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`);
    if (trace.length > 60) trace.shift();
  };

  const videoFrom = (e) => e.composedPath()[0];
  const mediaState = (v) => v ? `playing: ${!v.paused}, muted: ${v.muted}, volume: ${v.volume.toFixed(2)}, t: ${v.currentTime.toFixed(1)}` : 'none';

  document.addEventListener('videoqol-arm', (e) => {
    armed = videoFrom(e);
    dbg(`build ${BUILD} | armed for tab switch | mediaSession: ${!!ms} | documentPictureInPicture: ${'documentPictureInPicture' in window} |`, mediaState(armed));
    if (ms) setPipHandler(() => { dbg('Chrome asked to pop out |', mediaState(armed)); open(armed, true); });
  }, true);

  document.addEventListener('videoqol-disarm', () => {
    armed = null;
    dbg('disarmed');
    if (ms) setPipHandler(siteHandler);
  }, true);

  document.addEventListener('videoqol-popout', (e) => {
    const video = videoFrom(e);
    if (pip) pip.win.close();
    else open(video, false);
  }, true);

  document.addEventListener('videoqol-toast', (e) => pip && pip.toast(String(e.detail)), true);

  // The user's shortcut bindings, sent by content.js.
  const S = VIDEO_QOL_SETTINGS;
  let bindings = S.SHORTCUTS;
  document.addEventListener('videoqol-shortcuts', (e) => {
    try { bindings = { ...S.SHORTCUTS, ...JSON.parse(e.detail) }; } catch { /* malformed */ }
  }, true);
  const withKey = (text, act) => (bindings[act] ? `${text}  ${S.comboLabel(bindings[act])}` : text);

  document.addEventListener('visibilitychange', () => {
    if (armed || pip) dbg(`tab ${document.hidden ? 'hidden' : 'visible'} | armed: ${mediaState(armed)} | pop-out open: ${!!pip}`);
    if (!document.hidden && pip && pip.auto) pip.win.close();
  });

  // Sites that draw subtitles as page elements over the video instead of using <track>.
  const CAPTION_SELECTORS = [
    '.player-timedtext',
    '.ytp-caption-window-container',
  ];

  function captionText() {
    for (const sel of CAPTION_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el.innerText.trim();
    }
    return '';
  }

  const formatTime = (t) => {
    t = Math.max(0, Math.floor(t || 0));
    const h = Math.floor(t / 3600);
    const m = Math.floor(t / 60) % 60;
    const ss = String(t % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };

  const describe = (el) => el ? `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''}>` : 'none';

  // Players' own fullscreen controls; clicking one lets the site lay itself out for fullscreen.
  const FULLSCREEN_BUTTONS = [
    '.ytp-fullscreen-button', '.vjs-fullscreen-control', '[data-plyr="fullscreen"]', '.jw-icon-fullscreen',
    'button[aria-label*="full screen" i]', 'button[aria-label*="fullscreen" i]',
    'button[title*="full screen" i]', 'button[title*="fullscreen" i]', '[data-testid*="fullscreen" i]',
  ];

  function siteFullscreenButton(video) {
    const v = video.getBoundingClientRect();
    for (let el = video.parentElement; el && el !== document.body; el = el.parentElement) {
      for (const sel of FULLSCREEN_BUTTONS) {
        const b = [...el.querySelectorAll(sel)].find((x) => !/exit|leave/i.test(`${x.getAttribute('aria-label') || ''} ${x.title || ''}`)
          && !x.disabled && x.getAttribute('aria-disabled') !== 'true');
        if (b) return b;
      }
      const r = el.getBoundingClientRect();
      if (r.width * r.height > v.width * v.height * 2) break;
    }
    return null;
  }

  const fullscreenWithin = (ms) => new Promise((resolve) => {
    if (document.fullscreenElement) return resolve(true);
    const done = () => { document.removeEventListener('fullscreenchange', done); clearTimeout(t); resolve(!!document.fullscreenElement); };
    const t = setTimeout(done, ms);
    document.addEventListener('fullscreenchange', done);
  });

  // Site's own fullscreen first; otherwise the video itself, which Chrome centres, with its built-in controls.
  async function enterFullscreen(video) {
    const button = siteFullscreenButton(video);
    const ytButton = document.querySelector('.ytp-fullscreen-button');
    dbg('site button:', describe(button), ytButton ? `(YouTube's: aria-disabled=${ytButton.getAttribute('aria-disabled')})` : '',
      '| activation:', navigator.userActivation.isActive, '| fullscreenEnabled:', document.fullscreenEnabled);
    if (button) {
      button.click();
      const ok = await fullscreenWithin(700);
      dbg('after site button:', ok ? `fullscreen on ${describe(document.fullscreenElement)}` : 'no fullscreen', '| activation:', navigator.userActivation.isActive);
      if (ok) return;
    }
    const hadControls = video.controls;
    video.controls = true;
    try {
      await video.requestFullscreen();
      dbg('fallback: video fullscreen ok');
      const restoreControls = () => {
        if (document.fullscreenElement) return;
        video.controls = hadControls;
        document.removeEventListener('fullscreenchange', restoreControls);
      };
      document.addEventListener('fullscreenchange', restoreControls);
    } catch (err) {
      dbg('fallback failed:', err && err.message, '| activation:', navigator.userActivation.isActive, '| hidden:', document.hidden);
      video.controls = hadControls;
      send('fullscreen-failed');
    }
  }

  const send = (act) => document.dispatchEvent(new CustomEvent('videoqol-action', { detail: act }));

  async function open(video, auto) {
    dbg(`open pop-out (${auto ? 'tab switch' : 'manual'}) | activation: ${navigator.userActivation.isActive}`);
    if (pip || !video || !video.isConnected) return dbg(`not opened: ${pip ? 'already open' : 'video gone from the page'}`);
    if (!('documentPictureInPicture' in window)) {
      video.disablePictureInPicture = false;
      try { await video.requestPictureInPicture(); } catch (err) { dbg('video picture-in-picture failed:', String(err && err.message)); }
      return;
    }

    const aspect = (video.videoWidth && video.videoHeight) ? video.videoWidth / video.videoHeight : 16 / 9;
    const width = Math.round(Math.min(640, screen.availWidth * 0.35));
    let win;
    try {
      win = await documentPictureInPicture.requestWindow({ width, height: Math.round(width / aspect) });
    } catch (err) {
      return dbg('pop-out window failed:', String(err && err.message));
    }
    dbg('pop-out window opened');

    const doc = win.document;
    doc.title = document.title;
    // Constructed sheets aren't blocked by a strict style-src CSP, unlike a <style> tag.
    const sheet = new win.CSSStyleSheet();
    sheet.replaceSync(PIP_CSS);
    doc.adoptedStyleSheets = [sheet];

    const el = (tag, props = {}, ...kids) => {
      const n = doc.createElement(tag);
      Object.assign(n, props);
      n.append(...kids);
      return n;
    };
    const icon = (name) => VIDEO_QOL_ICONS(doc, name);
    const btn = (content, title, onClick) => {
      const b = el('button', { title }, content);
      b.addEventListener('click', onClick);
      return b;
    };

    const playBtn = btn('', 'Play/pause  Space', () => (video.paused ? video.play() : video.pause()));
    const rateEl = btn('', withKey('Toggle 1×', 'reset'), () => send('reset'));
    const muteBtn = btn('', 'Mute  M', () => { video.muted = !video.muted; });
    const volumeEl = el('input', { type: 'range', className: 'volume', min: 0, max: 1, step: 0.05, title: 'Volume  ↑ ↓' });
    volumeEl.addEventListener('input', () => {
      video.volume = Number(volumeEl.value);
      video.muted = video.volume === 0;
    });
    const toastEl = el('div', { className: 'toast' });
    const timeEl = el('span', { className: 'time' });
    const bufferedEl = el('div', { className: 'buffered' });
    const playedEl = el('div', { className: 'played' });
    const knobEl = el('div', { className: 'knob' });
    const progressEl = el('div', { className: 'progress', title: 'Seek' },
      el('div', { className: 'track' }, bufferedEl, playedEl), knobEl);
    const captionLine = el('span');
    const captionEl = el('div', { className: 'captions' }, captionLine);
    const bar = el('div', { className: 'bar' },
      btn(icon('back10'), 'Back 10s  ←', () => { video.currentTime -= 10; }),
      playBtn,
      btn(icon('forward10'), 'Forward 10s  →', () => { video.currentTime += 10; }),
      timeEl,
      el('span', { className: 'sep' }),
      muteBtn,
      volumeEl,
      el('span', { className: 'sep' }),
      btn(icon('minus'), withKey('Slower', 'slower'), () => send('slower')),
      rateEl,
      btn(icon('plus'), withKey('Faster', 'faster'), () => send('faster')),
      el('span', { className: 'sep' }),
      btn(icon('camera'), withKey('Screenshot', 'shot'), () => send('shot')),
      btn(icon('fullscreen'), 'Fullscreen in the tab  F', () => goFullscreen()),
      btn(icon('close'), 'Close and put the video back', () => win.close()),
    );

    const syncPlay = () => {
      playBtn.replaceChildren(icon(video.ended ? 'replay' : video.paused ? 'play' : 'pause'));
      playBtn.title = video.ended ? 'Replay  Space' : 'Play/pause  Space';
      bar.classList.toggle('pinned', video.ended);
    };
    const syncRate = () => { rateEl.textContent = `${+video.playbackRate.toFixed(2)}×`; };
    const syncVolume = () => {
      const silent = video.muted || video.volume === 0;
      muteBtn.replaceChildren(icon(silent ? 'muted' : 'volume'));
      muteBtn.title = silent ? 'Unmute  M' : 'Mute  M';
      volumeEl.value = silent ? 0 : video.volume;
    };
    syncPlay();
    syncRate();
    syncVolume();

    // Moving a playing <video> between documents keeps it playing; a comment marks its way home.
    const placeholder = document.createComment('video-qol pip');
    const savedStyle = video.getAttribute('style');
    video.replaceWith(placeholder);
    doc.body.append(video, captionEl, progressEl, bar, toastEl);

    // Seek bar: click or drag; shows position, buffered range and time.
    let scrubbing = false;
    const seekable = () => Number.isFinite(video.duration) && video.duration > 0;
    const fractionAt = (e) => {
      const r = progressEl.getBoundingClientRect();
      return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    };
    const showFraction = (f) => {
      playedEl.style.width = `${f * 100}%`;
      knobEl.style.left = `${f * 100}%`;
    };
    progressEl.addEventListener('pointerdown', (e) => {
      if (!seekable()) return;
      scrubbing = true;
      try { progressEl.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
      const f = fractionAt(e);
      showFraction(f);
      video.currentTime = f * video.duration;
    });
    progressEl.addEventListener('pointermove', (e) => {
      if (!scrubbing) return;
      const f = fractionAt(e);
      showFraction(f);
      video.currentTime = f * video.duration;
    });
    const endScrub = () => { scrubbing = false; };
    progressEl.addEventListener('pointerup', endScrub);
    progressEl.addEventListener('pointercancel', endScrub);

    let progressFrame = 0;
    const syncProgress = () => {
      const ok = seekable();
      progressEl.hidden = !ok;
      timeEl.textContent = ok ? `${formatTime(video.currentTime)} / ${formatTime(video.duration)}` : formatTime(video.currentTime);
      if (ok) {
        if (!scrubbing) showFraction(video.currentTime / video.duration);
        const b = video.buffered;
        let end = 0;
        for (let i = 0; i < b.length; i++) if (b.start(i) <= video.currentTime + 0.5) end = Math.max(end, b.end(i));
        bufferedEl.style.width = `${(end / video.duration) * 100}%`;
      }
      progressFrame = win.requestAnimationFrame(syncProgress);
    };
    syncProgress();

    let captionQueued = false;
    const syncCaptions = () => {
      captionQueued = false;
      const text = captionText();
      if (captionLine.textContent !== text) captionLine.textContent = text;
      captionEl.hidden = !text;
    };
    const captionObserver = new MutationObserver(() => {
      if (captionQueued) return;
      captionQueued = true;
      win.requestAnimationFrame(syncCaptions);
    });
    captionObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    syncCaptions();

    video.addEventListener('play', syncPlay);
    video.addEventListener('pause', syncPlay);
    video.addEventListener('ended', syncPlay);
    video.addEventListener('seeked', syncPlay);
    video.addEventListener('ratechange', syncRate);
    video.addEventListener('volumechange', syncVolume);

    let toastTimer = 0;
    pip = {
      win,
      auto,
      toast(text) {
        toastEl.textContent = text;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1500);
      },
    };

    const changeVolume = (delta) => {
      video.volume = Math.min(1, Math.max(0, Math.round((video.volume + delta) * 20) / 20));
      video.muted = video.volume === 0;
      pip.toast(`Volume ${Math.round(video.volume * 100)}%`);
    };

    // The user's shortcuts first (the pop-out key closes the window), then the window's own keys.
    win.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.target === volumeEl && e.key.startsWith('Arrow')) return;
      const combo = S.comboFromEvent(e);
      const act = Object.keys(bindings).find((a) => bindings[a] && bindings[a] === combo);
      let handled = true;
      if (act === 'popout') win.close();
      else if (act) send(act);
      else if (e.altKey || e.shiftKey && e.key.length > 1) handled = false;
      else if (e.key === ' ' || e.key === 'k') video.paused ? video.play() : video.pause();
      else if (e.key === 'ArrowLeft') video.currentTime -= 10;
      else if (e.key === 'ArrowRight') video.currentTime += 10;
      else if (e.key === 'ArrowUp') changeVolume(0.1);
      else if (e.key === 'ArrowDown') changeVolume(-0.1);
      else if (e.key === 'm' || e.key === 'M') video.muted = !video.muted;
      else if (e.key === 'f' || e.key === 'F') goFullscreen();
      else handled = false;
      if (handled) e.preventDefault();
    });

    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      captionObserver.disconnect();
      win.cancelAnimationFrame(progressFrame);
      const wasPlaying = !video.paused;
      video.removeEventListener('play', syncPlay);
      video.removeEventListener('pause', syncPlay);
      video.removeEventListener('ended', syncPlay);
      video.removeEventListener('seeked', syncPlay);
      video.removeEventListener('ratechange', syncRate);
      video.removeEventListener('volumechange', syncVolume);
      video.removeEventListener('dblclick', goFullscreen);
      if (placeholder.isConnected) {
        placeholder.replaceWith(video);
        // Players lay out the video while it's away; undo that and make them lay it out again in place.
        if (savedStyle === null) video.removeAttribute('style');
        else video.setAttribute('style', savedStyle);
        window.dispatchEvent(new Event('resize'));
      } else {
        video.remove();
      }
      if (wasPlaying && video.paused) video.play().catch(() => {});
      if (pip && pip.win === win) pip = null;
    };

    win.addEventListener('pagehide', restore, { once: true });

    // Back to the tab and fullscreen there. The click here also activates the tab, but focusing or
    // closing uses that up, so the fullscreen request has to come first.
    const goFullscreen = async () => {
      dbg(`build ${BUILD} | fullscreen requested | tab hidden:`, document.hidden, '| activation:', navigator.userActivation.isActive);
      try {
        await fullscreenSteps();
      } catch (err) {
        dbg('error:', String(err && err.stack || err));
        send('fullscreen-failed');
      } finally {
        win.close();
      }
    };

    const fullscreenSteps = async () => {
      restore();
      // window.focus() would use up the click that fullscreen needs, so the extension switches tabs instead.
      if (document.hidden) {
        send('activate-tab');
        await new Promise((resolve) => {
          const done = () => { document.removeEventListener('visibilitychange', done); resolve(); };
          document.addEventListener('visibilitychange', done);
          setTimeout(done, 3000);
        });
        dbg('after tab switch | hidden:', document.hidden, '| activation:', navigator.userActivation.isActive);
      }
      await enterFullscreen(video);
    };
    video.addEventListener('dblclick', goFullscreen);
  }

  const PIP_CSS = `
    html, body { margin:0; height:100%; background:#000; overflow:hidden; }
    video { position:static !important; display:block !important; width:100% !important; height:100% !important;
      max-width:none !important; max-height:none !important; left:auto !important; top:auto !important;
      transform:none !important; object-fit:contain !important; }
    .bar { position:fixed; left:50%; bottom:10px; transform:translateX(-50%); display:flex; gap:2px; align-items:center;
      padding:4px; border-radius:8px; background:rgba(0,0,0,.7); color:#fff; font:600 13px/1 system-ui, sans-serif;
      opacity:0; transition:opacity .2s; white-space:nowrap; }
    body:hover .bar, .bar:focus-within, .bar.pinned { opacity:1; }
    button { all:unset; cursor:pointer; display:flex; align-items:center; justify-content:center;
      min-width:32px; height:32px; padding:0 4px; box-sizing:border-box; border-radius:5px; }
    button svg { display:block; width:20px; height:20px; }
    button:hover { background:rgba(255,255,255,.2); }
    .volume { width:64px; margin:0 4px; accent-color:#fff; cursor:pointer; }
    @media (max-width: 520px) { .volume { display:none; } }
    .sep { width:1px; height:16px; margin:0 4px; background:rgba(255,255,255,.3); }
    .captions { position:fixed; left:4%; right:4%; bottom:6%; text-align:center; pointer-events:none;
      transition:bottom .2s; }
    body:hover .captions, body:has(.bar.pinned) .captions { bottom:74px; }
    body::after { content:''; position:fixed; left:0; right:0; bottom:0; height:120px; pointer-events:none;
      background:linear-gradient(transparent, rgba(0,0,0,.65)); opacity:0; transition:opacity .2s; }
    body:hover::after, body:has(.bar.pinned)::after { opacity:1; }
    .bar, .progress, .captions, .toast { z-index:1; }
    .progress { position:fixed; left:12px; right:12px; bottom:52px; height:16px; cursor:pointer; touch-action:none;
      opacity:0; transition:opacity .2s; filter:drop-shadow(0 0 2px rgba(0,0,0,.7)); }
    .progress[hidden] { display:none; }
    body:hover .progress, body:has(.bar.pinned) .progress { opacity:1; }
    .track { position:absolute; left:0; right:0; top:6px; height:4px; border-radius:2px; background:rgba(255,255,255,.25);
      overflow:hidden; transition:top .1s, height .1s; }
    .progress:hover .track { top:5px; height:6px; }
    .buffered, .played { position:absolute; left:0; top:0; bottom:0; width:0; }
    .buffered { background:rgba(255,255,255,.35); }
    .played { background:#fff; }
    .knob { position:absolute; top:3px; width:10px; height:10px; margin-left:-5px; border-radius:50%; background:#fff;
      transform:scale(0); transition:transform .1s; }
    .progress:hover .knob { transform:scale(1); }
    .time { padding:0 8px; font-weight:500; font-variant-numeric:tabular-nums; }
    @media (max-width: 420px) { .time { display:none; } }
    .captions span { white-space:pre-line; color:#fff; background:rgba(0,0,0,.75); padding:.1em .4em; border-radius:3px;
      font:500 clamp(13px, 5.5vh, 30px)/1.35 system-ui, sans-serif; box-decoration-break:clone; -webkit-box-decoration-break:clone; }
    .toast { position:fixed; top:10px; left:10px; padding:5px 8px; border-radius:5px; background:rgba(0,0,0,.75);
      color:#fff; font:12px system-ui, sans-serif; opacity:0; transition:opacity .2s; }
    .toast.show { opacity:1; }
  `;
})();
