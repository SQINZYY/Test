/* Cover: zuerst ein erzeugtes Farbcover (funktioniert offline), dann – wenn online – das echte Albumcover
 * über open.spotify.com/oembed. Geladen wird nur, was sichtbar ist; Ergebnisse bleiben gespeichert. */
(function (global) {
  'use strict';

  const KEY = 'kw.covers';
  const MAX = 4000;
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { cache = {}; }
  const queue = [];
  const waiting = new Map(); // albumKey -> [Elemente]
  let active = 0;
  let offline = false;
  let saveTimer = null;
  let observer = null;

  function hash(s) {
    let h = 2166136261;
    for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /** Erzeugtes Cover: Farbverlauf + Anfangsbuchstaben (CSS-Variablen für .gen-cover). */
  function generated(title, seed) {
    const h = hash(seed || title);
    const hue = h % 360, hue2 = (hue + 35 + (h >> 9) % 70) % 360;
    const words = String(title || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    const letters = ((words[0] || '?')[0] + (words[1] ? words[1][0] : '')).toUpperCase();
    return { style: '--c1:hsl(' + hue + ',62%,46%);--c2:hsl(' + hue2 + ',58%,24%)', letters, shape: h % 3 };
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const keys = Object.keys(cache);
      if (keys.length > MAX) for (const k of keys.slice(0, keys.length - MAX)) delete cache[k];
      try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* voll */ }
    }, 800);
  }

  function apply(el, url) {
    if (!url || !el.isConnected) return;
    const img = new Image();
    img.decoding = 'async';
    img.alt = '';
    img.onload = () => { el.classList.add('has-img'); el.appendChild(img); };
    img.src = url;
  }

  function pump() {
    while (!offline && active < 3 && queue.length) {
      const { key, trackId } = queue.shift();
      active++;
      Platform.getJson('https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/track/' + trackId))
        .then(d => {
          const url = d && d.thumbnail_url || '';
          cache[key] = url;
          save();
          for (const el of waiting.get(key) || []) apply(el, url);
        })
        .catch(() => { offline = true; setTimeout(() => { offline = false; pump(); }, 60000); })
        .finally(() => { waiting.delete(key); active--; pump(); });
    }
  }

  function request(el) {
    const key = el.dataset.cover;
    const trackId = el.dataset.track;
    if (!key || !trackId || el.dataset.done) return;
    el.dataset.done = '1';
    if (key in cache) { apply(el, cache[key]); return; }
    if (waiting.has(key)) { waiting.get(key).push(el); return; }
    waiting.set(key, [el]);
    queue.push({ key, trackId });
    pump();
  }

  const Covers = {
    generated,
    /** Sucht neue Cover-Elemente unterhalb von root und lädt sie, sobald sie sichtbar werden. */
    watch(root) {
      if (!observer) {
        observer = new IntersectionObserver(entries => {
          for (const e of entries) if (e.isIntersecting) { observer.unobserve(e.target); request(e.target); }
        }, { rootMargin: '300px' });
      }
      for (const el of (root || document).querySelectorAll('[data-cover]:not([data-done])')) observer.observe(el);
    },
    cached: key => cache[key] || '',
  };

  global.Covers = Covers;
})(window);
