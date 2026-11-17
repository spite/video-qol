// Loaded before content.js and pip.js. Built with createElementNS because Trusted Types sites reject HTML strings.
var VIDEO_QOL_ICONS = (() => {
  const seekArc = [
    ['path', { d: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9' }],
    ['path', { d: 'M4.5 4.5V9H9' }],
  ];
  const seekText = ['text', { x: '12', y: '14.6', 'font-size': '6.5', 'font-weight': '700', 'text-anchor': 'middle', fill: 'currentColor', stroke: 'none', 'font-family': 'system-ui, sans-serif' }, '10'];

  const ICONS = {
    minus: [['path', { d: 'M6 12h12' }]],
    plus: [['path', { d: 'M12 6v12M6 12h12' }]],
    camera: [
      ['path', { d: 'M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z' }],
      ['circle', { cx: '12', cy: '12.5', r: '3.25' }],
    ],
    popout: [
      ['rect', { x: '3', y: '5', width: '18', height: '14', rx: '2' }],
      ['rect', { x: '12', y: '11.5', width: '6', height: '4.5', rx: '1', fill: 'currentColor', stroke: 'none' }],
    ],
    play: [['path', { d: 'M8 5.8v12.4a.8.8 0 0 0 1.2.7l9.9-6.2a.8.8 0 0 0 0-1.4L9.2 5.1a.8.8 0 0 0-1.2.7z', fill: 'currentColor' }]],
    pause: [
      ['rect', { x: '6.5', y: '5', width: '3.5', height: '14', rx: '1', fill: 'currentColor', stroke: 'none' }],
      ['rect', { x: '14', y: '5', width: '3.5', height: '14', rx: '1', fill: 'currentColor', stroke: 'none' }],
    ],
    replay: seekArc,
    back10: [...seekArc, seekText],
    forward10: [['g', { transform: 'matrix(-1 0 0 1 24 0)' }, ...seekArc], seekText],
    download: [['path', { d: 'M12 4.5v10M7.5 10l4.5 4.5 4.5-4.5M5 19h14' }]],
    fullscreen: [['path', { d: 'M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15' }]],
    close: [['path', { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }]],
  };

  const NS = 'http://www.w3.org/2000/svg';

  function build(doc, [tag, attrs, ...kids]) {
    const node = doc.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    for (const kid of kids) node.append(typeof kid === 'string' ? kid : build(doc, kid));
    return node;
  }

  return function icon(doc, name) {
    const svg = build(doc, ['svg', {
      viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor',
      'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
    }]);
    for (const part of ICONS[name]) svg.append(build(doc, part));
    return svg;
  };
})();
