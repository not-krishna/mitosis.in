"use strict";
/// <reference types="@figma/plugin-typings" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const STANDARD_COLOR_COLUMNS = [
    { header: "PRIMARY_COLOR", value: "#111111" },
    { header: "SECONDARY_COLOR", value: "#6EE7B7" },
    { header: "TERTIARY_COLOR", value: "#8B5CF6" },
    { header: "TEXT_COLOR_1", value: "#FFFFFF" },
    { header: "TEXT_COLOR_2", value: "#A1A1AA" },
];
figma.showUI(__html__, {
    width: 420,
    height: 560,
    title: "Mitosis.in Executor",
});
function isTemplateNode(node) {
    return !!node && (node.type === "FRAME" || node.type === "COMPONENT");
}
function getTopLevelTemplates() {
    return figma.currentPage.children
        .filter(isTemplateNode)
        .map((node) => ({ id: node.id, name: node.name, type: node.type }));
}
function postTemplateMetadata() {
    const templates = figma.currentPage.children
        .filter(isTemplateNode)
        .map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        width: node.width,
        height: node.height,
        layerOptions: scanLayerOptions(node),
    }));
    figma.ui.postMessage({ type: "template-metadata", templates });
}
function postGenerationError(message) {
    figma.notify(message, { error: true });
    figma.ui.postMessage({ type: "generation-error", message });
}
function isIdHeader(header) {
    return header.trim().toUpperCase() === "ID";
}
function isHexColor(value) {
    return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}
function normalizeHex(value) {
    const rgb = hexToRgb(value);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
}
function hexToRgb(hex) {
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
function rgbToHex(r, g, b) {
    const toHex = (channel) => {
        const hex = Math.round(channel * 255).toString(16);
        return hex.length === 1 ? `0${hex}` : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function escapeCSV(value) {
    if (value.includes(",") || value.includes("\n") || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
function normalizeKey(value) {
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
function keyForKind(header, kind) {
    let key = normalizeKey(header);
    if (kind === "COLOR") {
        key = key.replace(/_(COLOR|COLOUR)$/i, "") || key;
    }
    return key || "VALUE";
}
function tagForKind(header, kind) {
    return `#${kind}_${keyForKind(header, kind)}`;
}
const parseCSV = (text) => {
    const result = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    inQuotes = false;
                }
            }
            else {
                field += char;
            }
            continue;
        }
        if (char === '"') {
            inQuotes = true;
        }
        else if (char === ",") {
            row.push(field);
            field = "";
        }
        else if (char === "\n" || char === "\r") {
            if (char === "\r" && i + 1 < text.length && text[i + 1] === "\n") {
                i++;
            }
            row.push(field);
            result.push(row);
            row = [];
            field = "";
        }
        else {
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
    figma.ui.postMessage({
        type: "frames-loaded",
        frames: getTopLevelTemplates(),
    });
}, 100);
setTimeout(() => {
    postTemplateMetadata();
}, 140);
const loadFonts = (textNode) => __awaiter(void 0, void 0, void 0, function* () {
    if (textNode.fontName !== figma.mixed) {
        yield figma.loadFontAsync(textNode.fontName);
        return;
    }
    const fonts = textNode.getRangeAllFontNames(0, textNode.characters.length);
    for (const font of fonts) {
        yield figma.loadFontAsync(font);
    }
});
function hasFills(node) {
    return ("fills" in node &&
        Array.isArray(node.fills));
}
function getFills(node) {
    if (!hasFills(node)) {
        return null;
    }
    const fills = node.fills;
    return Array.isArray(fills) ? fills : null;
}
function setFills(node, fills) {
    node.fills = fills;
}
function firstSolidFillHex(node) {
    const fills = getFills(node);
    if (!fills) {
        return null;
    }
    const solidFill = fills.find((fill) => fill.type === "SOLID");
    if (!solidFill) {
        return null;
    }
    return rgbToHex(solidFill.color.r, solidFill.color.g, solidFill.color.b);
}
function getLayerOption(node) {
    const targetKinds = [];
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
    const preview = node.type === "TEXT"
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
function scanLayerOptions(masterNode) {
    return masterNode
        .findAll((node) => getLayerOption(node) !== null)
        .map((node) => getLayerOption(node))
        .filter((option) => option !== null);
}
function inferColumnKind(header, values) {
    const headerUpper = header.trim().toUpperCase();
    const sample = values.find((value) => value.trim()) || "";
    if (isIdHeader(header)) {
        return "SKIP";
    }
    if (/^https?:\/\//i.test(sample) ||
        /(IMAGE|IMG|PHOTO|LOGO|PICTURE|BG|BACKGROUND)/.test(headerUpper)) {
        return "IMAGE";
    }
    if (isHexColor(sample) ||
        /(COLOR|COLOUR|PRIMARY|SECONDARY|TERTIARY|ACCENT|THEME|TEXT_COLOR)/.test(headerUpper)) {
        return "COLOR";
    }
    return "TEXT";
}
function layerLooksMappedToHeader(layer, header, kind) {
    const layerKey = normalizeKey(layer.name);
    const headerKey = keyForKind(header, kind);
    return (layer.name.trim().toUpperCase() === tagForKind(header, kind) ||
        layerKey === headerKey ||
        layerKey.endsWith(`_${headerKey}`) ||
        headerKey.endsWith(`_${layerKey}`) ||
        layerKey.includes(headerKey));
}
function valuesForColumn(rows, columnIndex) {
    const values = [];
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
        values.push((rows[rowIndex][columnIndex] || "").trim());
    }
    return values;
}
function matchTargetsForColumn(rows, columnIndex, kind, layerOptions, usedTextTargets, usedImageTargets) {
    const header = rows[0][columnIndex];
    const values = valuesForColumn(rows, columnIndex);
    const sample = values.find((value) => value.trim()) || "";
    const compatibleLayers = layerOptions.filter((layer) => layer.targetKinds.indexOf(kind) >= 0);
    const matches = compatibleLayers
        .filter((layer) => layerLooksMappedToHeader(layer, header, kind))
        .map((layer) => layer.id);
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
function buildMappingPlan(rows, masterNode) {
    const layerOptions = scanLayerOptions(masterNode);
    const mappings = [];
    const usedTextTargets = new Set();
    const usedImageTargets = new Set();
    for (let columnIndex = 0; columnIndex < rows[0].length; columnIndex++) {
        const header = (rows[0][columnIndex] || "").trim();
        if (!header) {
            continue;
        }
        const inferredKind = inferColumnKind(header, valuesForColumn(rows, columnIndex));
        const kind = inferredKind;
        const tag = kind === "SKIP" ? "" : tagForKind(header, kind);
        const targetIds = kind === "SKIP"
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
function isNodeInsideRoot(node, root) {
    let current = node;
    while (current) {
        if (current.id === root.id) {
            return true;
        }
        current = current.parent;
    }
    return false;
}
function renameTargets(masterNode_1, mappings_1) {
    return __awaiter(this, arguments, void 0, function* (masterNode, mappings, autoColorTargetIds = []) {
        const usedTargetIds = new Set();
        for (const mapping of mappings) {
            if (mapping.kind === "SKIP" || !mapping.tag) {
                continue;
            }
            for (const targetId of mapping.targetIds) {
                const node = yield figma.getNodeByIdAsync(targetId);
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
            const node = yield figma.getNodeByIdAsync(targetId);
            if (node && "name" in node && isNodeInsideRoot(node, masterNode)) {
                node.name = "#AUTO_COLOR";
            }
        }
    });
}
function getTemplateNodeById(nodeId) {
    return __awaiter(this, void 0, void 0, function* () {
        const node = yield figma.getNodeByIdAsync(nodeId);
        return isTemplateNode(node) ? node : null;
    });
}
function hslToRgb(hue, saturation, lightness) {
    const s = saturation / 100;
    const l = lightness / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hue < 60) {
        r = c;
        g = x;
    }
    else if (hue < 120) {
        r = x;
        g = c;
    }
    else if (hue < 180) {
        g = c;
        b = x;
    }
    else if (hue < 240) {
        g = x;
        b = c;
    }
    else if (hue < 300) {
        r = x;
        b = c;
    }
    else {
        r = c;
        b = x;
    }
    return { r: r + m, g: g + m, b: b + m };
}
function autoColorFor(rowNumber, colorIndex) {
    const hue = (rowNumber * 137.508 + colorIndex * 49) % 360;
    const lightness = [46, 54, 62][(rowNumber + colorIndex) % 3];
    return hslToRgb(hue, 72, lightness);
}
function collectImageUrls(rows, mappings) {
    const urlsToFetch = new Set();
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
function applyMappedValue(targetNode, mapping, value, imageHashMap, warnings) {
    return __awaiter(this, void 0, void 0, function* () {
        if (mapping.kind === "TEXT") {
            if (targetNode.type !== "TEXT") {
                warnings.push(`Layer "${targetNode.name}" is mapped as text but is not a text layer.`);
                return;
            }
            try {
                yield loadFonts(targetNode);
                targetNode.characters = value;
            }
            catch (error) {
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
    });
}
function applySolidColorToTag(root, tag, color) {
    const targetNodes = root.findAll((node) => node.name.trim() === tag && hasFills(node));
    for (const targetNode of targetNodes) {
        setFills(targetNode, [{ type: "SOLID", color }]);
    }
}
function generateFrames(masterNode, rows, mappings, imageHashMap, autoColorEnabled, autoColorTargetIds, generationContext) {
    return __awaiter(this, void 0, void 0, function* () {
        yield renameTargets(masterNode, mappings, autoColorEnabled ? autoColorTargetIds : []);
        const generatedNodes = [];
        const warnings = [];
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
            duplicate.x =
                masterNode.x +
                    masterNode.width +
                    gap +
                    columnOffset * (masterNode.width + gap);
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
                    yield applyMappedValue(targetNode, mapping, value, imageHashMap, warnings);
                }
            }
            if (autoColorEnabled && autoColorTargetIds.length > 0) {
                applySolidColorToTag(duplicate, "#AUTO_COLOR", autoColorFor(rowIndex - 1, colorMappings.length));
            }
            generatedNodes.push(duplicate);
            generatedIndex++;
        }
        if (generationContext && generatedNodes.length > 0) {
            annotateGeneratedNodes(generatedNodes, generationContext);
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
        figma.ui.postMessage({
            type: "generation-complete",
            generationId: (generationContext === null || generationContext === void 0 ? void 0 : generationContext.generationId) || "",
            frameIds: generatedNodes.map((node) => node.id),
            frameNames: generatedNodes.map((node) => node.name),
        });
    });
}
function rgbToTuple(rgb) {
    return [rgb.r, rgb.g, rgb.b];
}
function prepareGeneration(masterFrameId, csvContent) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!masterFrameId) {
            postGenerationError("Select a master frame before generating.");
            return;
        }
        const rows = parseCSV(csvContent);
        if (rows.length < 2) {
            postGenerationError("CSV must have a header row and at least one data row.");
            return;
        }
        const masterNode = yield getTemplateNodeById(masterFrameId);
        if (!masterNode) {
            postGenerationError("Selected master frame was not found.");
            return;
        }
        const mappingPlan = buildMappingPlan(rows, masterNode);
        yield renameTargets(masterNode, mappingPlan.mappings);
        figma.ui.postMessage({
            type: "show-mapping-screen",
            masterFrameId,
            rows,
            mappings: mappingPlan.mappings,
            layerOptions: scanLayerOptions(masterNode),
        });
    });
}
function importMappedData(masterFrameId, csvContent, mappings, autoColorEnabled, autoColorTargetIds, generationContext) {
    return __awaiter(this, void 0, void 0, function* () {
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
                csvContent,
                campaignName: generationContext === null || generationContext === void 0 ? void 0 : generationContext.campaignName,
                variantSetName: generationContext === null || generationContext === void 0 ? void 0 : generationContext.variantSetName,
                generationId: generationContext === null || generationContext === void 0 ? void 0 : generationContext.generationId,
            });
            return;
        }
        const masterNode = yield getTemplateNodeById(masterFrameId);
        if (!masterNode) {
            postGenerationError("Selected master frame was not found.");
            return;
        }
        yield generateFrames(masterNode, rows, mappings, {}, autoColorEnabled, autoColorTargetIds, generationContext);
    });
}
function makeGenerationContext(msg, mappings, ratioName) {
    return {
        campaignName: msg.campaignName || "Campaign_A",
        variantSetName: msg.variantSetName || "Variant_Set_1",
        generationId: msg.generationId || `gen_${Date.now()}`,
        mappingConfig: mappings,
        ratioName,
    };
}
function variantName(campaignName, index, ratioName) {
    const numberText = index + 1 < 10 ? `0${index + 1}` : String(index + 1);
    const variant = `Variant_${numberText}`;
    return ratioName
        ? `${campaignName} / ${ratioName} / ${variant}`
        : `${campaignName} / ${variant}`;
}
function generatedBounds(nodes) {
    const minX = Math.min(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const maxX = Math.max(...nodes.map((node) => node.x + node.width));
    const maxY = Math.max(...nodes.map((node) => node.y + node.height));
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
function createGenerationSection(nodes, context) {
    if (nodes.length === 0) {
        return null;
    }
    const bounds = generatedBounds(nodes);
    const section = figma.createSection();
    section.name = `${context.campaignName} / ${context.variantSetName}`;
    section.x = bounds.minX - 80;
    section.y = bounds.minY - 80;
    section.resizeWithoutConstraints(Math.max(1, bounds.width + 160), Math.max(1, bounds.height + 160));
    section.setPluginData("mitosis:generationId", context.generationId);
    section.setPluginData("mitosis:campaignName", context.campaignName);
    section.setPluginData("mitosis:variantSetName", context.variantSetName);
    // Send section to back by moving it to the beginning of parent's children
    const parent = section.parent;
    if (parent && "children" in parent && parent.children.length > 1) {
        const children = parent.children;
        const index = children.indexOf(section);
        if (index > 0) {
            parent.insertChild(0, section);
        }
    }
    return section;
}
function annotateGeneratedNodes(nodes, context) {
    nodes.forEach((node, index) => {
        node.name = variantName(context.campaignName, index, context.ratioName);
        node.setPluginData("mitosis:generationId", context.generationId);
        node.setPluginData("mitosis:campaignName", context.campaignName);
        node.setPluginData("mitosis:variantSetName", context.variantSetName);
        node.setPluginData("mitosis:ratioName", context.ratioName || "");
        node.setPluginData("mitosis:sourceRow", String(index + 1));
        node.setPluginData("mitosis:mappingConfig", JSON.stringify(context.mappingConfig));
    });
    createGenerationSection(nodes, context);
}
function localImageUrlForKey(key) {
    return `https://local.mitosis.in/${encodeURIComponent(key.replace(/^local::/, ""))}`;
}
function normalizeLocalImageRows(rows, imageHashMap) {
    const normalizedRows = rows.map((row) => [...row]);
    const normalizedImageHashMap = Object.assign({}, imageHashMap);
    for (const key in imageHashMap) {
        if (!key.startsWith("local::")) {
            continue;
        }
        const urlKey = localImageUrlForKey(key);
        normalizedImageHashMap[urlKey] = imageHashMap[key];
        for (const row of normalizedRows) {
            for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
                if (row[columnIndex] === key) {
                    row[columnIndex] = urlKey;
                }
            }
        }
    }
    return { rows: normalizedRows, imageHashMap: normalizedImageHashMap };
}
function getHorizontalConstraint(node) {
    return "constraints" in node ? node.constraints.horizontal : "LEFT";
}
function getVerticalConstraint(node) {
    return "constraints" in node ? node.constraints.vertical : "TOP";
}
function resizeSceneNode(node, width, height) {
    if ("resize" in node) {
        node.resize(Math.max(0.01, width), Math.max(0.01, height));
    }
}
function resizeFrameToRatio(frame, targetW, targetH, scaleMode) {
    const originalW = frame.width;
    const originalH = frame.height;
    const scaleX = targetW / originalW;
    const scaleY = targetH / originalH;
    const children = [...frame.children];
    const childSnapshots = children.map((node) => ({
        node,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        right: originalW - (node.x + node.width),
        bottom: originalH - (node.y + node.height),
        horizontal: getHorizontalConstraint(node),
        vertical: getVerticalConstraint(node),
    }));
    frame.resize(targetW, targetH);
    if (frame.layoutMode !== "NONE") {
        return;
    }
    for (const snapshot of childSnapshots) {
        const node = snapshot.node;
        if ("layoutPositioning" in node && node.layoutPositioning !== "ABSOLUTE") {
            continue;
        }
        let nextX = snapshot.x;
        let nextY = snapshot.y;
        let nextW = snapshot.width;
        let nextH = snapshot.height;
        if (scaleMode === "stretch" ||
            snapshot.horizontal === "SCALE" ||
            snapshot.horizontal === "STRETCH" ||
            snapshot.horizontal === "LEFT_RIGHT") {
            nextX = snapshot.x * scaleX;
            nextW = snapshot.width * scaleX;
        }
        else if (snapshot.horizontal === "RIGHT" ||
            snapshot.horizontal === "MAX") {
            nextX = targetW - snapshot.right - snapshot.width;
        }
        else if (snapshot.horizontal === "CENTER") {
            nextX = targetW / 2 - snapshot.width / 2;
        }
        if (scaleMode === "stretch" ||
            snapshot.vertical === "SCALE" ||
            snapshot.vertical === "STRETCH" ||
            snapshot.vertical === "TOP_BOTTOM") {
            nextY = snapshot.y * scaleY;
            nextH = snapshot.height * scaleY;
        }
        else if (snapshot.vertical === "BOTTOM" || snapshot.vertical === "MAX") {
            nextY = targetH - snapshot.bottom - snapshot.height;
        }
        else if (snapshot.vertical === "CENTER") {
            nextY = targetH / 2 - snapshot.height / 2;
        }
        node.x = nextX;
        node.y = nextY;
        resizeSceneNode(node, nextW, nextH);
        if (node.type === "TEXT" &&
            scaleMode === "proportional" &&
            node.textAutoResize === "NONE" &&
            nextW < snapshot.width) {
            node.textAutoResize = "HEIGHT";
        }
    }
}
function generateFramesForRatio(templateNode, rows, mappings, imageHashMap, autoColorEnabled, autoColorTargetIds, originX, originY, gap, gridColumns, ratioName, generationContext) {
    return __awaiter(this, void 0, void 0, function* () {
        const generatedNodes = [];
        const warnings = [];
        const idColumnIndex = rows[0].findIndex(isIdHeader);
        const activeMappings = mappings.filter((mapping) => mapping.kind !== "SKIP" && mapping.tag && mapping.targetIds.length > 0);
        const colorMappings = activeMappings.filter((mapping) => mapping.kind === "COLOR");
        let generatedIndex = 0;
        for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            if (!row || row.every((cell) => !cell.trim())) {
                continue;
            }
            const duplicate = templateNode.clone();
            const fallbackId = `Variation ${rowIndex}`;
            const variationId = ((idColumnIndex >= 0 ? row[idColumnIndex] : row[0]) || fallbackId).trim() || fallbackId;
            const rowOffset = Math.floor(generatedIndex / gridColumns);
            const columnOffset = generatedIndex % gridColumns;
            duplicate.x = originX + columnOffset * (templateNode.width + gap);
            duplicate.y = originY + rowOffset * (templateNode.height + gap);
            duplicate.name = `${templateNode.name}_${ratioName}_${variationId}`;
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
                    yield applyMappedValue(targetNode, mapping, value, imageHashMap, warnings);
                }
            }
            if (autoColorEnabled && autoColorTargetIds.length > 0) {
                applySolidColorToTag(duplicate, "#AUTO_COLOR", autoColorFor(rowIndex - 1, colorMappings.length));
            }
            generatedNodes.push(duplicate);
            generatedIndex++;
        }
        if (generationContext && generatedNodes.length > 0) {
            annotateGeneratedNodes(generatedNodes, Object.assign(Object.assign({}, generationContext), { ratioName }));
        }
        return { generatedNodes, warnings };
    });
}
function importMultiRatioData(masterFrameId_1, csvContent_1, mappings_1, ratioTargets_1, autoColorEnabled_1, autoColorTargetIds_1) {
    return __awaiter(this, arguments, void 0, function* (masterFrameId, csvContent, mappings, ratioTargets, autoColorEnabled, autoColorTargetIds, gap = 80, gridColumns = 3, scaleMode = "proportional", imageHashMap, generationContext) {
        if (!masterFrameId) {
            postGenerationError("Select a master frame before generating.");
            return;
        }
        const rows = parseCSV(csvContent);
        if (rows.length < 2) {
            postGenerationError("CSV must have a header row and at least one data row.");
            return;
        }
        if (!imageHashMap) {
            const urlsToFetch = collectImageUrls(rows, mappings);
            if (urlsToFetch.length > 0) {
                figma.ui.postMessage({
                    type: "fetch-images",
                    urls: urlsToFetch,
                    rows,
                    masterFrameId,
                    csvContent,
                    mappings,
                    ratioTargets,
                    autoColorEnabled,
                    autoColorTargetIds,
                    gap,
                    gridColumns,
                    scaleMode,
                });
                return;
            }
        }
        const normalizedLocalImages = normalizeLocalImageRows(rows, imageHashMap || {});
        const resolvedRows = normalizedLocalImages.rows;
        const resolvedImageHashMap = normalizedLocalImages.imageHashMap;
        const masterNode = yield getTemplateNodeById(masterFrameId);
        if (!masterNode) {
            postGenerationError("Selected master frame was not found.");
            return;
        }
        yield renameTargets(masterNode, mappings, autoColorEnabled ? autoColorTargetIds : []);
        const allGeneratedNodes = [];
        const allWarnings = [];
        const normalizedGap = Math.max(0, gap);
        const normalizedGridColumns = Math.min(Math.max(Math.round(gridColumns), 1), 6);
        const originX = masterNode.x + masterNode.width + normalizedGap;
        let originY = masterNode.y;
        for (const ratioTarget of ratioTargets) {
            const ratioTemplate = masterNode.clone();
            ratioTemplate.name = `${masterNode.name}_${ratioTarget.name}`;
            resizeFrameToRatio(ratioTemplate, ratioTarget.width, ratioTarget.height, scaleMode);
            const { generatedNodes, warnings } = yield generateFramesForRatio(ratioTemplate, resolvedRows, mappings, resolvedImageHashMap, autoColorEnabled, autoColorTargetIds, originX, originY, normalizedGap, normalizedGridColumns, ratioTarget.name, generationContext);
            allGeneratedNodes.push(...generatedNodes);
            allWarnings.push(...warnings);
            ratioTemplate.remove();
            originY += ratioTarget.height + normalizedGap * 2;
        }
        if (allGeneratedNodes.length > 0) {
            figma.currentPage.selection = allGeneratedNodes;
            figma.viewport.scrollAndZoomIntoView(allGeneratedNodes);
        }
        const warningSummary = allWarnings.length > 0 ? ` (${allWarnings.length} warnings)` : "";
        figma.notify(`Generated ${allGeneratedNodes.length} frame${allGeneratedNodes.length === 1 ? "" : "s"} across ${ratioTargets.length} ratio${ratioTargets.length === 1 ? "" : "s"}${warningSummary}.`);
        if (allWarnings.length > 0) {
            console.warn(allWarnings.join("\n"));
        }
        figma.ui.postMessage({
            type: "generation-complete",
            generationId: (generationContext === null || generationContext === void 0 ? void 0 : generationContext.generationId) || "",
            frameIds: allGeneratedNodes.map((node) => node.id),
            frameNames: allGeneratedNodes.map((node) => node.name),
        });
    });
}
figma.ui.onmessage = (msg) => {
    if (msg.type === "open-hosted-app" && msg.url) {
        figma.openExternal(msg.url);
        return;
    }
    if (msg.type === "refresh-document") {
        figma.ui.postMessage({
            type: "frames-loaded",
            frames: getTopLevelTemplates(),
        });
        postTemplateMetadata();
        return;
    }
    if (msg.type === "resize-ui") {
        const width = Math.min(Math.max(Math.round(msg.uiWidth || 900), 480), 1200);
        const height = Math.min(Math.max(Math.round(msg.uiHeight || 740), 480), 960);
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
                ...hashNodes.map((child) => child.type === "TEXT"
                    ? child.characters
                    : firstSolidFillHex(child) || ""),
            ];
            const existingHeaders = new Set(headers.map((header) => header
                .trim()
                .replace(/^#(TEXT|IMAGE|COLOR)_/i, "")
                .toUpperCase()));
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
        importMappedData(msg.masterFrameId, msg.csvContent, msg.mappings, Boolean(msg.autoColorEnabled), msg.autoColorTargetIds || [], makeGenerationContext(msg, msg.mappings)).catch((error) => {
            console.error(error);
            postGenerationError("Error generating frames. See console.");
        });
        return;
    }
    if (msg.type === "import-multi-ratio" &&
        msg.csvContent &&
        msg.mappings &&
        msg.ratioTargets) {
        const imageHashMap = {};
        if (msg.imageBytesMap) {
            for (const url in msg.imageBytesMap) {
                const bytes = msg.imageBytesMap[url];
                const figmaImage = figma.createImage(new Uint8Array(bytes));
                imageHashMap[url] = figmaImage.hash;
            }
        }
        importMultiRatioData(msg.masterFrameId, msg.csvContent, msg.mappings, msg.ratioTargets, Boolean(msg.autoColorEnabled), msg.autoColorTargetIds || [], msg.gap, msg.gridColumns, msg.scaleMode || "proportional", msg.imageBytesMap ? imageHashMap : undefined, makeGenerationContext(msg, msg.mappings)).catch((error) => {
            console.error(error);
            postGenerationError("Error generating ratio frames. See console.");
        });
        return;
    }
    if (msg.type === "export-ratio") {
        figma.notify("Ratio export is coming soon.");
        return;
    }
    if (msg.type === "images-fetched" &&
        msg.imageBytesMap &&
        msg.rows &&
        msg.masterFrameId &&
        msg.mappings) {
        const imageHashMap = {};
        for (const url in msg.imageBytesMap) {
            const bytes = msg.imageBytesMap[url];
            const figmaImage = figma.createImage(new Uint8Array(bytes));
            imageHashMap[url] = figmaImage.hash;
        }
        if (msg.ratioTargets && msg.csvContent) {
            importMultiRatioData(msg.masterFrameId, msg.csvContent, msg.mappings, msg.ratioTargets, Boolean(msg.autoColorEnabled), msg.autoColorTargetIds || [], msg.gap, msg.gridColumns, msg.scaleMode || "proportional", imageHashMap, makeGenerationContext(msg, msg.mappings)).catch((error) => {
                console.error(error);
                postGenerationError("Error generating ratio frames. See console.");
            });
            return;
        }
        const normalizedLocalImages = normalizeLocalImageRows(msg.rows || [], imageHashMap);
        getTemplateNodeById(msg.masterFrameId)
            .then((masterNode) => {
            if (!masterNode) {
                postGenerationError("Selected master frame was not found.");
                return;
            }
            return generateFrames(masterNode, normalizedLocalImages.rows, msg.mappings || [], normalizedLocalImages.imageHashMap, Boolean(msg.autoColorEnabled), msg.autoColorTargetIds || [], makeGenerationContext(msg, msg.mappings || []));
        })
            .catch((error) => {
            console.error(error);
            postGenerationError("Error generating frames. See console.");
        });
        return;
    }
    console.warn("Unknown message received:", msg);
};
function extractNode(nodeId) {
    return __awaiter(this, void 0, void 0, function* () {
        return figma.getNodeByIdAsync(nodeId);
    });
}
