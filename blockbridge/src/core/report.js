// Sammelt, was beim Umwandeln passiert ist, gruppiert für die Anzeige.

export class Report {
  constructor() {
    this.groups = new Map();
    this.converted = 0;
  }

  /** level: 'ok' | 'info' | 'warn' | 'skip' */
  add(level, title, detail) {
    const key = level + '|' + title;
    let g = this.groups.get(key);
    if (!g) {
      g = { level, title, details: [], count: 0 };
      this.groups.set(key, g);
    }
    g.count++;
    if (detail != null && g.details.length < 400) g.details.push(String(detail));
    return g;
  }

  ok(title, detail) {
    this.converted++;
    return this.add('ok', title, detail);
  }
  info(title, detail) {
    return this.add('info', title, detail);
  }
  warn(title, detail) {
    return this.add('warn', title, detail);
  }
  skip(title, detail) {
    return this.add('skip', title, detail);
  }

  toJSON() {
    const order = { ok: 0, info: 1, warn: 2, skip: 3 };
    return [...this.groups.values()].sort((a, b) => order[a.level] - order[b.level]);
  }
}
