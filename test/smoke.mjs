// Smoke test: loads the extension into headless Chromium and drives a local test page.
// Usage: node test/smoke.mjs   (CHROME=/path/to/chromium to override; needs ffmpeg with libvpx)
// Branded Google Chrome ignores --load-extension, so this uses Chromium (e.g. Playwright's build).
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const EXT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'video-qol-smoke-'));
const PORT = 8000 + (process.pid % 1000);
const CHROME = process.env.CHROME || (() => {
  const base = `${os.homedir()}/.cache/ms-playwright`;
  const dir = fs.existsSync(base) && fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop();
  if (!dir) throw new Error('No Chromium found; set CHROME=/path/to/chromium');
  return `${base}/${dir}/chrome-linux/chrome`;
})();
const PROFILE = `${T}/profile`;

fs.mkdirSync(`${T}/site`);
fs.mkdirSync(`${T}/dl`);
fs.copyFileSync(`${EXT}/test/site/index.html`, `${T}/site/index.html`);
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', ...args], { stdio: 'inherit' });
ff(['-i', 'testsrc2=size=640x360:rate=25', '-t', '6', '-c:v', 'libvpx', '-b:v', '600k', '-an', `${T}/site/file.webm`]);
ff(['-i', 'testsrc=size=640x360:rate=25', '-t', '6', '-c:v', 'libvpx', '-b:v', '600k', '-an', '-dash', '1', `${T}/site/stream.webm`]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(`${PROFILE}/Default`, { recursive: true });
fs.writeFileSync(`${PROFILE}/Default/Preferences`, JSON.stringify({ download: { default_directory: `${T}/dl`, prompt_for_download: false } }));
// Static server with Range support; without it Chrome can't seek in a plain video file.
const TYPES = { '.html': 'text/html', '.webm': 'video/webm' };
const server = http.createServer((req, res) => {
  const file = path.join(`${T}/site`, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
  if (!file.startsWith(`${T}/site`) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(file).size;
  const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (!m) { res.writeHead(200, { ...headers, 'Content-Length': size }); return fs.createReadStream(file).pipe(res); }
  const start = m[1] ? +m[1] : size - +m[2];
  const end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
  res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
  fs.createReadStream(file, { start, end }).pipe(res);
}).listen(PORT, '127.0.0.1');
const chrome = spawn(CHROME, [
  '--headless=new', `--user-data-dir=${PROFILE}`, '--mute-audio', '--no-first-run', '--no-default-browser-check',
  `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`, '--remote-debugging-port=0',
  '--window-size=1100,700', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let chromeErr = '';
chrome.stderr.on('data', (d) => { chromeErr += d; });

const cleanup = () => {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch {}
  try { server.close(); } catch {}
  try { fs.rmSync(T, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 150000);

let wsUrl;
for (let i = 0; i < 100 && !wsUrl; i++) {
  await sleep(100);
  try {
    const [port, p] = fs.readFileSync(`${PROFILE}/DevToolsActivePort`, 'utf8').trim().split('\n');
    wsUrl = `ws://127.0.0.1:${port}${p}`;
  } catch {}
}
if (!wsUrl) { console.log('no devtools port', chromeErr.slice(-500)); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let nextId = 1;
const pending = new Map();
const listeners = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else if (msg.method) listeners.forEach((l) => l(msg));
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

const errors = [];
listeners.push((m) => {
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`log: ${m.params.entry.text} ${m.params.entry.url || ''}`);
});

await sleep(800);
const { targetInfos } = await send('Target.getTargets');
const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
check('extension service worker running', !!sw, sw?.url);

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, S);
await send('Log.enable', {}, S);
await send('Page.enable', {}, S);
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }, S);

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, S);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (expr, ms = 8000) => {
  for (let t = 0; t < ms; t += 100) { if (await evaluate(expr).catch(() => false)) return true; await sleep(100); }
  return false;
};
const move = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, S); await sleep(150); };
const click = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, S);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, S);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, S);
  await sleep(150);
};
const key = async (k, code, vk, modifiers = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers }, S);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers }, S);
  await sleep(150);
};
const HOST = `[...document.querySelectorAll('body > div')].find(d => d.style.zIndex === '2147483647')`;
const barState = () => evaluate(`(() => { const h = ${HOST}; return h ? { display: h.style.display, opacity: h.style.opacity, transform: h.style.transform } : null; })()`);

// The bar's shadow root is closed, so read it through the DOM domain, which pierces it.
async function barButtons() {
  const { root } = await send('DOM.getDocument', { depth: -1, pierce: true }, S);
  let host;
  (function walk(n) {
    if (host) return;
    const attrs = n.attributes || [];
    const style = attrs[attrs.indexOf('style') + 1] || '';
    if (n.nodeName === 'DIV' && n.shadowRoots && style.includes('2147483647')) host = n;
    (n.children || []).forEach(walk);
  })(root);
  const buttons = {};
  (function walk(n) {
    if (n.nodeName === 'BUTTON') {
      const a = n.attributes;
      const get = (k) => (a.indexOf(k) >= 0 ? a[a.indexOf(k) + 1] : null);
      buttons[get('data-act')] = { nodeId: n.nodeId, hidden: a.includes('hidden'), cls: get('class') };
    }
    (n.children || []).forEach(walk);
  })(host.shadowRoots[0]);
  return buttons;
}
async function centerOf(nodeId) {
  const { model } = await send('DOM.getBoxModel', { nodeId }, S);
  const q = model.border;
  return [(q[0] + q[4]) / 2, (q[1] + q[5]) / 2];
}

await waitFor(`document.readyState === 'complete' && window.mseReady && [...document.querySelectorAll('video')].every(v => v.readyState >= 2)`);
await sleep(500);

// 1. hover shows the bar at the video's corner
await move(200, 150);
let st = await barState();
check('hover over file video shows bar', st?.display === 'block', JSON.stringify(st));
check('bar sits at video corner', st?.transform === 'translate(28px, 28px)', st?.transform);

// 2. speed keys
await key(']', 'BracketRight', 221);
let rate = await evaluate(`document.getElementById('file').playbackRate`);
check('] speeds up to 1.25', rate === 1.25, String(rate));
await key('[', 'BracketLeft', 219);
await key('[', 'BracketLeft', 219);
rate = await evaluate(`document.getElementById('file').playbackRate`);
check('[ [ slows to 0.75', rate === 0.75, String(rate));
await key('\\', 'Backslash', 220);
rate = await evaluate(`document.getElementById('file').playbackRate`);
check('\\ resets to 1', rate === 1, String(rate));
await key('\\', 'Backslash', 220);
rate = await evaluate(`document.getElementById('file').playbackRate`);
check('\\ again restores 0.75', rate === 0.75, String(rate));
await key('\\', 'Backslash', 220);

// 2b. frame step and ±5s
{
  await move(200, 150);
  await evaluate(`(async () => { const v = document.getElementById('file'); v.pause(); v.currentTime = 2; await new Promise((r) => v.addEventListener('seeked', r, { once: true })); })()`);
  await key('.', 'Period', 190);
  await sleep(200);
  const fwd = await evaluate(`document.getElementById('file').currentTime`);
  check('. steps one frame forward (0.04s at 25 fps)', Math.abs(fwd - 2.04) < 0.002, fwd.toFixed(4));
  await key(',', 'Comma', 188);
  await sleep(200);
  const back = await evaluate(`document.getElementById('file').currentTime`);
  check(', steps back to the same frame', Math.abs(back - 2) < 0.002, back.toFixed(4));
  await key('.', 'Period', 190, 1);
  await sleep(200);
  const plus5 = await evaluate(`document.getElementById('file').currentTime`);
  check('Alt+. jumps forward 5s', Math.abs(plus5 - 7) < 0.01 || Math.abs(plus5 - 6) < 0.01, plus5.toFixed(3));
  await evaluate(`document.getElementById('file').currentTime = 3`);
  await key(',', 'Comma', 188, 1);
  await sleep(200);
  const minus5 = await evaluate(`document.getElementById('file').currentTime`);
  check('Alt+, jumps back 5s, stopping at 0', minus5 === 0, minus5.toFixed(3));
  await evaluate(`document.getElementById('file').play()`);
  await sleep(300);
  await key('.', 'Period', 190);
  const stillPlaying = await evaluate(`!document.getElementById('file').paused`);
  check('. is left to the site while the video plays', stillPlaying);
}

// 3. download button visibility: file vs stream
await move(200, 150);
let b = await barButtons();
check('download button shown for file video', b.download && !b.download.hidden);
await move(760, 150);
b = await barButtons();
check('download button hidden for MSE stream', b.download && b.download.hidden);
st = await barState();
check('bar follows to stream video', st?.transform === 'translate(528px, 28px)', st?.transform);

// 4. covered video
await move(10, 690);
await sleep(3200);
await move(600, 400);
st = await barState();
check('no bar when hovering a panel covering the video', st?.display !== 'block', JSON.stringify(st));
await move(950, 580);
st = await barState();
check('no bar when the video corner is covered', st?.display !== 'block', JSON.stringify(st));

// 5. screenshot and download
const before = new Set(fs.readdirSync(`${T}/dl`));
await move(200, 150);
await key('s', 'KeyS', 83, 1);
await move(200, 150);
b = await barButtons();
const [dx, dy] = await centerOf(b.download.nodeId);
await click(dx, dy);
let files = [];
for (let i = 0; i < 50; i++) {
  files = fs.readdirSync(`${T}/dl`).filter((f) => !before.has(f) && !f.endsWith('.crdownload'));
  if (files.length >= 2) break;
  await sleep(200);
}
const png = files.find((f) => f.endsWith('.png'));
const webm = files.find((f) => f.endsWith('.webm'));
check('Alt+S saves a PNG frame', !!png, png);
if (png) {
  const buf = fs.readFileSync(`${T}/dl/${png}`);
  check('PNG is full video resolution 640x360', buf.readUInt32BE(16) === 640 && buf.readUInt32BE(20) === 360, `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`);
}
check('download button saves the video file, named after the page', webm === 'Smoke Test Page.webm' && fs.statSync(`${T}/dl/${webm}`).size === fs.statSync(`${T}/site/file.webm`).size, webm);

// 6. fade: bar gone a few seconds after the pointer leaves
await move(10, 690);
await sleep(3300);
st = await barState();
check('bar fades out after idle', st?.display === 'none', JSON.stringify(st));

// 7. arm button
await move(200, 150);
b = await barButtons();
await click(...(await centerOf(b.pip.nodeId)));
b = await barButtons();
check('pop-out button arms (turns on)', b.pip.cls.includes('on'), b.pip.cls);

// 8. document pip pop-out and return
await move(200, 150);
await key('P', 'KeyP', 80, 1 | 8);
const opened = await waitFor(`!!(window.documentPictureInPicture && documentPictureInPicture.window) && document.getElementById('file') === null`, 3000);
check('Alt+Shift+P pops video into a document PiP window', opened, opened ? '' : 'documentPictureInPicture unavailable in headless?');
if (opened) {
  const bar = await evaluate(`documentPictureInPicture.window.document.querySelectorAll('.bar button').length`);
  check('pop-out window has its controls', bar === 9, String(bar));
  const seek = await evaluate(`(async () => {
    const w = documentPictureInPicture.window, d = w.document, v = d.querySelector('video');
    v.pause();
    const p = d.querySelector('.progress'), r = p.getBoundingClientRect();
    p.dispatchEvent(new w.PointerEvent('pointerdown', { clientX: r.left + r.width / 2, clientY: r.top + 5, bubbles: true }));
    p.dispatchEvent(new w.PointerEvent('pointerup', { clientX: r.left + r.width / 2, clientY: r.top + 5, bubbles: true }));
    await new Promise((res) => setTimeout(res, 300));
    return { t: v.currentTime, d: v.duration, hidden: p.hidden, time: d.querySelector('.time').textContent };
  })()`);
  check('seek bar jumps to the clicked point', !seek.hidden && Math.abs(seek.t - seek.d / 2) < 0.3, JSON.stringify(seek));
  check('time readout shows position / duration', /^0:0[23] \/ 0:06$/.test(seek.time), seek.time);
  // PIP_SHOT=/path/to.png saves a screenshot of the pop-out window with its controls showing.
  if (process.env.PIP_SHOT) {
    await evaluate(`(() => { const d = documentPictureInPicture.window.document; d.querySelector('.bar').classList.add('pinned'); })()`);
    const { targetInfos: all } = await send('Target.getTargets');
    const pipTarget = all.find((t) => t.type === 'page' && t.targetId !== targetId && t.url === 'about:blank');
    if (pipTarget) {
      const { sessionId: P } = await send('Target.attachToTarget', { targetId: pipTarget.targetId, flatten: true });
      await sleep(400);
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, P);
      fs.writeFileSync(process.env.PIP_SHOT, Buffer.from(data, 'base64'));
    }
    console.log(`      pop-out screenshot: ${pipTarget ? process.env.PIP_SHOT : 'window target not found'}`);
  }
  await evaluate(`documentPictureInPicture.window.close()`);
  const back = await waitFor(`document.getElementById('file')?.parentElement?.classList.contains('box')`, 3000);
  check('closing the window puts the video back', back);

  // Fullscreen needs a real click, so drive the pop-out window's own target with input events.
  await move(200, 150);
  await key('P', 'KeyP', 80, 1 | 8);
  const reopened = await waitFor(`!!documentPictureInPicture.window`, 3000);
  const { targetInfos: all } = await send('Target.getTargets');
  const pipTarget = all.find((t) => t.type === 'page' && t.targetId !== targetId && t.url === 'about:blank');
  if (reopened && pipTarget) {
    const { sessionId: P } = await send('Target.attachToTarget', { targetId: pipTarget.targetId, flatten: true });
    const r = await send('Runtime.evaluate', { expression: `(() => { const b = [...document.querySelectorAll('.bar button')].find((x) => x.title.startsWith('Fullscreen')).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`, returnByValue: true }, P);
    const [fx, fy] = r.result.value;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fx, y: fy }, P);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fx, y: fy, button: 'left', clickCount: 1 }, P);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fx, y: fy, button: 'left', clickCount: 1 }, P);
    const fs1 = await waitFor(`!!document.fullscreenElement && !documentPictureInPicture.window`, 3000);
    const where = await evaluate(`(() => { const f = document.fullscreenElement; const v = document.getElementById('file'); return { el: f && (f.className || f.tagName), hasVideo: !!(f && v && f.contains(v)) }; })()`);
    check('fullscreen uses the player\'s own fullscreen control', fs1 && where.el === 'box' && where.hasVideo, JSON.stringify(where));
    const tr = await evaluate(`window.__videoQolTrace.join('\\n')`);
    check('fullscreen attempts are traced for bug reports', /build [\w-]+ \| fullscreen requested/.test(tr) && /after site button: fullscreen on/.test(tr), tr.split('\n').slice(0, 3).join(' / ').slice(0, 300));
    await evaluate(`document.exitFullscreen().catch(() => {})`);
    await sleep(300);

    // Same from another tab, with the player's control disabled (as YouTube sometimes has it): it must not be used.
    await evaluate(`(() => { const b = document.querySelector('.vjs-fullscreen-control'); b.setAttribute('aria-disabled', 'true'); b.onclick = () => { window.__disabledClicked = true; }; })()`);
    await move(200, 150);
    await key('P', 'KeyP', 80, 1 | 8);
    await waitFor(`!!documentPictureInPicture.window`, 3000);
    const { targetId: otherTab } = await send('Target.createTarget', { url: 'about:blank#other' });
    await send('Target.activateTarget', { targetId: otherTab });
    await sleep(500);
    const hiddenBefore = await evaluate(`document.visibilityState`);
    // Chrome stops an idle extension service worker; waking it delays the tab switch.
    await send('ServiceWorker.enable', {}, S);
    await send('ServiceWorker.stopAllWorkers', {}, S);
    await sleep(500);
    const swAlive = (await send('Target.getTargets')).targetInfos.some((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
    const { targetInfos: all2 } = await send('Target.getTargets');
    const pip2 = all2.find((t) => t.type === 'page' && t.url === 'about:blank' && t.targetId !== targetId);
    const { sessionId: P2 } = await send('Target.attachToTarget', { targetId: pip2.targetId, flatten: true });
    const r2 = await send('Runtime.evaluate', { expression: `(() => { const b = [...document.querySelectorAll('.bar button')].find((x) => x.title.startsWith('Fullscreen')).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`, returnByValue: true }, P2);
    const [gx, gy] = r2.result.value;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gx, y: gy }, P2);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: gx, y: gy, button: 'left', clickCount: 1 }, P2);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: gx, y: gy, button: 'left', clickCount: 1 }, P2);
    const fs2 = await waitFor(`!!document.fullscreenElement`, 4000);
    const after = await evaluate(`document.visibilityState`);
    check('fullscreen works from another tab, with the service worker asleep', fs2, `video tab before click: ${hiddenBefore}, after: ${after}, worker running before click: ${swAlive}`);
    const fb = await evaluate(`(() => { const v = document.getElementById('file'); return { el: document.fullscreenElement && document.fullscreenElement.tagName, controls: v.controls }; })()`);
    fb.disabledClicked = await evaluate(`!!window.__disabledClicked`);
    check('a disabled player control is skipped; the video itself goes fullscreen with Chrome\'s controls', fb.el === 'VIDEO' && fb.controls && !fb.disabledClicked, JSON.stringify(fb));
    await evaluate(`document.exitFullscreen().catch(() => {})`);
    await sleep(400);
    const ctlAfter = await evaluate(`document.getElementById('file').controls`);
    check('Chrome\'s controls are removed again on exit', ctlAfter === false, String(ctlAfter));
    await send('Target.closeTarget', { targetId: otherTab });
    await sleep(300);
  } else {
    check('fullscreen button returns the video to the tab, fullscreen', false, 'pop-out did not reopen');
  }
}

// 9. reload the extension under the open page: the orphaned content script must not throw
{
  // Reload from an extension page: the service worker may be asleep by now.
  const { targetId: extPage } = await send('Target.createTarget', { url: `chrome-extension://${new URL(sw.url).host}/options.html` });
  const { sessionId: W } = await send('Target.attachToTarget', { targetId: extPage, flatten: true });
  await sleep(500);
  send('Runtime.evaluate', { expression: 'chrome.runtime.reload()' }, W).catch(() => {});
  await sleep(1500);
  const before = errors.length;
  await move(200, 150);
  await key(']', 'BracketRight', 221);
  const r2 = await evaluate(`document.getElementById('file').playbackRate`);
  await key('s', 'KeyS', 83, 1);
  await move(200, 150);
  const bb = await barButtons();
  await click(...(await centerOf(bb.download.nodeId)));
  await sleep(500);
  check('speed keys still work after extension reload', r2 === 1.25, String(r2));
  check('no errors from the orphaned script after reload', errors.length === before, errors.slice(before).join(' | ').slice(0, 300));
}

// 10. options page: site speed, default speed, live update
{
  const extId = new URL(sw.url).host;
  const { targetId: optId } = await send('Target.createTarget', { url: `chrome-extension://${extId}/options.html` });
  const { sessionId: O } = await send('Target.attachToTarget', { targetId: optId, flatten: true });
  await send('Runtime.enable', {}, O);
  const evalIn = async (session, expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await sleep(800);
  const setField = (sel, value) => `(() => { const el = ${sel}; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); })()`;
  await evalIn(O, `document.querySelector('#add').click()`);
  await evalIn(O, setField(`document.querySelector('#sites tr:last-child input[type=text]')`, `http://127.0.0.1:${PORT}/page`));
  await evalIn(O, setField(`document.querySelector('#sites tr:last-child input.speed')`, '1.5'));
  await sleep(700);
  const stored = await evalIn(O, `chrome.storage.sync.get(null)`);
  check('options page saves the site speed, normalised', stored.siteSpeeds?.['127.0.0.1'] === 1.5, JSON.stringify(stored));

  const ready = `document.readyState === 'complete' && [...document.querySelectorAll('video')].every(v => v.readyState >= 2)`;
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }, S);
  await sleep(500);
  await waitFor(ready);
  await sleep(300);
  let rate2 = await evaluate(`document.getElementById('file').playbackRate`);
  check('site speed applies on 127.0.0.1', rate2 === 1.5, String(rate2));

  await send('Page.navigate', { url: `http://localhost:${PORT}/` }, S);
  await sleep(500);
  await waitFor(ready);
  await sleep(300);
  rate2 = await evaluate(`document.getElementById('file').playbackRate`);
  check('another host uses the default (1×)', rate2 === 1, String(rate2));

  await evalIn(O, setField(`document.querySelector('#default-speed')`, '1.25'));
  await sleep(900);
  rate2 = await evaluate(`document.getElementById('file').playbackRate`);
  check('changing the default reaches the open tab live', rate2 === 1.25, String(rate2));

  // OPT_SHOT=/path/prefix saves the options page as <prefix>-light.png and <prefix>-dark.png.
  if (process.env.OPT_SHOT) {
    await evalIn(O, `document.querySelector('#add').click()`);
    await evalIn(O, setField(`document.querySelector('#sites tr:last-child input[type=text]')`, 'youtube.com'));
    await evalIn(O, setField(`document.querySelector('#sites tr:last-child input.speed')`, '1.75'));
    await evalIn(O, `(() => { document.querySelector('#add-arm').click(); const i = document.querySelector('#arm-sites tr:last-child input'); i.value = 'youtube.com'; i.dispatchEvent(new Event('input')); })()`);
    await sleep(500);
    await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 1500, deviceScaleFactor: 1, mobile: false }, O);
    for (const scheme of ['light', 'dark']) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }, O);
      await sleep(300);
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, O);
      fs.writeFileSync(`${process.env.OPT_SHOT}-${scheme}.png`, Buffer.from(data, 'base64'));
    }
    console.log(`      options screenshots: ${process.env.OPT_SHOT}-light.png / -dark.png`);
  }
  await evalIn(O, setField(`document.querySelector('#sites tr:last-child input[type=text]')`, 'not a site!'));
  await sleep(600);
  const err = await evalIn(O, `document.querySelector('#sites-error').textContent`);
  check('options page flags an invalid site', /isn't a site/.test(err), err);
}

// 11. arming is per page, and auto-arm sites arm a playing video with sound
{
  const armed = async () => { await move(200, 150); const b = await barButtons(); return b.pip.cls.includes('on'); };
  const replay = () => evaluate(`(async () => { const v = document.getElementById('file'); v.pause(); await v.play(); })()`);
  await waitFor(`[...document.querySelectorAll('video')].every(v => v.readyState >= 2)`);

  await evaluate(`history.pushState({}, '', location.pathname + '?v=1')`);
  await move(200, 150);
  await key('p', 'KeyP', 80, 1);
  check('Alt+P arms the video', await armed());
  await evaluate(`history.pushState({}, '', location.pathname + '?v=1&t=30')`);
  await replay();
  check('a timestamp-only address change keeps it armed', await armed());
  await evaluate(`history.pushState({}, '', location.pathname + '?v=2')`);
  await replay();
  check('moving to another video clears the arming', !(await armed()));

  const { targetId: optId2 } = await send('Target.createTarget', { url: `chrome-extension://${new URL(sw.url).host}/options.html` });
  const { sessionId: O2 } = await send('Target.attachToTarget', { targetId: optId2, flatten: true });
  await sleep(800);
  await send('Runtime.evaluate', { expression: `(() => { document.querySelector('#add-arm').click(); const i = document.querySelector('#arm-sites tr:last-child input'); i.value = 'localhost'; i.dispatchEvent(new Event('input')); })()` }, O2);
  await sleep(800);
  await evaluate(`(async () => { const v = document.getElementById('file'); v.muted = false; await v.play(); })()`);
  await sleep(300);
  const autoOk = await armed();
  const dbgInfo = autoOk ? '' : JSON.stringify({
    stored: (await send('Runtime.evaluate', { expression: 'chrome.storage.sync.get(null)', awaitPromise: true, returnByValue: true }, O2)).result.value,
    page: await evaluate(`(() => { const v = document.getElementById('file'); return { host: location.hostname, paused: v.paused, muted: v.muted, volume: v.volume }; })()`),
    trace: (await evaluate(`window.__videoQolTrace.slice(-4)`)),
  });
  check('auto-arm site arms the playing video once it has sound', autoOk, dbgInfo);

  await move(200, 150);
  await key('p', 'KeyP', 80, 1);
  await replay();
  check('un-arming on an auto-arm site sticks on the same page', !(await armed()));
  await evaluate(`history.pushState({}, '', location.pathname + '?v=3')`);
  await replay();
  check('…and the next video auto-arms again', await armed());
  await evaluate(`document.getElementById('file').muted = true`);
}

const extErrors = errors.filter((e) => /chrome-extension|videoqol|VIDEO_QOL/i.test(e) || !/favicon/.test(e));
check('no page/extension errors', extErrors.length === 0, extErrors.join(' | ').slice(0, 400));

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
ws.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
