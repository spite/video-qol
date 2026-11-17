// Extension-only APIs for content.js: video downloads and the tab-capture screenshot fallback.
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'download') {
    chrome.downloads.download({ url: msg.url, filename: msg.filename })
      .then(() => sendResponse({}))
      .catch((err) => sendResponse({ error: String(err && err.message || err) }));
    return true;
  }
  if (msg.type === 'activate-tab') {
    chrome.tabs.update(sender.tab.id, { active: true })
      .then(() => chrome.windows.update(sender.tab.windowId, { focused: true }))
      .then(() => sendResponse({}), (err) => sendResponse({ error: String(err && err.message || err) }));
    return true;
  }
  if (msg.type !== 'capture-rect') return;
  captureRect(sender.tab.windowId, msg.rect, msg.dpr)
    .then((dataUrl) => sendResponse({ dataUrl }))
    .catch((err) => sendResponse({ error: String(err && err.message || err) }));
  return true;
});

async function captureRect(windowId, rect, dpr) {
  const shot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const bitmap = await createImageBitmap(await (await fetch(shot)).blob());
  const sx = Math.max(0, Math.round(rect.x * dpr));
  const sy = Math.max(0, Math.round(rect.y * dpr));
  const sw = Math.min(bitmap.width - sx, Math.round(rect.width * dpr));
  const sh = Math.min(bitmap.height - sy, Math.round(rect.height * dpr));
  if (sw <= 0 || sh <= 0) throw new Error('Video is not on screen');
  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return 'data:image/png;base64,' + btoa(bin);
}
