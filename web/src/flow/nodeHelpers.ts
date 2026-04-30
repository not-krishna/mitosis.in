import { detectColumnKind, tagForKind } from "../utils/mapping";
import { ratioSizes } from "../utils/constants";

export function normalizeColorValue(value) {
  const clean = String(value || "")
    .trim()
    .replace(/^#/, "")
    .toUpperCase();
  if (/^[0-9A-F]{3}$/.test(clean)) {
    return clean
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  }
  if (/^[0-9A-F]{6}$/.test(clean)) return clean;
  return "000000";
}

export function colorInputValue(value) {
  return `#${normalizeColorValue(value)}`;
}

export function variantNameForRow(row, index) {
  return (row?.[0] || `Variant_${String(index + 1).padStart(2, "0")}`).trim();
}

export function mappingStatus(mapping) {
  if (!mapping || mapping.kind === "SKIP") return "connected";
  if (!mapping.targetIds?.length) return "missing";
  if ((mapping.confidence || 0) < 0.75) return "partial";
  return "connected";
}

export function resolutionForRatio(ratio) {
  const size = ratioSizes[ratio] || ratioSizes["1:1"];
  return `${size.w} x ${size.h}`;
}

export function firstFilledCell(rows, columnIndex) {
  const rowIndex = rows.findIndex((row) =>
    String(row?.[columnIndex] || "").trim(),
  );
  return {
    rowIndex: rowIndex >= 0 ? rowIndex : 0,
    value: rowIndex >= 0 ? rows[rowIndex]?.[columnIndex] || "" : "",
  };
}

export function previewForVariant(columns, row, variant, index) {
  const textColumnIndexes = columns
    .map((column, columnIndex) => (column.type === "TEXT" ? columnIndex : -1))
    .filter((columnIndex) => columnIndex >= 0);
  const colorIndex = columns.findIndex((column) => column.type === "COLOR");
  const imageIndex = columns.findIndex((column) => column.type === "IMAGE");
  const ratio =
    variant.scale && variant.ratios?.[0] ? variant.ratios[0] : "1:1";

  return {
    title:
      row?.[textColumnIndexes[1]] ||
      row?.[textColumnIndexes[0]] ||
      variantNameForRow(row, index),
    kicker: row?.[textColumnIndexes[0]] || `Variant ${index + 1}`,
    image: row?.[imageIndex] || "",
    color: colorIndex >= 0 ? colorInputValue(row?.[colorIndex]) : "#735cff",
    ratio,
    resolution: resolutionForRatio(ratio),
  };
}

export function defaultMappingForColumn(column, columnIndex) {
  const kind = column.type || detectColumnKind(column.name);
  return {
    columnIndex,
    header: column.name,
    kind,
    tag: tagForKind(column.name, kind),
    targetIds: [],
    confidence: kind === "SKIP" ? 1 : 0,
    rule: kind === "SKIP" ? "skip-id" : "needs-target",
  };
}
