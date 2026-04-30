export function normalizeKey(value) {
  return String(value || '')
    .trim()
    .replace(/^#/, '')
    .replace(/^(TEXT|IMAGE|IMG|PHOTO|COLOR|COLOUR)_/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase() || 'VALUE';
}

export function detectColumnKind(name, sample = '') {
  const key = String(name || '').toUpperCase();
  const value = String(sample || '').trim();
  if (key === 'ID') return 'SKIP';
  if (/^https?:\/\//i.test(value) || /(IMAGE|IMG|PHOTO|LOGO|PICTURE|BG|BACKGROUND|PATH)/.test(key)) return 'IMAGE';
  if (/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) || /(COLOR|COLOUR|PRIMARY|SECONDARY|TERTIARY|ACCENT|HEX)/.test(key)) return 'COLOR';
  return 'TEXT';
}

export function tagForKind(name, kind) {
  if (kind === 'SKIP') return '';
  let key = normalizeKey(name);
  if (kind === 'COLOR') key = key.replace(/_(COLOR|COLOUR)$/i, '') || key;
  return `#${kind}_${key}`;
}

export function layerKind(layer) {
  if (layer.name?.startsWith('#TEXT_')) return 'TEXT';
  if (layer.name?.startsWith('#IMAGE_')) return 'IMAGE';
  if (layer.name?.startsWith('#COLOR_') || layer.name === '#AUTO_COLOR') return 'COLOR';
  return layer.targetKinds?.[0] || 'TEXT';
}

export function autoMapColumns(columns, layers) {
  const conflicts = [];
  const usedLayerIds = new Set();
  const mappings = columns.map((column, columnIndex) => {
    const kind = column.type || detectColumnKind(column.name);
    const tag = tagForKind(column.name, kind);
    if (kind === 'SKIP') {
      return { columnIndex, header: column.name, kind, tag: '', targetIds: [], confidence: 1, rule: 'skip-id' };
    }

    const compatible = layers.filter((layer) => layerKind(layer) === kind || layer.targetKinds?.includes(kind));
    const exact = compatible.filter((layer) => layer.name === tag);
    const key = normalizeKey(column.name);
    const fuzzy = compatible.filter((layer) => {
      const layerKey = normalizeKey(layer.name);
      return layerKey === key || layerKey.includes(key) || key.includes(layerKey);
    });
    const fallback = compatible.filter((layer) => !usedLayerIds.has(layer.id));
    const candidates = exact.length ? exact : fuzzy.length ? fuzzy : fallback.slice(0, 1);
    const targetIds = candidates.map((layer) => layer.id);

    if (targetIds.length > 1) {
      conflicts.push({ column: column.name, targetIds, reason: 'multiple-candidates' });
    }

    targetIds.forEach((id) => usedLayerIds.add(id));
    return {
      columnIndex,
      header: column.name,
      kind,
      tag,
      targetIds,
      confidence: exact.length ? 1 : fuzzy.length ? 0.72 : targetIds.length ? 0.35 : 0,
      rule: exact.length ? 'exact-tag' : fuzzy.length ? 'name-fuzzy' : targetIds.length ? 'type-fallback' : 'unmapped',
    };
  });

  return { mappings, conflicts };
}

export function buildCsv(columns, rows) {
  const escape = (value) => {
    const text = String(value || '');
    return text.includes(',') || text.includes('\n') || text.includes('"') ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.map((column) => column.name), ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim()) || rows.length === 0) rows.push(row);
  return rows;
}
