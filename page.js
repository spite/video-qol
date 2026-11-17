// Runs in the page's JS world in every frame: records which blob: URLs are MediaSource streams rather than files.
(() => {
  if (window.__videoQolPage) return;
  window.__videoQolPage = true;

  const streams = new Set();
  const origCreate = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    const url = origCreate.call(this, obj);
    if ((window.MediaSource && obj instanceof MediaSource) ||
        (window.ManagedMediaSource && obj instanceof ManagedMediaSource)) streams.add(url);
    return url;
  };

  // content.js asks synchronously; cancelling the event answers "this video is a stream".
  document.addEventListener('videoqol-is-stream', (e) => {
    const v = e.composedPath()[0];
    if (streams.has(v.currentSrc || v.src)) e.preventDefault();
  }, true);
})();
