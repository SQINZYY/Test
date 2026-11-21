// Java-Versionen mit ihren pack_format-Nummern (Ressourcenpaket "rp" und Datenpaket "dp").

export const JAVA_VERSIONS = [
  { id: '1.21.9', label: '1.21.9 – 1.21.10', rp: 69, dp: 88 },
  { id: '1.21.7', label: '1.21.7 – 1.21.8', rp: 64, dp: 81 },
  { id: '1.21.6', label: '1.21.6', rp: 63, dp: 80 },
  { id: '1.21.5', label: '1.21.5', rp: 55, dp: 71 },
  { id: '1.21.4', label: '1.21.4', rp: 46, dp: 61 },
  { id: '1.21.2', label: '1.21.2 – 1.21.3', rp: 42, dp: 57 },
  { id: '1.21', label: '1.21 – 1.21.1', rp: 34, dp: 48 },
  { id: '1.20.5', label: '1.20.5 – 1.20.6', rp: 32, dp: 41 },
  { id: '1.20.3', label: '1.20.3 – 1.20.4', rp: 22, dp: 26 },
  { id: '1.20.2', label: '1.20.2', rp: 18, dp: 18 },
  { id: '1.20', label: '1.20 – 1.20.1', rp: 15, dp: 15 },
  { id: '1.19.4', label: '1.19.4', rp: 13, dp: 12 },
  { id: '1.19.3', label: '1.19.3', rp: 12, dp: 10 },
  { id: '1.19', label: '1.19 – 1.19.2', rp: 9, dp: 10 },
  { id: '1.18', label: '1.18 – 1.18.2', rp: 8, dp: 8 },
  { id: '1.17', label: '1.17 – 1.17.1', rp: 7, dp: 7 },
  { id: '1.16.2', label: '1.16.2 – 1.16.5', rp: 6, dp: 6 },
  { id: '1.15', label: '1.15 – 1.16.1', rp: 5, dp: 5 },
  { id: '1.13', label: '1.13 – 1.14.4', rp: 4, dp: 4 },
  { id: '1.11', label: '1.11 – 1.12.2', rp: 3, dp: null },
  { id: '1.9', label: '1.9 – 1.10.2', rp: 2, dp: null },
  { id: '1.8', label: '1.8 – 1.8.9', rp: 1, dp: null },
];

export const LATEST_JAVA = JAVA_VERSIONS[0];

export function javaVersionById(id) {
  return JAVA_VERSIONS.find((v) => v.id === id) || null;
}

/** Version zu einem Ressourcenpaket-Format (die neueste, die es noch versteht). */
export function javaVersionForRp(fmt) {
  if (!fmt) return null;
  return JAVA_VERSIONS.find((v) => v.rp <= fmt) || JAVA_VERSIONS[JAVA_VERSIONS.length - 1];
}

export function javaVersionForDp(fmt) {
  if (!fmt) return null;
  return JAVA_VERSIONS.find((v) => v.dp != null && v.dp <= fmt) || JAVA_VERSIONS.find((v) => v.id === '1.13');
}

/** Bezeichnung wie "1.20 – 1.20.1" für eine Formatnummer */
export function javaLabelForRp(fmt) {
  const v = javaVersionForRp(fmt);
  if (!v) return 'unbekannt';
  if (fmt > LATEST_JAVA.rp) return 'neuer als ' + LATEST_JAVA.label;
  return v.label;
}

export function javaLabelForDp(fmt) {
  const v = javaVersionForDp(fmt);
  if (!v) return 'unbekannt';
  if (fmt > LATEST_JAVA.dp) return 'neuer als ' + LATEST_JAVA.label;
  return v.label;
}

/** Ziel-Formate aus Auswahl (Version oder eigene Nummer). */
export function resolveJavaTarget(target) {
  if (target && target.customRp) {
    const rp = Number(target.customRp);
    const v = javaVersionForRp(rp) || LATEST_JAVA;
    const dp = target.customDp ? Number(target.customDp) : v.dp || LATEST_JAVA.dp;
    return { id: 'custom', label: 'pack_format ' + rp, rp, dp };
  }
  return javaVersionById(target && target.javaVersion) || LATEST_JAVA;
}

/** pack.mcmeta für ein Ziel. Ab 1.21.9 gibt es zusätzlich min_format/max_format. */
export function packMcmeta(description, fmt, newStyleFrom) {
  const pack = { pack_format: fmt, description };
  if (fmt >= newStyleFrom) {
    pack.min_format = fmt;
    pack.max_format = fmt;
  }
  return { pack };
}

export const BEDROCK_RP_MIN_ENGINE = [1, 20, 0];
export const BEDROCK_ADDON_MIN_ENGINE = [1, 21, 40];
