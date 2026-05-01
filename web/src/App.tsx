// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  autoMapColumns,
  buildCsv,
  detectColumnKind,
  layerKind,
  parseCsv,
  tagForKind,
} from "./utils/mapping";
import { useBridge } from "./hooks/useBridge";
import { Icon } from "./components/Icon";
import { CanvasSurface, flowEdgeOptions } from "./flow/CanvasSurface";
import { ToolButton } from "./flow/ToolButton";
import { nodeTypes } from "./flow/nodes";
import {
  colorInputValue,
  defaultMappingForColumn,
  firstFilledCell,
  mappingStatus,
  normalizeColorValue,
  previewForVariant,
  variantNameForRow,
} from "./flow/nodeHelpers";
import {
  ratioSizes,
  seedColumns,
  seedRows,
  toolCatalog,
} from "./utils/constants";
import { readJsonStorage, writeJsonStorage } from "./utils/storage";

function initialNodes() {
  return [];
}

const initialEdges = [];
const MITOSIS_SIGNATURE = "MITOSIS_CFG_V1";
const MAPPING_PROPS_BY_LAYER_TYPE = {
  TEXT: [
    "Text content",
    "Font family",
    "Font size",
    "Font weight",
    "Text color",
    "Visibility",
  ],
  IMAGE: ["Image file path / URL", "Visibility"],
  SHAPE: ["Fill color", "Stroke color", "Opacity", "Visibility"],
  ANY: ["Visibility"],
};

function createMappingEditorRow(partial = {}) {
  return {
    id: `mapping_row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    columnName: "",
    pathSegments: [],
    layerId: "",
    property: "",
    ...partial,
  };
}

function splitLayerPath(layerName) {
  return String(layerName || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function buildLayerTree(layerOptions) {
  const root = { children: new Map(), layers: [] };
  for (const layer of layerOptions || []) {
    const segments = splitLayerPath(layer.name);
    let cursor = root;
    for (const segment of segments) {
      if (!cursor.children.has(segment)) {
        cursor.children.set(segment, { children: new Map(), layers: [] });
      }
      cursor = cursor.children.get(segment);
    }
    cursor.layers.push(layer);
  }
  return root;
}

function getTreeNodeByPath(tree, pathSegments) {
  let cursor = tree;
  for (const segment of pathSegments || []) {
    if (!cursor.children.has(segment)) return null;
    cursor = cursor.children.get(segment);
  }
  return cursor;
}

function defaultPropertyForKind(kind) {
  if (kind === "IMAGE") return "Image file path / URL";
  if (kind === "COLOR") return "Fill color";
  return "Text content";
}

function resolveLayerType(layer) {
  if (!layer) return "ANY";
  if (layer.nodeType === "TEXT") return "TEXT";
  if (layer.targetKinds?.includes("IMAGE") && !layer.targetKinds?.includes("TEXT"))
    return "IMAGE";
  if (
    ["FRAME", "COMPONENT", "RECTANGLE", "ELLIPSE", "POLYGON", "STAR", "VECTOR", "LINE", "GROUP", "SECTION"].includes(
      layer.nodeType,
    )
  )
    return "SHAPE";
  return "ANY";
}

function propertyOptionsForLayer(layer) {
  const layerType = resolveLayerType(layer);
  return (
    MAPPING_PROPS_BY_LAYER_TYPE[layerType] || MAPPING_PROPS_BY_LAYER_TYPE.ANY
  );
}

function kindForMappingProperty(property, layer) {
  if (property === "Image file path / URL") return "IMAGE";
  if (
    property === "Fill color" ||
    property === "Stroke color" ||
    property === "Opacity" ||
    property === "Text color"
  ) {
    return "COLOR";
  }
  if (property === "Visibility") {
    return layer?.targetKinds?.[0] || "TEXT";
  }
  return "TEXT";
}

function App() {
  const bridge = useBridge();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [columns, setColumns] = useState(() =>
    readJsonStorage("mitosis.columns", seedColumns),
  );
  const [rows, setRows] = useState(() =>
    readJsonStorage("mitosis.rows", seedRows),
  );
  const [templateId, setTemplateId] = useState("");
  const [campaignName, setCampaignName] = useState("Campaign_A");
  const [variantSetName] = useState("Variant_Set_1");
  const [activeRatios, setActiveRatios] = useState(["1:1", "16:9"]);
  const [variantSettings, setVariantSettings] = useState(() =>
    readJsonStorage("mitosis.variantSettings", {}),
  );
  const [mappings, setMappings] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [frames, setFrames] = useState([]);
  const [selectedGeneratedFrameId, setSelectedGeneratedFrameId] = useState("");
  const [activeTool, setActiveTool] = useState("input");
  const [columnQuery, setColumnQuery] = useState("");
  const [columnFilter, setColumnFilter] = useState("all");
  const [rightPanelTab, setRightPanelTab] = useState("mapping");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [propsPanelView, setPropsPanelView] = useState("node");
  const [mappingEditorFrameId, setMappingEditorFrameId] = useState("");
  const [mappingEditorRows, setMappingEditorRows] = useState([]);
  const [isLeftPanelVisible, setIsLeftPanelVisible] = useState(true);
  const [isRightPanelVisible, setIsRightPanelVisible] = useState(false);
  const [isNodesPanelVisible, setIsNodesPanelVisible] = useState(false);
  const [isImportExportPanelVisible, setIsImportExportPanelVisible] =
    useState(false);
  const [importExportError, setImportExportError] = useState("");
  const [importedWorkspaceFileName, setImportedWorkspaceFileName] =
    useState("");
  const [pendingImportConfig, setPendingImportConfig] = useState(null);
  const [pendingImportFileName, setPendingImportFileName] = useState("");
  const [bottomQuery, setBottomQuery] = useState("");
  const [selectedDockFrameIds, setSelectedDockFrameIds] = useState([]);
  const [notice, setNotice] = useState(
    "Start by adding a frame or dropping a workflow tool onto the canvas.",
  );
  const [toast, setToast] = useState("");
  const nodeCounterRef = useRef(1);
  const handledExportsRef = useRef(new Set());
  const handledGenerationsRef = useRef(new Set());
  const previousBridgeStatusRef = useRef(bridge.status);

  const selectedTemplate = useMemo(
    () =>
      bridge.templates.find((template) => template.id === templateId) ||
      bridge.templates[0],
    [bridge.templates, templateId],
  );

  const mappingRows = useMemo(() => {
    const byHeader = new Map(
      mappings.map((mapping) => [mapping.header, mapping]),
    );
    return columns.map(
      (column, index) =>
        byHeader.get(column.name) || defaultMappingForColumn(column, index),
    );
  }, [columns, mappings]);

  const mappingWarnings = useMemo(
    () =>
      mappingRows.filter(
        (mapping) => mapping.kind !== "SKIP" && mapping.targetIds.length === 0,
      ),
    [mappingRows],
  );

  const connectedMappingCount = useMemo(
    () =>
      mappingRows.filter(
        (mapping) =>
          mappingStatus(mapping) === "connected" ||
          mappingStatus(mapping) === "partial",
      ).length,
    [mappingRows],
  );

  const filteredColumnItems = useMemo(() => {
    const query = columnQuery.trim().toLowerCase();
    return columns
      .map((column, index) => {
        const mapping =
          mappingRows[index] || defaultMappingForColumn(column, index);
        const preview = firstFilledCell(rows, index);
        const status = mappingStatus(mapping);
        return { column, index, mapping, preview, status };
      })
      .filter((item) =>
        columnFilter === "mapped"
          ? item.status === "connected" || item.status === "partial"
          : true,
      )
      .filter(
        (item) =>
          !query ||
          item.column.name.toLowerCase().includes(query) ||
          String(item.preview.value || "")
            .toLowerCase()
            .includes(query),
      );
  }, [columnFilter, columnQuery, columns, mappingRows, rows]);

  const templateLayers = useMemo(
    () => selectedTemplate?.layerOptions || [],
    [selectedTemplate],
  );

  const variantRows = useMemo(
    () =>
      rows.map((row, index) => {
        const stored = variantSettings[index] || {};
        return {
          index,
          name: variantNameForRow(row, index),
          generate: stored.generate !== false,
          scale: Boolean(stored.scale),
          ratios: stored.ratios || activeRatios,
        };
      }),
    [activeRatios, rows, variantSettings],
  );

  const selectedVariantIndexes = useMemo(
    () =>
      variantRows
        .filter((variant) => variant.generate)
        .map((variant) => variant.index),
    [variantRows],
  );

  const scaledVariantIndexes = useMemo(
    () =>
      variantRows
        .filter((variant) => variant.generate && variant.scale)
        .map((variant) => variant.index),
    [variantRows],
  );

  const filteredVariantRows = useMemo(() => {
    const query = bottomQuery.trim().toLowerCase();
    if (!query) return variantRows;
    return variantRows.filter((variant) => {
      const row = rows[variant.index] || [];
      return (
        variant.name.toLowerCase().includes(query) ||
        row.some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(query),
        )
      );
    });
  }, [bottomQuery, rows, variantRows]);

  useEffect(() => {
    if (!templateId && bridge.templates[0])
      setTemplateId(bridge.templates[0].id);
  }, [bridge.templates, templateId]);

  useEffect(() => {
    writeJsonStorage("mitosis.columns", columns);
    writeJsonStorage("mitosis.rows", rows);
  }, [columns, rows]);

  useEffect(() => {
    writeJsonStorage("mitosis.variantSettings", variantSettings);
  }, [variantSettings]);

  const resetBoard = useCallback(
    (message = "Board reset.") => {
      setNodes([]);
      setEdges([]);
      nodeCounterRef.current = 1;
      setNotice(message);
    },
    [setEdges, setNodes],
  );

  useEffect(() => {
    if (
      previousBridgeStatusRef.current !== "disconnected" &&
      bridge.status === "disconnected"
    ) {
      resetBoard("Bridge disconnected. Canvas reset to an empty board.");
    }
    previousBridgeStatusRef.current = bridge.status;
  }, [bridge.status, resetBoard]);

  useEffect(() => {
    if (!bridge.pluginConnected) {
      setNotice("Plugin executor closed. Open the plugin to continue.");
    }
  }, [bridge.pluginConnected]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    for (const event of bridge.events) {
      if (event.type === "generation-complete") {
        const key =
          event.generationId ||
          (event.frameIds || event.frameNames || []).join("|");
        if (!key || handledGenerationsRef.current.has(key)) continue;
        handledGenerationsRef.current.add(key);

        const nextFrames = (event.frameNames || []).map((name, index) => ({
          id: event.frameIds?.[index] || name,
          name,
          generationId: event.generationId,
          createdAt: new Date().toISOString(),
        }));

        setFrames((items) => [...nextFrames, ...items].slice(0, 80));
        if (nextFrames[0]) setSelectedGeneratedFrameId(nextFrames[0].id);
        setToast("Generation Completed");
        setNotice(`Generation Completed: ${nextFrames.length} frames created.`);
      }

      if (event.type === "export-data" && event.data?.csvContent) {
        const exportKey = `${event.data.frameName}-${event.data.csvContent.length}`;
        if (handledExportsRef.current.has(exportKey)) continue;
        handledExportsRef.current.add(exportKey);
        const blob = new Blob([event.data.csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${event.data.frameName || "export"}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    }
  }, [bridge.events]);

  const refreshFigma = useCallback(() => {
    const sent = bridge.sendCommand({ type: "refresh-document" });
    setNotice(
      sent
        ? "Requested fresh templates from Figma."
        : "Bridge connection required. Use the refresh button.",
    );
  }, [bridge]);

  const refreshBridge = useCallback(() => {
    resetBoard("Refreshing bridge. Canvas reset to an empty board.");
    bridge.disconnect();
    setTimeout(() => {
      bridge.connect();
      setNotice("Bridge refreshed and reconnected.");
    }, 500);
  }, [bridge, resetBoard]);

  const resetSession = useCallback(() => {
    // Clear localStorage
    try {
      window.localStorage.removeItem("mitosis.columns");
      window.localStorage.removeItem("mitosis.rows");
      window.localStorage.removeItem("mitosis.variantSettings");
    } catch (_error) {
      // Storage might be blocked
    }
    // Reset all state
    setColumns(seedColumns);
    setRows(seedRows);
    setVariantSettings({});
    setMappings([]);
    setConflicts([]);
    setFrames([]);
    setNodes(initialNodes());
    setEdges(initialEdges);
    setTemplateId("");
    setCampaignName("Campaign_A");
    setActiveRatios(["1:1", "16:9"]);
    setSelectedGeneratedFrameId("");
    setActiveTool("input");
    nodeCounterRef.current = 1;
    handledExportsRef.current.clear();
    handledGenerationsRef.current.clear();
    setNotice("Session reset. All data cleared.");
  }, []);

  const runAutoMap = useCallback(() => {
    const result = autoMapColumns(columns, templateLayers);
    setMappings(result.mappings);
    setConflicts(result.conflicts);
    setNotice(
      result.conflicts.length
        ? `${result.conflicts.length} mapping conflicts need review.`
        : "Auto mapping completed.",
    );
  }, [columns, templateLayers]);

  useEffect(() => {
    if (selectedTemplate) runAutoMap();
  }, [selectedTemplate, runAutoMap]);

  const exportCsv = useCallback(() => {
    const blob = new Blob([buildCsv(columns, rows)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mitosis-data.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Sheet exported as CSV.");
  }, [columns, rows]);

  const downloadSelectedVariants = useCallback(() => {
    if (selectedVariantIndexes.length === 0) {
      setNotice("Select at least one variant before downloading.");
      return;
    }

    const selectedRows = selectedVariantIndexes
      .map((index) => rows[index])
      .filter(Boolean);
    const blob = new Blob([buildCsv(columns, selectedRows)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mitosis-selected-variants.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`Downloaded ${selectedRows.length} selected variants.`);
  }, [columns, rows, selectedVariantIndexes]);

  const importCsv = useCallback((selectedFile = null, options = {}) => {
    const clearOnly = Boolean(options?.clear);
    if (clearOnly) {
      setColumns([]);
      setRows([]);
      setVariantSettings({});
      setMappings([]);
      setConflicts([]);
      setNotice("CSV data cleared.");
      return Promise.resolve(true);
    }

    const applyFile = (file) =>
      file
        .text()
        .then((text) => {
          const parsed = parseCsv(text.trim());
          const headers = parsed[0] || [];
          const bodyRows = parsed.slice(1);
          setColumns(
            headers.map((name, index) => ({
              name,
              type: detectColumnKind(name, bodyRows[0]?.[index]),
            })),
          );
          setRows(bodyRows);
          setVariantSettings({});
          setMappings([]);
          setConflicts([]);
          setNotice(`Imported ${Math.max(bodyRows.length, 0)} rows.`);
          return true;
        })
        .catch(() => false);

    if (selectedFile) return applyFile(selectedFile);

    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".csv";
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(false);
          return;
        }
        applyFile(file).then(resolve);
      });
      input.click();
    });
  }, []);

  const updateColumnName = useCallback((columnIndex, value) => {
    setColumns((items) =>
      items.map((column, index) =>
        index === columnIndex ? { ...column, name: value } : column,
      ),
    );
  }, []);

  const updateColumnType = useCallback((columnIndex, type) => {
    setColumns((items) =>
      items.map((column, index) =>
        index === columnIndex ? { ...column, type } : column,
      ),
    );
    setMappings((items) =>
      items.map((mapping) =>
        mapping.columnIndex === columnIndex
          ? {
              ...mapping,
              kind: type,
              tag: tagForKind(mapping.header, type),
              targetIds: type === "SKIP" ? [] : mapping.targetIds,
            }
          : mapping,
      ),
    );
  }, []);

  const updateCell = useCallback((rowIndex, columnIndex, value) => {
    setRows((items) =>
      items.map((row, index) => {
        if (index !== rowIndex) return row;
        const nextRow = [...row];
        nextRow[columnIndex] = value;
        return nextRow;
      }),
    );
  }, []);

  const updateColorCell = useCallback(
    (rowIndex, columnIndex, value) => {
      updateCell(rowIndex, columnIndex, normalizeColorValue(value));
    },
    [updateCell],
  );

  const updateVariantSetting = useCallback(
    (rowIndex, patch) => {
      setVariantSettings((items) => ({
        ...items,
        [rowIndex]: {
          generate: items[rowIndex]?.generate !== false,
          scale: Boolean(items[rowIndex]?.scale),
          ratios: items[rowIndex]?.ratios || activeRatios,
          ...patch,
        },
      }));
    },
    [activeRatios],
  );

  const setAllVariantGeneration = useCallback(
    (generate) => {
      setVariantSettings((items) => {
        const next = { ...items };
        rows.forEach((_row, index) => {
          const current = items[index] || {};
          next[index] = {
            generate,
            scale: Boolean(current.scale),
            ratios: current.ratios || activeRatios,
          };
        });
        return next;
      });
      setNotice(
        generate ? "All variants selected." : "All variants deselected.",
      );
    },
    [activeRatios, rows],
  );

  const toggleVariantRatio = useCallback(
    (rowIndex, ratio) => {
      setVariantSettings((items) => {
        const current = items[rowIndex] || {
          generate: true,
          scale: true,
          ratios: activeRatios,
        };
        const ratios = current.ratios || activeRatios;
        return {
          ...items,
          [rowIndex]: {
            ...current,
            ratios: ratios.includes(ratio)
              ? ratios.filter((item) => item !== ratio)
              : [...ratios, ratio],
            scale: true,
          },
        };
      });
    },
    [activeRatios],
  );

  const addRow = useCallback(() => {
    setRows((items) => [...items, columns.map(() => "")]);
    setNotice("Added a new sheet row.");
  }, [columns]);

  const addColumn = useCallback(() => {
    const nextName = `TEXT_COLUMN_${columns.length + 1}`;
    setColumns((items) => [...items, { name: nextName, type: "TEXT" }]);
    setRows((items) => items.map((row) => [...row, ""]));
    setNotice("Added a new sheet column.");
  }, [columns.length]);

  const ensureMappingRows = useCallback(
    (current) =>
      current.length
        ? current
        : columns.map((column, index) =>
            defaultMappingForColumn(column, index),
          ),
    [columns],
  );

  const updateMapping = useCallback(
    (header, patch) => {
      setMappings((items) =>
        ensureMappingRows(items).map((mapping) =>
          mapping.header === header
            ? { ...mapping, ...patch, rule: patch.rule || "manual" }
            : mapping,
        ),
      );
    },
    [ensureMappingRows],
  );

  const updateMappingKind = useCallback(
    (mapping, kind) => {
      updateMapping(mapping.header, {
        kind,
        tag: tagForKind(mapping.header, kind),
        targetIds: kind === "SKIP" ? [] : mapping.targetIds,
        confidence: kind === "SKIP" ? 1 : mapping.confidence,
      });
    },
    [updateMapping],
  );

  const compatibleLayersForMapping = useCallback(
    (mapping) => {
      if (mapping.kind === "SKIP") return [];
      return templateLayers.filter(
        (layer) =>
          layerKind(layer) === mapping.kind ||
          layer.targetKinds?.includes(mapping.kind),
      );
    },
    [templateLayers],
  );

  const useExactTargets = useCallback(
    (mapping) => {
      const targetIds = compatibleLayersForMapping(mapping)
        .filter((layer) => layer.name === mapping.tag)
        .map((layer) => layer.id);
      updateMapping(mapping.header, {
        targetIds,
        confidence: targetIds.length ? 1 : 0,
        rule: targetIds.length ? "exact-tag" : "no-exact-target",
      });
    },
    [compatibleLayersForMapping, updateMapping],
  );

  const toggleRatio = useCallback((ratio) => {
    setActiveRatios((items) =>
      items.includes(ratio)
        ? items.filter((item) => item !== ratio)
        : [...items, ratio],
    );
  }, []);

  const runAll = useCallback(
    (options = {}) => {
      const masterFrameId = options.masterFrameId || selectedTemplate?.id;
      if (!masterFrameId) {
        setNotice("Choose a Figma template before running.");
        return false;
      }

      const activeMappings = mappingRows.filter(
        (mapping) => mapping.kind !== "SKIP" && mapping.targetIds.length > 0,
      );
      if (activeMappings.length === 0) {
        setNotice("Map at least one column to a Figma layer first.");
        return false;
      }

      const allowedIndexes = options.variantIndexes || selectedVariantIndexes;
      const selectedIndexes = allowedIndexes
        .map((index) => Number(index))
        .filter(
          (index) =>
            Number.isInteger(index) &&
            rows[index] &&
            variantRows[index]?.generate,
        );

      if (selectedIndexes.length === 0) {
        setNotice("Select at least one variant before generating.");
        return false;
      }

      const generationId = `gen_${Date.now()}`;
      const sendRows = (
        rowIndexes,
        commandType,
        ratios = [],
        suffix = "base",
      ) => {
        if (rowIndexes.length === 0) return false;
        const rowSubset = rowIndexes.map((index) => rows[index]);
        const common = {
          masterFrameId,
          csvContent: buildCsv(columns, rowSubset),
          mappings: mappingRows,
          autoColorEnabled: false,
          autoColorTargetIds: [],
          campaignName,
          variantSetName,
          generationId: `${generationId}_${suffix}`,
          gap: 80,
          gridColumns: 3,
        };

        if (commandType === "scale") {
          return bridge.sendCommand({
            type: "import-multi-ratio",
            ...common,
            ratioTargets: ratios.map((name) => ({
              name,
              width: ratioSizes[name].w,
              height: ratioSizes[name].h,
            })),
          });
        }

        return bridge.sendCommand({ type: "import-mapped-data", ...common });
      };

      const scaleGroups = new Map();
      const baseIndexes = [];

      selectedIndexes.forEach((index) => {
        const variant = variantRows[index];
        const ratios = (variant.ratios || []).filter(
          (ratio) => ratioSizes[ratio],
        );
        if (variant.scale && ratios.length > 0) {
          const key = ratios.join("|");
          scaleGroups.set(key, [...(scaleGroups.get(key) || []), index]);
        } else {
          baseIndexes.push(index);
        }
      });

      let sentAny = sendRows(baseIndexes, "base", [], "base");
      scaleGroups.forEach((indexes, key) => {
        const ratios = key.split("|").filter(Boolean);
        sentAny =
          sendRows(
            indexes,
            "scale",
            ratios,
            `scale_${ratios.join("_").replace(/[^a-z0-9_]/gi, "")}`,
          ) || sentAny;
      });

      if (sentAny) {
        resetBoard(
          `Generate sent for ${selectedIndexes.length} selected variants. Canvas reset to an empty board.`,
        );
      } else {
        setNotice("Bridge is not connected. Click Connect first.");
      }
      return sentAny;
    },
    [
      bridge,
      campaignName,
      columns,
      mappingRows,
      resetBoard,
      rows,
      selectedTemplate,
      selectedVariantIndexes,
      variantRows,
      variantSetName,
    ],
  );

  const runFromFrame = useCallback(
    (frameId, variantIndex = "") => {
      if (!frameId) {
        setNotice("Choose a generated frame or template first.");
        return false;
      }
      const variantIndexes =
        variantIndex === "" ? selectedVariantIndexes : [Number(variantIndex)];
      return runAll({ masterFrameId: frameId, variantIndexes });
    },
    [runAll, selectedVariantIndexes],
  );

  const updateFrameNode = useCallback(
    (nodeId, patch) => {
      setNodes((items) =>
        items.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...patch } }
            : node,
        ),
      );
    },
    [setNodes],
  );

  const addCanvasNode = useCallback(
    (toolType, position, frameId = "") => {
      setActiveTool(toolType);
      const nodeId = `${toolType}-${nodeCounterRef.current}`;
      const offset = nodeCounterRef.current * 28;
      nodeCounterRef.current += 1;
      const resolvedPosition = position || { x: 180 + offset, y: 220 + offset };
      const nodeType = toolType === "frame" ? "frame" : toolType;
      const data =
        nodeType === "frame"
          ? { label: "Add Frame", frameId: frameId || selectedGeneratedFrameId }
          : {};

      if (!nodeTypes[nodeType]) return;
      setNodes((items) => [
        ...items,
        { id: nodeId, type: nodeType, position: resolvedPosition, data },
      ]);
      setNotice(
        `${toolCatalog.find((tool) => tool.type === toolType)?.label || "Tool"} added to canvas.`,
      );
    },
    [selectedGeneratedFrameId, setNodes],
  );

  const addVariantFrameNode = useCallback(
    (variantIndex) => {
      const offset = nodeCounterRef.current * 28;
      addCanvasNode(
        "frame",
        { x: 220 + offset, y: 180 + offset },
        selectedGeneratedFrameId,
      );
      window.setTimeout(() => {
        setNodes((items) =>
          items.map((node) =>
            node.id === `frame-${nodeCounterRef.current - 1}`
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    variantIndex: String(variantIndex),
                    label: variantNameForRow(rows[variantIndex], variantIndex),
                  },
                }
              : node,
          ),
        );
      }, 0);
    },
    [addCanvasNode, rows, selectedGeneratedFrameId, setNodes],
  );

  const toggleDockFrame = useCallback((frameId) => {
    setSelectedGeneratedFrameId(frameId);
    setSelectedDockFrameIds((items) =>
      items.includes(frameId)
        ? items.filter((item) => item !== frameId)
        : [...items, frameId],
    );
  }, []);

  const onConnect = useCallback(
    (connection) =>
      setEdges((items) =>
        addEdge({ ...connection, ...flowEdgeOptions }, items),
      ),
    [setEdges],
  );

  const disconnectEdge = useCallback(
    (edgeId) => {
      setEdges((items) => items.filter((edge) => edge.id !== edgeId));
      setNotice("Connection disconnected.");
    },
    [setEdges],
  );

  const exportWorkspace = useCallback(() => {
    const workspaceState = {
      nodes,
      edges,
      mappings: mappingRows,
      conflicts,
      columns,
      rows,
      csv: {
        raw: buildCsv(columns, rows),
        encoding: "utf-8",
      },
      templateId,
      campaignName,
      variantSetName,
      activeRatios,
      variantSettings,
      frames,
      selectedGeneratedFrameId,
      selectedDockFrameIds,
      activeTool,
      columnQuery,
      columnFilter,
      rightPanelTab,
      bottomQuery,
      notice,
      nodeCounter: nodeCounterRef.current,
      panelVisibility: {
        data: isLeftPanelVisible,
        props: isRightPanelVisible,
        nodes: isNodesPanelVisible,
        importExport: isImportExportPanelVisible,
      },
    };

    const payload = {
      __mitosis_signature: MITOSIS_SIGNATURE,
      exportedAt: new Date().toISOString(),
      workspace: workspaceState,
    };
    const serialized = JSON.stringify(payload, null, 2);
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "workspace.mitosis";
    anchor.click();
    URL.revokeObjectURL(url);
    setImportExportError("");
    setNotice("Workspace exported.");
  }, [
    activeRatios,
    activeTool,
    bottomQuery,
    campaignName,
    columnFilter,
    columnQuery,
    columns,
    conflicts,
    edges,
    frames,
    mappingRows,
    nodes,
    notice,
    rightPanelTab,
    rows,
    selectedDockFrameIds,
    selectedGeneratedFrameId,
    templateId,
    isImportExportPanelVisible,
    isLeftPanelVisible,
    isNodesPanelVisible,
    isRightPanelVisible,
    variantSetName,
    variantSettings,
  ]);

  const applyImportedWorkspace = useCallback(
    (rawConfig, fileName) => {
      const workspace =
        rawConfig && typeof rawConfig.workspace === "object"
          ? rawConfig.workspace
          : rawConfig;

      const csvRaw =
        typeof workspace?.csv?.raw === "string" ? workspace.csv.raw : "";

      let nextColumns = Array.isArray(workspace?.columns)
        ? workspace.columns
        : [];
      let nextRows = Array.isArray(workspace?.rows) ? workspace.rows : [];

      if (csvRaw.trim()) {
        const parsed = parseCsv(csvRaw.trim());
        const headers = parsed[0] || [];
        const bodyRows = parsed.slice(1);
        if (headers.length > 0) {
          nextColumns = headers.map((name, index) => ({
            name,
            type:
              workspace?.columns?.[index]?.type ||
              detectColumnKind(name, bodyRows[0]?.[index]),
          }));
          nextRows = bodyRows;
        }
      }

      const importedNodes = Array.isArray(workspace?.nodes)
        ? workspace.nodes
        : [];
      const importedEdges = Array.isArray(workspace?.edges)
        ? workspace.edges
        : [];
      const importedMappings = Array.isArray(workspace?.mappings)
        ? workspace.mappings
        : [];

      setNodes([]);
      setEdges([]);
      setColumns(nextColumns);
      setRows(nextRows);
      setNodes(importedNodes);
      setEdges(importedEdges);
      setMappings(importedMappings);
      setConflicts(Array.isArray(workspace?.conflicts) ? workspace.conflicts : []);
      setVariantSettings(
        workspace?.variantSettings && typeof workspace.variantSettings === "object"
          ? workspace.variantSettings
          : {},
      );
      setFrames(Array.isArray(workspace?.frames) ? workspace.frames : []);
      setTemplateId(typeof workspace?.templateId === "string" ? workspace.templateId : "");
      setCampaignName(
        typeof workspace?.campaignName === "string"
          ? workspace.campaignName
          : "Campaign_A",
      );
      setActiveRatios(
        Array.isArray(workspace?.activeRatios) && workspace.activeRatios.length
          ? workspace.activeRatios
          : ["1:1", "16:9"],
      );
      setSelectedGeneratedFrameId(
        typeof workspace?.selectedGeneratedFrameId === "string"
          ? workspace.selectedGeneratedFrameId
          : "",
      );
      setSelectedDockFrameIds(
        Array.isArray(workspace?.selectedDockFrameIds)
          ? workspace.selectedDockFrameIds
          : [],
      );
      setActiveTool(typeof workspace?.activeTool === "string" ? workspace.activeTool : "input");
      setColumnQuery(
        typeof workspace?.columnQuery === "string" ? workspace.columnQuery : "",
      );
      setColumnFilter(
        workspace?.columnFilter === "mapped" ? "mapped" : "all",
      );
      setRightPanelTab(
        workspace?.rightPanelTab === "frame" ? "frame" : "mapping",
      );
      setBottomQuery(
        typeof workspace?.bottomQuery === "string" ? workspace.bottomQuery : "",
      );
      const panelVisibility = workspace?.panelVisibility || {};
      const openPanel = panelVisibility.importExport
        ? "import-export"
        : panelVisibility.nodes
          ? "nodes"
          : panelVisibility.props
            ? "right"
            : panelVisibility.data === false
              ? ""
              : "left";
      setIsLeftPanelVisible(openPanel === "left");
      setIsRightPanelVisible(openPanel === "right");
      setIsNodesPanelVisible(openPanel === "nodes");
      setIsImportExportPanelVisible(openPanel === "import-export");
      nodeCounterRef.current =
        typeof workspace?.nodeCounter === "number"
          ? workspace.nodeCounter
          : importedNodes.length + 1;
      handledExportsRef.current.clear();
      handledGenerationsRef.current.clear();
      setImportedWorkspaceFileName(fileName || "");
      setImportExportError("");
      setPendingImportConfig(null);
      setPendingImportFileName("");
      setNotice("Workspace imported.");
    },
    [setEdges, setNodes],
  );

  const handleImportWorkspaceFile = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => {
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (_error) {
          setImportExportError(
            "Invalid file. Only .mitosis config files exported from this app are supported.",
          );
          return;
        }

        if (parsed?.__mitosis_signature !== MITOSIS_SIGNATURE) {
          setImportExportError(
            "Invalid file. Only .mitosis config files exported from this app are supported.",
          );
          return;
        }

        setPendingImportConfig(parsed);
        setPendingImportFileName(file.name);
        setImportExportError("");
      })
      .finally(() => {
        event.target.value = "";
      });
  }, []);

  const toggleRailPanel = useCallback(
    (panel) => {
      const nextLeft = panel === "left" ? !isLeftPanelVisible : false;
      const nextRight = panel === "right" ? !isRightPanelVisible : false;
      const nextNodes = panel === "nodes" ? !isNodesPanelVisible : false;
      const nextImport =
        panel === "import-export" ? !isImportExportPanelVisible : false;
      setIsLeftPanelVisible(nextLeft);
      setIsRightPanelVisible(nextRight);
      setIsNodesPanelVisible(nextNodes);
      setIsImportExportPanelVisible(nextImport);
    },
    [
      isImportExportPanelVisible,
      isLeftPanelVisible,
      isNodesPanelVisible,
      isRightPanelVisible,
    ],
  );

  const handleCanvasSelectionChange = useCallback((selectedNodes = []) => {
    const selected = selectedNodes[0] || null;
    setSelectedNodeId(selected?.id || "");
    setPropsPanelView("node");
    if (!selected) return;
    setIsLeftPanelVisible(false);
    setIsNodesPanelVisible(false);
    setIsImportExportPanelVisible(false);
    setIsRightPanelVisible(true);
  }, []);

  const connectedNodeIds = useMemo(() => {
    const ids = new Set();
    edges.forEach((edge) => {
      ids.add(edge.source);
      ids.add(edge.target);
    });
    return ids;
  }, [edges]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  const mappingEditorTemplates = useMemo(
    () => bridge.templates || [],
    [bridge.templates],
  );

  const activeMappingEditorFrameId = useMemo(
    () => mappingEditorFrameId || templateId || mappingEditorTemplates[0]?.id || "",
    [mappingEditorFrameId, mappingEditorTemplates, templateId],
  );

  const activeMappingEditorFrame = useMemo(
    () =>
      mappingEditorTemplates.find(
        (template) => template.id === activeMappingEditorFrameId,
      ) || null,
    [activeMappingEditorFrameId, mappingEditorTemplates],
  );

  const mappingEditorLayers = useMemo(
    () => activeMappingEditorFrame?.layerOptions || [],
    [activeMappingEditorFrame],
  );

  const mappingEditorLayerTree = useMemo(
    () => buildLayerTree(mappingEditorLayers),
    [mappingEditorLayers],
  );

  const resolveLayerForRow = useCallback(
    (row) => {
      const treeNode = getTreeNodeByPath(mappingEditorLayerTree, row.pathSegments);
      if (!treeNode || treeNode.children.size > 0 || treeNode.layers.length === 0) {
        return null;
      }
      if (row.layerId) {
        return (
          treeNode.layers.find((layer) => layer.id === row.layerId) ||
          treeNode.layers[0]
        );
      }
      return treeNode.layers[0];
    },
    [mappingEditorLayerTree],
  );

  const openMappingEditor = useCallback(
    (nodeId = "") => {
      const nextFrameId =
        activeMappingEditorFrameId || mappingEditorTemplates[0]?.id || "";
      const seededRows = (mappings || []).map((mapping) => {
        const targetLayer = (bridge.templates || [])
          .flatMap((template) => template.layerOptions || [])
          .find((layer) => layer.id === mapping.targetIds?.[0]);
        return createMappingEditorRow({
          columnName: mapping.header || "",
          pathSegments: splitLayerPath(targetLayer?.name || ""),
          layerId: mapping.targetIds?.[0] || "",
          property: mapping.property || defaultPropertyForKind(mapping.kind),
        });
      });
      setSelectedNodeId(nodeId || selectedNodeId);
      setMappingEditorFrameId(nextFrameId);
      setMappingEditorRows(
        seededRows.length ? seededRows : [createMappingEditorRow()],
      );
      setPropsPanelView("mapping-editor");
      setIsLeftPanelVisible(false);
      setIsNodesPanelVisible(false);
      setIsImportExportPanelVisible(false);
      setIsRightPanelVisible(true);
    },
    [
      activeMappingEditorFrameId,
      bridge.templates,
      mappings,
      mappingEditorTemplates,
      selectedNodeId,
    ],
  );

  const addMappingEditorRow = useCallback(() => {
    setMappingEditorRows((items) => [...items, createMappingEditorRow()]);
  }, []);

  const removeMappingEditorRow = useCallback((rowId) => {
    setMappingEditorRows((items) => items.filter((row) => row.id !== rowId));
  }, []);

  const updateMappingEditorRowColumn = useCallback((rowId, columnName) => {
    setMappingEditorRows((items) =>
      items.map((row) => (row.id === rowId ? { ...row, columnName } : row)),
    );
  }, []);

  const updateMappingEditorRowPath = useCallback(
    (rowId, levelIndex, segment) => {
      setMappingEditorRows((items) =>
        items.map((row) => {
          if (row.id !== rowId) return row;
          const nextPath = [...row.pathSegments.slice(0, levelIndex), segment];
          const treeNode = getTreeNodeByPath(mappingEditorLayerTree, nextPath);
          if (!treeNode || treeNode.children.size > 0 || treeNode.layers.length === 0) {
            return { ...row, pathSegments: nextPath, layerId: "", property: "" };
          }
          const resolvedLayer = treeNode.layers[0];
          const nextPropertyOptions = propertyOptionsForLayer(resolvedLayer);
          return {
            ...row,
            pathSegments: nextPath,
            layerId: resolvedLayer.id,
            property: nextPropertyOptions.includes(row.property)
              ? row.property
              : nextPropertyOptions[0] || "",
          };
        }),
      );
    },
    [mappingEditorLayerTree],
  );

  const updateMappingEditorRowProperty = useCallback((rowId, property) => {
    setMappingEditorRows((items) =>
      items.map((row) => (row.id === rowId ? { ...row, property } : row)),
    );
  }, []);

  const saveMappingsFromEditor = useCallback(() => {
    const nextMappings = mappingEditorRows
      .map((row) => {
        const columnIndex = columns.findIndex(
          (column) => column.name === row.columnName,
        );
        const layer = resolveLayerForRow(row);
        if (columnIndex < 0 || !layer || !row.property) return null;
        const kind = kindForMappingProperty(row.property, layer);
        return {
          columnIndex,
          header: row.columnName,
          kind,
          tag: kind === "SKIP" ? "" : tagForKind(row.columnName, kind),
          targetIds: [layer.id],
          confidence: 1,
          rule: "mapping-editor",
          property: row.property,
          frameId: activeMappingEditorFrameId,
          pathSegments: row.pathSegments,
        };
      })
      .filter(Boolean);
    setMappings(nextMappings);
    setConflicts([]);
    setPropsPanelView("node");
    setNotice("Mappings saved.");
  }, [
    activeMappingEditorFrameId,
    columns,
    mappingEditorRows,
    resolveLayerForRow,
  ]);

  useEffect(() => {
    if (!selectedNode || selectedNode.type !== "mapping") return;
    const sourceMappings = (
      selectedNode.data?.savedMappings?.length
        ? selectedNode.data.savedMappings
        : selectedNode.data?.mappings || []
    ).filter(Boolean);

    const nextRows =
      sourceMappings.length > 0
        ? sourceMappings.map((mapping) => {
            const targetLayer = (bridge.templates || [])
              .flatMap((template) => template.layerOptions || [])
              .find((layer) => layer.id === mapping.targetIds?.[0]);
            return createMappingEditorRow({
              columnName: mapping.header || "",
              pathSegments:
                mapping.pathSegments?.length > 0
                  ? mapping.pathSegments
                  : splitLayerPath(targetLayer?.name || ""),
              layerId: mapping.targetIds?.[0] || "",
              property: mapping.property || defaultPropertyForKind(mapping.kind),
            });
          })
        : [createMappingEditorRow()];

    setMappingEditorRows(nextRows);
    const mappedFrameId =
      sourceMappings.find((mapping) => mapping.frameId)?.frameId || "";
    setMappingEditorFrameId(
      mappedFrameId || templateId || bridge.templates[0]?.id || "",
    );
  }, [bridge.templates, selectedNode, selectedNodeId, templateId]);

  const typeNodeData = useMemo(
    () => ({
      newInput: { columns, rows, importCsv, exportCsv, autoMap: runAutoMap },
      mapping: {
        mappings: mappingRows,
        savedMappings: mappings,
        conflicts: mappingWarnings,
        openMappingEditor,
      },
      generation: {
        templates: bridge.templates,
        templateId,
        setTemplateId,
        templateName: selectedTemplate?.name,
        campaignName,
        setCampaignName,
        runAll,
      },
      scale: { activeRatios, toggleRatio },
      output: { frames, refresh: refreshFigma },
    }),
    [
      activeRatios,
      bridge.templates,
      campaignName,
      columns,
      exportCsv,
      frames,
      importCsv,
      mappings,
      mappingRows,
      mappingWarnings,
      openMappingEditor,
      refreshFigma,
      rows,
      runAll,
      runAutoMap,
      selectedTemplate,
      templateId,
      toggleRatio,
    ],
  );

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const connected = connectedNodeIds.has(node.id);
        const className = connected ? "connected" : "disconnected";
        if (node.type === "frame") {
          return {
            ...node,
            className,
            data: {
              ...node.data,
              nodeId: node.id,
              connected,
              frames,
              rows,
              templates: bridge.templates,
              selectedGeneratedFrameId,
              updateFrameNode,
              selectGeneratedFrame: setSelectedGeneratedFrameId,
              runFromFrame,
            },
          };
        }

        return {
          ...node,
          className,
          data: {
            ...node.data,
            nodeId: node.id,
            connected,
            ...(typeNodeData[node.type] || {}),
          },
        };
      }),
    );
  }, [
    bridge.templates,
    connectedNodeIds,
    frames,
    rows,
    runFromFrame,
    selectedGeneratedFrameId,
    setNodes,
    typeNodeData,
    updateFrameNode,
  ]);

  if (!bridge.pluginConnected) {
    return (
      <div className="app-shell disconnected-state">
        <div className="disconnected-overlay">
          <div className="disconnected-card">
            <div className="disconnected-icon">⚠️</div>
            <h1>Connection Disconnected</h1>
            <p>The plugin executor has closed.</p>
            <p className="secondary">
              Open the Mitosis.in plugin in Figma to resume your workflow.
            </p>
            <div className="waiting-indicator">
              <span className="pulse"></span>
              <span>Waiting for plugin...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell with-icon-rail">
      <nav className="left-icon-rail" aria-label="Panel rail">
        <button
          type="button"
          className={
            isLeftPanelVisible ? "rail-icon-button active" : "rail-icon-button"
          }
          onClick={() => toggleRailPanel("left")}
          aria-label="Toggle data panel"
          title="Toggle data panel"
        >
          <Icon name="sheet" />
        </button>
        <button
          type="button"
          className={
            isRightPanelVisible ? "rail-icon-button active" : "rail-icon-button"
          }
          onClick={() => toggleRailPanel("right")}
          aria-label="Toggle props panel"
          title="Toggle props panel"
        >
          <Icon name="output" />
        </button>
        <button
          type="button"
          className={
            isNodesPanelVisible ? "rail-icon-button active" : "rail-icon-button"
          }
          onClick={() => toggleRailPanel("nodes")}
          aria-label="Toggle nodes panel"
          title="Toggle nodes panel"
        >
          <Icon name="mapping" />
        </button>
        <button
          type="button"
          className={
            isImportExportPanelVisible
              ? "rail-icon-button active"
              : "rail-icon-button"
          }
          onClick={() => toggleRailPanel("import-export")}
          aria-label="Toggle import export panel"
          title="Toggle import export panel"
        >
          <Icon name="download" />
        </button>
      </nav>

      <header className="top-toolbar">
        <div className="brand-cluster">
          <div className="brand-mark">M</div>
          <div className="brand-copy">
            <strong>Banner Campaign</strong>
            <span>v2 workspace</span>
          </div>
          <span className={`sync-pill ${bridge.status}`}>
            <span />
            {bridge.status === "connected"
              ? "All changes saved"
              : bridge.status}
          </span>
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="icon-button"
            onClick={refreshBridge}
            title="Refresh bridge connection"
          >
            <Icon name="refresh-cw" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={resetSession}
            title="Reset session and clear all data"
          >
            <Icon name="trash-2" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={refreshFigma}
            title="Refresh Figma document"
          >
            <Icon name="refresh" />
          </button>
          <button
            type="button"
            className="primary-generate"
            onClick={() => runAll()}
          >
            <Icon name="generate" />
            Generate
          </button>
        </div>
      </header>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <div
        className={`workspace-grid ${isLeftPanelVisible ? "" : "left-collapsed"} ${isRightPanelVisible ? "" : "right-collapsed"} ${isNodesPanelVisible ? "nodes-open" : ""} ${isImportExportPanelVisible ? "import-open" : ""}`}
      >
        <aside
          className="left-panel panel-shell"
          aria-label="Data panel"
          aria-hidden={!isLeftPanelVisible}
        >
          <div className="panel-header">
            <div>
              <span className="eyebrow">Data</span>
              <h1>products.csv</h1>
              <p>
                {rows.length} rows / {columns.length} columns
              </p>
            </div>
            <button type="button" className="ghost-button" onClick={importCsv}>
              Replace
            </button>
          </div>

          <div className="panel-actions">
            <button type="button" className="ghost-button" onClick={exportCsv}>
              <Icon name="download" />
              Export
            </button>
            <button type="button" className="ghost-button" onClick={addRow}>
              <Icon name="plus" />
              Row
            </button>
            <button type="button" className="ghost-button" onClick={addColumn}>
              <Icon name="plus" />
              Column
            </button>
          </div>

          <label className="search-field">
            <Icon name="search" />
            <input
              value={columnQuery}
              onChange={(event) => setColumnQuery(event.target.value)}
              placeholder="Search columns..."
            />
          </label>

          <div className="segmented-control" aria-label="Column filter">
            <button
              type="button"
              className={columnFilter === "all" ? "active" : ""}
              onClick={() => setColumnFilter("all")}
            >
              All Columns
              <span>{columns.length}</span>
            </button>
            <button
              type="button"
              className={columnFilter === "mapped" ? "active" : ""}
              onClick={() => setColumnFilter("mapped")}
            >
              Mapped
              <span>{connectedMappingCount}</span>
            </button>
          </div>

          <div className="column-list">
            {filteredColumnItems.map(({ column, index, preview, status }) => {
              const iconName =
                column.type === "IMAGE"
                  ? "image"
                  : column.type === "COLOR"
                    ? "color"
                    : "text";
              const value = preview.value || "";
              return (
                <article
                  className={`column-item ${column.type.toLowerCase()} ${status}`}
                  key={`${column.name}-${index}`}
                >
                  <div className="column-kind" title={column.type}>
                    <Icon name={iconName} />
                    <span>{column.type}</span>
                  </div>
                  <div className="column-content">
                    <input
                      className="ghost-input column-name-input"
                      value={column.name}
                      onChange={(event) =>
                        updateColumnName(index, event.target.value)
                      }
                      aria-label={`${column.name} column name`}
                    />
                    <div className="column-value-row">
                      {column.type === "COLOR" && (
                        <label className="swatch-picker" title="Pick color">
                          <span
                            style={{ backgroundColor: colorInputValue(value) }}
                          />
                          <input
                            type="color"
                            value={colorInputValue(value)}
                            onChange={(event) =>
                              updateColorCell(
                                preview.rowIndex,
                                index,
                                event.target.value,
                              )
                            }
                            aria-label={`${column.name} color`}
                          />
                        </label>
                      )}
                      <input
                        className="ghost-input value-preview"
                        value={value}
                        placeholder={
                          column.type === "IMAGE"
                            ? "Image URL or asset path"
                            : "Value preview"
                        }
                        onChange={(event) =>
                          updateCell(
                            preview.rowIndex,
                            index,
                            event.target.value,
                          )
                        }
                        aria-label={`${column.name} value preview`}
                      />
                    </div>
                  </div>
                  <select
                    className="inline-select"
                    value={column.type}
                    onChange={(event) =>
                      updateColumnType(index, event.target.value)
                    }
                    aria-label={`${column.name} type`}
                  >
                    <option value="TEXT">Text</option>
                    <option value="IMAGE">Image</option>
                    <option value="COLOR">Color</option>
                    <option value="SKIP">Skip</option>
                  </select>
                  <span className={`status-chip ${status}`}>{status}</span>
                </article>
              );
            })}
            {filteredColumnItems.length === 0 && (
              <div className="empty-inline">
                <strong>No columns match</strong>
                <span>Clear the search or switch back to all columns.</span>
              </div>
            )}
          </div>
        </aside>

        <aside
          className="nodes-panel panel-shell"
          aria-label="Nodes panel"
          aria-hidden={!isNodesPanelVisible}
        >
          <div className="panel-header">
            <div>
              <span className="eyebrow">Nodes</span>
              <h1>Workflow steps</h1>
              <p>Sheet, mapping, generation, scale, output, and frame tools</p>
            </div>
          </div>
          <nav className="nodes-panel-tools" aria-label="Workflow tools">
            {toolCatalog.map((tool) => (
              <ToolButton
                tool={tool}
                activeTool={activeTool}
                selectedGeneratedFrameId={selectedGeneratedFrameId}
                onAddTool={addCanvasNode}
                key={tool.type}
              />
            ))}
          </nav>
        </aside>

        <aside
          className="right-panel panel-shell"
          aria-label="Properties panel"
          aria-hidden={!isRightPanelVisible}
        >
          {selectedNode?.type === "mapping" ? (
            <>
              <div className="panel-header">
                <div>
                  <span className="eyebrow">Mapping Editor</span>
                  <h1>Mapping</h1>
                  <p>
                    Configure CSV-to-Figma mappings for the selected mapping
                    node.
                  </p>
                </div>
              </div>
              <section className="property-section">
                <div className="mapping-editor-panel">
                  <label className="field-control">
                    <span>Figma frame</span>
                    <select
                      value={activeMappingEditorFrameId}
                      onChange={(event) => {
                        setMappingEditorFrameId(event.target.value);
                        setMappingEditorRows((items) =>
                          items.map((row) => ({
                            ...row,
                            pathSegments: [],
                            layerId: "",
                            property: "",
                          })),
                        );
                      }}
                    >
                      <option value="">Choose frame</option>
                      {mappingEditorTemplates.map((template) => (
                        <option value={template.id} key={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="mapping-editor-rows">
                    {mappingEditorRows.map((row) => {
                      const treeNode = getTreeNodeByPath(
                        mappingEditorLayerTree,
                        row.pathSegments,
                      );
                      const resolvedLayer = resolveLayerForRow(row);
                      const propertyOptions = propertyOptionsForLayer(
                        resolvedLayer,
                      );
                      const kind = kindForMappingProperty(
                        row.property || defaultPropertyForKind("TEXT"),
                        resolvedLayer,
                      );
                      const tag = row.columnName ? tagForKind(row.columnName, kind) : "";
                      const targets = resolvedLayer?.id
                        ? [resolvedLayer.id]
                        : row.layerId
                          ? [row.layerId]
                          : [];

                      const levelOptions = [];
                      let cursor = mappingEditorLayerTree;
                      let levelIndex = 0;
                      while (cursor) {
                        const entries = [...cursor.children.keys()].sort();
                        if (entries.length === 0) break;
                        levelOptions.push(entries);
                        const selectedSegment = row.pathSegments[levelIndex];
                        if (
                          !selectedSegment ||
                          !cursor.children.has(selectedSegment)
                        ) {
                          break;
                        }
                        cursor = cursor.children.get(selectedSegment);
                        levelIndex += 1;
                      }

                      return (
                        <div className="mapping-editor-row" key={row.id}>
                          <select
                            value={row.columnName}
                            onChange={(event) =>
                              updateMappingEditorRowColumn(
                                row.id,
                                event.target.value,
                              )
                            }
                          >
                            <option value="">CSV column</option>
                            {columns.map((column) => (
                              <option value={column.name} key={column.name}>
                                {column.name}
                              </option>
                            ))}
                          </select>

                          <div className="mapping-editor-cascade">
                            {levelOptions.map((options, index) => (
                              <select
                                value={row.pathSegments[index] || ""}
                                onChange={(event) =>
                                  updateMappingEditorRowPath(
                                    row.id,
                                    index,
                                    event.target.value,
                                  )
                                }
                                key={`${row.id}-level-${index}`}
                              >
                                <option value="">Level {index + 1}</option>
                                {options.map((option) => (
                                  <option value={option} key={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ))}
                            {treeNode &&
                              treeNode.children.size === 0 &&
                              treeNode.layers.length > 0 && (
                                <select
                                  value={row.property}
                                  onChange={(event) =>
                                    updateMappingEditorRowProperty(
                                      row.id,
                                      event.target.value,
                                    )
                                  }
                                >
                                  <option value="">Property</option>
                                  {propertyOptions.map((property) => (
                                    <option value={property} key={property}>
                                      {property}
                                    </option>
                                  ))}
                                </select>
                              )}
                            <div className="mapping-editor-readout">
                              <span>[CSV Column: "{row.columnName || "-"}"]</span>
                              <span>{` → [Kind: ${kind}]`}</span>
                              <span>{` [Tag: ${tag || "-"}]`}</span>
                              <span>
                                {` [Targets: ${targets.length ? targets.join(", ") : "-"}]`}
                              </span>
                              {kind === "SKIP" && (
                                <span className="status-chip missing">Skip</span>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="icon-button small"
                            onClick={() => removeMappingEditorRow(row.id)}
                            title="Delete mapping row"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mapping-editor-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={addMappingEditorRow}
                    >
                      <Icon name="plus" />
                      Add Row
                    </button>
                    <button
                      type="button"
                      className="primary-generate"
                      onClick={saveMappingsFromEditor}
                    >
                      Save Mappings
                    </button>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="panel-header">
                <div>
                  <span className="eyebrow">Props</span>
                  <h1>
                    {selectedNode
                      ? selectedNode.data?.label || selectedNode.type || "Node"
                      : "No node selected"}
                  </h1>
                  <p>
                    {selectedNode
                      ? "Showing properties for the selected node."
                      : "Select a node to view properties"}
                  </p>
                </div>
              </div>
              <section className="property-section">
                {selectedNode ? (
                  <pre className="selected-node-properties">
                    {JSON.stringify(selectedNode, null, 2)}
                  </pre>
                ) : (
                  <div className="empty-inline">
                    <strong>Select a node to view properties</strong>
                    <span>Click any node on the canvas to inspect it here.</span>
                  </div>
                )}
              </section>
            </>
          )}
        </aside>

        <aside
          className="import-export-panel panel-shell"
          aria-label="Import export panel"
          aria-hidden={!isImportExportPanelVisible}
        >
          <div className="panel-header">
            <div>
              <span className="eyebrow">Import / Export</span>
              <h1>Workspace config</h1>
              <p>Export or import a complete .mitosis workspace file.</p>
            </div>
          </div>

          <div className="import-export-content">
            <button
              type="button"
              className="ghost-button import-export-button"
              onClick={exportWorkspace}
            >
              <Icon name="download" />
              Export Workspace
            </button>

            <hr className="import-export-divider" />

            <label className="import-export-upload">
              <span>Import Workspace</span>
              <input
                type="file"
                accept=".mitosis"
                onChange={handleImportWorkspaceFile}
              />
            </label>

            {importExportError && (
              <p className="import-export-error" role="alert">
                {importExportError}
              </p>
            )}

            {importedWorkspaceFileName && (
              <p className="import-export-filename">
                Loaded: {importedWorkspaceFileName}
              </p>
            )}
          </div>

          {pendingImportConfig && (
            <div
              className="import-export-confirm"
              role="dialog"
              aria-modal="true"
              aria-label="Overwrite current workspace"
            >
              <div className="import-export-confirm-card">
                <h2>Overwrite current workspace?</h2>
                <p>
                  Importing this file will permanently overwrite all current
                  nodes, connections, data mappings, and settings. This cannot
                  be undone.
                </p>
                <div className="import-export-confirm-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setPendingImportConfig(null);
                      setPendingImportFileName("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-generate"
                    onClick={() =>
                      applyImportedWorkspace(
                        pendingImportConfig,
                        pendingImportFileName,
                      )
                    }
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>

        <main className="center-panel" aria-label="Node canvas">
          <div className="canvas-toolbar">
            <div>
              <span className="eyebrow">Canvas</span>
              <strong>Node flow</strong>
              <p>{notice}</p>
            </div>
            <div className="canvas-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={runAutoMap}
              >
                <Icon name="sparkle" />
                Auto map
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => addCanvasNode("frame")}
              >
                <Icon name="frame" />
                Add Frame
              </button>
            </div>
          </div>
          <div className="flow-stage">
            {nodes.length === 0 && (
              <div className="canvas-empty-state">
                <strong>Start by adding a frame</strong>
                <span>
                  Drop tools from the top toolbar to build a clean mapping flow.
                </span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => addCanvasNode("frame")}
                >
                  <Icon name="plus" />
                  Add Frame
                </button>
              </div>
            )}
            <ReactFlowProvider>
              <CanvasSurface
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onDropTool={addCanvasNode}
                onSelectionChange={handleCanvasSelectionChange}
              />
            </ReactFlowProvider>
          </div>
        </main>
      </div>

    </div>
  );
}

export default App;
