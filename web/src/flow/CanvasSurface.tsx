import { useCallback } from "react";
import { Background, Controls, ReactFlow, useReactFlow } from "@xyflow/react";
import { nodeTypes } from "./nodes";

export const flowEdgeOptions = {
  type: "smoothstep",
  animated: true,
  style: { stroke: "#8b5cf6", strokeWidth: 2 },
};

export function CanvasSurface({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onDropTool,
  onSelectionChange,
}) {
  const { screenToFlowPosition } = useReactFlow();

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/mitosis-tool");
      if (!raw) return;

      try {
        const payload = JSON.parse(raw);
        onDropTool(
          payload.type,
          screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          payload.frameId,
        );
      } catch (_error) {
        // Ignore malformed drag payloads.
      }
    },
    [onDropTool, screenToFlowPosition],
  );

  const handleSelectionChange = useCallback(
    (selection) => {
      onSelectionChange?.(selection?.nodes || []);
    },
    [onSelectionChange],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onSelectionChange={handleSelectionChange}
      deleteKeyCode={["Delete", "Backspace"]}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.15}
      maxZoom={2.2}
      defaultEdgeOptions={flowEdgeOptions}
      connectionLineStyle={{ stroke: "#8b5cf6", strokeWidth: 2 }}
      snapToGrid
      snapGrid={[24, 24]}
      panOnScroll
      selectionOnDrag
    >
      <Background color="#283041" gap={24} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
