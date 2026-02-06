import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import type { GraphNode } from "./types";

interface EntityListProps {
  /** All nodes in the graph */
  nodes: GraphNode[];
  /** Currently selected node ID */
  selectedNodeId: string | null;
  /** Called when the user clicks an entity */
  onSelect: (node: GraphNode) => void;
}

/**
 * Scrollable, filterable list of all entities (nodes) in the knowledge graph.
 * Sorted by number of connections (val) descending so the most important
 * entities appear first.
 */
export function EntityList({
  nodes,
  selectedNodeId,
  onSelect,
}: EntityListProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => b.val - a.val);
    if (!query.trim()) return sorted;

    const q = query.toLowerCase();
    return sorted.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.summary?.toLowerCase().includes(q)
    );
  }, [nodes, query]);

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-border/50 bg-card">
      {/* Search */}
      <div className="shrink-0 border-b border-border/50 px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter entities..."
            className={cn(
              "w-full rounded-lg border border-border/50 bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/40",
              "focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/20"
            )}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground/50">
            {query ? "No matches" : "No entities"}
          </p>
        )}

        <ul className="py-1">
          {filtered.map((node) => {
            const isActive = node.id === selectedNodeId;
            return (
              <li key={node.id}>
                <button
                  onClick={() => onSelect(node)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors",
                    "hover:bg-muted/50",
                    isActive && "bg-primary/10"
                  )}
                >
                  {/* Connection count badge */}
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {node.val}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-xs font-medium",
                        isActive ? "text-primary" : "text-foreground"
                      )}
                    >
                      {node.name}
                    </p>
                    {node.summary && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/60">
                        {node.summary}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footer count */}
      <div className="shrink-0 border-t border-border/50 px-3 py-1.5">
        <p className="text-[10px] text-muted-foreground/40">
          {filtered.length} of {nodes.length} entities
        </p>
      </div>
    </div>
  );
}
