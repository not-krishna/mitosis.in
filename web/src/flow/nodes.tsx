// @ts-nocheck
import { useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { emptyAction, ratioSizes } from "../utils/constants";
import { variantNameForRow } from "./nodeHelpers";

export function MappingNode({ data }) {
  const mappings = data.mappings || [];
  const savedMappings = data.savedMappings || [];
  const conflicts = data.conflicts || [];
  const linked = mappings.filter(
    (mapping) => mapping.kind === "SKIP" || mapping.targetIds.length,
  ).length;

  return (
    <section className="flow-node mapping-node">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <header>
        <strong>Mapping</strong>
        <span>
          {data.connected
            ? `${linked}/${mappings.length || 0} ready`
            : "disconnected"}
        </span>
      </header>
      <div className="node-actions">
        <button
          type="button"
          className="primary"
          onClick={() => data.openMappingEditor?.(data.nodeId)}
        >
          {savedMappings.length === 0 ? "Add Mapping" : "Edit Mapping"}
        </button>
      </div>
      {conflicts.length > 0 && (
        <div className="conflict">{conflicts.length} mappings need review</div>
      )}
    </section>
  );
}

export function GenerationNode({ data }) {
  const templates = data.templates || [];

  return (
    <section className="flow-node generation-node">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <header>
        <strong>Generation</strong>
        <span>
          {data.connected ? data.templateName || "No template" : "disconnected"}
        </span>
      </header>
      <label>
        Template
        <select
          value={data.templateId || ""}
          onChange={(event) => data.setTemplateId?.(event.target.value)}
        >
          <option value="">Choose template</option>
          {templates.map((template) => (
            <option value={template.id} key={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Campaign
        <input
          value={data.campaignName || ""}
          onChange={(event) => data.setCampaignName?.(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="primary"
        onClick={data.runAll || emptyAction}
      >
        Generate
      </button>
    </section>
  );
}

export function NewOutputNode() {
  return (
    <section className="flow-node new-output-node">
      <Handle type="target" position={Position.Left} />
      <header>
        <strong>Output</strong>
        <span>disconnected</span>
      </header>
      <p>
        Generated frames will appear in the bottom dock. Connect a frame node to
        display them here.
      </p>
    </section>
  );
}

export function ScaleNode({ data }) {
  const activeRatios = data.activeRatios || [];

  return (
    <section className="flow-node scale-node">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <header>
        <strong>Scaling</strong>
        <span>
          {data.connected ? `${activeRatios.length} ratios` : "disconnected"}
        </span>
      </header>
      <div className="ratio-grid">
        {Object.keys(ratioSizes).map((ratio) => (
          <button
            type="button"
            className={activeRatios.includes(ratio) ? "active" : ""}
            onClick={() => data.toggleRatio?.(ratio)}
            key={ratio}
          >
            {ratio}
          </button>
        ))}
      </div>
    </section>
  );
}

export function NewInputNode({ data }) {
  const columns = data.columns || [];
  const rows = data.rows || [];
  const [importedFileName, setImportedFileName] = useState("");
  const fileInputRef = useRef(null);

  const openCsvPicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    console.log("[NewInputNode] CSV picker change fired", file?.name || "none");
    if (!file) return;
    const imported = await (data.importCsv || emptyAction)(file);
    if (imported) setImportedFileName(file.name);
    event.target.value = "";
  };

  const clearImportedCsv = async () => {
    await (data.importCsv || emptyAction)(null, { clear: true });
    setImportedFileName("");
  };

  return (
    <section className="flow-node new-input-node">
      <Handle type="source" position={Position.Right} />
      <header>
        <strong>Sheet</strong>
        <span>{data.connected ? "connected" : `${rows.length} rows`}</span>
      </header>
      <div
        className="compact-sheet"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
        }}
      >
        <div>{columns.length} columns loaded</div>
        <strong>
          {columns
            .slice(0, 4)
            .map((column) => column.name)
            .join(" / ") || "No columns"}
        </strong>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <div className="node-actions">
        {importedFileName ? (
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
            }}
          >
            <span
              style={{
                color: "var(--muted)",
                fontSize: "11px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={importedFileName}
            >
              {importedFileName}
            </span>
            <button
              type="button"
              onClick={clearImportedCsv}
              aria-label="Remove imported csv"
              title="Remove imported csv"
              style={{
                minHeight: "24px",
                minWidth: "24px",
                padding: "0 8px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "rgba(13, 16, 24, 0.72)",
                color: "var(--muted)",
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <button type="button" onClick={openCsvPicker}>
            Import CSV
          </button>
        )}
      </div>
    </section>
  );
}

export function FrameNode({ data }) {
  const frames = data.frames || [];
  const templates = data.templates || [];
  const rows = data.rows || [];
  const selectedFrameId = data.frameId || "";
  const selectedVariantIndex = data.variantIndex ?? "";
  const selectedFrame = frames.find((frame) => frame.id === selectedFrameId);
  const selectedTemplate = templates.find(
    (template) => template.id === selectedFrameId,
  );

  return (
    <section className="flow-node frame-node">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <header>
        <strong>{data.label || "Frame"}</strong>
        <span>{selectedFrame || selectedTemplate ? "selected" : "empty"}</span>
      </header>
      <label>
        Generated from
        <select
          value={selectedFrameId}
          onChange={(event) =>
            data.updateFrameNode?.(data.nodeId, { frameId: event.target.value })
          }
        >
          <option value="">Choose generated frame or template</option>
          {frames.length > 0 && (
            <optgroup label="Generated frames">
              {frames.map((frame) => (
                <option value={frame.id} key={frame.id}>
                  {frame.name}
                </option>
              ))}
            </optgroup>
          )}
          {templates.length > 0 && (
            <optgroup label="Templates">
              {templates.map((template) => (
                <option value={template.id} key={template.id}>
                  {template.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <label>
        Variant
        <select
          value={selectedVariantIndex}
          onChange={(event) =>
            data.updateFrameNode?.(data.nodeId, {
              variantIndex: event.target.value,
            })
          }
        >
          <option value="">Any selected variant</option>
          {rows.map((row, index) => (
            <option
              value={index}
              key={`${variantNameForRow(row, index)}-${index}`}
            >
              {variantNameForRow(row, index)}
            </option>
          ))}
        </select>
      </label>
      <div className="frame-node-body">
        <span>
          {selectedFrame?.generationId ||
            selectedTemplate?.type ||
            "Drop this tool, then pick a source frame and variant."}
        </span>
      </div>
      <div className="node-actions">
        <button
          type="button"
          onClick={() => data.selectGeneratedFrame?.(selectedFrameId)}
          disabled={!selectedFrameId}
        >
          Select
        </button>
        <button
          type="button"
          className="primary"
          onClick={() =>
            data.runFromFrame?.(selectedFrameId, selectedVariantIndex)
          }
          disabled={!selectedFrameId}
        >
          Generate from
        </button>
      </div>
    </section>
  );
}

export const nodeTypes = {
  newInput: NewInputNode,
  mapping: MappingNode,
  generation: GenerationNode,
  scale: ScaleNode,
  newOutput: NewOutputNode,
  frame: FrameNode,
};
