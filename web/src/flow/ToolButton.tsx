import { Icon } from "../components/Icon";

export function ToolButton({
  tool,
  activeTool,
  selectedGeneratedFrameId,
  onAddTool,
}) {
  const startDrag = (event) => {
    event.dataTransfer.setData(
      "application/mitosis-tool",
      JSON.stringify({
        type: tool.type,
        frameId: tool.type === "frame" ? selectedGeneratedFrameId : "",
      }),
    );
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <button
      type="button"
      className={tool.type === activeTool ? "tool-tab active" : "tool-tab"}
      draggable
      onDragStart={startDrag}
      onClick={() => onAddTool(tool.type)}
      title={`${tool.label}: ${tool.detail}`}
    >
      <span className="tool-tab-icon">
        <Icon name={tool.icon} />
      </span>
      <span className="tool-copy">
        <strong>{tool.label}</strong>
        <span>{tool.detail}</span>
      </span>
    </button>
  );
}
