const S = VIDEO_QOL_SETTINGS;
const $ = (sel) => document.querySelector(sel);
const defaultInput = $('#default-speed');
const sitesBody = $('#sites');
const armBody = $('#arm-sites');
const hideBody = $('#hide-sites');
const hideEverywhere = $('#hide-everywhere');
const keysBody = $('#shortcuts');
let shortcuts = {};

function parseSpeed(input) {
  const v = parseFloat(input.value);
  const ok = Number.isFinite(v) && v >= S.MIN_RATE && v <= S.MAX_RATE;
  input.classList.toggle('invalid', !ok);
  return ok ? S.clampRate(v) : null;
}

function removeIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M6.5 6.5l11 11M17.5 6.5l-11 11');
  svg.append(path);
  return svg;
}

function addRow(site = '', speed = 1.5) {
  const tr = document.createElement('tr');
  const siteInput = Object.assign(document.createElement('input'), {
    type: 'text', value: site, placeholder: 'youtube.com', spellcheck: false, ariaLabel: 'Site',
  });
  const speedInput = Object.assign(document.createElement('input'), {
    type: 'number', className: 'speed', value: speed, min: S.MIN_RATE, max: S.MAX_RATE, step: 0.05, ariaLabel: 'Speed',
  });
  const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'remove', title: 'Remove' });
  remove.append(removeIcon());
  remove.addEventListener('click', () => { tr.remove(); scheduleSave(); });
  siteInput.addEventListener('input', scheduleSave);
  siteInput.addEventListener('change', () => {
    const norm = S.normalizeSite(siteInput.value);
    if (norm) siteInput.value = norm;
  });
  speedInput.addEventListener('input', scheduleSave);

  const td = (cls, ...kids) => {
    const cell = document.createElement('td');
    cell.className = cls;
    cell.append(...kids);
    return cell;
  };
  tr.append(td('site', siteInput), td('speed-cell', speedInput), td('del', remove));
  sitesBody.append(tr);
  updateEmpty();
  return siteInput;
}

function updateEmpty() {
  $('#empty').hidden = sitesBody.children.length > 0;
  $('#arm-empty').hidden = armBody.children.length > 0;
  $('#hide-empty').hidden = hideBody.children.length > 0;
}

// A row in a plain list of sites (auto-arm, hidden bar).
function addListRow(body, site = '') {
  const tr = document.createElement('tr');
  const siteInput = Object.assign(document.createElement('input'), {
    type: 'text', value: site, placeholder: 'youtube.com', spellcheck: false, ariaLabel: 'Site',
  });
  const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'remove', title: 'Remove' });
  remove.append(removeIcon());
  remove.addEventListener('click', () => { tr.remove(); scheduleSave(); });
  siteInput.addEventListener('input', scheduleSave);
  siteInput.addEventListener('change', () => {
    const norm = S.normalizeSite(siteInput.value);
    if (norm) siteInput.value = norm;
  });
  const siteCell = Object.assign(document.createElement('td'), { className: 'site' });
  siteCell.append(siteInput);
  const delCell = Object.assign(document.createElement('td'), { className: 'del' });
  delCell.append(remove);
  tr.append(siteCell, delCell);
  body.append(tr);
  updateEmpty();
  return siteInput;
}

function collectSiteList(body, errorEl) {
  const sites = [];
  const problems = [];
  for (const input of body.querySelectorAll('input')) {
    const raw = input.value.trim();
    const site = S.normalizeSite(raw);
    input.classList.toggle('invalid', !!raw && !site);
    if (!raw) continue;
    if (!site) problems.push(`“${raw}” isn't a site name.`);
    else if (!sites.includes(site)) sites.push(site);
  }
  errorEl.textContent = problems[0] || '';
  return sites;
}

// ---------- shortcuts ----------

const keyChips = (combo) => {
  if (!combo) return [Object.assign(document.createElement('span'), { className: 'none', textContent: 'Off' })];
  return S.comboKeys(combo).flatMap((k, i) => {
    const kbd = Object.assign(document.createElement('kbd'), { textContent: k });
    return i ? ['+', kbd] : [kbd];
  });
};

function renderShortcuts() {
  const bindings = S.shortcutsFor({ shortcuts });
  keysBody.replaceChildren(...Object.keys(S.SHORTCUTS).map((act) => {
    const tr = document.createElement('tr');
    const name = Object.assign(document.createElement('td'), { className: 'act', textContent: S.SHORTCUT_LABELS[act] });
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'shortcut', title: 'Click, then press the new keys' });
    button.dataset.act = act;
    button.append(...keyChips(bindings[act]));
    button.addEventListener('click', () => record(button, act));
    const cell = Object.assign(document.createElement('td'), { className: 'key' });
    cell.append(button);
    tr.append(name, cell);
    return tr;
  }));
}

function record(button, act) {
  if (button.classList.contains('recording')) return;
  const error = $('#keys-error');
  button.classList.add('recording');
  button.replaceChildren('Press keys…');
  const stop = () => {
    button.removeEventListener('keydown', onKey);
    button.removeEventListener('blur', stop);
    renderShortcuts();
  };
  const onKey = (e) => {
    if (e.key === 'Tab') return stop();
    e.preventDefault();
    if (e.key === 'Escape') { error.textContent = ''; return stop(); }
    let combo;
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.altKey && !e.shiftKey) combo = '';
    else {
      if (e.ctrlKey || e.metaKey) { error.textContent = 'Ctrl and ⌘ shortcuts belong to the browser; use Alt or a single key.'; return; }
      combo = S.comboFromEvent(e);
      if (!combo) return;
      const bindings = S.shortcutsFor({ shortcuts });
      const taken = Object.keys(bindings).find((a) => a !== act && bindings[a] === combo);
      if (taken) { error.textContent = `${S.comboLabel(combo)} is already used for “${S.SHORTCUT_LABELS[taken]}”.`; return; }
    }
    error.textContent = '';
    if (combo === S.SHORTCUTS[act]) delete shortcuts[act];
    else shortcuts[act] = combo;
    stop();
    scheduleSave();
    keysBody.querySelector(`[data-act="${act}"]`)?.focus();
  };
  button.addEventListener('keydown', onKey);
  button.addEventListener('blur', stop);
}

$('#reset-keys').addEventListener('click', () => {
  shortcuts = {};
  $('#keys-error').textContent = '';
  renderShortcuts();
  scheduleSave();
});

// Reads the form; returns null for any field that is invalid, so nothing half-typed gets saved.
function collect() {
  const defaultSpeed = parseSpeed(defaultInput);
  $('#default-error').textContent = defaultSpeed === null ? `Enter a speed from ${S.MIN_RATE} to ${S.MAX_RATE}.` : '';

  const siteSpeeds = {};
  const seen = new Map();
  const problems = [];
  for (const tr of sitesBody.children) {
    const [siteInput, speedInput] = tr.querySelectorAll('input');
    const raw = siteInput.value.trim();
    const site = S.normalizeSite(raw);
    const speed = parseSpeed(speedInput);
    siteInput.classList.toggle('invalid', !!raw && !site);
    if (!raw) continue;
    if (!site) { problems.push(`“${raw}” isn't a site name.`); continue; }
    if (seen.has(site)) {
      siteInput.classList.add('invalid');
      problems.push(`${site} is listed twice; the lower one wins.`);
    }
    seen.set(site, true);
    if (speed !== null) siteSpeeds[site] = speed;
    else problems.push(`Enter a speed from ${S.MIN_RATE} to ${S.MAX_RATE} for ${site}.`);
  }
  $('#sites-error').textContent = problems[0] || '';
  return { defaultSpeed, siteSpeeds };
}

let saveTimer = 0;
function scheduleSave() {
  updateEmpty();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

let statusTimer = 0;
async function save() {
  const { defaultSpeed, siteSpeeds } = collect();
  const data = {
    siteSpeeds,
    autoArmSites: collectSiteList(armBody, $('#arm-error')),
    hideBarSites: collectSiteList(hideBody, $('#hide-error')),
    hideBarEverywhere: hideEverywhere.checked,
    shortcuts,
  };
  if (defaultSpeed !== null) data.defaultSpeed = defaultSpeed;
  await chrome.storage.sync.set(data);
  const status = $('#status');
  status.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => status.classList.remove('show'), 1200);
}

defaultInput.addEventListener('input', scheduleSave);
$('#add').addEventListener('click', () => addRow().focus());
$('#add-arm').addEventListener('click', () => addListRow(armBody).focus());
$('#add-hide').addEventListener('click', () => addListRow(hideBody).focus());
hideEverywhere.addEventListener('change', scheduleSave);
$('#open-chrome-pip').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://settings/content/autoPictureInPicture' }));

chrome.storage.sync.get(S.DEFAULTS).then((s) => {
  defaultInput.value = s.defaultSpeed;
  for (const [site, speed] of Object.entries(s.siteSpeeds).sort(([a], [b]) => a.localeCompare(b))) addRow(site, speed);
  for (const site of s.autoArmSites) addListRow(armBody, site);
  for (const site of s.hideBarSites) addListRow(hideBody, site);
  hideEverywhere.checked = !!s.hideBarEverywhere;
  shortcuts = { ...s.shortcuts };
  renderShortcuts();
  updateEmpty();
});
