/* Unterwegs – Karte mit Leaflet und OpenStreetMap-Kacheln. */
(function (root) {
  'use strict';
  var core = root.U.core;
  var map = null, layer = null;

  function ensure(el) {
    if (map) return map;
    if (!root.L) return null;
    map = root.L.map(el, { zoomControl: false, attributionControl: true, tap: true });
    root.L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix(false);
    root.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
    }).addTo(map);
    layer = root.L.layerGroup().addTo(map);
    return map;
  }

  function legColor(l) {
    if (l.type === 'transit') return l.color && l.color !== '#ffffff' ? l.color : core.CAT_COLOR[l.cat];
    return core.CAT_COLOR[l.cat] || '#64748b';
  }

  function dot(latlng, color, radius, fill) {
    return root.L.circleMarker(latlng, {
      radius: radius, color: color, weight: 3, fillColor: fill || '#ffffff', fillOpacity: 1
    });
  }

  /** Route zeichnen: farbige Abschnitte, Start, Ziel und Haltestellen. */
  function show(el, route) {
    var m = ensure(el);
    if (!m) return;
    layer.clearLayers();
    var bounds = [];
    route.legs.forEach(function (l) {
      var pts = (l.geometry || []).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
      if (pts.length < 2) return;
      var color = legColor(l);
      var street = l.type !== 'transit';
      if (!street) root.L.polyline(pts, { color: '#ffffff', weight: 9, opacity: 0.9 }).addTo(layer);
      root.L.polyline(pts, {
        color: color, weight: street ? 5 : 6, opacity: 0.95,
        dashArray: l.type === 'walk' ? '2 9' : null, lineCap: 'round'
      }).addTo(layer);
      bounds = bounds.concat(pts);
      if (!street) {
        dot(pts[0], color, 6).bindTooltip(core.fmtTime(l.start) + ' ' + l.from.name).addTo(layer);
        dot(pts[pts.length - 1], color, 6).bindTooltip(core.fmtTime(l.end) + ' ' + l.to.name).addTo(layer);
      }
    });
    var first = route.legs[0], last = route.legs[route.legs.length - 1];
    if (first && first.from.lat !== null) {
      dot([first.from.lat, first.from.lon], '#15803d', 8, '#22c55e').bindTooltip('Start').addTo(layer);
      bounds.push([first.from.lat, first.from.lon]);
    }
    if (last && last.to.lat !== null) {
      dot([last.to.lat, last.to.lon], '#b91c1c', 8, '#ef4444').bindTooltip('Ziel').addTo(layer);
      bounds.push([last.to.lat, last.to.lon]);
    }
    m.invalidateSize();
    if (bounds.length) m.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 });
  }

  function refresh() {
    if (map) map.invalidateSize();
  }

  root.U.map = { show: show, refresh: refresh };
})(window);
