// Shared by content.js and the options page. Stored in chrome.storage.sync.
var VIDEO_QOL_SETTINGS = (() => {
  const DEFAULTS = { defaultSpeed: 1, siteSpeeds: {}, autoArmSites: [] };
  const MIN_RATE = 0.0625;
  const MAX_RATE = 16;

  const clampRate = (r) => Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(r * 100) / 100));

  // "https://www.YouTube.com/watch?v=1" -> "youtube.com"; returns '' when it isn't a usable host.
  function normalizeSite(input) {
    let s = String(input || '').trim().toLowerCase();
    if (!s) return '';
    try {
      s = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(s) ? s : `http://${s}`).hostname;
    } catch {
      return '';
    }
    s = s.replace(/^www\./, '').replace(/\.$/, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(s) || /^\[[0-9a-f:]+\]$/.test(s) ? s : '';
  }

  // A host and its parent domains, most specific first: "m.youtube.com", "youtube.com", "com".
  function siteKeys(host) {
    const labels = normalizeSite(host).split('.');
    return labels.map((_, i) => labels.slice(i).join('.'));
  }

  function speedFor(host, settings) {
    const sites = settings.siteSpeeds || {};
    const key = siteKeys(host).find((k) => sites[k]);
    return clampRate(key ? sites[key] : settings.defaultSpeed || 1);
  }

  function autoArms(host, settings) {
    const sites = new Set(settings.autoArmSites || []);
    return siteKeys(host).some((k) => sites.has(k));
  }

  return { DEFAULTS, MIN_RATE, MAX_RATE, clampRate, normalizeSite, speedFor, autoArms };
})();
