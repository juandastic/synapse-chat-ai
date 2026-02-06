import {
  useRef,
  useCallback,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { ForceGraphMethods, NodeObject } from "react-force-graph-2d";
import type { GraphData, GraphNode } from "./types";

/** Methods exposed to the parent via ref */
export interface GraphCanvasHandle {
  /** Center and zoom the canvas on a specific node by ID */
  centerOnNode: (nodeId: string) => void;
}

interface GraphCanvasProps {
  /** The graph data to render */
  graphData: GraphData;
  /** Callback when a node is clicked */
  onNodeClick: (node: GraphNode) => void;
  /** ID of the currently selected node (for visual highlighting) */
  selectedNodeId: string | null;
}

// =============================================================================
// Color palette derived from the app's warm design system
// =============================================================================

const COLORS = {
  node: "hsl(30, 35%, 45%)", // --primary
  nodeHover: "hsl(25, 50%, 75%)", // --accent
  nodeSelected: "hsl(35, 40%, 70%)", // --primary dark mode
  link: "hsla(35, 15%, 60%, 0.3)",
  linkLabel: "hsla(30, 10%, 45%, 0.7)",
  text: "hsl(30, 15%, 20%)",
  textDark: "hsl(38, 25%, 90%)",
};

/**
 * Force-directed 2D graph visualization using Canvas.
 * Wraps react-force-graph-2d with custom node rendering
 * that matches the app's warm, therapeutic design system.
 */
export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  function GraphCanvas({ graphData, onNodeClick, selectedNodeId }, ref) {
  const fgRef = useRef<ForceGraphMethods>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Detect dark mode
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  // Expose imperative methods to parent
  useImperativeHandle(ref, () => ({
    centerOnNode(nodeId: string) {
      if (!fgRef.current) return;
      const node = graphData.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      // The node object gets x/y injected by the simulation at runtime
      const simNode = node as GraphNode & { x?: number; y?: number };
      if (simNode.x != null && simNode.y != null) {
        fgRef.current.centerAt(simNode.x, simNode.y, 600);
        fgRef.current.zoom(3, 600);
      }
    },
  }));

  // Track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: Math.floor(width), height: Math.floor(height) });
      }
    });

    observer.observe(container);

    // Initial measurement
    const { width, height } = container.getBoundingClientRect();
    setDimensions({ width: Math.floor(width), height: Math.floor(height) });

    return () => observer.disconnect();
  }, []);

  // Configure d3-force and zoom to fit after data loads
  useEffect(() => {
    if (graphData.nodes.length > 0 && fgRef.current) {
      // Weaken charge repulsion so nodes don't fly apart on drag
      const charge = fgRef.current.d3Force("charge") as unknown as
        | { strength: (v: number) => void; distanceMax: (v: number) => void }
        | undefined;
      if (charge) {
        charge.strength(-80);
        charge.distanceMax(200);
      }

      // Small delay to let the physics settle, then fit to view
      const timer = setTimeout(() => {
        fgRef.current?.zoomToFit(400, 60);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [graphData]);

  // Custom node rendering on canvas
  const paintNode = useCallback(
    (
      node: NodeObject,
      ctx: CanvasRenderingContext2D,
      globalScale: number
    ) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const val = (node as NodeObject & { val?: number }).val ?? 1;
      const label =
        (node as NodeObject & { name?: string }).name ??
        String(node.id ?? "");
      const isSelected = String(node.id) === selectedNodeId;

      // Node circle
      const baseRadius = Math.sqrt(Math.max(val, 1)) * 3;
      const radius = isSelected ? baseRadius + 1.5 : baseRadius;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);

      if (isSelected) {
        ctx.fillStyle = COLORS.nodeSelected;
        // Glow effect
        ctx.shadowColor = COLORS.nodeSelected;
        ctx.shadowBlur = 12;
      } else {
        ctx.fillStyle = COLORS.node;
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
      }

      ctx.fill();
      ctx.shadowBlur = 0;

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = COLORS.nodeHover;
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      // Label (only if zoomed in enough)
      const fontSize = Math.min(12 / globalScale, 4);
      if (fontSize >= 1.5) {
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isDark ? COLORS.textDark : COLORS.text;
        ctx.fillText(label, x, y + radius + 2);
      }
    },
    [selectedNodeId, isDark]
  );

  // Custom pointer area for nodes (so clicks register on the painted circle)
  const paintNodeArea = useCallback(
    (
      node: NodeObject,
      color: string,
      ctx: CanvasRenderingContext2D
    ) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const val = (node as NodeObject & { val?: number }).val ?? 1;
      const radius = Math.sqrt(Math.max(val, 1)) * 3 + 2; // Slightly larger hit area

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    []
  );

  const handleNodeClick = useCallback(
    (node: NodeObject) => {
      // The node object contains our custom fields (name, val, summary)
      // alongside the force-graph internal fields (x, y, vx, vy)
      onNodeClick(node as unknown as GraphNode);
    },
    [onNodeClick]
  );

  // Pin the node where it was dropped so the layout stays stable
  const handleNodeDragEnd = useCallback((node: NodeObject) => {
    node.fx = node.x;
    node.fy = node.y;
  }, []);

  const handleBackgroundClick = useCallback(() => {
    // Deselect by clicking the background — parent handles via onNodeClick with null check
  }, []);

  if (dimensions.width === 0 || dimensions.height === 0) {
    return <div ref={containerRef} className="h-full w-full" />;
  }

  return (
    <div ref={containerRef} className="h-full w-full">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        // Node config
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => "replace"}
        nodePointerAreaPaint={paintNodeArea}
        nodeLabel=""
        // Link config
        linkColor={() => COLORS.link}
        linkWidth={1}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        linkDirectionalArrowColor={() => COLORS.link}
        linkLabel="label"
        // Physics — high damping so dragging one node doesn't scatter others
        d3AlphaDecay={0.05}
        d3VelocityDecay={0.6}
        cooldownTicks={80}
        warmupTicks={30}
        // Interaction
        onNodeClick={handleNodeClick}
        onNodeDragEnd={handleNodeDragEnd}
        onBackgroundClick={handleBackgroundClick}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />
    </div>
  );
});
