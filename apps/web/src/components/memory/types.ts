/** A node in the knowledge graph */
export interface GraphNode {
  id: string;
  name: string;
  /** Number of connections — used for visual node sizing */
  val: number;
  summary: string;
}

/** A directed relationship between two nodes */
export interface GraphLink {
  source: string;
  target: string;
  label: string;
  /** Human-readable fact describing this relationship (can be null) */
  fact: string | null;
}

/** Full graph data structure expected by react-force-graph-2d */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
