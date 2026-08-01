import { createHash, randomUUID } from 'node:crypto';
import {
  CONTRACT_VERSION,
  type Contradiction,
  type EntityId,
  type Evidence,
  type GraphEdge,
  type GraphNode,
  type ISO8601,
  type KnowledgeStatus,
  type SuggestedAction,
} from '../../contracts/src/index.ts';

export interface GraphNodeSpec {
  readonly id: EntityId;
  readonly type: string;
  readonly label: string;
  readonly status: KnowledgeStatus;
  readonly validFrom?: ISO8601;
  readonly validTo?: ISO8601;
}

export interface GraphEdgeSpec {
  readonly id?: EntityId;
  readonly from: EntityId;
  readonly to: EntityId;
  readonly type: string;
  readonly status: KnowledgeStatus;
  readonly confidence: number;
  readonly evidenceIds: readonly EntityId[];
  readonly validFrom?: ISO8601;
  readonly validTo?: ISO8601;
}

export interface GraphMutation {
  readonly sourceKey: string;
  readonly sourceChecksum: string;
  readonly nodes: readonly GraphNodeSpec[];
  readonly evidence: readonly Evidence[];
  readonly edges: readonly GraphEdgeSpec[];
}

export interface GraphQuery {
  readonly type?: string;
  readonly status?: KnowledgeStatus;
  readonly labelIncludes?: string;
  readonly at?: ISO8601;
}

export interface GraphPath {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export interface GraphImpact {
  readonly origin: GraphNode;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly depth: number;
}

export class GraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphError';
  }
}

export class InMemoryGraphStore {
  readonly nodes = new Map<EntityId, GraphNode>();
  readonly edges = new Map<string, GraphEdge>();
  readonly evidence = new Map<EntityId, Evidence>();
  readonly sources = new Map<string, string>();
}

export class GraphLoop {
  private readonly store: InMemoryGraphStore;

  constructor(store = new InMemoryGraphStore()) {
    this.store = store;
  }

  addEvidence(item: Evidence): void {
    this.store.evidence.set(item.id, item);
  }

  upsertNode(spec: GraphNodeSpec): GraphNode {
    if (spec.id.trim().length === 0 || spec.type.trim().length === 0 || spec.label.trim().length === 0) throw new GraphError('Graph node id, type and label are required');
    const current = this.store.nodes.get(spec.id);
    const node: GraphNode = { ...this.auditFields(current?.correlationId ?? `node:${spec.id}`), ...spec };
    this.store.nodes.set(spec.id, node);
    return node;
  }

  upsertEdge(spec: GraphEdgeSpec): GraphEdge {
    if (!this.store.nodes.has(spec.from) || !this.store.nodes.has(spec.to)) throw new GraphError('Graph edge endpoints must exist');
    if (spec.evidenceIds.length === 0) throw new GraphError('Graph edge requires at least one evidence id');
    for (const id of spec.evidenceIds) if (!this.store.evidence.has(id)) throw new GraphError(`Graph edge evidence not found: ${id}`);
    if (!Number.isFinite(spec.confidence) || spec.confidence < 0 || spec.confidence > 1) throw new GraphError('Graph edge confidence must be between 0 and 1');
    const key = this.edgeKey(spec);
    const current = this.store.edges.get(key);
    const edge: GraphEdge = { ...this.auditFields(current?.correlationId ?? `edge:${key}`), ...spec, id: current?.id ?? spec.id ?? randomUUID() as EntityId };
    this.store.edges.set(key, edge);
    return edge;
  }

  apply(mutation: GraphMutation): { readonly nodes: number; readonly edges: number; readonly skipped: boolean } {
    if (this.store.sources.get(mutation.sourceKey) === mutation.sourceChecksum) return { nodes: 0, edges: 0, skipped: true };
    for (const item of mutation.evidence) this.addEvidence(item);
    for (const item of mutation.nodes) this.upsertNode(item);
    for (const item of mutation.edges) this.upsertEdge(item);
    this.store.sources.set(mutation.sourceKey, mutation.sourceChecksum);
    return { nodes: mutation.nodes.length, edges: mutation.edges.length, skipped: false };
  }

  query(query: GraphQuery = {}): readonly GraphNode[] {
    return [...this.store.nodes.values()]
      .filter((node) => query.type === undefined || node.type === query.type)
      .filter((node) => query.status === undefined || node.status === query.status)
      .filter((node) => query.labelIncludes === undefined || node.label.toLowerCase().includes(query.labelIncludes.toLowerCase()))
      .filter((node) => this.active(node.validFrom, node.validTo, query.at))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  path(from: EntityId, to: EntityId, maxDepth = 5, at?: ISO8601): GraphPath | undefined {
    if (!this.store.nodes.has(from) || !this.store.nodes.has(to)) return undefined;
    const queue: Array<{ id: EntityId; nodePath: EntityId[]; edgePath: GraphEdge[] }> = [{ id: from, nodePath: [from], edgePath: [] }];
    const visited = new Set<EntityId>([from]);
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      if (current.id === to) return { nodes: current.nodePath.map((id) => this.store.nodes.get(id)).filter((node): node is GraphNode => node !== undefined), edges: current.edgePath };
      if (current.edgePath.length >= maxDepth) continue;
      for (const edge of this.activeEdges(at)) {
        if (edge.from !== current.id || visited.has(edge.to)) continue;
        visited.add(edge.to);
        queue.push({ id: edge.to, nodePath: [...current.nodePath, edge.to], edgePath: [...current.edgePath, edge] });
      }
    }
    return undefined;
  }

  impact(origin: EntityId, depth = 2, direction: 'outgoing' | 'incoming' | 'both' = 'outgoing', at?: ISO8601): GraphImpact {
    const root = this.store.nodes.get(origin);
    if (root === undefined) throw new GraphError(`Graph node not found: ${origin}`);
    const nodes = new Map<EntityId, GraphNode>([[origin, root]]);
    const edges = new Map<string, GraphEdge>();
    let frontier = new Set<EntityId>([origin]);
    for (let level = 0; level < depth; level += 1) {
      const next = new Set<EntityId>();
      for (const edge of this.activeEdges(at)) {
        const forward = (direction === 'outgoing' || direction === 'both') && frontier.has(edge.from);
        const backward = (direction === 'incoming' || direction === 'both') && frontier.has(edge.to);
        if (!forward && !backward) continue;
        const target = forward ? edge.to : edge.from;
        const node = this.store.nodes.get(target);
        if (node !== undefined) {
          nodes.set(target, node);
          next.add(target);
          edges.set(this.edgeKey(edge), edge);
        }
      }
      frontier = next;
    }
    return { origin: root, nodes: [...nodes.values()], edges: [...edges.values()], depth };
  }

  contradictions(at?: ISO8601): readonly Contradiction[] {
    return this.activeEdges(at, true).filter((edge) => edge.type === 'CONTRADICTS').map((edge) => ({ id: edge.id, claimIds: [edge.from, edge.to], reason: 'Contradictory relation recorded in GraphLoop', evidenceIds: edge.evidenceIds }));
  }

  agenda(): readonly SuggestedAction[] {
    return [...this.store.nodes.values()]
      .filter((node) => !this.activeEdges().some((edge) => edge.from === node.id || edge.to === node.id))
      .map((node) => ({ id: randomUUID() as EntityId, reason: `Graph node has no relation: ${node.label}`, priority: 50, risk: 'low' as const, dependencyIds: [], evidenceIds: [], approvalRequired: false }));
  }

  private activeEdges(at?: ISO8601, includeContradicted = false): readonly GraphEdge[] {
    return [...this.store.edges.values()].filter((edge) => (includeContradicted || edge.status !== 'contradicted') && this.active(edge.validFrom, edge.validTo, at));
  }

  private active(validFrom?: ISO8601, validTo?: ISO8601, at?: ISO8601): boolean {
    const point = at ?? new Date().toISOString() as ISO8601;
    return (validFrom === undefined || validFrom <= point) && (validTo === undefined || point < validTo);
  }

  private edgeKey(edge: { readonly from: EntityId; readonly to: EntityId; readonly type: string; readonly validFrom?: ISO8601 }): string {
    return `${edge.from}|${edge.to}|${edge.type}|${edge.validFrom ?? ''}`;
  }

  private auditFields(correlationId: string): Pick<GraphNode, 'schemaVersion' | 'createdAt' | 'updatedAt' | 'correlationId'> {
    const now = new Date().toISOString() as ISO8601;
    return { schemaVersion: CONTRACT_VERSION, createdAt: now, updatedAt: now, correlationId };
  }
}

export interface DeterministicDocument {
  readonly nodeId: EntityId;
  readonly locator: string;
  readonly content: string;
  readonly capturedAt: ISO8601;
}

export function extractDeterministicRelations(document: DeterministicDocument): GraphMutation {
  const evidence: Evidence[] = [];
  const nodes = new Map<EntityId, GraphNodeSpec>();
  const edges: GraphEdgeSpec[] = [];
  const addRelation = (target: string, type: string, line: number): void => {
    const targetId = stableId(`${type}:${target}`);
    const evidenceId = stableId(`evidence:${document.locator}:${line}:${type}:${target}`);
    nodes.set(targetId, { id: targetId, type: type === 'DEPENDS_ON' ? 'File' : 'Document', label: target, status: 'verified' });
    evidence.push({ id: evidenceId, source: 'deterministic-extractor', locator: `${document.locator}:${line}`, capturedAt: document.capturedAt, status: 'verified' });
    edges.push({ from: document.nodeId, to: targetId, type, status: 'verified', confidence: 1, evidenceIds: [evidenceId] });
  };
  const lines = document.content.split('\n');
  lines.forEach((line, index) => {
    const importMatch = line.match(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/);
    if (importMatch?.[2] !== undefined) addRelation(importMatch[2], 'DEPENDS_ON', index + 1);
    const linkMatch = line.match(/\[[^\]]+\]\(([^)#]+)(?:#[^)]*)?\)/);
    if (linkMatch?.[1] !== undefined) addRelation(linkMatch[1], 'DERIVED_FROM', index + 1);
  });
  const sourceChecksum = createHash('sha256').update(document.content).digest('hex');
  return { sourceKey: document.locator, sourceChecksum, nodes: [...nodes.values()], evidence, edges };
}

function stableId(value: string): EntityId {
  return createHash('sha256').update(value).digest('hex') as EntityId;
}
