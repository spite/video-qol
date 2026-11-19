// Builds the Chrome Web Store images into store/images: four 1280×800 screenshots, the 440×280 small promo
// tile and the 1400×560 marquee, plus web-*.webp shots for the landing page (index.html).
// The extension's UI is captured live from headless Chromium, then laid out.
// Usage: node store/make-assets.mjs   (needs ffmpeg with libvpx, python3 with Pillow, and Chromium as in test/smoke.mjs)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const EXT = path.resolve(HERE, '..');
const OUT = `${HERE}/images`;
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'video-qol-store-'));
const SITE = `${T}/site`;
const PORT = 9000 + (process.pid % 1000);
const CHROME = process.env.CHROME || (() => {
  const base = `${os.homedir()}/.cache/ms-playwright`;
  const dir = fs.existsSync(base) && fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop();
  if (!dir) throw new Error('No Chromium found; set CHROME=/path/to/chromium');
  return `${base}/${dir}/chrome-linux/chrome`;
})();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (s) => console.log(`${(performance.now() / 1000).toFixed(1)}s ${s}`);
process.on('exit', () => fs.rmSync(T, { recursive: true, force: true }));
fs.mkdirSync(SITE, { recursive: true });
fs.mkdirSync(`${T}/dl`);
fs.mkdirSync(OUT, { recursive: true });

// ---------- demo video and pages ----------

execFileSync('python3', [`${HERE}/scene.py`, `${T}/fg.png`]);
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i',
  'gradients=size=1280x720:rate=30:n=3:speed=0.0005:x0=600:y0=0:x1=680:y1=520:c0=0x241a5e:c1=0xc8457a:c2=0xffb46e',
  '-i', `${T}/fg.png`, '-filter_complex', '[0][1]overlay,format=yuv420p', '-t', '20', '-c:v', 'libvpx', '-b:v', '4M',
  '-deadline', 'good', '-cpu-used', '4', `${SITE}/sunset.webm`], { stdio: 'inherit' });
fs.copyFileSync(`${EXT}/icons/icon128.png`, `${SITE}/icon.png`);

const FAMILY = `'Ubuntu Sans', Ubuntu, system-ui, sans-serif`;
const FONT = `font-family: ${FAMILY};`;
const thumbs = [
  ['#1d4e6b', '#6fb7c9', 'Tide pools at low water', '12:04'],
  ['#3b2a5e', '#e08a5b', 'Night train, window seat', '48:30'],
  ['#20402c', '#9bc27a', 'Forest rain, one hour', '1:00:00'],
  ['#5a2035', '#f0b36b', 'Desert dunes at golden hour', '8:17'],
  ['#1f2c4a', '#7d9bff', 'Northern lights over the fjord', '21:45'],
];
fs.writeFileSync(`${SITE}/watch.html`, `<!doctype html><meta charset=utf-8><title>Sunset over the ridgeline</title>
<style>
  body { margin:0; background:#0f0f12; color:#eee; ${FONT} }
  header { height:56px; display:flex; align-items:center; gap:16px; padding:0 24px; border-bottom:1px solid #222; }
  .menu { width:20px; height:14px; border-top:2px solid #bbb; border-bottom:2px solid #bbb; position:relative; }
  .menu::after { content:''; position:absolute; left:0; right:0; top:6px; border-top:2px solid #bbb; }
  .search { margin:0 auto; width:420px; height:34px; border-radius:17px; background:#1c1c21; border:1px solid #2c2c33;
    color:#777; font-size:14px; display:flex; align-items:center; padding:0 16px; box-sizing:border-box; }
  .avatar { width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#f0a35b,#c8457a); }
  main { display:flex; gap:24px; padding:20px 24px; }
  .player { width:864px; height:486px; background:#000; border-radius:12px; overflow:hidden; position:relative; }
  video { width:100%; height:100%; display:block; }
  h1 { font-size:20px; margin:14px 0 6px; font-weight:600; }
  .meta { color:#9a9aa5; font-size:14px; }
  aside { flex:1; display:flex; flex-direction:column; gap:12px; }
  aside h2 { font-size:15px; margin:0 0 2px; color:#ccc; font-weight:600; }
  .t { display:flex; gap:10px; }
  .t i { width:150px; height:84px; border-radius:8px; flex:none; position:relative; }
  .t i b { position:absolute; right:5px; bottom:5px; font:600 11px/1 ${FAMILY}; font-style:normal; background:rgba(0,0,0,.75);
    padding:3px 4px; border-radius:3px; }
  .t span { font-size:13px; line-height:1.35; color:#ddd; }
  .t small { display:block; color:#888; margin-top:4px; font-size:12px; }
</style>
<header><div class=menu></div><div class=search>Search</div><div class=avatar></div></header>
<main>
  <div>
    <div class=player><video id=v src="sunset.webm" loop playsinline></video></div>
    <h1>Sunset over the ridgeline · 4K timelapse</h1>
    <div class=meta>Slow Skies · 184K views · 3 days ago</div>
  </div>
  <aside><h2>Up next</h2>
    ${thumbs.map(([a, b, t, d]) => `<div class=t><i style="background:linear-gradient(160deg,${a},${b})"><b>${d}</b></i><span>${t}<small>Slow Skies</small></span></div>`).join('')}
  </aside>
</main>
<script>const v = document.getElementById('v'); v.volume = 0.7; v.play();</script>`);

fs.writeFileSync(`${SITE}/read.html`, `<!doctype html><meta charset=utf-8><title>Planning a two-day ridge hike</title>
<style>
  body { margin:0; background:#fbfaf7; color:#24262b; ${FONT} }
  header { height:56px; display:flex; align-items:center; padding:0 40px; border-bottom:1px solid #e6e3dc; font-weight:700; letter-spacing:.02em; color:#5b5f68; }
  article { max-width:680px; margin:0 auto; padding:36px 24px; }
  .kicker { color:#c8457a; font-weight:700; font-size:13px; text-transform:uppercase; letter-spacing:.08em; }
  h1 { font-size:36px; line-height:1.15; margin:10px 0 14px; }
  .by { color:#7a7e87; font-size:14px; margin-bottom:24px; }
  p { font-size:17px; line-height:1.7; margin:0 0 18px; color:#33363c; }
  h2 { font-size:21px; margin:28px 0 10px; }
</style>
<header>Field Notes</header>
<article>
  <div class=kicker>Trip planning</div>
  <h1>Planning a two-day ridge hike, step by step</h1>
  <div class=by>12 min read</div>
  <p>The best ridge walks reward a little preparation. Before you pick a route, check how much daylight you have, where the water sources are, and which sections are exposed if the weather turns.</p>
  <p>Start by splitting the route into stages of three to four hours. Mark a realistic camp for the first night and a fallback that is an hour earlier, so a slow afternoon never forces you to walk in the dark.</p>
  <h2>Water and weather</h2>
  <p>On high ground, streams can dry up by late summer. Carry enough for the longest dry stretch plus a margin, and look at the forecast for wind as well as rain: a gusty ridge is far harder than a wet valley.</p>
  <p>Pack layers you can add without stopping for long, and keep the map and a headlamp where you can reach them.</p>
</article>`);

step('video encoded');
// ---------- browser ----------

const PROFILE = `${T}/profile`;
fs.mkdirSync(`${PROFILE}/Default`, { recursive: true });
fs.writeFileSync(`${PROFILE}/Default/Preferences`, JSON.stringify({ download: { default_directory: `${T}/dl`, prompt_for_download: false } }));
const TYPES = { '.html': 'text/html', '.webm': 'video/webm', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
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
  '--window-size=1280,800', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore', detached: true });
const cleanup = () => {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch {}
  try { server.close(); } catch {}
  try { fs.rmSync(T, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000);

let wsUrl;
for (let i = 0; i < 100 && !wsUrl; i++) {
  await sleep(100);
  try {
    const [port, p] = fs.readFileSync(`${PROFILE}/DevToolsActivePort`, 'utf8').trim().split('\n');
    wsUrl = `ws://127.0.0.1:${port}${p}`;
  } catch {}
}
if (!wsUrl) { console.log('Chromium did not start'); process.exit(1); }
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

async function openTab(url, width = 1280, height = 800, scale = 2) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false, screenWidth: 1920, screenHeight: 1080 }, sessionId);
  await send('Page.navigate', { url }, sessionId);
  const tab = {
    targetId, sessionId,
    eval: async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, ms = 10000) {
      for (let t = 0; t < ms; t += 100) { if (await tab.eval(expr).catch(() => false)) return true; await sleep(100); }
      throw new Error(`timed out: ${expr}`);
    },
    move: async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId); await sleep(200); },
    key: async (key, code, vk, modifiers = 0) => {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, modifiers }, sessionId);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers }, sessionId);
      await sleep(120);
    },
    shot: async (file, clip) => {
      const format = file.endsWith('.webp') ? 'webp' : 'png';
      const { data } = await send('Page.captureScreenshot', { format, quality: 90, ...(clip ? { clip: { ...clip, scale: 1 } } : {}), captureBeyondViewport: !!clip }, sessionId);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
    },
    front: () => send('Target.activateTarget', { targetId }),
  };
  await tab.waitFor(`document.readyState === 'complete'`);
  return tab;
}
const rectOf = (tab, sel) => tab.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
const pad = (r, p) => ({ x: r.x - p, y: r.y - p, width: r.width + 2 * p, height: r.height + 2 * p });

await sleep(800);
const extId = (await send('Target.getTargets')).targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'))?.url.split('/')[2];
if (!extId) throw new Error('extension did not load');

// ---------- captures ----------

// Settings shown on the options page and used by the captures.
const opt = await openTab(`chrome-extension://${extId}/options.html`, 720, 800);
await opt.eval(`chrome.storage.sync.set({ defaultSpeed: 1, siteSpeeds: { 'youtube.com': 1.75, 'coursera.org': 1.5, 'vimeo.com': 1.25 }, autoArmSites: ['youtube.com'], hideBarSites: [], hideBarEverywhere: false, shortcuts: {} })`);

const watch = await openTab(`http://127.0.0.1:${PORT}/watch.html`);
await watch.front();
await watch.waitFor(`document.getElementById('v').readyState >= 3 && !document.getElementById('v').paused`);
await watch.eval(`(async () => { const v = document.getElementById('v'); v.currentTime = 14; await new Promise((r) => v.addEventListener('seeked', r, { once: true })); })()`);
const player = await rectOf(watch, '.player');
const sceneClip = { x: 0, y: 0, width: 1280, height: 800 };

step('watch page ready');
// 1. speed: hover, then ] three times
await watch.move(player.x + 300, player.y + 200);
for (let i = 0; i < 3; i++) await watch.key(']', 'BracketRight', 221);
await sleep(250);
await watch.shot(`${SITE}/cap-speed.png`, sceneClip);
await watch.shot(`${OUT}/web-speed.webp`, { x: player.x - 24, y: 0, width: player.width + 48, height: player.y + player.height + 12 });

step('speed captured');
// 2. frame: pause, step a frame, save it
await watch.eval(`document.getElementById('v').pause()`);
await sleep(1600);
await watch.key('.', 'Period', 190);
await watch.key('s', 'KeyS', 83, 1);
await sleep(350);
await watch.shot(`${SITE}/cap-frame.png`, sceneClip);
await watch.shot(`${OUT}/web-frame.webp`, { x: player.x - 24, y: player.y - 24, width: 560, height: 350 });
await watch.eval(`document.getElementById('v').play()`);

step('frame captured');
// 3. pop-out over another tab
await watch.move(player.x + 300, player.y + 200);
await watch.key('P', 'KeyP', 80, 1 | 8);
await watch.waitFor(`!!(window.documentPictureInPicture && documentPictureInPicture.window)`);
await watch.eval(`(() => { const d = documentPictureInPicture.window.document; d.querySelector('.bar').classList.add('pinned'); })()`);
const pipTarget = (await send('Target.getTargets')).targetInfos.find((t) => t.type === 'page' && t.url === 'about:blank' && t.targetId !== watch.targetId && t.targetId !== opt.targetId);
const { sessionId: P } = await send('Target.attachToTarget', { targetId: pipTarget.targetId, flatten: true });
await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 2, mobile: false }, P);
await sleep(800);
fs.writeFileSync(`${SITE}/cap-pip.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' }, P)).data, 'base64'));
const read = await openTab(`http://127.0.0.1:${PORT}/read.html`);
await read.shot(`${SITE}/cap-read.png`, sceneClip);

step('pop-out captured');
// 4. options page sections
// Background tabs don't paint, and a screenshot of one waits forever.
await opt.front();
await send('Page.reload', {}, opt.sessionId);
await sleep(300);
await opt.waitFor(`document.readyState === 'complete' && document.querySelectorAll('#sites tr').length === 3`);
await opt.eval(`document.getElementById('status').remove()`);
const sections = await opt.eval(`[...document.querySelectorAll('section')].map((s) => { const r = s.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, width: r.width, height: r.height, title: s.querySelector('h2').textContent }; })`);
const sec = (title) => sections.find((s) => s.title === title);
await opt.shot(`${SITE}/cap-opt-sites.png`, pad(sec('Site speeds'), 1));
await opt.shot(`${SITE}/cap-opt-keys.png`, pad(sec('Keyboard shortcuts'), 1));
await opt.shot(`${SITE}/cap-opt-bar.png`, pad(sec('Control bar'), 1));

step('options captured');
// ---------- layouts ----------

const STYLE = `
  * { box-sizing:border-box; }
  body { margin:0; ${FONT} color:#fff; overflow:hidden;
    background: radial-gradient(900px 520px at 85% -10%, rgba(91,140,255,.45), transparent 70%),
                radial-gradient(700px 500px at -10% 110%, rgba(200,69,122,.35), transparent 70%), #12122a; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:700; font-size:18px; color:#dfe4ff; }
  .brand img { width:34px; height:34px; margin:-5px; }
  h1 { font-size:42px; line-height:1.12; margin:0; font-weight:700; letter-spacing:-.01em; }
  p.sub { font-size:20px; line-height:1.45; color:#c4cbf2; margin:12px 0 0; }
  .card { position:absolute; border-radius:14px; overflow:hidden; box-shadow:0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08); }
  .card img { display:block; width:100%; }
  kbd { font:600 15px/1 ${FAMILY}; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.25); border-bottom-width:2px;
    border-radius:5px; padding:3px 7px; color:#fff; }
`;
const screen = (body) => `<!doctype html><meta charset=utf-8><style>${STYLE} body { width:1280px; height:800px; position:relative; }
  .head { position:absolute; left:64px; top:52px; right:64px; } .head h1 { margin-top:22px; }</style>${body}`;
const brand = `<div class=brand><img src="icon.png" alt="">Video QoL</div>`;

// Scene crops: x/y/width of the 1280×800 capture (css px), drawn at `width` in the layout.
const crop = (img, c, width, left, top) => {
  const k = width / c.width;
  return `<div class=card style="left:${left}px; top:${top}px; width:${width}px; height:${Math.round(c.height * k)}px">
    <img src="${img}" style="width:${1280 * k}px; margin:${-c.y * k}px 0 0 ${-c.x * k}px; max-width:none"></div>`;
};
const playerCrop = { x: player.x - 24, y: 0, width: player.width + 48, height: player.y + player.height + 80 };
const barCrop = { x: player.x - 24, y: player.y - 24, width: 560, height: 360 };
const marqueeCrop = { ...playerCrop, height: player.y + player.height + 12 };

const layouts = {
  'screenshot-1-speed': screen(`<div class=head>${brand}<h1>Any speed, on any video</h1>
    <p class=sub>Hover a video for the bar, or press <kbd>[</kbd> <kbd>]</kbd>. Set a speed per site and it sticks.</p></div>
    ${crop('cap-speed.png', playerCrop, 1000, 140, 236)}`),
  'screenshot-2-frames': screen(`<div class=head>${brand}<h1>Step frame by frame, save the exact frame</h1>
    <p class=sub>Pause, press <kbd>,</kbd> <kbd>.</kbd> to step, and <kbd>Alt</kbd>+<kbd>S</kbd> for a full-resolution PNG.</p></div>
    ${crop('cap-frame.png', barCrop, 1000, 140, 236)}`),
  'screenshot-3-popout': screen(`<div class=head>${brand}<h1>Keep watching in a pop-out player</h1>
    <p class=sub>It floats when you switch tabs, with seek, volume, speed, subtitles and fullscreen.</p></div>
    ${crop('cap-read.png', { x: 0, y: 0, width: 1280, height: 800 }, 1000, 64, 236)}
    <div class=card style="left:${1280 - 64 - 560}px; top:420px; width:560px"><img src="cap-pip.png"></div>`),
  'screenshot-4-options': screen(`<div class=head>${brand}<h1>Your speeds, your keys</h1>
    <p class=sub>Speeds per site, sites that pop out on their own, a hidden bar where you'd rather use keys, and every shortcut changeable.</p></div>
    <div class=card style="left:64px; top:262px; width:560px"><img src="cap-opt-sites.png"></div>
    <div class=card style="left:64px; top:${262 + Math.round(sec('Site speeds').height * 560 / sec('Site speeds').width) + 24}px; width:560px"><img src="cap-opt-bar.png"></div>
    <div class=card style="left:656px; top:262px; width:560px"><img src="cap-opt-keys.png"></div>`),
  'promo-small-440x280': `<!doctype html><meta charset=utf-8><style>${STYLE} body { width:440px; height:280px; position:relative; }
    .c { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; padding:0 36px; }
    .c img { width:84px; height:84px; margin:-12px 0 4px -12px; } h1 { font-size:36px; } p { font-size:16px; color:#c4cbf2; margin:8px 0 0; line-height:1.4; }</style>
    <div class=c><img src="icon.png" alt=""><h1>Video QoL</h1><p>Speed, frame steps, screenshots and a pop-out player for any video.</p></div>`,
  'marquee-1400x560': `<!doctype html><meta charset=utf-8><style>${STYLE} body { width:1400px; height:560px; position:relative; }
    .c { position:absolute; left:72px; top:0; bottom:0; width:470px; display:flex; flex-direction:column; justify-content:center; }
    .c img { width:96px; height:96px; margin:-14px 0 6px -14px; } h1 { font-size:52px; } p { font-size:21px; color:#c4cbf2; margin:14px 0 0; line-height:1.45; }</style>
    <div class=c><img src="icon.png" alt=""><h1>Video QoL</h1><p>Speed control, frame-by-frame stepping, full-resolution screenshots and a pop-out player, on any site.</p></div>
    ${crop('cap-speed.png', marqueeCrop, 760, 590, 46)}`,
};

// Landing page shots: no headlines, at 2× for sharp screens.
const web = (body, bg) => `<!doctype html><meta charset=utf-8><style>${STYLE} body { width:1280px; height:800px; position:relative; ${bg ? `background:${bg};` : ''} }
  .card { box-shadow:0 18px 50px rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.08); }</style>${body}`;
layouts['web-popout'] = web(`<img src="cap-read.png" style="position:absolute; inset:0; width:1280px">
  <div class=card style="left:${1280 - 40 - 600}px; top:${800 - 40 - 338}px; width:600px"><img src="cap-pip.png"></div>`);
layouts['web-options'] = web(`
  <div class=card style="left:48px; top:48px; width:576px"><img src="cap-opt-sites.png"></div>
  <div class=card style="left:48px; top:${48 + Math.round(sec('Site speeds').height * 576 / sec('Site speeds').width) + 24}px; width:576px"><img src="cap-opt-bar.png"></div>
  <div class=card style="left:656px; top:48px; width:576px"><img src="cap-opt-keys.png"></div>`, '#e9ecf2');

const sizes = { 'promo-small-440x280': [440, 280], 'marquee-1400x560': [1400, 560] };
for (const [name, html] of Object.entries(layouts)) {
  fs.writeFileSync(`${SITE}/${name}.html`, html);
  const [w, h] = sizes[name] || [1280, 800];
  const isWeb = name.startsWith('web-');
  const tab = await openTab(`http://127.0.0.1:${PORT}/${name}.html`, w, h, isWeb ? 2 : 1);
  await tab.waitFor(`[...document.images].every((i) => i.complete && i.naturalWidth > 0)`);
  await tab.eval(`document.fonts.ready.then(() => true)`);
  await tab.shot(`${OUT}/${name}.${isWeb ? 'webp' : 'png'}`);
  await send('Target.closeTarget', { targetId: tab.targetId });
  console.log(`${OUT}/${name}.${isWeb ? 'webp' : 'png'}`);
}
ws.close();
process.exit(0);
