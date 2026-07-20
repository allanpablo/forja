/**
 * lib/memory-audit.ts — os mapas de memória não podem mentir sobre o código (SPEC-017, ADR-0009).
 *
 * A economia de token do Forja é o `context.md` como mapa (`token:economy` mede −61%). Mas um mapa
 * que aponta "a regra mora em `domain/order.entity.ts`" **depois** que o arquivo foi renomeado é
 * *pior* que mapa nenhum: engana com confiança, e um agente vai ler o lugar errado — pagando o custo
 * e chegando à conclusão errada.
 *
 * Este módulo é o `adr-refs` dos mapas: extrai os paths de código que cada `context.md` cita e
 * confere que eles existem. Referência pendurada num mapa é a economia de token se voltando contra si.
 */

import fs from 'node:fs';
import path from 'node:path';
import { domainsOf } from './code-context.ts';

export interface AuditEnv {
  fs: typeof fs;
}

const defaultEnv: AuditEnv = { fs };

/** Paths de código citados num mapa: tokens entre crases que terminam em `.ts` e têm ao menos um `/`. */
const CODE_REF_RE = /`([a-z][a-zA-Z0-9/._-]*\/[a-zA-Z0-9/._-]*\.ts)`/g;

export interface DomainAudit {
  domain: string;
  mapPath: string;
  refs: number;
  dangling: string[];
}

/**
 * Resolve um path citado num mapa contra as bases plausíveis: relativo ao módulo
 * (`backend/src/modules/<domain>/`), ao `backend/`, e à raiz do projeto. Basta existir numa.
 */
function refResolves(projectRoot: string, domain: string, ref: string, env: AuditEnv): boolean {
  const bases = [
    path.join(projectRoot, 'backend', 'src', 'modules', domain),
    path.join(projectRoot, 'backend'),
    projectRoot,
  ];
  return bases.some((base) => env.fs.existsSync(path.join(base, ref)));
}

/** Audita os mapas de todos os domínios de um projeto. */
export function auditMemoryMaps(projectRoot: string, env: AuditEnv = defaultEnv): DomainAudit[] {
  const out: DomainAudit[] = [];
  for (const domain of domainsOf(projectRoot, env)) {
    const mapPath = path.join(projectRoot, 'memory', '30-domains', domain, 'context.md');
    let src: string;
    try {
      src = env.fs.readFileSync(mapPath, 'utf8');
    } catch {
      continue;
    }
    const refs = [...new Set([...src.matchAll(CODE_REF_RE)].map((m) => m[1]))];
    const dangling = refs.filter((ref) => !refResolves(projectRoot, domain, ref, env));
    out.push({
      domain,
      mapPath: path.relative(projectRoot, mapPath),
      refs: refs.length,
      dangling,
    });
  }
  return out;
}
