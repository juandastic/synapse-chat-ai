import { cn } from "@/lib/utils";
import type { GraphNode, GraphLink } from "./types";
import { X } from "lucide-react";

interface NodeInspectorProps {
  /** Currently selected node, or null when nothing is selected */
  node: GraphNode | null;
  /** All links in the graph (to find relationships for the selected node) */
  links: GraphLink[];
  /** All nodes in the graph (to resolve names from link source/target) */
  nodes: GraphNode[];
  /** Close / deselect callback */
  onClose: () => void;
}

/** Detail panel shown when a node is selected in the graph */
export function NodeInspector({
  node,
  links,
  nodes,
  onClose,
}: NodeInspectorProps) {
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 rounded-full bg-muted/50 p-3">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 text-muted-foreground/50"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        </div>
        <p className="text-xs text-muted-foreground/60">
          Click a node to inspect it
        </p>
      </div>
    );
  }

  // Build a lookup map for node names
  const nodeMap = new Map(nodes.map((n) => [n.id, n.name]));

  // Find all relationships involving this node
  const outgoing = links.filter((l) => resolveId(l.source) === node.id);
  const incoming = links.filter((l) => resolveId(l.target) === node.id);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-3">
        <h2 className="truncate font-display text-sm font-semibold tracking-tight text-foreground">
          {node.name}
        </h2>
        <button
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close inspector"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Summary */}
        {node.summary && (
          <div className="mb-5">
            <SectionLabel>Summary</SectionLabel>
            <p className="text-sm leading-relaxed text-foreground/80">
              {node.summary}
            </p>
          </div>
        )}

        {/* Connections count */}
        <div className="mb-5">
          <SectionLabel>Connections</SectionLabel>
          <p className="text-xs text-muted-foreground">
            {node.val} relationship{node.val !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Outgoing relationships */}
        {outgoing.length > 0 && (
          <div className="mb-5">
            <SectionLabel>Outgoing</SectionLabel>
            <ul className="space-y-2">
              {outgoing.map((link, i) => (
                <RelationshipRow
                  key={`out-${i}`}
                  direction="out"
                  label={link.label}
                  targetName={
                    nodeMap.get(resolveId(link.target)) ??
                    resolveId(link.target)
                  }
                  fact={link.fact}
                />
              ))}
            </ul>
          </div>
        )}

        {/* Incoming relationships */}
        {incoming.length > 0 && (
          <div className="mb-5">
            <SectionLabel>Incoming</SectionLabel>
            <ul className="space-y-2">
              {incoming.map((link, i) => (
                <RelationshipRow
                  key={`in-${i}`}
                  direction="in"
                  label={link.label}
                  targetName={
                    nodeMap.get(resolveId(link.source)) ??
                    resolveId(link.source)
                  }
                  fact={link.fact}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * react-force-graph mutates link.source/target from string IDs
 * to full node objects after the first render. This helper
 * normalizes both cases back to a string ID.
 */
function resolveId(value: string | { id: string }): string {
  return typeof value === "string" ? value : value.id;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
      {children}
    </p>
  );
}

function RelationshipRow({
  direction,
  label,
  targetName,
  fact,
}: {
  direction: "in" | "out";
  label: string;
  targetName: string;
  fact: string | null;
}) {
  return (
    <li
      className={cn(
        "rounded-lg border border-border/50 bg-card px-3 py-2 text-xs"
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="shrink-0">{direction === "out" ? "→" : "←"}</span>
        <span className="font-medium text-primary/80">{label}</span>
        <span className="shrink-0">{direction === "out" ? "→" : "←"}</span>
        <span className="truncate font-medium text-foreground">
          {targetName}
        </span>
      </div>
      {fact && (
        <p className="mt-1 text-muted-foreground/70 leading-relaxed">{fact}</p>
      )}
    </li>
  );
}
