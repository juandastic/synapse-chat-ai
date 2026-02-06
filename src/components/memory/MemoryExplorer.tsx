import { useState, useCallback, useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { GraphCanvas } from "./GraphCanvas";
import type { GraphCanvasHandle } from "./GraphCanvas";
import { EntityList } from "./EntityList";
import { NodeInspector } from "./NodeInspector";
import { MemoryCorrection } from "./MemoryCorrection";
import type { GraphData, GraphNode } from "./types";
import { ArrowLeft, List, X } from "lucide-react";

/**
 * Memory Explorer page — interactive knowledge-graph visualization.
 *
 * Layout (Inspector Pattern):
 * - Desktop: graph canvas (left ~65%) + inspector panel (right ~35%)
 * - Mobile: full-width graph, inspector slides up as bottom sheet
 * - Bottom: memory correction input
 */
export function MemoryExplorer() {
  const navigate = useNavigate();
  const fetchGraph = useAction(api.graph.fetch);

  // Graph data
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected node
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Entity list visibility (defaults open on desktop)
  const [entityListOpen, setEntityListOpen] = useState(true);

  // Graph canvas ref for imperative centering
  const canvasRef = useRef<GraphCanvasHandle>(null);

  // Fetch graph data
  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGraph();
      setGraphData(data);

      // Clear selection if the previously selected node no longer exists
      if (selectedNode && !data.nodes.some((n) => n.id === selectedNode.id)) {
        setSelectedNode(null);
      }
    } catch {
      setError("Failed to load memory graph");
    } finally {
      setLoading(false);
    }
  }, [fetchGraph, selectedNode]);

  // Load on mount
  useEffect(() => {
    loadGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  /** Called from the entity list — select + center the canvas on the node */
  const handleEntitySelect = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    canvasRef.current?.centerOnNode(node.id);
  }, []);

  const handleCloseInspector = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleCorrectionSent = useCallback(() => {
    // Re-fetch graph after a successful correction
    loadGraph();
  }, [loadGraph]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/50 px-4">
        <button
          onClick={() => navigate("/")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-sm font-semibold tracking-tight text-foreground">
          Memory Explorer
        </h1>
        {graphData && !loading && (
          <span className="text-[11px] text-muted-foreground/50">
            {graphData.nodes.length} node
            {graphData.nodes.length !== 1 ? "s" : ""}
            {" · "}
            {graphData.links.length} relationship
            {graphData.links.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* Toggle entity list panel */}
        {graphData && graphData.nodes.length > 0 && (
          <button
            onClick={() => setEntityListOpen((v) => !v)}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={entityListOpen ? "Hide entity list" : "Show entity list"}
          >
            {entityListOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <List className="h-4 w-4" />
            )}
          </button>
        )}
      </header>

      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        {/* Loading state */}
        {loading && !graphData && (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <p className="text-sm text-muted-foreground">
                Loading your memory graph...
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !graphData && (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="text-center">
              <p className="text-sm text-destructive">{error}</p>
              <button
                onClick={loadGraph}
                className="mt-3 text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {graphData && graphData.nodes.length === 0 && !loading && (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="text-center">
              <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-muted/50 p-4">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-full w-full text-muted-foreground/40"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-7.07l-2.83 2.83M9.76 14.24l-2.83 2.83m12.14 0l-2.83-2.83M9.76 9.76L6.93 6.93" />
                </svg>
              </div>
              <p className="text-sm font-medium text-foreground/80">
                No memories yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Start chatting to build your knowledge graph.
              </p>
            </div>
          </div>
        )}

        {/* Entity List + Graph + Inspector */}
        {graphData && graphData.nodes.length > 0 && (
          <>
            {/* Entity list panel (left) */}
            <div
              className={`
                shrink-0 transition-all duration-200 ease-in-out
                ${entityListOpen ? "w-56" : "w-0 overflow-hidden"}
                max-md:fixed max-md:inset-y-14 max-md:left-0 max-md:z-20 max-md:w-64 max-md:shadow-xl
                ${entityListOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"}
              `}
            >
              <EntityList
                nodes={graphData.nodes}
                selectedNodeId={selectedNode?.id ?? null}
                onSelect={handleEntitySelect}
              />
            </div>

            {/* Graph canvas (center) */}
            <div className="relative min-w-0 flex-1">
              {loading && (
                <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg bg-card/80 px-2.5 py-1.5 text-[11px] text-muted-foreground backdrop-blur-sm">
                  <div className="h-3 w-3 animate-spin rounded-full border border-muted border-t-primary" />
                  Refreshing...
                </div>
              )}
              <GraphCanvas
                ref={canvasRef}
                graphData={graphData}
                onNodeClick={handleNodeClick}
                selectedNodeId={selectedNode?.id ?? null}
              />
            </div>

            {/* Inspector panel — desktop: side panel, mobile: bottom sheet */}
            <div
              className={`
                shrink-0 border-l border-border/50 bg-card transition-all duration-200 ease-in-out
                ${selectedNode ? "w-80" : "w-0 overflow-hidden border-l-0"}
                max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:w-full max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t max-md:shadow-xl
                ${selectedNode ? "max-md:max-h-[60vh]" : "max-md:max-h-0 max-md:border-t-0"}
              `}
            >
              <NodeInspector
                node={selectedNode}
                links={graphData.links}
                nodes={graphData.nodes}
                onClose={handleCloseInspector}
              />
            </div>
          </>
        )}
      </div>

      {/* Memory correction input */}
      {graphData && (
        <MemoryCorrection onCorrectionSent={handleCorrectionSent} />
      )}
    </div>
  );
}
