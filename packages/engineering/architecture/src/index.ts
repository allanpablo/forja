/**
 * Architecture Constitution (SPEC-033) — turns an ADR's `## Constraints` section into rules that
 * can be checked against real code, instead of a decision that only a human remembers to reread.
 *
 * Pure domain: no `fs`, no network, no dependency on `GraphLoop`/SQLite. `scripts/architecture.ts`
 * is the adapter that reads ADR files and resolves `DependencyEdge[]` from the real Engineering
 * Graph — this module only parses strings and compares lists, so it's fully unit-testable and
 * reusable from a future MCP tool or the dashboard without dragging in I/O.
 *
 * LLM never decides a rule is `active` (ADR-0078, security principles). The recognized-phrase
 * vocabulary here is small and fixed on purpose: anything outside it produces a `proposed` rule
 * with `confidence < 1`, never `active` — a wrong guess here is a false positive that erodes trust
 * in every future run of `architecture:check`, so silence (staying `proposed`) is the safe default,
 * not a failure.
 */

export type ArchitectureConstraintKind = 'forbid_import' | 'require_dependency' | 'forbid_dependency';

export interface ArchitectureConstraint {
  readonly kind: ArchitectureConstraintKind;
  readonly target: string;
}

export type ArchitectureRuleStatus = 'active' | 'proposed';
export type ArchitectureSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface ArchitectureRule {
  readonly id: string;
  readonly source: string;
  readonly status: ArchitectureRuleStatus;
  readonly scope: { readonly paths: readonly string[] };
  readonly constraint: ArchitectureConstraint;
  readonly severity: ArchitectureSeverity;
  readonly rationale: string;
  readonly confidence: number;
}

/** A real (or hypothesized) import/dependency edge the graph already extracted — file path to a
 *  target label (an import specifier, a relative path, or an npm package name). */
export interface DependencyEdge {
  readonly fromPath: string;
  readonly targetLabel: string;
}

export interface ArchitectureViolation {
  readonly ruleId: string;
  readonly severity: ArchitectureSeverity;
  readonly file: string;
  readonly target: string;
  readonly source: string;
  readonly remediation: string;
}

export interface ArchitectureCheckReport {
  readonly compliant: number;
  readonly violations: readonly ArchitectureViolation[];
}

export interface ParsedConstraintLine {
  readonly constraint: ArchitectureConstraint;
  readonly scopeRaw: string;
  readonly confidence: number;
}

/** A recognized scope/target must look like a path or package specifier, not an arbitrary noun
 *  phrase — this is most of what keeps false positives out (D2, plan.md). */
function looksLikePathOrPackage(value: string): boolean {
  return /[\w-]+(\/[\w.-]+)+|^@?[a-z0-9][\w.-]*$/i.test(value) && value.length > 0;
}

const PATTERNS: readonly { readonly kind: ArchitectureConstraintKind; readonly regex: RegExp }[] = [
  { kind: 'forbid_import', regex: /^([\w./-]+?)\s+n[ãa]o\s+(?:pode\s+)?depend(?:e|er)\s+de\s+([\w./-]+?)\s*\.?$/i },
  { kind: 'forbid_import', regex: /^([\w./-]+?)\s+n[ãa]o\s+import(?:a|am)\s+([\w./-]+?)\s*(?:diretamente)?\s*\.?$/i },
  { kind: 'forbid_dependency', regex: /^([\w./-]+?)\s+n[ãa]o\s+acess(?:a|am)\s+([\w./-]+?)\s*(?:diretamente)?\s*\.?$/i },
  { kind: 'require_dependency', regex: /^([\w./-]+?)\s+usa(?:m)?\s+([\w./-]+?)\s*\.?$/i },
];

/**
 * Parses one bullet from an ADR's `## Constraints` section. Returns `undefined` only when the
 * line isn't a bullet at all; an unrecognized bullet still returns a result, just with
 * `confidence` low enough that `compileConstitution` keeps it `proposed`.
 */
export function parseConstraintLine(rawLine: string): ParsedConstraintLine | undefined {
  const line = rawLine.trim().replace(/^-\s*/, '');
  if (line.length === 0) return undefined;
  for (const { kind, regex } of PATTERNS) {
    const match = regex.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    const scopeRaw = match[1].trim();
    const target = match[2].trim();
    const confidence = looksLikePathOrPackage(scopeRaw) && looksLikePathOrPackage(target) ? 1 : 0.3;
    return { constraint: { kind, target }, scopeRaw, confidence };
  }
  // No fixed pattern matched at all — still worth surfacing as a low-confidence proposal (an
  // operator can see it in `architecture:status` and either rephrase it or approve it manually),
  // rather than silently dropping the ADR author's intent.
  return { constraint: { kind: 'forbid_dependency', target: line }, scopeRaw: '(não reconhecido)', confidence: 0.1 };
}

function toPathPattern(scopeRaw: string): string {
  return scopeRaw.endsWith('/') || scopeRaw.endsWith('*') ? scopeRaw : `${scopeRaw}/**`;
}

function severityFor(confidence: number): ArchitectureSeverity {
  return confidence >= 1 ? 'high' : confidence >= 0.5 ? 'medium' : 'info';
}

function slug(source: string, index: number, constraint: ArchitectureConstraint): string {
  const base = source.replace(/^.*\//, '').replace(/\.md$/, '');
  return `${base}-${constraint.kind}-${index}`;
}

export interface AdrDocument {
  readonly source: string;
  readonly content: string;
}

/** Extracts every `## Constraints` section's bullets from a set of ADR documents and compiles
 *  them into rules. Deterministic — no LLM, no I/O (the caller reads the files). */
export function compileConstitution(adrs: readonly AdrDocument[]): readonly ArchitectureRule[] {
  const rules: ArchitectureRule[] = [];
  for (const adr of adrs) {
    const section = /## Constraints\n([\s\S]*?)(?:\n## |\n?$)/.exec(adr.content)?.[1];
    if (section === undefined) continue;
    const bullets = section.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('- '));
    bullets.forEach((bullet, index) => {
      const parsed = parseConstraintLine(bullet);
      if (parsed === undefined) return;
      rules.push({
        id: slug(adr.source, index, parsed.constraint),
        source: adr.source,
        status: parsed.confidence >= 1 ? 'active' : 'proposed',
        scope: { paths: [toPathPattern(parsed.scopeRaw)] },
        constraint: parsed.constraint,
        severity: severityFor(parsed.confidence),
        rationale: bullet.replace(/^-\s*/, ''),
        confidence: parsed.confidence,
      });
    });
  }
  return rules;
}

function matchesScope(file: string, paths: readonly string[]): boolean {
  return paths.some((pattern) => {
    const prefix = pattern.replace(/\*+$/, '');
    return file === prefix.replace(/\/$/, '') || file.startsWith(prefix);
  });
}

function matchesTarget(targetLabel: string, ruleTarget: string): boolean {
  return targetLabel === ruleTarget || targetLabel.includes(ruleTarget);
}

const REMEDIATION: Record<ArchitectureConstraintKind, (rule: ArchitectureRule) => string> = {
  forbid_import: (rule) => `Remova a dependência de "${rule.constraint.target}" em ${rule.scope.paths[0]} — introduza um adapter/porta em vez de importar diretamente (ver ${rule.source}).`,
  forbid_dependency: (rule) => `Remova o acesso a "${rule.constraint.target}" em ${rule.scope.paths[0]} — a ADR de origem (${rule.source}) exige uma camada intermediária.`,
  require_dependency: (rule) => `${rule.scope.paths[0]} deveria depender de "${rule.constraint.target}" segundo ${rule.source}, mas nenhuma aresta correspondente foi encontrada.`,
};

/**
 * Checks only `active` rules (a `proposed` rule isn't enforced — that's the whole point of the
 * status) against the real dependency edges the caller resolved from the graph.
 */
export function checkConstitution(rules: readonly ArchitectureRule[], edges: readonly DependencyEdge[]): ArchitectureCheckReport {
  const violations: ArchitectureViolation[] = [];
  let compliant = 0;
  for (const rule of rules) {
    if (rule.status !== 'active') continue;
    if (rule.constraint.kind === 'require_dependency') {
      const satisfied = edges.some((edge) => matchesScope(edge.fromPath, rule.scope.paths) && matchesTarget(edge.targetLabel, rule.constraint.target));
      if (satisfied) compliant += 1;
      else violations.push({ ruleId: rule.id, severity: rule.severity, file: rule.scope.paths[0] ?? '', target: rule.constraint.target, source: rule.source, remediation: REMEDIATION.require_dependency(rule) });
      continue;
    }
    const offending = edges.filter((edge) => matchesScope(edge.fromPath, rule.scope.paths) && matchesTarget(edge.targetLabel, rule.constraint.target));
    if (offending.length === 0) { compliant += 1; continue; }
    for (const edge of offending) violations.push({ ruleId: rule.id, severity: rule.severity, file: edge.fromPath, target: rule.constraint.target, source: rule.source, remediation: REMEDIATION[rule.constraint.kind](rule) });
  }
  return { compliant, violations };
}

export function explainRule(rules: readonly ArchitectureRule[], ruleId: string): ArchitectureRule | undefined {
  return rules.find((rule) => rule.id === ruleId);
}
