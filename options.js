const S = VIDEO_QOL_SETTINGS;
const $ = (sel) => document.querySelector(sel);
const defaultInput = $('#default-speed');
const sitesBody = $('#sites');
const armBody = $('#arm-sites');

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
}

function addArmRow(site = '') {
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
  armBody.append(tr);
  updateEmpty();
  return siteInput;
}

function collectArmSites() {
  const sites = [];
  const problems = [];
  for (const input of armBody.querySelectorAll('input')) {
    const raw = input.value.trim();
    const site = S.normalizeSite(raw);
    input.classList.toggle('invalid', !!raw && !site);
    if (!raw) continue;
    if (!site) problems.push(`“${raw}” isn't a site name.`);
    else if (!sites.includes(site)) sites.push(site);
  }
  $('#arm-error').textContent = problems[0] || '';
  return sites;
}

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
  const data = { siteSpeeds, autoArmSites: collectArmSites() };
  if (defaultSpeed !== null) data.defaultSpeed = defaultSpeed;
  await chrome.storage.sync.set(data);
  const status = $('#status');
  status.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => status.classList.remove('show'), 1200);
}

defaultInput.addEventListener('input', scheduleSave);
$('#add').addEventListener('click', () => addRow().focus());
$('#add-arm').addEventListener('click', () => addArmRow().focus());
$('#open-chrome-pip').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://settings/content/autoPictureInPicture' }));

chrome.storage.sync.get(S.DEFAULTS).then((s) => {
  defaultInput.value = s.defaultSpeed;
  for (const [site, speed] of Object.entries(s.siteSpeeds).sort(([a], [b]) => a.localeCompare(b))) addRow(site, speed);
  for (const site of s.autoArmSites) addArmRow(site);
  updateEmpty();
});
