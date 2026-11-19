// Shared by content.js, pip.js and the options page. Stored in chrome.storage.sync.
var VIDEO_QOL_SETTINGS = (() => {
  // shortcuts holds only the bindings changed from SHORTCUTS; '' turns one off.
  const DEFAULTS = { defaultSpeed: 1, siteSpeeds: {}, autoArmSites: [], hideBarSites: [], hideBarEverywhere: false, shortcuts: {} };
  const MIN_RATE = 0.0625;
  const MAX_RATE = 16;

  // Default bindings. With Alt the physical key (e.code) counts, since Alt changes the character on a Mac;
  // without it the character typed (e.key), so they follow the keyboard layout.
  const SHORTCUTS = {
    slower: '[',
    faster: ']',
    reset: '\\',
    frameBack: ',',
    frameFwd: '.',
    back5: 'Alt+Comma',
    fwd5: 'Alt+Period',
    shot: 'Alt+KeyS',
    pip: 'Alt+KeyP',
    popout: 'Alt+Shift+KeyP',
  };
  const SHORTCUT_LABELS = {
    slower: 'Slower',
    faster: 'Faster',
    reset: 'Toggle 1× and the last speed',
    frameBack: 'Previous frame, while paused',
    frameFwd: 'Next frame, while paused',
    back5: 'Back 5 seconds',
    fwd5: 'Forward 5 seconds',
    shot: 'Save the current frame',
    pip: 'Pop out when switching tabs',
    popout: 'Pop out now',
  };

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

  const listed = (host, list) => {
    const sites = new Set(list || []);
    return siteKeys(host).some((k) => sites.has(k));
  };
  const autoArms = (host, settings) => listed(host, settings.autoArmSites);
  const hidesBar = (host, settings) => !!settings.hideBarEverywhere || listed(host, settings.hideBarSites);

  // Action -> combo, with the user's changes applied.
  const shortcutsFor = (settings) => ({ ...SHORTCUTS, ...(settings.shortcuts || {}) });

  const MODIFIER_KEYS = new Set(['Alt', 'AltGraph', 'Shift', 'Control', 'Meta', 'CapsLock', 'Fn', 'OS']);

  // A keydown as a combo string like "Alt+Shift+KeyP" or "]"; '' for Ctrl/⌘ combos and lone modifiers.
  function comboFromEvent(e) {
    if (e.ctrlKey || e.metaKey || MODIFIER_KEYS.has(e.key) || !e.key) return '';
    if (e.altKey) return `Alt+${e.shiftKey ? 'Shift+' : ''}${e.code}`;
    return e.shiftKey && e.key.length > 1 ? `Shift+${e.key}` : e.key;
  }

  const CODE_LABELS = {
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', Space: 'Space',
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  };
  const KEY_LABELS = { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc' };

  // "Alt+Shift+KeyP" -> ['Alt', 'Shift', 'P'], for display.
  function comboKeys(combo) {
    if (!combo) return [];
    const keys = [];
    let rest = combo;
    let alt = false;
    for (;;) {
      if (rest.startsWith('Alt+') && rest.length > 4) { keys.push('Alt'); alt = true; rest = rest.slice(4); }
      else if (rest.startsWith('Shift+') && rest.length > 6) { keys.push('Shift'); rest = rest.slice(6); }
      else break;
    }
    if (alt) keys.push(CODE_LABELS[rest] || rest.replace(/^(Key|Digit|Numpad)/, ''));
    else if (rest.length === 1 && rest !== rest.toLowerCase()) keys.push('Shift', rest);
    else keys.push(KEY_LABELS[rest] || (rest.length === 1 ? rest.toUpperCase() : rest));
    return keys;
  }
  const comboLabel = (combo) => comboKeys(combo).join('+');

  return {
    DEFAULTS, MIN_RATE, MAX_RATE, SHORTCUTS, SHORTCUT_LABELS, clampRate, normalizeSite, speedFor, autoArms, hidesBar,
    shortcutsFor, comboFromEvent, comboKeys, comboLabel,
  };
})();
