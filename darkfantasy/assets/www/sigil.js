// Zeichnet das Siegel eines Charakters (SVG): Hintergrund im Farbton des Stils, Runenkreis in der Farbe
// der Seltenheit, ein Stern-Polygon und das Symbol des Archetyps. Alles hängt am Kern-Seed.
var DF_SIGIL = (function () {
  var uid = 0;

  var ICONS = {
    sword: '<path d="M100 48 L109 62 L109 120 L91 120 L91 62 Z"/><rect x="76" y="120" width="48" height="8" rx="3"/>' +
      '<rect x="95.5" y="128" width="9" height="20" rx="2"/><circle cx="100" cy="153" r="6"/>',
    star: null, // wird erzeugt
    moon: '<path d="M120 64 A38 38 0 1 0 120 136 A29 29 0 1 1 120 64 Z"/>',
    sun: '<circle cx="100" cy="100" r="17"/>',
    leaf: '<path d="M100 54 C134 78 134 122 100 148 C66 122 66 78 100 54 Z"/>' +
      '<path d="M100 66 L100 140 M100 92 L114 80 M100 108 L86 96 M100 122 L113 110" stroke-width="3" fill="none" class="cut"/>',
    claw: '<path d="M76 62 C92 86 92 116 80 142 C100 118 102 88 76 62 Z"/><path d="M98 56 C114 84 114 118 102 148 C122 120 124 86 98 56 Z"/>' +
      '<path d="M120 62 C136 86 136 116 124 142 C144 118 146 88 120 62 Z"/>',
    drop: '<path d="M100 52 C100 52 130 94 130 114 A30 30 0 0 1 70 114 C70 94 100 52 100 52 Z"/>' +
      '<path d="M86 116 A14 14 0 0 0 100 130" stroke-width="4" fill="none" class="cut"/>'
  };

  function starPath(cx, cy, points, outer, inner, rot) {
    var d = '';
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 ? inner : outer;
      var a = rot + Math.PI * i / points;
      d += (i ? 'L' : 'M') + (cx + r * Math.sin(a)).toFixed(1) + ' ' + (cy - r * Math.cos(a)).toFixed(1) + ' ';
    }
    return d + 'Z';
  }

  function sunRays() {
    var s = '';
    for (var i = 0; i < 12; i++) {
      var a = Math.PI * i / 6, r1 = 25, r2 = i % 2 ? 38 : 46;
      s += '<line x1="' + (100 + r1 * Math.sin(a)).toFixed(1) + '" y1="' + (100 - r1 * Math.cos(a)).toFixed(1) +
        '" x2="' + (100 + r2 * Math.sin(a)).toFixed(1) + '" y2="' + (100 - r2 * Math.cos(a)).toFixed(1) + '" stroke-width="5" stroke-linecap="round"/>';
    }
    return s;
  }

  // Runenähnliche Zeichen: senkrechter Strich mit 1–3 schrägen Ästen
  function rune(r) {
    var d = 'M0 -6 L0 6';
    var n = r.int(1, 3);
    for (var i = 0; i < n; i++) {
      var y = r.int(-6, 3), dir = r() < 0.5 ? -1 : 1, len = r.int(3, 5);
      d += ' M0 ' + y + ' L' + dir * len + ' ' + (y + (r() < 0.5 ? len : -len));
    }
    return d;
  }

  function render(c, seed) {
    var D = DF_DATA, r = DF_GEN.rng(seed || 1);
    var st = D.STYLES[c.style] || D.STYLES.dark;
    var col = st.colors, rc = c.rarityColor;
    var id = 'sg' + (++uid);
    var out = '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="sigil tier' + c.tier + '">';
    out += '<defs><radialGradient id="' + id + 'b" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="' + col[0] + '"/>' +
      '<stop offset="1" stop-color="' + col[2] + '"/></radialGradient>' +
      '<filter id="' + id + 'g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="' + (2 + c.tier) + '" result="b"/>' +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
    out += '<rect width="200" height="200" fill="url(#' + id + 'b)"/>';
    // Glut
    for (var i = 0; i < 22; i++) {
      out += '<circle cx="' + r.int(4, 196) + '" cy="' + r.int(4, 196) + '" r="' + (r() * 1.6 + 0.4).toFixed(1) +
        '" fill="' + (r() < 0.5 ? col[1] : rc) + '" opacity="' + (r() * 0.5 + 0.2).toFixed(2) + '"/>';
    }
    // Runenkreis (dreht sich bei hoher Seltenheit)
    out += '<g class="spin" stroke="' + rc + '" fill="none" opacity="0.85">';
    out += '<circle cx="100" cy="100" r="86" stroke-width="1.5"/><circle cx="100" cy="100" r="72" stroke-width="1"/>';
    var count = 18;
    for (i = 0; i < count; i++) {
      var a = 360 * i / count;
      out += '<path d="' + rune(r) + '" stroke-width="1.6" stroke-linecap="round" transform="rotate(' + a + ' 100 100) translate(100 21)"/>';
    }
    out += '</g>';
    // Stern-Polygon
    var pts = r.int(5, 9);
    out += '<path d="' + starPath(100, 100, pts, 70, 70 * Math.cos(Math.PI * 2 / pts) * 0.95 / Math.cos(Math.PI / pts), r() * Math.PI) +
      '" fill="none" stroke="' + col[1] + '" stroke-width="1.2" opacity="0.5"/>';
    // Symbol
    var icon = c.icon === 'star' ? '<path d="' + starPath(100, 100, 8, 46, 18, 0) + '"/>' :
      c.icon === 'sun' ? ICONS.sun + sunRays() : ICONS[c.icon] || ICONS.sword;
    out += '<g fill="' + rc + '" stroke="' + rc + '" filter="url(#' + id + 'g)">' +
      icon.replace(/class="cut"/g, 'stroke="' + col[2] + '"') + '</g>';
    out += '</svg>';
    return out;
  }

  // Kleine Bilder für die Stilauswahl
  var SCENES = {
    high: '<path d="M0 150 L40 110 L70 130 L110 80 L150 125 L200 95 L200 200 L0 200 Z" fill="#0d1b3a" opacity=".8"/>' +
      '<path d="M120 200 L120 70 L114 70 L124 40 L134 70 L128 70 L128 200 Z M100 200 L100 110 L108 96 L116 110 L116 200 Z" fill="#f0c96b" opacity=".85"/>',
    dark: '<circle cx="140" cy="60" r="26" fill="#e9d5ff" opacity=".85"/><circle cx="130" cy="54" r="24" fill="#2a0d18"/>' +
      '<path d="M60 200 L66 120 L40 90 M66 120 L92 84 L100 60 M80 100 L110 96 M64 140 L30 118" stroke="#0a0608" stroke-width="7" fill="none" stroke-linecap="round"/>' +
      '<path d="M0 170 Q100 150 200 175 L200 200 L0 200 Z" fill="#0a0608"/>',
    mythic: '<path d="M30 130 C60 60 120 50 170 70 C140 80 120 95 110 115 C140 110 160 120 175 140 C130 130 90 140 60 160 Z" fill="#a5f3fc" opacity=".75"/>' +
      '<circle cx="150" cy="72" r="3" fill="#06151a"/><path d="M0 175 Q100 160 200 178 L200 200 L0 200 Z" fill="#06151a"/>',
    medieval: '<path d="M30 200 L30 110 L42 110 L42 100 L54 100 L54 110 L66 110 L66 100 L78 100 L78 110 L90 110 L90 80 L110 60 L130 80 L130 110 ' +
      'L142 110 L142 100 L154 100 L154 110 L166 110 L166 100 L178 100 L178 200 Z" fill="#14100c"/>' +
      '<path d="M110 60 L110 30 L136 38 L110 46" fill="#e5e7eb" stroke="#e5e7eb" stroke-width="2"/>'
  };

  function scene(styleId) {
    var st = DF_DATA.STYLES[styleId], col = st.colors, id = 'sc' + (++uid);
    return '<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + col[0] + '"/>' +
      '<stop offset="1" stop-color="' + col[2] + '"/></linearGradient></defs>' +
      '<rect width="200" height="200" fill="url(#' + id + ')"/>' + SCENES[styleId] + '</svg>';
  }

  return { render: render, scene: scene };
})();
