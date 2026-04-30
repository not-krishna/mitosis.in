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
  const [isLeftPanelVisible, setIsLeftPanelVisible] = useState(true);
  const [isRightPanelVisible, setIsRightPanelVisible] = useState(false);
  const [isNodesPanelVisible, setIsNodesPanelVisible] = useState(false);
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

  const importCsv = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      file.text().then((text) => {
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
      });
    });
    input.click();
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

  const toggleRailPanel = useCallback(
    (panel) => {
      const nextLeft = panel === "left" ? !isLeftPanelVisible : false;
      const nextRight = panel === "right" ? !isRightPanelVisible : false;
      const nextNodes = panel === "nodes" ? !isNodesPanelVisible : false;
      setIsLeftPanelVisible(nextLeft);
      setIsRightPanelVisible(nextRight);
      setIsNodesPanelVisible(nextNodes);
    },
    [isLeftPanelVisible, isRightPanelVisible, isNodesPanelVisible],
  );

  const connectedNodeIds = useMemo(() => {
    const ids = new Set();
    edges.forEach((edge) => {
      ids.add(edge.source);
      ids.add(edge.target);
    });
    return ids;
  }, [edges]);

  const typeNodeData = useMemo(
    () => ({
      input: { columns, rows, importCsv, exportCsv, autoMap: runAutoMap },
      mapping: { mappings: mappingRows, conflicts: mappingWarnings },
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
      mappingRows,
      mappingWarnings,
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
          data: { ...node.data, connected, ...(typeNodeData[node.type] || {}) },
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
        className={`workspace-grid ${isLeftPanelVisible ? "" : "left-collapsed"} ${isRightPanelVisible ? "" : "right-collapsed"} ${isNodesPanelVisible ? "nodes-open" : ""}`}
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
          <div
            className="panel-tabs"
            role="tablist"
            aria-label="Properties tabs"
          >
            <button
              type="button"
              role="tab"
              className={rightPanelTab === "mapping" ? "active" : ""}
              onClick={() => setRightPanelTab("mapping")}
            >
              Mapping
            </button>
            <button
              type="button"
              role="tab"
              className={rightPanelTab === "frame" ? "active" : ""}
              onClick={() => setRightPanelTab("frame")}
            >
              Frame Properties
            </button>
          </div>

          {rightPanelTab === "mapping" ? (
            <section className="property-section">
              <div className="section-title-row">
                <div>
                  <span className="eyebrow">Mapping list</span>
                  <h2>{connectedMappingCount} connected</h2>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={runAutoMap}
                >
                  <Icon name="sparkle" />
                  Auto map
                </button>
              </div>

              <div className="mapping-table">
                {mappingRows.map((mapping) => {
                  const compatibleLayers = compatibleLayersForMapping(mapping);
                  const selectedTarget = mapping.targetIds[0] || "";
                  const status = mappingStatus(mapping);
                  return (
                    <article
                      className={`mapping-row-editor ${status}`}
                      key={mapping.header}
                    >
                      <div className="mapping-name-cell">
                        <span className={`mapping-dot ${status}`} />
                        <div>
                          <strong>{mapping.header}</strong>
                          <span>
                            {status} /{" "}
                            {Math.round((mapping.confidence || 0) * 100)}%
                          </span>
                        </div>
                      </div>
                      <select
                        value={mapping.kind}
                        onChange={(event) =>
                          updateMappingKind(mapping, event.target.value)
                        }
                        aria-label={`${mapping.header} kind`}
                      >
                        <option value="TEXT">Text</option>
                        <option value="IMAGE">Image</option>
                        <option value="COLOR">Color</option>
                        <option value="SKIP">Skip</option>
                      </select>
                      <input
                        value={mapping.tag}
                        onChange={(event) =>
                          updateMapping(mapping.header, {
                            tag: event.target.value,
                          })
                        }
                        disabled={mapping.kind === "SKIP"}
                        aria-label={`${mapping.header} tag`}
                      />
                      <select
                        value={selectedTarget}
                        onChange={(event) =>
                          updateMapping(mapping.header, {
                            targetIds: event.target.value
                              ? [event.target.value]
                              : [],
                            confidence: event.target.value ? 0.88 : 0,
                            rule: event.target.value
                              ? "manual-target"
                              : "manual-empty",
                          })
                        }
                        disabled={mapping.kind === "SKIP"}
                        aria-label={`${mapping.header} target`}
                      >
                        <option value="">No target selected</option>
                        {compatibleLayers.map((layer) => (
                          <option value={layer.id} key={layer.id}>
                            {layer.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="subtle-action"
                        onClick={() => useExactTargets(mapping)}
                        disabled={mapping.kind === "SKIP"}
                      >
                        <Icon name="link" />
                        Use exact tag
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="property-section">
              <div className="section-title-row">
                <div>
                  <span className="eyebrow">Frame</span>
                  <h2>{selectedTemplate?.name || "No master frame"}</h2>
                </div>
                <span
                  className={`status-chip ${bridge.status === "connected" ? "connected" : "missing"}`}
                >
                  {bridge.status}
                </span>
              </div>

              <div className="property-stack">
                <label className="field-control">
                  <span>Master frame</span>
                  <select
                    value={templateId}
                    onChange={(event) => setTemplateId(event.target.value)}
                  >
                    <option value="">Choose template</option>
                    {bridge.templates.map((template) => (
                      <option value={template.id} key={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-control">
                  <span>Campaign</span>
                  <input
                    value={campaignName}
                    onChange={(event) => setCampaignName(event.target.value)}
                  />
                </label>
                <label className="field-control">
                  <span>Generated frame</span>
                  <select
                    value={selectedGeneratedFrameId}
                    onChange={(event) =>
                      setSelectedGeneratedFrameId(event.target.value)
                    }
                  >
                    <option value="">None selected</option>
                    {frames.map((frame) => (
                      <option value={frame.id} key={frame.id}>
                        {frame.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="ratio-editor">
                  <span>Scale ratios</span>
                  <div>
                    {Object.keys(ratioSizes).map((ratio) => (
                      <button
                        type="button"
                        className={activeRatios.includes(ratio) ? "active" : ""}
                        onClick={() => toggleRatio(ratio)}
                        key={ratio}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="connection-list compact">
                  <div className="section-mini-head">
                    <strong>Connections</strong>
                    <span>{edges.length}</span>
                  </div>
                  {edges.length === 0 ? (
                    <div className="connection-empty">
                      Connect node anchors to define the workflow.
                    </div>
                  ) : (
                    edges.map((edge) => (
                      <div className="connection-row" key={edge.id}>
                        <span>
                          {edge.source}
                          {" -> "}
                          {edge.target}
                        </span>
                        <button
                          type="button"
                          className="icon-button small"
                          onClick={() => disconnectEdge(edge.id)}
                          title="Disconnect"
                        >
                          <Icon name="unlink" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="event-summary">
                  <div className="section-mini-head">
                    <strong>Activity</strong>
                    <span>{bridge.events.length}</span>
                  </div>
                  {bridge.events.slice(0, 5).map((event, index) => (
                    <div className="event-row" key={`${event.type}-${index}`}>
                      <strong>{event.type}</strong>
                      <span>
                        {event.frameNames?.length
                          ? `${event.frameNames.length} frames`
                          : "plugin event"}
                      </span>
                    </div>
                  ))}
                  {bridge.events.length === 0 && (
                    <div className="connection-empty">
                      No bridge activity yet.
                    </div>
                  )}
                </div>
              </div>
            </section>
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
              />
            </ReactFlowProvider>
          </div>
        </main>
      </div>

    </div>
  );
}

export default App;
