/**
 * lib/project-upgrade.ts — a metade que falta do scaffolder (SPEC-018).
 *
 * O framework GERA projetos, mas nunca soube ATUALIZAR um projeto já gerado quando ele evolui: uma
 * memória nova (`70-summaries/`), um agent novo, um config multi-IA novo. Quem gerou na v1.2 ficava
 * preso na v1.2. Aqui a regra é simples e segura: **aditivo, nunca sobrescreve.** O upgrade só traz
 * peças de scaffold que FALTAM no projeto; um arquivo que já existe pode ter edição do usuário, e o
 * código do usuário é intocável.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface UpgradeEnv {
  fs: typeof fs;
}

const defaultEnv: UpgradeEnv = { fs };

/** Dirs que são runtime/build/deps — não são scaffold a copiar. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.memory', '.context']);

/** Todos os arquivos (rel) sob um root, menos os SKIP_DIRS. */
export function listFiles(root: string, env: UpgradeEnv = defaultEnv): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = env.fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e)) continue;
      const p = path.join(dir, e);
      let st;
      try {
        st = env.fs.statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else out.push(path.relative(root, p));
    }
  };
  walk(root);
  return out.sort();
}

export interface UpgradePlan {
  /** Arquivos que o scaffold atual traz e o projeto não tem — as peças novas, seguras de adicionar. */
  newFiles: string[];
  /** Presentes nos dois — não tocados (podem ter edição do usuário). */
  existing: number;
}

/**
 * Planeja o upgrade: o que o scaffold fresco tem que o projeto-alvo não tem. **Só adições** — nunca
 * lista sobrescritas, porque um arquivo existente é território do usuário.
 */
export function planUpgrade(freshRoot: string, targetRoot: string, env: UpgradeEnv = defaultEnv): UpgradePlan {
  const fresh = listFiles(freshRoot, env);
  const newFiles: string[] = [];
  let existing = 0;
  for (const rel of fresh) {
    if (env.fs.existsSync(path.join(targetRoot, rel))) existing += 1;
    else newFiles.push(rel);
  }
  return { newFiles, existing };
}

/** Aplica o plano: copia as peças novas para o alvo, criando diretórios. Nunca sobrescreve. */
export function applyUpgrade(freshRoot: string, targetRoot: string, plan: UpgradePlan, env: UpgradeEnv = defaultEnv): string[] {
  const applied: string[] = [];
  for (const rel of plan.newFiles) {
    const dst = path.join(targetRoot, rel);
    if (env.fs.existsSync(dst)) continue; // paranoia: nunca sobrescreve
    env.fs.mkdirSync(path.dirname(dst), { recursive: true });
    env.fs.copyFileSync(path.join(freshRoot, rel), dst);
    applied.push(rel);
  }
  return applied;
}
