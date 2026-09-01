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
  type RuntimeRun,
  type ExecutionResult,
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

export interface GraphContextRecord {
  readonly id: EntityId;
  readonly locator: string;
  readonly content: string;
  readonly relevance: number;
  readonly status: KnowledgeStatus;
  readonly evidence: readonly Evidence[];
  readonly checksum: string;
}

export interface GraphStore {
  getNode(id: EntityId): GraphNode | undefined;
  listNodes(): readonly GraphNode[];
  saveNode(node: GraphNode): void;
  getEdge(key: string): GraphEdge | undefined;
  listEdges(): readonly GraphEdge[];
  saveEdge(key: string, edge: GraphEdge): void;
  getEvidence(id: EntityId): Evidence | undefined;
  saveEvidence(item: Evidence): void;
  getSourceChecksum(sourceKey: string): string | undefined;
  saveSourceChecksum(sourceKey: string, checksum: string): void;
}

export class GraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphError';
  }
}

/**
 * Evidence sources allowed to claim `status: 'verified'` directly. Without this, any caller —
 * including an LLM/agent whose output feeds `addEvidence`/`upsertEdge` — could write
 * `status: 'verified'` on a bare assertion and GraphLoop would store it as indistinguishable
 * from a fact derived by the deterministic extractor or a real sandboxed execution. Anything
 * outside this allowlist is clamped to `'inferred'` (see `addEvidence`/`upsertEdge`) instead of
 * being rejected, so the graph stays usable for genuinely uncertain input — it just can't be
 * mislabeled as verified.
 */
const DEFAULT_TRUSTED_EVIDENCE_SOURCES: readonly string[] = ['deterministic-extractor', 'sandbox', 'forja.graph', 'forja.cli'];

export interface GraphLoopOptions {
  readonly trustedEvidenceSources?: readonly string[];
}

export class InMemoryGraphStore implements GraphStore {
  readonly nodes = new Map<EntityId, GraphNode>();
  readonly edges = new Map<string, GraphEdge>();
  readonly evidence = new Map<EntityId, Evidence>();
  readonly sources = new Map<string, string>();

  getNode(id: EntityId): GraphNode | undefined { return this.nodes.get(id); }
  listNodes(): readonly GraphNode[] { return [...this.nodes.values()]; }
  saveNode(node: GraphNode): void { this.nodes.set(node.id, node); }
  getEdge(key: string): GraphEdge | undefined { return this.edges.get(key); }
  listEdges(): readonly GraphEdge[] { return [...this.edges.values()]; }
  saveEdge(key: string, edge: GraphEdge): void { this.edges.set(key, edge); }
  getEvidence(id: EntityId): Evidence | undefined { return this.evidence.get(id); }
  saveEvidence(item: Evidence): void { this.evidence.set(item.id, item); }
  getSourceChecksum(sourceKey: string): string | undefined { return this.sources.get(sourceKey); }
  saveSourceChecksum(sourceKey: string, checksum: string): void { this.sources.set(sourceKey, checksum); }
}

export class GraphLoop {
  private readonly store: GraphStore;
  private readonly trustedEvidenceSources: readonly string[];

  constructor(store: GraphStore = new InMemoryGraphStore(), options: GraphLoopOptions = {}) {
    this.store = store;
    this.trustedEvidenceSources = options.trustedEvidenceSources ?? DEFAULT_TRUSTED_EVIDENCE_SOURCES;
  }

  private isTrustedSource(source: string): boolean {
    return this.trustedEvidenceSources.some((prefix) => source === prefix || source.startsWith(`${prefix}.`));
  }

  addEvidence(item: Evidence): void {
    const stored = item.status === 'verified' && !this.isTrustedSource(item.source) ? { ...item, status: 'inferred' as KnowledgeStatus } : item;
    this.store.saveEvidence(stored);
  }

  upsertNode(spec: GraphNodeSpec): GraphNode {
    if (spec.id.trim().length === 0 || spec.type.trim().length === 0 || spec.label.trim().length === 0) throw new GraphError('Graph node id, type and label are required');
    const current = this.store.getNode(spec.id);
    const node: GraphNode = { ...this.auditFields(current?.correlationId ?? `node:${spec.id}`), ...spec };
    this.store.saveNode(node);
    return node;
  }

  upsertEdge(spec: GraphEdgeSpec): GraphEdge {
    if (this.store.getNode(spec.from) === undefined || this.store.getNode(spec.to) === undefined) throw new GraphError('Graph edge endpoints must exist');
    if (spec.evidenceIds.length === 0) throw new GraphError('Graph edge requires at least one evidence id');
    const referencedEvidence: Evidence[] = [];
    for (const id of spec.evidenceIds) {
      const item = this.store.getEvidence(id);
      if (item === undefined) throw new GraphError(`Graph edge evidence not found: ${id}`);
      referencedEvidence.push(item);
    }
    if (!Number.isFinite(spec.confidence) || spec.confidence < 0 || spec.confidence > 1) throw new GraphError('Graph edge confidence must be between 0 and 1');
    // An edge can't be more verified than the evidence it rests on — otherwise 'verified' becomes
    // a label the edge asserts about itself, exactly the self-declared-truth gap this guards.
    const status = spec.status === 'verified' && !referencedEvidence.every((item) => item.status === 'verified') ? 'inferred' : spec.status;
    const key = this.edgeKey(spec);
    const current = this.store.getEdge(key);
    const edge: GraphEdge = { ...this.auditFields(current?.correlationId ?? `edge:${key}`), ...spec, status, id: current?.id ?? spec.id ?? randomUUID() as EntityId };
    this.store.saveEdge(key, edge);
    return edge;
  }

  apply(mutation: GraphMutation): { readonly nodes: number; readonly edges: number; readonly skipped: boolean } {
    if (this.store.getSourceChecksum(mutation.sourceKey) === mutation.sourceChecksum) return { nodes: 0, edges: 0, skipped: true };
    for (const item of mutation.evidence) this.addEvidence(item);
    for (const item of mutation.nodes) this.upsertNode(item);
    for (const item of mutation.edges) this.upsertEdge(item);
    this.store.saveSourceChecksum(mutation.sourceKey, mutation.sourceChecksum);
    return { nodes: mutation.nodes.length, edges: mutation.edges.length, skipped: false };
  }

  query(query: GraphQuery = {}): readonly GraphNode[] {
    return [...this.store.listNodes()]
      .filter((node) => query.type === undefined || node.type === query.type)
      .filter((node) => query.status === undefined || node.status === query.status)
      .filter((node) => query.labelIncludes === undefined || node.label.toLowerCase().includes(query.labelIncludes.toLowerCase()))
      .filter((node) => this.active(node.validFrom, node.validTo, query.at))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  path(from: EntityId, to: EntityId, maxDepth = 5, at?: ISO8601): GraphPath | undefined {
    if (this.store.getNode(from) === undefined || this.store.getNode(to) === undefined) return undefined;
    const queue: Array<{ id: EntityId; nodePath: EntityId[]; edgePath: GraphEdge[] }> = [{ id: from, nodePath: [from], edgePath: [] }];
    const visited = new Set<EntityId>([from]);
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      if (current.id === to) return { nodes: current.nodePath.map((id) => this.store.getNode(id)).filter((node): node is GraphNode => node !== undefined), edges: current.edgePath };
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
    const root = this.store.getNode(origin);
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
        const node = this.store.getNode(target);
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
    return [...this.store.listNodes()]
      .filter((node) => !this.activeEdges().some((edge) => edge.from === node.id || edge.to === node.id))
      .map((node) => ({ id: randomUUID() as EntityId, reason: `Graph node has no relation: ${node.label}`, priority: 50, risk: 'low' as const, dependencyIds: [], evidenceIds: [], approvalRequired: false }));
  }

  contextRecords(objective: string): readonly GraphContextRecord[] {
    const terms = objective.toLowerCase().split(/[^a-z0-9_./-]+/).filter((term) => term.length > 1);
    const records: Array<GraphContextRecord | undefined> = this.activeEdges()
      .map((edge) => {
        const from = this.store.getNode(edge.from);
        const to = this.store.getNode(edge.to);
        if (from === undefined || to === undefined) return undefined;
        const content = `${from.label} ${edge.type} ${to.label}`;
        const haystack = content.toLowerCase();
        const matches = terms.filter((term) => haystack.includes(term)).length;
        if (matches === 0) return undefined;
        const evidence = edge.evidenceIds.map((id) => this.store.getEvidence(id)).filter((item): item is Evidence => item !== undefined);
        if (evidence.length === 0) return undefined;
        return { id: edge.id, locator: `graph:${edge.id}`, content, relevance: matches / Math.max(1, terms.length), status: edge.status, evidence: evidence as readonly Evidence[], checksum: createHash('sha256').update(`${edge.id}:${edge.updatedAt}:${content}`).digest('hex') };
      });
    return records
      .filter((record): record is GraphContextRecord => record !== undefined)
      .sort((left, right) => right.relevance - left.relevance || left.locator.localeCompare(right.locator));
  }

  private activeEdges(at?: ISO8601, includeContradicted = false): readonly GraphEdge[] {
    return [...this.store.listEdges()].filter((edge) => (includeContradicted || edge.status !== 'contradicted') && this.active(edge.validFrom, edge.validTo, at));
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

/** Adapts runtime results into evidence-backed graph facts without importing runtime code. */
export class GraphExecutionMemory {
  private readonly graph: GraphLoop;

  constructor(graph: GraphLoop) { this.graph = graph; }

  remember(run: RuntimeRun, result: ExecutionResult): void {
    const executionId = `execution:${run.runId}` as EntityId;
    const capability = result.output?.capabilityId ?? 'unknown';
    const capabilityId = `capability:${capability}` as EntityId;
    this.graph.upsertNode({ id: executionId, type: 'Execution', label: run.objective, status: result.status === 'succeeded' ? 'verified' : 'unknown' });
    this.graph.upsertNode({ id: capabilityId, type: 'Capability', label: capability, status: 'verified' });
    for (const item of result.evidence) this.graph.addEvidence(item);
    if (result.evidence.length > 0) this.graph.upsertEdge({ from: executionId, to: capabilityId, type: 'PRODUCES', status: result.status === 'succeeded' ? 'verified' : 'unknown', confidence: result.status === 'succeeded' ? 1 : 0.5, evidenceIds: result.evidence.map((item) => item.id) });
  }
}

export interface DeterministicDocument {
  readonly nodeId: EntityId;
  readonly locator: string;
  readonly content: string;
  readonly capturedAt: ISO8601;
}

export interface GraphDocumentSource {
  listDocuments(): readonly DeterministicDocument[] | Promise<readonly DeterministicDocument[]>;
}

export interface GraphSyncResult {
  readonly documents: number;
  readonly indexed: number;
  readonly skipped: number;
  readonly nodes: number;
  readonly edges: number;
  readonly durationMs: number;
  readonly files: readonly string[];
}

export class GraphIndexer {
  private readonly graph: GraphLoop;

  constructor(graph: GraphLoop) { this.graph = graph; }

  async sync(source: GraphDocumentSource): Promise<GraphSyncResult> {
    const started = Date.now();
    const documents = await source.listDocuments();
    let indexed = 0;
    let skipped = 0;
    let nodes = 0;
    let edges = 0;
    for (const document of documents) {
      const result = this.graph.apply(extractDeterministicRelations(document));
      if (result.skipped) skipped += 1;
      else { indexed += 1; nodes += result.nodes; edges += result.edges; }
    }
    return { documents: documents.length, indexed, skipped, nodes, edges, durationMs: Date.now() - started, files: documents.map((document) => document.locator) };
  }
}

export function extractDeterministicRelations(document: DeterministicDocument): GraphMutation {
  const evidence: Evidence[] = [];
  const nodes = new Map<EntityId, GraphNodeSpec>();
  const edges: GraphEdgeSpec[] = [];
  nodes.set(document.nodeId, { id: document.nodeId, type: document.locator.endsWith('package.json') ? 'Project' : document.locator.endsWith('.md') ? 'Document' : 'File', label: document.locator, status: 'verified' });
  const addRelation = (target: string, type: string, line: number, targetType = 'Document'): void => {
    const normalizedTarget = target.trim();
    if (normalizedTarget.length === 0) return;
    const targetId = stableId(`${type}:${normalizedTarget}`);
    const evidenceId = stableId(`evidence:${document.locator}:${line}:${type}:${normalizedTarget}`);
    nodes.set(targetId, { id: targetId, type: targetType, label: normalizedTarget, status: 'verified' });
    evidence.push({ id: evidenceId, source: 'deterministic-extractor', locator: `${document.locator}:${line}`, capturedAt: document.capturedAt, status: 'verified' });
    edges.push({ from: document.nodeId, to: targetId, type, status: 'verified', confidence: 1, evidenceIds: [evidenceId] });
  };
  const lines = document.content.split('\n');
  lines.forEach((line, index) => {
    const importMatch = line.match(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/);
    if (importMatch?.[2] !== undefined) addRelation(importMatch[2], 'DEPENDS_ON', index + 1, 'File');
    const linkMatch = line.match(/\[[^\]]+\]\(([^)#]+)(?:#[^)]*)?\)/);
    if (linkMatch?.[1] !== undefined) addRelation(linkMatch[1], 'DERIVED_FROM', index + 1);
    const exportMatch = line.match(/\bexport\s+(?:default\s+)?(?:declare\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/);
    if (exportMatch?.[1] !== undefined) addRelation(exportMatch[1], 'DEFINES', index + 1, 'Symbol');
    const implementsMatch = line.match(/\bimplements\s+([A-Za-z_$][\w$]*)/);
    if (implementsMatch?.[1] !== undefined) addRelation(implementsMatch[1], 'IMPLEMENTS', index + 1, 'Symbol');
    const adrMatches = line.match(/\bADR-\d{4}\b/g) ?? [];
    for (const adr of adrMatches) addRelation(adr, 'DERIVED_FROM', index + 1, 'ADR');
    const taskMatch = line.match(/^\s*-\s*\[[ xX]\]\s+(.+)$/);
    if (taskMatch?.[1] !== undefined) addRelation(taskMatch[1], 'CONTAINS', index + 1, 'Task');
    const handoffAgentMatch = line.match(/^\s*-\s*\*\*(?:to|next agent)\*\*:\s*(.+)$/i);
    if (handoffAgentMatch?.[1] !== undefined) addRelation(handoffAgentMatch[1], 'ASSIGNED_TO', index + 1, 'Agent');
    const testMatch = line.match(/\b(?:describe|it|test)\s*\(\s*['"]([^'"]+)['"]/);
    if (testMatch?.[1] !== undefined) addRelation(testMatch[1], 'VALIDATES', index + 1, 'Test');
    const callMatches = [...line.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)];
    for (const match of callMatches) {
      const name = match[1];
      if (name !== undefined && !new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'describe', 'it', 'test']).has(name)) addRelation(name, 'CALLS', index + 1, 'Symbol');
    }
  });
  if (document.locator.endsWith('package.json')) {
    try {
      const manifest = JSON.parse(document.content) as unknown;
      if (isRecord(manifest)) for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const dependencies = manifest[field];
        if (isRecord(dependencies)) for (const name of Object.keys(dependencies)) addRelation(name, 'DEPENDS_ON', 1, 'Technology');
      }
    } catch { /* Invalid manifests are handled by their own validator. */ }
  }
  const sourceChecksum = createHash('sha256').update(document.content).digest('hex');
  return { sourceKey: document.locator, sourceChecksum, nodes: [...nodes.values()], evidence, edges };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stableId(value: string): EntityId {
  return createHash('sha256').update(value).digest('hex') as EntityId;
}

export function graphDocumentId(locator: string): EntityId {
  return stableId(`document:${locator}`);
}
