/// <reference types="@figma/plugin-typings" />

type TemplateNode = FrameNode | ComponentNode;
type MappingKind = "TEXT" | "IMAGE" | "COLOR" | "SKIP";
type TargetKind = Exclude<MappingKind, "SKIP">;
type ImageBytesMap = Record<string, Uint8Array | number[]>;

const STANDARD_COLOR_COLUMNS = [
  { header: "PRIMARY_COLOR", value: "#111111" },
  { header: "SECONDARY_COLOR", value: "#6EE7B7" },
  { header: "TERTIARY_COLOR", value: "#8B5CF6" },
  { header: "TEXT_COLOR_1", value: "#FFFFFF" },
  { header: "TEXT_COLOR_2", value: "#A1A1AA" },
] as const;

interface LayerOption {
  id: string;
  name: string;
  nodeType: SceneNode["type"];
  targetKinds: TargetKind[];
  preview: string;
  defaultHex?: string;
}

interface ColumnMapping {
  columnIndex: number;
  header: string;
  kind: MappingKind;
  tag: string;
  targetIds: string[];
}

interface PluginMessage {
  type: string;
  frameId?: string;
  masterFrameId?: string;
  csvContent?: string;
  imageBytesMap?: ImageBytesMap;
  rows?: string[][];
  mappings?: ColumnMapping[];
  autoColorEnabled?: boolean;
  autoColorTargetIds?: string[];
  uiWidth?: number;
  uiHeight?: number;
}

figma.showUI(__html__, { width: 560, height: 720, title: "Mitosis.in" });

function isTemplateNode(node: BaseNode | null): node is TemplateNode {
  return !!node && (node.type === "FRAME" || node.type === "COMPONENT");
}

function getTopLevelTemplates() {
  return figma.currentPage.children
    .filter(isTemplateNode)
    .map((node) => ({ id: node.id, name: node.name, type: node.type }));
}

function postGenerationError(message: string) {
  figma.notify(message, { error: true });
  figma.ui.postMessage({ type: "generation-error", message });
}

function isIdHeader(header: string) {
  return header.trim().toUpperCase() === "ID";
}

function isHexColor(value: string) {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function normalizeHex(value: string) {
  const rgb = hexToRgb(value);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function hexToRgb(hex: string): RGB {
  let cleanHex = hex.trim().replace(/^#/, "");

  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split("")
      .map((char) => char + char)
      .join("");
  }

  const num = parseInt(cleanHex, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (channel: number) => {
    const hex = Math.round(channel * 255).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function escapeCSV(value: string) {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function normalizeKey(value: string) {
  const withoutMarker = value
    .trim()
    .replace(/^#/, "")
    .replace(/^(TEXT|IMAGE|IMG|PHOTO|COLOR|COLOUR)_/i, "");

  const normalized = withoutMarker
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toUpperCase();

  return normalized || "VALUE";
}

function keyForKind(header: string, kind: TargetKind) {
  let key = normalizeKey(header);

  if (kind === "COLOR") {
    key = key.replace(/_(COLOR|COLOUR)$/i, "") || key;
  }

  return key || "VALUE";
}

function tagForKind(header: string, kind: TargetKind) {
  return `#${kind}_${keyForKind(header, kind)}`;
}

const parseCSV = (text: string) => {
  const result: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && i + 1 < text.length && text[i + 1] === "\n") {
        i++;
      }

      row.push(field);
      result.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    result.push(row);
  }

  return result.filter((parsedRow) => parsedRow.some((cell) => cell.trim()));
};

setTimeout(() => {
  figma.ui.postMessage({ type: "frames-loaded", frames: getTopLevelTemplates() });
}, 100);

const loadFonts = async (textNode: TextNode) => {
  if (textNode.fontName !== figma.mixed) {
    await figma.loadFontAsync(textNode.fontName as FontName);
    return;
  }

  const fonts = textNode.getRangeAllFontNames(0, textNode.characters.length);
  for (const font of fonts) {
    await figma.loadFontAsync(font);
  }
};

function hasFills(node: SceneNode): node is SceneNode & MinimalFillsMixin {
  return "fills" in node && Array.isArray((node as SceneNode & MinimalFillsMixin).fills);
}

function getFills(node: SceneNode) {
  if (!hasFills(node)) {
    return null;
  }

  const fills = (node as SceneNode & MinimalFillsMixin).fills;
  return Array.isArray(fills) ? fills : null;
}

function setFills(node: SceneNode, fills: Paint[]) {
  (node as SceneNode & MinimalFillsMixin).fills = fills;
}

function firstSolidFillHex(node: SceneNode) {
  const fills = getFills(node);
  if (!fills) {
    return null;
  }

  const solidFill = fills.find((fill: Paint) => fill.type === "SOLID") as SolidPaint | undefined;
  if (!solidFill) {
    return null;
  }

  return rgbToHex(solidFill.color.r, solidFill.color.g, solidFill.color.b);
}

function getLayerOption(node: SceneNode): LayerOption | null {
  const targetKinds: TargetKind[] = [];

  if (node.type === "TEXT") {
    targetKinds.push("TEXT");
  }

  if (hasFills(node)) {
    if (node.type !== "TEXT") {
      targetKinds.push("IMAGE");
    }

    if (firstSolidFillHex(node)) {
      targetKinds.push("COLOR");
    }
  }

  if (targetKinds.length === 0) {
    return null;
  }

  const defaultHex = firstSolidFillHex(node) || undefined;
  const preview =
    node.type === "TEXT"
      ? node.characters.slice(0, 80)
      : defaultHex || node.type.toLowerCase().replace(/_/g, " ");

  return {
    id: node.id,
    name: node.name,
    nodeType: node.type,
    targetKinds,
    preview,
    defaultHex,
  };
}

function scanLayerOptions(masterNode: TemplateNode) {
  return masterNode
    .findAll((node) => getLayerOption(node) !== null)
    .map((node) => getLayerOption(node))
    .filter((option): option is LayerOption => option !== null);
}

function inferColumnKind(header: string, values: string[]): MappingKind {
  const headerUpper = header.trim().toUpperCase();
  const sample = values.find((value) => value.trim()) || "";

  if (isIdHeader(header)) {
    return "SKIP";
  }

  if (/^https?:\/\//i.test(sample) || /(IMAGE|IMG|PHOTO|LOGO|PICTURE|BG|BACKGROUND)/.test(headerUpper)) {
    return "IMAGE";
  }

  if (isHexColor(sample) || /(COLOR|COLOUR|PRIMARY|SECONDARY|TERTIARY|ACCENT|THEME|TEXT_COLOR)/.test(headerUpper)) {
    return "COLOR";
  }

  return "TEXT";
}

function layerLooksMappedToHeader(layer: LayerOption, header: string, kind: TargetKind) {
  const layerKey = normalizeKey(layer.name);
  const headerKey = keyForKind(header, kind);

  return (
    layer.name.trim().toUpperCase() === tagForKind(header, kind) ||
    layerKey === headerKey ||
    layerKey.endsWith(`_${headerKey}`) ||
    headerKey.endsWith(`_${layerKey}`) ||
    layerKey.includes(headerKey)
  );
}

function valuesForColumn(rows: string[][], columnIndex: number) {
  const values: string[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    values.push((rows[rowIndex][columnIndex] || "").trim());
  }

  return values;
}

function matchTargetsForColumn(
  rows: string[][],
  columnIndex: number,
  kind: TargetKind,
  layerOptions: LayerOption[],
  usedTextTargets: Set<string>,
  usedImageTargets: Set<string>,
) {
  const header = rows[0][columnIndex];
  const values = valuesForColumn(rows, columnIndex);
  const sample = values.find((value) => value.trim()) || "";
  const compatibleLayers = layerOptions.filter((layer) => layer.targetKinds.indexOf(kind) >= 0);
  const matches = compatibleLayers.filter((layer) => layerLooksMappedToHeader(layer, header, kind)).map((layer) => layer.id);

  if (matches.length > 0) {
    return matches;
  }

  if (kind === "TEXT" && sample) {
    const textMatches = compatibleLayers
      .filter((layer) => normalizeKey(layer.preview) === normalizeKey(sample))
      .map((layer) => layer.id);

    if (textMatches.length > 0) {
      return textMatches;
    }
  }

  if (kind === "COLOR" && isHexColor(sample)) {
    const sampleHex = normalizeHex(sample).toLowerCase();
    const colorMatches = compatibleLayers
      .filter((layer) => (layer.defaultHex || "").toLowerCase() === sampleHex)
      .map((layer) => layer.id);

    if (colorMatches.length > 0) {
      return colorMatches;
    }
  }

  if (kind === "TEXT") {
    const fallback = compatibleLayers.find((layer) => !usedTextTargets.has(layer.id));
    if (fallback) {
      usedTextTargets.add(fallback.id);
      return [fallback.id];
    }
  }

  if (kind === "IMAGE") {
    const fallback = compatibleLayers.find((layer) => !usedImageTargets.has(layer.id));
    if (fallback) {
      usedImageTargets.add(fallback.id);
      return [fallback.id];
    }
  }

  return [];
}

function buildMappingPlan(rows: string[][], masterNode: TemplateNode) {
  const layerOptions = scanLayerOptions(masterNode);
  const mappings: ColumnMapping[] = [];
  const usedTextTargets = new Set<string>();
  const usedImageTargets = new Set<string>();

  for (let columnIndex = 0; columnIndex < rows[0].length; columnIndex++) {
    const header = (rows[0][columnIndex] || "").trim();
    if (!header) {
      continue;
    }

    const inferredKind = inferColumnKind(header, valuesForColumn(rows, columnIndex));
    const kind = inferredKind;
    const tag = kind === "SKIP" ? "" : tagForKind(header, kind);
    const targetIds =
      kind === "SKIP"
        ? []
        : matchTargetsForColumn(rows, columnIndex, kind, layerOptions, usedTextTargets, usedImageTargets);

    mappings.push({
      columnIndex,
      header,
      kind,
      tag,
      targetIds,
    });
  }

  return { layerOptions, mappings };
}

function isNodeInsideRoot(node: BaseNode, root: BaseNode) {
  let current: BaseNode | null = node;

  while (current) {
    if (current.id === root.id) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

async function renameTargets(masterNode: TemplateNode, mappings: ColumnMapping[], autoColorTargetIds: string[] = []) {
  const usedTargetIds = new Set<string>();

  for (const mapping of mappings) {
    if (mapping.kind === "SKIP" || !mapping.tag) {
      continue;
    }

    for (const targetId of mapping.targetIds) {
      const node = await figma.getNodeByIdAsync(targetId);

      if (node && "name" in node && isNodeInsideRoot(node, masterNode)) {
        node.name = mapping.tag;
        usedTargetIds.add(targetId);
      }
    }
  }

  for (const targetId of autoColorTargetIds) {
    if (usedTargetIds.has(targetId)) {
      continue;
    }

    const node = await figma.getNodeByIdAsync(targetId);
    if (node && "name" in node && isNodeInsideRoot(node, masterNode)) {
      node.name = "#AUTO_COLOR";
    }
  }
}

async function getTemplateNodeById(nodeId: string) {
  const node = await figma.getNodeByIdAsync(nodeId);
  return isTemplateNode(node) ? node : null;
}

function hslToRgb(hue: number, saturation: number, lightness: number): RGB {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return { r: r + m, g: g + m, b: b + m };
}

function autoColorFor(rowNumber: number, colorIndex: number) {
  const hue = (rowNumber * 137.508 + colorIndex * 49) % 360;
  const lightness = [46, 54, 62][(rowNumber + colorIndex) % 3];
  return hslToRgb(hue, 72, lightness);
}

function collectImageUrls(rows: string[][], mappings: ColumnMapping[]) {
  const urlsToFetch = new Set<string>();
  const imageMappings = mappings.filter((mapping) => mapping.kind === "IMAGE" && mapping.targetIds.length > 0);

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];

    for (const mapping of imageMappings) {
      const value = (row[mapping.columnIndex] || "").trim();
      if (value.startsWith("http://") || value.startsWith("https://")) {
        urlsToFetch.add(value);
      }
    }
  }

  return Array.from(urlsToFetch);
}

async function applyMappedValue(
  targetNode: SceneNode,
  mapping: ColumnMapping,
  value: string,
  imageHashMap: Record<string, string>,
  warnings: string[],
) {
  if (mapping.kind === "TEXT") {
    if (targetNode.type !== "TEXT") {
      warnings.push(`Layer "${targetNode.name}" is mapped as text but is not a text layer.`);
      return;
    }

    try {
      await loadFonts(targetNode);
      targetNode.characters = value;
    } catch (error) {
      warnings.push(`Could not edit text layer "${targetNode.name}" because its font could not be loaded.`);
      console.error(error);
    }

    return;
  }

  if (mapping.kind === "IMAGE") {
    if (!hasFills(targetNode)) {
      warnings.push(`Layer "${targetNode.name}" is mapped as image but cannot receive fills.`);
      return;
    }

    if (!value.startsWith("http://") && !value.startsWith("https://")) {
      warnings.push(`Skipped image column "${mapping.header}" because the value is not a URL.`);
      return;
    }

    const hash = imageHashMap[value];
    if (!hash) {
      warnings.push(`Image was not fetched for "${mapping.header}".`);
      return;
    }

    setFills(targetNode, [
      {
        type: "IMAGE",
        scaleMode: "FILL",
        imageHash: hash,
      },
    ]);
    return;
  }

  if (mapping.kind === "COLOR") {
    if (!hasFills(targetNode)) {
      warnings.push(`Layer "${targetNode.name}" is mapped as color but cannot receive fills.`);
      return;
    }

    if (!isHexColor(value)) {
      warnings.push(`Skipped color column "${mapping.header}" because "${value}" is not a hex color.`);
      return;
    }

    setFills(targetNode, [{ type: "SOLID", color: hexToRgb(value) }]);
  }
}

function applySolidColorToTag(root: TemplateNode, tag: string, color: RGB) {
  const targetNodes = root.findAll((node) => node.name.trim() === tag && hasFills(node));

  for (const targetNode of targetNodes) {
    setFills(targetNode, [{ type: "SOLID", color }]);
  }
}

async function generateFrames(
  masterNode: TemplateNode,
  rows: string[][],
  mappings: ColumnMapping[],
  imageHashMap: Record<string, string>,
  autoColorEnabled: boolean,
  autoColorTargetIds: string[],
) {
  await renameTargets(masterNode, mappings, autoColorEnabled ? autoColorTargetIds : []);

  const generatedNodes: SceneNode[] = [];
  const warnings: string[] = [];
  const idColumnIndex = rows[0].findIndex(isIdHeader);
  const activeMappings = mappings.filter((mapping) => mapping.kind !== "SKIP" && mapping.tag && mapping.targetIds.length > 0);
  const colorMappings = activeMappings.filter((mapping) => mapping.kind === "COLOR");
  const gap = 80;
  let generatedIndex = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row || row.every((cell) => !cell.trim())) {
      continue;
    }

    const duplicate = masterNode.clone();
    const fallbackId = `Variation ${rowIndex}`;
    const variationId = ((idColumnIndex >= 0 ? row[idColumnIndex] : row[0]) || fallbackId).trim() || fallbackId;
    const rowOffset = Math.floor(generatedIndex / 3);
    const columnOffset = generatedIndex % 3;

    duplicate.x = masterNode.x + masterNode.width + gap + columnOffset * (masterNode.width + gap);
    duplicate.y = masterNode.y + rowOffset * (masterNode.height + gap);
    duplicate.name = `${masterNode.name}_${variationId}`;

    for (const mapping of activeMappings) {
      let value = (row[mapping.columnIndex] || "").trim();
      const targetNodes = duplicate.findAll((node) => node.name.trim() === mapping.tag);

      if (targetNodes.length === 0) {
        warnings.push(`No mapped layers found for "${mapping.header}" in "${duplicate.name}".`);
        continue;
      }

      if (autoColorEnabled && mapping.kind === "COLOR") {
        const colorIndex = colorMappings.findIndex((colorMapping) => colorMapping.columnIndex === mapping.columnIndex);
        value = rgbToHex(...rgbToTuple(autoColorFor(rowIndex - 1, colorIndex < 0 ? 0 : colorIndex)));
      }

      if (!value) {
        continue;
      }

      for (const targetNode of targetNodes) {
        await applyMappedValue(targetNode, mapping, value, imageHashMap, warnings);
      }
    }

    if (autoColorEnabled && autoColorTargetIds.length > 0) {
      applySolidColorToTag(duplicate, "#AUTO_COLOR", autoColorFor(rowIndex - 1, colorMappings.length));
    }

    generatedNodes.push(duplicate);
    generatedIndex++;
  }

  if (generatedNodes.length > 0) {
    figma.currentPage.selection = generatedNodes;
    figma.viewport.scrollAndZoomIntoView(generatedNodes);
  }

  const warningSummary = warnings.length > 0 ? ` (${warnings.length} warnings)` : "";
  figma.notify(`Generated ${generatedNodes.length} variation${generatedNodes.length === 1 ? "" : "s"}${warningSummary}.`);

  if (warnings.length > 0) {
    console.warn(warnings.join("\n"));
  }

  figma.closePlugin();
}

function rgbToTuple(rgb: RGB): [number, number, number] {
  return [rgb.r, rgb.g, rgb.b];
}

async function prepareGeneration(masterFrameId: string | undefined, csvContent: string) {
  if (!masterFrameId) {
    postGenerationError("Select a master frame before generating.");
    return;
  }

  const rows = parseCSV(csvContent);
  if (rows.length < 2) {
    postGenerationError("CSV must have a header row and at least one data row.");
    return;
  }

  const masterNode = await getTemplateNodeById(masterFrameId);
  if (!masterNode) {
    postGenerationError("Selected master frame was not found.");
    return;
  }

  const mappingPlan = buildMappingPlan(rows, masterNode);
  await renameTargets(masterNode, mappingPlan.mappings);

  figma.ui.postMessage({
    type: "show-mapping-screen",
    masterFrameId,
    rows,
    mappings: mappingPlan.mappings,
    layerOptions: scanLayerOptions(masterNode),
  });
}

async function importMappedData(
  masterFrameId: string | undefined,
  csvContent: string,
  mappings: ColumnMapping[],
  autoColorEnabled: boolean,
  autoColorTargetIds: string[],
) {
  if (!masterFrameId) {
    postGenerationError("Select a master frame before generating.");
    return;
  }

  const rows = parseCSV(csvContent);
  if (rows.length < 2) {
    postGenerationError("CSV must have a header row and at least one data row.");
    return;
  }

  const urlsToFetch = collectImageUrls(rows, mappings);
  if (urlsToFetch.length > 0) {
    figma.ui.postMessage({
      type: "fetch-images",
      urls: urlsToFetch,
      rows,
      masterFrameId,
      mappings,
      autoColorEnabled,
      autoColorTargetIds,
    });
    return;
  }

  const masterNode = await getTemplateNodeById(masterFrameId);
  if (!masterNode) {
    postGenerationError("Selected master frame was not found.");
    return;
  }

  await generateFrames(masterNode, rows, mappings, {}, autoColorEnabled, autoColorTargetIds);
}

figma.ui.onmessage = (msg: PluginMessage) => {
  if (msg.type === "resize-ui") {
    const width = Math.min(Math.max(Math.round(msg.uiWidth || 560), 420), 980);
    const height = Math.min(Math.max(Math.round(msg.uiHeight || 720), 420), 900);
    figma.ui.resize(width, height);
    return;
  }

  if (msg.type === "export-data" && msg.frameId) {
    extractNode(msg.frameId).then((node) => {
      if (!isTemplateNode(node)) {
        postGenerationError("Selected template was not found.");
        return;
      }

      const hashNodes = node.findAll((child) => child.name.startsWith("#"));
      const headers = ["ID", ...hashNodes.map((child) => child.name)];
      const values = [
        node.name,
        ...hashNodes.map((child) => (child.type === "TEXT" ? child.characters : firstSolidFillHex(child) || "")),
      ];
      const existingHeaders = new Set(headers.map((header) => header.trim().replace(/^#(TEXT|IMAGE|COLOR)_/i, "").toUpperCase()));

      for (const column of STANDARD_COLOR_COLUMNS) {
        const normalizedHeader = column.header.trim().toUpperCase();

        if (!existingHeaders.has(normalizedHeader)) {
          headers.push(column.header);
          values.push(column.value);
          existingHeaders.add(normalizedHeader);
        }
      }

      figma.ui.postMessage({
        type: "export-data",
        data: {
          frameName: node.name,
          csvContent: `${headers.map(escapeCSV).join(",")}\n${values.map(escapeCSV).join(",")}`,
        },
      });
    });
    return;
  }

  if (msg.type === "prepare-generation" && msg.csvContent) {
    prepareGeneration(msg.masterFrameId, msg.csvContent).catch((error) => {
      console.error(error);
      postGenerationError("Error preparing generation. See console.");
    });
    return;
  }

  if (msg.type === "import-mapped-data" && msg.csvContent && msg.mappings) {
    importMappedData(
      msg.masterFrameId,
      msg.csvContent,
      msg.mappings,
      Boolean(msg.autoColorEnabled),
      msg.autoColorTargetIds || [],
    ).catch((error) => {
      console.error(error);
      postGenerationError("Error generating frames. See console.");
    });
    return;
  }

  if (msg.type === "images-fetched" && msg.imageBytesMap && msg.rows && msg.masterFrameId && msg.mappings) {
    const imageHashMap: Record<string, string> = {};

    for (const url in msg.imageBytesMap) {
      const bytes = msg.imageBytesMap[url];
      const figmaImage = figma.createImage(new Uint8Array(bytes));
      imageHashMap[url] = figmaImage.hash;
    }

    getTemplateNodeById(msg.masterFrameId)
      .then((masterNode) => {
        if (!masterNode) {
          postGenerationError("Selected master frame was not found.");
          return;
        }

        return generateFrames(
          masterNode,
          msg.rows || [],
          msg.mappings || [],
          imageHashMap,
          Boolean(msg.autoColorEnabled),
          msg.autoColorTargetIds || [],
        );
      })
      .catch((error) => {
        console.error(error);
        postGenerationError("Error generating frames. See console.");
      });
    return;
  }

  console.warn("Unknown message received:", msg);
};

async function extractNode(nodeId: string) {
  return figma.getNodeByIdAsync(nodeId);
}
